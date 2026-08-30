# Early Warnings Feature — Plan

Third backend slice for SIH26001, following the heatmap and incident
reporting features. Covers the "Get Early Warnings" subscribe box on
the landing page.

---

## Scope decision: email real, SMS faked

**Email — will actually be sent.** Genuinely easy and free at
hackathon scale via a provider like Resend (100 emails/day free tier,
simple API) or Nodemailer + Gmail SMTP. No reason to fake this.

**SMS — will NOT actually be sent.** Twilio's free trial only sends
to phone numbers manually pre-verified in their dashboard — a judge's
real number won't work. Reliable India SMS gateways need business/DLT
registration, which is a multi-day compliance process, not something
buildable in the remaining hackathon time. Phone numbers will still be
collected and stored (so the feature looks complete and the data
exists for later), but no send attempt will be made. If the frontend
has an SMS toggle, it should be labeled "coming soon" rather than
implied to work.

---

## Data model

```prisma
model Subscriber {
  id            Int       @id @default(autoincrement())
  email         String
  phone         String?   // stored only, not used to send anything yet
  districtId    Int?      // null = alerts for all NER, or subscribe to one district
  district      District? @relation(fields: [districtId], references: [id])
  subscribedAt  DateTime  @default(now())
}
```

No `City` relation planned — subscriptions are district-scoped, matching
the national heatmap's granularity. Can be revisited if city-level
subscriptions become relevant later.

---

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/subscribe` | none | Store a new subscriber, send a real confirmation email |
| GET | `/api/subscribe/count` | none | Return total subscriber count — optional, useful for a landing-page stat |

### POST /api/subscribe — request body
```json
{
  "email": "user@example.com",
  "phone": "+91XXXXXXXXXX",
  "districtId": 55
}
```
Only `email` is required. `phone` and `districtId` are optional.

### What happens on a successful POST
1. Validate email format (basic regex, not full RFC validation — not
   worth over-engineering for this).
2. Save the subscriber row.
3. Send a real confirmation email via Resend: "You're subscribed to
   landslide risk alerts for [district name / all NER districts]."
4. Return the created subscriber (minus nothing sensitive — email
   itself is fine to echo back).

---

## Real alert trigger

Once subscribers exist, the more impressive version is triggering a
real email automatically when a subscribed district's `riskLevel`
crosses into `high` or `severe` — tying this feature back into the
heatmap's existing risk-bucketing logic instead of only sending a
one-time confirmation.

Simplest approach: check this inside the existing
`updateDistrictRisk`/`updateCityRisk` controllers (the same PUT
endpoints AIML calls) — after a score update, if the new `riskLevel`
is high/severe and previously wasn't, look up subscribers for that
district and send them a real email. This reuses infrastructure
already built rather than adding a separate cron job or polling
service, which would be more setup than the remaining time justifies.

---

## Build order

1. `Subscriber` schema + migration
2. Set up Resend (or Nodemailer) — get an API key, test sending one
   email manually before wiring it into the endpoint
3. `POST /api/subscribe` — save subscriber, send confirmation email
4. `GET /api/subscribe/count` (quick, optional)
5. Stretch: wire real-time risk-crossing alerts into the existing
   risk-update endpoints

---

## Explicitly out of scope

- Actual SMS sending (see decision above)
- Unsubscribe flow
- Email templates/branding beyond plain text
- Digest emails (daily/weekly summaries) — only immediate
  confirmation + optional real-time risk alerts are in scope