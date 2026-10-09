# GoRide

Customer website, native Android/iOS app source and a connected owner dashboard for GoRide rentals.

## Owner dashboard

Open https://goride-south.nagendra80.chatgpt.site/admin and sign in with the GoRide owner's existing ChatGPT account. Management APIs enforce the owner on the server; no password or secret is embedded in the apps. The current private Site's audience is preserved.

- **Cars & prices:** add or edit cars; choose category and seats; assign locations; enable self-drive/chauffeur; set whole-rupee daily base rates and deposits; add customer-visible rental notes; hide a listing or mark it under maintenance.
- **Photos:** upload JPG, PNG or WebP images up to 8 MB, or enter HTTPS image URLs. Uploads go to R2; saving the car attaches the image to its listing. Original stock-photo credits are retained until replaced. Cancelled/replaced uploads are retained in storage; automatic cleanup is not implemented.
- **Locations:** add or rename cities/pick-up areas, and pause locations. Paused locations are excluded from the customer catalogue. Car assignments remain for reactivation.
- Blank prices show “Request a quote.” Published rates are daily base prices, not a complete quote; taxes, fuel, kilometre limits and allowances must be explained in rental notes and confirmed with customers.
- Save updates the shared D1 catalogue. Website refresh/focus and mobile launch/resume/pull-to-refresh fetch the current records. A stale editor receives a conflict instead of overwriting another save.

The first authorized dashboard visit initializes the existing Dzire, Baleno and i20 and three cities once, preserving subsequent edits. Until that first visit, the catalogue serves those same starting records. No sample test prices are deployed.

## Website and server

- Customer website: `/`
- Owner dashboard: `/admin`
- Read-only catalogue: `/api/catalog`
- Owner APIs: `/api/admin/*`
- Uploaded photos: `/media/*`

Production runs a Cloudflare-compatible Worker, with logical `DB` and `BUCKET` bindings in `.openai/hosting.json`. Schema definitions are in `db/schema.ts`; Drizzle migrations are checked in under `drizzle/`. Production schema changes are migration-owned. No browser storage is used as a database.

```sh
npm ci
npm run build
npm test
```

For a local preview:

```sh
node scripts/preview.mjs
```

The preview listens only on `127.0.0.1:4173` and injects a **local test identity** to exercise owner flows. This script is not deployed. Local D1/R2 state is under ignored `.sites-runtime/` and is never published. Backend integration tests use isolated D1/R2 emulators to verify authorization, rates, stale-write conflicts, location filtering and uploads.

## Mobile app

```sh
cd mobile
npm ci
npm start
npx expo export --platform android --platform ios --output-dir export
```

`mobile/App.js` now fetches `/api/catalog` from `EXPO_PUBLIC_API_URL` (defaults to the GoRide Site). It does not bundle owner credentials. Copy `mobile/.env.example` to `.env` only when changing the API URL; this URL is public configuration, not a secret. Images and rates come from the shared catalogue.

**The Site remains owner-private.** Anonymous native clients cannot read the private API; the app shows an unavailable state rather than misleading bundled data. Public customer access must be enabled deliberately at launch, or an appropriate mobile authentication flow must be built. Management endpoints remain owner-protected independently of Site audience. Do not embed the platform service token in a mobile build.

Android and iOS JavaScript bundle exports verify compilation, not signed native binaries or device behavior. Apple Developer/Google Play accounts, unique identifiers, signing, device QA, icons, store disclosures and review are still pending.

## Customer app and separate Admin Panel (1.3.0)

One customer app serves Android and iOS. It includes Explore, Cities, Help and Bookings. There is no owner tab, owner component or management screen in the customer app. Customer WebView navigation rejects admin destinations. The customer website has no admin dashboard link.

The owner opens the separate protected Admin Panel at `/admin` on a phone or laptop, signing in with the authorized owner's ChatGPT account. Fleet, prices, locations, bookings, private documents, feedback and review moderation remain there. No second owner app or store listing is needed.

The server authorizes every admin page, script, stylesheet and API request; hiding links alone is not security. Existing older APKs may retain an Owner tab, but server authorization still applies. Install 1.3.0 to remove it.

The site remains owner-private at the user's request. Native catalogue requests remain unavailable until the audience is deliberately changed or native authentication is provided. Customer Bookings uses the platform ChatGPT sign-in in an embedded browser; real-device authentication and upload behavior still require verification. No credentials are embedded.

