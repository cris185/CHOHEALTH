# CHOHEALTH Courier

React Native (Expo Router) app for delivery couriers — the operational half of the real-GPS delivery feature. The web dashboard (`frontend/src/app/dashboard/delivery`) is read-only (history, stats, profile); every action that requires the courier's live location happens here instead, because a browser tab can't reliably keep tracking once it's backgrounded or the phone is locked.

## What it does

- Clock in/out and take breaks — gates whether the backend's assignment algorithm considers you a candidate.
- Background location: pings `PATCH /delivery/location/` every ~12s while on duty (`src/location/backgroundTask.ts`), independent of whether a delivery is active.
- Receives delivery offers (push via `expo-notifications`, with a polling fallback on the home screen so the app still works before push is configured) — accept/decline with a 45s countdown.
- Drives a delivery through its two real stage transitions: "Start Transit" (`picked_up` → `on_the_way`, this is what makes the patient's map go live) and "Mark Arrived" (`on_the_way` → `delivered`, requires a proof photo + the courier's current GPS position, checked against the delivery address as a soft geofence).

## Getting started

```bash
cd mobile
npm install

# create mobile/.env
echo "EXPO_PUBLIC_API_URL=https://chohealth-api.cristianpuentes.com/api" > .env

npx expo start
```

Open in Expo Go on a physical device for real GPS/camera behavior. The iOS Simulator and Android emulator can fake a location but not push or background tracking, so they're only useful for UI checks — see the two gaps below for what Expo Go itself still can't do.

## Known gap: background location doesn't run in Expo Go on Android

`startLocationTracking` (`src/location/backgroundTask.ts`) calls `Location.startLocationUpdatesAsync`, which logs "Background location is limited in Expo Go: On Android, it is not available at all" and doesn't actually keep tracking once the app is backgrounded or the screen locks — Expo Go on Android only runs it in the foreground. iOS Simulator can fake background location; a real device needs a development build (`eas build --profile development`) for this to work for real on Android. Until then, keep the app foregrounded during a test delivery — foreground pings work fine, and the patient's live map updates normally as long as the courier's screen is on.

## Known gap: push notifications need an EAS project

`registerForPushNotifications` (`src/notifications.ts`) looks for `Constants.expoConfig?.extra?.eas?.projectId`, which isn't set yet — this project hasn't been linked to an EAS project (`eas init` / `eas.json`). It also skips itself entirely on Expo Go (`Constants.appOwnership === 'expo'`), since Expo Go dropped remote push support for SDK 53+ — it throws on import otherwise. Until push is set up, offers still reach the courier via the 5s poll on the home screen (`src/app/home.tsx`), so the app is fully usable — offers just won't show up as a push notification when the app is backgrounded, only the next time it's foregrounded or the poll fires.

## Structure

```
src/
  api.ts                    — API client (mirrors frontend/src/lib/api.ts's fetchAPI pattern)
  context/AuthContext.tsx   — token storage (AsyncStorage) + session bootstrap
  location/backgroundTask.ts — TaskManager-based background GPS ping + permission flow
  notifications.ts          — push token registration
  app/                      — Expo Router screens (file-based routing, same idea as the Next.js frontend)
```
