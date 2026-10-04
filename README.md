# Blackline Walk

Native Expo Android/iOS foundation for the Blackline walking and territory app.

## Current build

- Monochrome black-and-white interface with lime field accent.
- Walk dashboard with steps, distance, calories, and a walking CTA.
- Territory screen with a map-style field and three-day claim progress.
- Seven-day activity trend chart.
- Supabase email magic-link entry point.
- Supabase-backed activity and territory reads when a session exists.
- Foreground location permission flow for territory verification.
- Notification permission flow for future walk reminders.

## Backend

Supabase project: `Blackline Walk` (`fgmxqauuohxvvnispopb`), region `eu-west-1`, free plan.

The initial schema includes `profiles`, `daily_activity`, `territories`, `territory_visits`, and `territory_claim_progress`, with row-level security enabled.

Local configuration lives in `.env.local` and is intentionally ignored by Git. The publishable Supabase key is safe for client use; never put a service-role key in the mobile app.

## Run

```bash
npm install
npx expo start
```

For a browser check:

```bash
npx expo start --web
```

For Android, use an Android device/emulator with Expo tooling. iOS native builds require macOS/Xcode, but the project is ready for Expo Go or an EAS build.

## Important next implementation phase

The current UI is a real working foundation. The next native phase should add a background step counter, GPS distance sampling, server-validated territory geofencing, three-consecutive-day claim transactions, and scheduled local notifications. These require device testing and should not be faked from the client.