Android and iOS source exports validate compilation. Android test APKs use the existing EAS project and signing key. A signed iPhone installer/App Store submission needs Apple Developer enrollment and iOS signing, not yet available. Play Store release also needs the user's Google Play Console account. Store review, release artwork and production readiness checks remain pending.

## Other launch work still pending

Email/password customer sign-in is implemented; enable it with GORIDE_EMAIL_LOGIN=enabled. SMS sign-in, online payments, native push and live WhatsApp/SMS delivery are not enabled. Accepted bookings enforce date availability per car listing. Customer records use their authenticated customer account; legacy private-preview records remain separate. Hiding a listing is not a booking calendar. Quote requests open WhatsApp for the customer to review/send; they do not create reservations. Confirm actual cars, rates, rental terms, business details and policies before launch.

WhatsApp: +91 9100852287. Calls: +91 8610235694.

## Image credits

Default fleet images are cropped and credited in the website footer and mobile information screen, with source links. Exact URLs, photographers and licenses are recorded in `dist/assets/images.json`.

- Dzire: Biswarup Ganguly / Wikimedia Commons, CC BY 3.0.
- Baleno: Kannada DriveSpark / Wikimedia Commons, CC BY 3.0.
- i20: The Drivers Hub / Wikimedia Commons, CC BY 3.0.
- Hero: Samuele Errico Piccarini / Unsplash License.

Stock photos do not show GoRide-owned cars or imply manufacturer endorsement. When uploading your own photos, use images you are entitled to display.


## Customer records, documents and reviews (1.2.0)

- `/account` starts dispatch-owned ChatGPT sign-in and shows only the current user's bookings. While owner-private, only the owner can test this flow; public or additional visitor access was explicitly declined on 9 October 2026.
- Requests save full name, age (18–100), contact phone/email, car/location/rental mode, pickup/return dates, request creation timestamp and consent timestamp. Owner sets requested/confirmed/completed/cancelled status manually; no automatic inventory lock or payment.
- Each booking can have a driving licence and optional **already masked** Aadhaar image. Consent and masked-image confirmation are required. The app does not perform masking, OCR or document verification. JPG/PNG/WebP up to 8 MB; not PDF/HEIC. The owner should review documents manually.
- Identity bytes live under `private/` in R2. No public `/media/` URL can read that prefix. Customer document routes authorize booking ownership; admin document routes authorize the owner. Responses use no-store. Customer and owner can permanently delete individual images. Replacement removes previous image bytes. There is no automatic retention schedule or full customer-record deletion UI yet; agree retention before accepting real documents.
- Feedback is owner-only. Reviews require a completed booking, customer permission and a rating from 1–5. They start pending; only approved reviews expose the chosen display name, rating, review and date. Do not approve reviews containing private customer details. No fabricated reviews are seeded.
- Owner navigation adds **Bookings & customers** and **Reviews & feedback**. Mobile 1.3.0 retains **Bookings** and removes the Owner tab. Use the separate Admin Panel for management. Older APKs need replacement to show the clean customer navigation.
- Automated Worker tests cover cross-customer isolation, admin authorization, CSRF origin checks, invalid booking data, document consent, private storage routing/deletion, completed-ride review eligibility and moderation. Android/iOS bundle export validates compilation only. Embedded sign-in and document picker still need testing on the user's phones.


## Booking decisions and alerts

Requests move from requested to confirmed (shown as Accepted), rejected or cancelled. Accepted bookings can be completed or cancelled; terminal decisions cannot be reopened. Acceptance requires an agreed whole-rupee rental total. Rejection/cancellation requires a customer-visible reason. A version check rejects stale decisions.

A single atomic SQL update checks for overlapping confirmed/completed bookings for the same car listing. This prevents simultaneous owners accepting overlapping requests. New requests also reject dates occupied by an accepted/completed booking. Rental ranges are [pickup date, return date), so a returning car can be booked again on the return date. Each listing must represent one physical car; add separate listings for multiple cars of the same model. Cancelling releases dates; completed rentals keep their historical dates blocked. No payment collection or automatic document verification is added.

D1 notifications are saved in the same transaction as the request/decision. Owner and customer screens refresh alerts every 20 seconds while open, and on focus. Each recipient can mark their own alerts read. Customers cannot read owner/other-customer alerts. These are in-app alerts, not background phone push. The existing Android/iPhone Bookings WebView loads this update automatically, with no new native dependency.

### Optional Twilio WhatsApp/SMS adapter

