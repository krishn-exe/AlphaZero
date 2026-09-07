# Admin Dashboard — Feature Plan & New Endpoints

Fourth backend slice for SIH26001. Covers what the admin dashboard
needs, plus four small analytics/utility endpoints that give it real
data to display.

---

## Part 1 — Admin dashboard core features

### 1. Incident moderation (highest priority)
- List all incidents, filterable by status (pending/verified/resolved)
- View incident detail (description, category, location, photo if built)
- Verify/resolve action — calls the existing `PATCH /api/incidents/:id/status`
- This is the most important piece: the endpoint already exists, but
  without a UI to use it, verification never actually happens.

### 2. Risk score overview
- Table of all districts/cities with current `riskScore`/`riskLevel`
- Visually distinguish the 2 districts with real AIML data (Aizawl,
  Shillong) from the 76 with demo data
- Optional: manual score override button, calling the existing
  `PUT /api/map/district/:id/risk` — useful for a live demo moment
  ("watch the map update") without waiting on AIML's pipeline

### 3. Subscriber list
- Table: email, subscribed district, subscribed date
- Total count, from `GET /api/subscribe/count`

### 4. Basic admin password gate
- Single shared `ADMIN_PASSWORD` env var, no user accounts/hashing
- Simple login form → password check → token/cookie unlocks admin
  routes, applied as middleware to incident/subscriber/override routes

### 5. Manual alert trigger (stretch, only if time allows)
- `POST /api/admin/alert` — admin picks a district, sends a real
  email (via the same Resend setup as subscriber confirmations) to
  everyone subscribed to it
- Lower priority than the four above — build only once those are solid

---

## Part 2 — New endpoints (2, 3, 5, 7)

These give the dashboard real numbers to show instead of raw tables
only.

### 2. Top-risk districts
`GET /api/map/top-risk?limit=5` — highest-risk districts, sorted
descending. Powers a "Top 5 highest-risk areas" widget.

Add to `src/controllers/mapController.js`:
```js
async function getTopRiskDistricts(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const districts = await prisma.district.findMany({
      orderBy: { riskScore: 'desc' },
      take: limit,
      select: {
        id: true, name: true, state: true,
        riskScore: true, riskLevel: true, computedAt: true,
      },
    });
    res.json(districts);
  } catch (err) {
    console.error('getTopRiskDistricts error:', err);
    res.status(500).json({ error: 'Failed to load top-risk districts' });
  }
}
```
Add `getTopRiskDistricts` to `module.exports`. In
`src/routes/mapRoutes.js`:
```js
router.get('/top-risk', getTopRiskDistricts);
```

### 3. Risk summary stats
`GET /api/map/stats` — counts of districts by riskLevel. Powers a
summary bar/pie chart.

Add to `mapController.js`:
```js
async function getRiskStats(req, res) {
  try {
    const grouped = await prisma.district.groupBy({
      by: ['riskLevel'],
      _count: { riskLevel: true },
    });

    const stats = { low: 0, medium: 0, high: 0, severe: 0 };
    grouped.forEach(g => { stats[g.riskLevel] = g._count.riskLevel; });
    stats.total = stats.low + stats.medium + stats.high + stats.severe;

    res.json(stats);
  } catch (err) {
    console.error('getRiskStats error:', err);
    res.status(500).json({ error: 'Failed to load risk stats' });
  }
}
```
Add to exports. In routes:
```js
router.get('/stats', getRiskStats);
```

### 5. Recent incidents
`GET /api/incidents/recent?limit=10` — most recently reported
incidents, for an admin "latest activity" panel.

In `src/controllers/incidentController.js`:
```js
async function getRecentIncidents(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const incidents = await prisma.incident.findMany({
      orderBy: { reportedAt: 'desc' },
      take: limit,
    });
    res.json(incidents);
  } catch (err) {
    console.error('getRecentIncidents error:', err);
    res.status(500).json({ error: 'Failed to load recent incidents' });
  }
}
```
Route: `router.get('/recent', getRecentIncidents);`

### 7. Nearby incidents
`GET /api/incidents/nearby?lat=23.7&lng=92.7&radiusKm=10` — incidents
within a radius of a point, for a "what's near me" view.

No PostGIS available, so distance is computed in JS via the Haversine
formula — fine at hackathon scale (fetches all incidents, filters in
memory; would need a real geo query if this ever scaled to thousands
of rows).

Same file:
```js
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getNearbyIncidents(req, res) {
  try {
    const { lat, lng, radiusKm } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params are required' });
    }
    const radius = Number(radiusKm) || 10;
    const userLat = Number(lat);
    const userLng = Number(lng);

    const allIncidents = await prisma.incident.findMany();
    const nearby = allIncidents
      .map(inc => ({
        ...inc,
        distanceKm: distanceKm(userLat, userLng, inc.latitude, inc.longitude),
      }))
      .filter(inc => inc.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json(nearby);
  } catch (err) {
    console.error('getNearbyIncidents error:', err);
    res.status(500).json({ error: 'Failed to load nearby incidents' });
  }
}
```
Route: `router.get('/nearby', getNearbyIncidents);`

**Important:** put `/recent` and `/nearby` routes ABOVE any `/:id`
route in the incident routes file — otherwise Express matches
`"recent"`/`"nearby"` as an `:id` parameter first and breaks both.

---

## Build order
1. `/top-risk` and `/stats` (map endpoints, ~15 min each)
2. `/recent` and `/nearby` (incident endpoints, ~15-30 min)
3. Admin password gate
4. Incident moderation UI wired to existing PATCH endpoint
5. Risk overview UI wired to existing PUT endpoint
6. Subscriber list UI
7. Manual alert trigger — only if time remains
