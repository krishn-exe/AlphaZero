# Frontend Guide: Report an Incident Feature

This guide explains how the frontend should integrate with the newly built "Report an Incident" backend API (Slice 2).

## 1. Plotting Incidents on the Map
To display user-reported incidents (like blocked roads or landslides) on your map, fetch the data from the new GET endpoint.

**Endpoint:** `GET /api/incidents`
**Auth:** None required.

**Response Format:**
The API returns a standard GeoJSON `FeatureCollection`. This was designed specifically so you can plug it straight into Mapbox, Leaflet, or whichever map library you are using, just like the district heatmaps.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [92.7176, 23.7271] // [longitude, latitude]
      },
      "properties": {
        "id": 1,
        "description": "Blocked road due to minor landslide",
        "category": "road_blockage",
        "status": "pending",
        "reportedAt": "2026-08-29T18:38:22.976Z",
        "photoUrl": null
      }
    }
  ]
}
```
**Tip:** You can use the `category` property to render different icons (e.g., a rock icon for landslides, a barrier icon for road blockages), and the `status` property to color-code them (e.g., yellow for `pending`, green for `resolved`).

## 2. Submitting a New Incident (The Form)
When a user fills out the "Report Incident" form on the UI, send that data to the POST endpoint.

**Endpoint:** `POST /api/incidents`
**Auth:** None required.
**Note:** This endpoint has rate-limiting enabled (max 5 requests per 15 minutes per IP) to prevent spam.

**Request Body (JSON):**
```json
{
  "description": "Tree fell across the highway",
  "category": "road_blockage", 
  "latitude": 23.7271,
  "longitude": 92.7176
}
```
*(All 4 fields are required).*

**Success Response (201 Created):**
Returns the newly created incident object. 
*(Once successful, you can optionally re-fetch the `GET /api/incidents` list to refresh the map).*

## 3. Admin: Updating Incident Status
If you are building an admin dashboard where authorities can mark an incident as verified or resolved, use this endpoint.

**Endpoint:** `PATCH /api/incidents/:id/status`
**Auth:** Requires the `x-api-key` header (the same one used for the AIML pipeline).

**Request Headers:**
`x-api-key`: `<YOUR_AIML_API_KEY>`

**Request Body (JSON):**
```json
{
  "status": "verified" // must be one of: "pending", "verified", "resolved"
}
```
