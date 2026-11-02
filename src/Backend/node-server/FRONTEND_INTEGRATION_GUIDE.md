# Frontend Admin Dashboard Integration Guide

This guide outlines the endpoints the React/Vite frontend must use to build the Admin Dashboard and Early Warning features.

## Base URL
- **Local Development**: `http://localhost:5000`
- **Production**: (Update with your deployed Render/Vercel backend URL)

---

## 1. Authentication

Before accessing protected routes (like resolving incidents or sending alerts), the Admin must log in.

- **Endpoint:** `POST /api/admin/login`
- **Payload:** `{ "password": "your_admin_password" }`
- **Response:** `{ "token": "ey..." }`

**Important:** For all protected endpoints below, you must attach this token in the headers:
`Authorization: Bearer <token>`

---

## 2. Incident Moderation

These endpoints power the Admin Incident Dashboard.

- **Get All Incidents:** `GET /api/incidents`
  - Returns a GeoJSON FeatureCollection of all incidents to plot on the map.
- **Get Recent Incidents:** `GET /api/incidents/recent?limit=10`
  - Returns the latest reported incidents (JSON array) for the activity feed.
- **Get Nearby Incidents:** `GET /api/incidents/nearby?lat=23.7&lng=92.7&radiusKm=10`
  - Returns incidents near a specific point.
- **Resolve/Verify Incident (Protected):** `PATCH /api/incidents/:id/status`
  - **Headers:** `Authorization: Bearer <token>`
  - **Payload:** `{ "status": "verified" }` *(Options: pending, verified, resolved)*

---

## 3. Map & Risk Analytics

These endpoints power the charts and statistics on the dashboard.

- **Get National Heatmap:** `GET /api/map/national`
  - Returns a GeoJSON FeatureCollection of all districts and their risk levels.
- **Get Top Risk Districts:** `GET /api/map/top-risk?limit=5`
  - Returns a JSON array of the top 5 highest-risk districts.
- **Get Risk Stats:** `GET /api/map/stats`
  - Returns aggregation numbers for pie charts: `{ "low": 50, "medium": 12, "high": 4, "severe": 1, "total": 67 }`

---

## 4. Manual Operations (Protected)

- **Override District Risk:** `PUT /api/map/district/:id/risk`
  - **Headers:** `Authorization: Bearer <token>`
  - **Payload:** `{ "riskScore": 90 }` (Manually update the map for live demos).
- **Trigger Manual Email Alert:** `POST /api/admin/alert`
  - **Headers:** `Authorization: Bearer <token>`
  - **Payload:** `{ "districtId": 12, "riskLevel": "severe" }`
  - Automatically emails all early-warning subscribers for that district.
