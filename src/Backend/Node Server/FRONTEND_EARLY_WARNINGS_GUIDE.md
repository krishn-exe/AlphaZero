# Frontend Guide: Early Warnings (Subscribe for Alert)

This guide explains how the frontend should integrate with the newly built "Early Warnings" backend API (Slice 3).

## 1. Subscribing to Alerts
When a user wants to receive email notifications for high/severe landslide risks, they will use the "Subscribe" box on the landing page.

**Endpoint:** `POST `
**Auth:** None required.
**Note:** This endpoint has rate-limiting enabled (max 10 requests per 1 hour per IP) to prevent spam.

**Request Body (JSON):**
```json
{
  "email": "user@example.com",
  "phone": "+91XXXXXXXXXX", // Optional: just stored, SMS is not sent currently
  "districtId": 55          // Optional: If omitted/null, they subscribe to ALL NER districts
}
```

**Success Response (201 Created):**
Returns the newly created subscriber object. 
*(Once successful, the backend automatically sends a real confirmation email to the user via Resend!)*

**Frontend UX Tip:** 
When the API returns a 201, show a success toast or checkmark message like: *"Success! Please check your inbox for a confirmation email."*

## 2. Displaying Total Subscriber Count (Optional)
If you want to add social proof to the landing page (e.g., "Join 5,432 others receiving alerts"), you can fetch the total number of subscribers.

**Endpoint:** `GET /api/subscribe/count`
**Auth:** None required.

**Response Format:**
```json
{
  "count": 124
}
```

## How the Real-Time Alerts Work (For your context)
You do **not** need to trigger the alert emails from the frontend. The backend handles this automatically.
Whenever the AIML team updates a district's risk score (via `PUT /api/map/district/:id/risk`), the backend checks if the district's risk level jumped from `low/medium` to `high/severe`. If it did, the backend immediately queries the database and blasts out warning emails to everyone subscribed to that district. 