Messaging is inactive until runtime values are configured securely. Keep all keys server-side and out of EXPO_PUBLIC_* settings. See `.env.example` for names only. SMS needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_SMS_FROM. WhatsApp also needs TWILIO_WHATSAPP_FROM and an approved TWILIO_WHATSAPP_CONTENT_SID template whose variable {{1}} accepts the generic booking alert text. Business-initiated WhatsApp requires an approved template. Enable production messaging only after provider onboarding and end-to-end phone testing, including any applicable sender registration.

Customer phone alerts are opt-in on the request form (none, SMS or WhatsApp), with an alert consent timestamp. Existing bookings remain in-app only. Owner alerts use GORIDE_OWNER_ALERT_CHANNEL and GORIDE_OWNER_ALERT_PHONE. Phone messages contain only booking references, car/dates or decision/price/note; no document images, identity numbers or private download links.

Delivery runs after the saved transaction. Missing configuration or provider failure never rolls back a booking. Submitted means the provider accepted the request, not delivered to the handset. No status callback is implemented. The owner can retry explicitly rejected/unconfigured messages. Unknown responses and interrupted sending states require checking provider logs; they are not automatically retried to avoid duplicate billable messages. Messaging has been tested with a fake provider only; no real message has been sent or delivery verified.

Official references: https://www.twilio.com/docs/messaging/api/message-resource and https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates .


## Optional customer SMS backend (1.4.0)

The retained optional SMS API supports Indian mobile-number sign-in using six-digit SMS codes via Twilio Verify. The current /login UI uses email and password instead. The provider creates and checks the code; no app-generated or test code is deployed. Enable with server-only TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID (a Verify Service configured for six-digit codes). No provider account is connected and no real OTP has been sent or verified yet. Provider configuration and real-phone QA remain required before declaring phone login operational.

The Site's private dispatch-owned ChatGPT gate remains in place at the user's request. Phone login is an additional customer identity behind that gate during testing, not a bypass. Anonymous public browsing still requires an explicitly authorized audience change. Only when both email login and Verify are disabled can existing signed-in platform users continue the private test flow. Once configured, customer APIs require verified phone sessions; admin APIs continue using the platform-authorized owner email only.

Verified sessions last seven days. A 256-bit opaque token lives only in a Secure, HttpOnly, SameSite=Lax host cookie; D1 holds its SHA-256 hash. Logout revokes the token. Challenges expire after ten minutes, accept at most five code attempts, are consumed once, and bind the provider verification ID to the requested phone. Resends have a rolling sixty-second cooldown plus per-phone/per-IP limits. Authentication POSTs require same-origin requests. No OTP or provider secret is returned, stored in browser storage or logged.

Each verified phone has a separate customer ID. Bookings must use that verified number. Phone identity never grants owner permissions. Existing private test bookings are not automatically linked by typed phone numbers, which were previously unverified. Expired challenges, auth-limit records and sessions are cleaned in bounded batches during authentication; an automatic account/session retention policy is not yet provided.

Mobile 1.4.0 removes the old native shell signout shortcut; use Sign out inside My bookings to revoke the phone session. Replace older APKs before enabling phone login. Android and iPhone use the same protected customer pages. On a still-private Site, signing out of phone login does not necessarily end the separate platform session. Phone verification and document picker behavior require on-device testing.

Official Verify API references: https://www.twilio.com/docs/verify/api/verification and https://www.twilio.com/docs/verify/api/verification-check .

### Email and password customer login

Set the server runtime variable `GORIDE_EMAIL_LOGIN=enabled` to use the first-party customer login without an SMS or email delivery provider. Registration, password login and recovery share `/login`, including the customer app's My bookings view. Passwords require 15–128 characters and are independently salted PBKDF2-SHA256 hashes (100,000 iterations, Workers WebCrypto limit). Authentication attempts have per-IP and per-email server limits. Session tokens use the existing hashed, seven-day HttpOnly secure cookies. Owner privileges still require the separately authorized platform owner identity.

Customers receive a random 256-bit recovery code at registration and must save it privately. The server stores only its SHA-256 hash. Recovery rotates the password and recovery code and revokes every old session. There is no email delivery, email verification, phone verification or email-based password reset. The login does not establish ownership of a typed email address. Existing preview/phone bookings are never linked automatically by a matching email or phone. A customer who loses both password and recovery code cannot recover through this flow; manual identity review would be needed. Runtime hosting/storage usage can still incur platform charges; this removes messaging-provider charges, not all operating costs.

