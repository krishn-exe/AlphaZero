# Frontend Guide: Admin Dashboard API

This guide provides the complete list of backend API endpoints required to build the Admin Dashboard UI.

## 1. Authentication
All protected Admin endpoints require a JWT token passed in the `Authorization` header as a Bearer token.

**Endpoint:** `POST /api/admin/login`
**Auth Required:** None
**Description:** Use this to log the admin in and receive a JWT token.

**Request Body:**
```json
{
  "password": "your_admin_password"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5c..."
}
```

---

## 2. Risk Statistics (Dashboard Overview)
Use these endpoints to populate the top metrics and charts on the admin dashboard.

**Endpoint:** `GET /api/map/stats`
**Auth Required:** None (Public)
**Description:** Returns the total count of districts grouped by their current risk level.

**Response:**
```json
{
  "low": 42,
  "medium": 20,
  "high": 12,
  "severe": 4,
  "total": 78
}
```

**Endpoint:** `GET /api/map/top-risk`
**Auth Required:** None (Public)
**Description:** Returns the districts sorted by highest risk score first. Useful for a "Top High-Risk Areas" table.
**Query Params:** `?limit=5` (default is 5, max is 50).

**Response:**
```json
[
  {
    "id": 55,
    "name": "Aizawl",
    "state": "Mizoram",
    "riskScore": 8.5,
    "riskLevel": "severe",
    "computedAt": "2026-08-30T10:00:00Z"
  }
]
```

---

## 3. Incident Moderation
Use these to fetch community-reported incidents and moderate their status.

**Endpoint:** `GET /api/incidents`
**Auth Required:** None (Public)
**Description:** Returns all community-reported incidents formatted as a GeoJSON FeatureCollection. The UI can extract `features[].properties` to display a table of incidents.

**Endpoint:** `PATCH /api/incidents/:id/status`
**Auth Required:** `Bearer <JWT_TOKEN>`
**Description:** Updates the moderation status of an incident.

**Request Body:**
```json
{
  "status": "verified" // Must be 'pending', 'verified', or 'resolved'
}
```

---

## 4. Subscriber Management
Use this to display the list of users who have signed up for early email warnings.

**Endpoint:** `GET /api/subscribe`
**Auth Required:** `Bearer <JWT_TOKEN>`
**Description:** Returns the complete list of all email subscribers, ordered by newest first. Includes the district name if they subscribed to a specific district.

**Response:**
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "phone": null,
    "districtId": 55,
    "subscribedAt": "2026-08-30T10:00:00Z",
    "district": {
      "name": "Aizawl",
      "state": "Mizoram"
    }
  }
]
```

---

## 5. Manual Alert Trigger
Use this to hook up a manual "Trigger Alert" button on the dashboard.

**Endpoint:** `POST /api/map/alert`
**Auth Required:** `Bearer <JWT_TOKEN>`
**Description:** Manually triggers the email service to blast a risk alert to all subscribers of a specific district.

**Request Body:**
```json
{
  "districtId": 55,
  "riskLevel": "severe"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "alertedCount": 142
}
```
