# GoRide

A first working product preview for self-drive and chauffeur rentals in Bangalore, Chennai and Tirupati.

## What's included

- Responsive website with city, rental mode and vehicle category filters.
- Pick-up and return date validation, quote requests and a trip preview dialog.
- Native React Native / Expo app project for Android and iOS, matching the website's charcoal and lime design.
- Native date pickers, fleet browsing, city navigation and trip previews and WhatsApp quote requests in the app.
- Verified Wikimedia Commons fleet photos, an Unsplash hero and photographer credits in `dist/assets/images.json`.

This is a **preview**, not an operational rental platform. No reservations are created, no availability is verified, and no payment or personal data is collected. The fleet lists Maruti Suzuki Dzire, Maruti Suzuki Baleno and Hyundai i20; this interpretation of the supplied names should be confirmed. Photos are representative and prices are on request. WhatsApp: +91 9100852287. Calls: +91 8610235694. The app is not published in either store. Website and mobile currently use matching fleet data; there is no shared live backend.

## Website

Serve `dist/` with a static server. For example:

```sh
python3 -m http.server 4173 --directory dist
```

The Sites deployment manifest is `.openai/hosting.json`.

## Mobile development

```sh
cd mobile
npm ci
npm start
```

Run on an Expo-compatible development environment or a device with the matching Expo Go version. App entry point: `mobile/App.js`. Photos are remote HTTPS assets. Metro's Android and iOS export verifies JavaScript bundles; it does not create signed native applications or certify device behavior.

```sh
npx expo install --check
npx expo export --platform android --platform ios --output-dir export
```

## Before a customer launch

1. Supply actual vehicle models, images, city-specific inventory, self-drive and chauffeur rates, addresses and support contacts.
2. Supply rental prices and decide deposits, taxes, kilometre limits, pickup times, driver allowances, cancellation/refund rules and eligibility requirements.
3. Add the shared server, availability enforcement, booking records, staff operations and customer notifications. Connect payment collection with server-side payment verification. Current demo must not be represented as live availability.
4. Add the business's approved terms and privacy policy before collecting personal information.
5. Supply the business-owned domain and Apple Developer, Google Play Console and Expo accounts. Confirm unique iOS bundle identifier and Android package name; none is claimed by this project.
6. Configure identifiers in `mobile/app.json`, link an Expo project (`eas init`), create app icon and store assets, then build signed native apps using the supplied `mobile/eas.json` profiles.
7. Test on actual Android/iOS devices, complete store privacy disclosures and account requirements, and submit for review.

Do not paste account passwords, payment secrets or signing credentials into chat. Use the account providers' sign-in and credential flows.

Build reference: https://docs.expo.dev/build/setup/

## Image credits

Fleet images are cropped to fit and credited in the website footer and mobile How it works screen, with source and license links. See `dist/assets/images.json` for each exact source, author and license.

- Dzire: Biswarup Ganguly / Wikimedia Commons, CC BY 3.0.
- Baleno: Kannada DriveSpark / Wikimedia Commons, CC BY 3.0.
- i20: The Drivers Hub / Wikimedia Commons, CC BY 3.0.
- Hero: Samuele Errico Piccarini / Unsplash License.

Stock photographs do not show GoRide-owned vehicles or imply manufacturer endorsement.
