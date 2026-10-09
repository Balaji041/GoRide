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

## Owner access inside the mobile app

In the updated GoRide app, tap **Owner** in the bottom navigation, then **Owner Login**. The app embeds the existing protected owner dashboard in a native WebView; it does not send the owner to an external dashboard URL or introduce a separate GoRide password. Sign in with the existing GoRide owner's ChatGPT account. Car, price, photo and location management reuse the same server-authorized dashboard and database.

The in-app workspace has back/refresh controls, sign-out, loading/error recovery and HTTPS navigation restrictions. Owner credentials are not injected or bundled. Returning to customer mode retains the signed-in owner session; use Sign out to end it. iOS photo/camera purpose descriptions are configured for vehicle image selection. The native WebView dependency requires an updated app build.

Android and iOS bundle compilation and navigation-policy checks passed. No Android emulator, iOS simulator or attached device is available here. **On-device sign-in, sign-out, keyboard/back behavior and photo selection remain unverified.** Identity providers may restrict embedded sign-in; test the actual provider used by the owner before release. This implementation does not bypass those restrictions or replace them with an unverified native OAuth flow.

The user intends to test both Android and iPhone. EAS preview/production profiles are in `mobile/eas.json`. A new signed build needs the user's Expo project/account and applicable Apple signing setup; store release additionally needs Apple Developer and Google Play Console accounts. No APK, IPA, TestFlight release or store submission is included in the source archive. Native app build reference: https://docs.expo.dev/build/setup/ . WebView integration reference: https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md .

## Other launch work still pending

Automatic reservations, date-specific vehicle availability, app-owned phone/email sign-in, online payment verification and notifications are not implemented. Booking requests and customer records use the platform ChatGPT identity; they are not a reservation or payment system. Hiding a listing is not a booking calendar. Quote requests open WhatsApp for the customer to review/send; they do not create reservations. Confirm actual cars, rates, rental terms, business details and policies before launch.

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
- Owner navigation adds **Bookings & customers** and **Reviews & feedback**. Mobile 1.2.0 adds **Bookings**, using the protected customer page in a WebView. The previously installed 1.1.0 APK needs replacement to show that tab. Existing Owner dashboard gains its new features when refreshed.
- Automated Worker tests cover cross-customer isolation, admin authorization, CSRF origin checks, invalid booking data, document consent, private storage routing/deletion, completed-ride review eligibility and moderation. Android/iOS bundle export validates compilation only. Embedded sign-in and document picker still need testing on the user's phones.
