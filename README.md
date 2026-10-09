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

## Other launch work still pending

Live reservations, date-specific vehicle availability, customer accounts, online payment verification, booking operations and notifications are not implemented. Hiding a listing is not a booking calendar. Quote requests open WhatsApp for the customer to review/send; they do not create reservations. Confirm actual cars, rates, rental terms, business details and policies before launch.

WhatsApp: +91 9100852287. Calls: +91 8610235694.

## Image credits

Default fleet images are cropped and credited in the website footer and mobile information screen, with source links. Exact URLs, photographers and licenses are recorded in `dist/assets/images.json`.

- Dzire: Biswarup Ganguly / Wikimedia Commons, CC BY 3.0.
- Baleno: Kannada DriveSpark / Wikimedia Commons, CC BY 3.0.
- i20: The Drivers Hub / Wikimedia Commons, CC BY 3.0.
- Hero: Samuele Errico Piccarini / Unsplash License.

Stock photos do not show GoRide-owned cars or imply manufacturer endorsement. When uploading your own photos, use images you are entitled to display.
