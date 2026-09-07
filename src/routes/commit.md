# Recent Changes
This document outlines the updates from the last three commits to the repository. These changes focus on API refinement, dashboard enhancements, and adding crucial documentation for cross-team integration.
---
## 1. Update backend API contract to remove confidence and add risk-data endpoint
**Commit:** `437aeab19aba73346719d5d203f3d1d7a3e84f2b`
- **Removed `confidence` fields**: Cleaned up the Prisma database schema, `mapController.js`, and `seed.js` to remove the `confidence` metric, as the AIML pipeline no longer provides it.
- **New Endpoint for Grid Data**: Added a new endpoint at `GET /api/risk-data` to serve the ~4600 `GridPrediction` coordinates to the frontend heatmap component. 
- **Updated API Contract Docs**: Updated the `AIML_INTEGRATION_GUIDE.md` to reflect the removal of the `confidence` parameter from the expected POST payload.
- **Cleanup**: Removed an old `FRONTEND_EARLY_WARNINGS_GUIDE.md` file that is no longer needed.
## 2. Update AdminDashboard: fix CSS compatibility, fix alert endpoint, add override risk UI
**Commit:** `eeeb18cfc5156c17d22248d9c22765a1ea70cf13`
- **Override Risk Feature**: Added a new UI form on the `AdminDashboard` component allowing administrators to manually override a district's risk score for live demonstrations.
- **Fixed Alert Endpoint**: Corrected the fetch call logic for triggering the manual email alerts so the dashboard successfully communicates with the backend `POST /api/admin/alert` endpoint.
- **CSS Fixes**: Small fixes to `AdminDashboard.css` to improve styling compatibility and layout responsiveness.
## 3. docs: add integration guides for AIML and Frontend teams
**Commit:** `391890c182e620bd5f3231defca245394f5a0704`
- **AIML Integration Guide**: Added `AIML_INTEGRATION_GUIDE.md` detailing the `/api/map/national` POST endpoint contract, JSON schemas, and authorization requirements for pushing grid predictions and pilot city risk scores.
- **Frontend Integration Guide**: Added `FRONTEND_INTEGRATION_GUIDE.md` detailing the required endpoints for building the Admin Dashboard and Early Warning features, including authentication and incident moderation endpoints.