When enabled, unverified platform preview identities cannot access customer account APIs without a customer session. The site's private audience gate remains in place. Native version 1.4's My bookings WebView loads this web login; older shells should update to version 1.4 for correct customer-session sign-out. Actual Android/iOS device sign-in, recovery and upload QA remain required before release.

### GoRide visual refresh (mobile 1.5.0)

Customer web and native screens share midnight navy (#101e33), cobalt blue (#2555e8), white and pale blue surfaces. The home page uses a compact two-line hero, a clear rental-mode selector, separate date fields, larger vehicle cards and a mobile-visible My bookings link. Login, account and review surfaces use the same palette. No booking permissions or data visibility changed. Verified responsive home layouts at 320px and 1440px and checked car-image loading/trip preview in the local browser. Android/iOS exports compile; actual-device QA and Apple signing are still pending. A new APK is required for the native Explore/Cities/Help design.

### Car slideshows (mobile 1.6.0)

The marketing banner rotates three representative car photos every six seconds; users can select a slide or pause it. Reduced-motion settings disable autoplay. Vehicle cards have swipeable, keyboard-accessible front/rear galleries. Owners can upload up to seven extra photos per listing through Edit car; each gallery photo is validated server-side and stored in the existing car JSON. Existing single-photo rows receive the verified default rear view only if their cover still matches the original launch photo; owner-supplied covers are preserved without assumed gallery images. An explicitly empty gallery suppresses defaults.

The old footer and mobile Help credit lists were removed. Required Commons attribution remains on /image-information, linked by a discreet info button on credited photos. Own photos with no required attribution do not show the info button. Hero photos use the Unsplash License. Images are representative and do not establish actual fleet inventory.


## Booking details — October 2026
Customer requests require pickup/return dates and HH:mm times in IST, meeting-point addresses and optional trip notes. Same-day trips are supported; exact accepted time intervals are checked atomically for conflicts. Existing date-only records retain legacy midnight boundaries and display a time-to-confirm label.

Owner acceptance requires a whole-rupee quote breakdown with kilometre/hour allowances, extra rates, deposit, fuel, toll/parking and permit arrangements. Rental total excludes the refundable deposit. Agreed quote snapshots persist on the booking and remain visible after completion or cancellation. Prices and terms must still be discussed with the customer; no online payment or automatic tax computation is implemented. The customer app uses the same protected booking WebView, so this update does not require a native build.


## Customer cancellation requests
Active requested/accepted bookings can have one pending customer cancellation. The reason and timestamp persist in a private history. Submission increments the booking version without changing its status or releasing the car. Owner approval cancels and releases the car; decline leaves status and quote intact. Pending cancellations must be reviewed before normal booking transitions. Both submission and decision have idempotent request identifiers and atomic version guards; notifications are recorded in the same transaction. No cancellation fees or refunds are calculated or processed by this feature. The owner must assess notice using the recorded customer request time. Customer and owner WebViews use the same protected pages.

### Payment and deposit records

Owners can append records of rental/deposit money already received or refunded outside GoRide from Bookings & customers. Customers see only their own booking's payment history, rental balance and deposit held. Records preserve the original quote and booking status, trigger an in-app customer notice, and cannot be edited or deleted. Amounts are positive whole rupees; net receipts cannot exceed the quoted rental/deposit amount and refunds cannot exceed money held. Received money can only be recorded on accepted/completed bookings. Cancelled bookings show “Contact GoRide” for rental balance because cancellation settlement is agreed separately. This is not a tax invoice, payment gateway, automatic charge, deposit deduction or refund service. Do not include account/card/identity numbers in notes or references.

### Owner availability calendar

Owner navigation → Availability calendar provides a month view with a car-listing filter and a selected-day agenda. Its owner-only API queries the full month independently of the 200-record recent-bookings list. Accepted/completed bookings mark reserved days; requested bookings are shown separately and do not reserve cars. Cancelled/rejected bookings are excluded. Boundaries use the same IST pick-up/return timestamps as acceptance checks, with an exclusive return time; legacy bookings use midnight boundaries and show an explicit time warning. Each listing must represent one physical car. Listing maintenance/hidden status is shown when filtered; empty days do not guarantee operational availability. The calendar refreshes with the owner panel and does not change booking decisions. Monthly queries above 1,000 matches require narrowing to a car rather than silently truncating results.
