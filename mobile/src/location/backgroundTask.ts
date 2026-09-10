import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { deliveryPerson, getStoredToken } from '@/api';

export const LOCATION_TASK_NAME = 'chohealth-courier-location-task';

// Must be defined at module scope (not inside a component/hook) so it's
// registered before the app renders — this file is imported once from the
// root layout specifically to guarantee that.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[location-task]', error.message);
    return;
  }
  const { locations } = (data as { locations: Location.LocationObject[] }) ?? { locations: [] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  const token = await getStoredToken();
  if (!token) return;

  try {
    await deliveryPerson.pingLocation(latest.coords.latitude, latest.coords.longitude, token);
  } catch {
    // Best-effort — a dropped ping just means the patient's map goes a bit
    // stale until the next one lands; nothing to retry here.
  }
});

/** Foreground permission first, then background — Expo/iOS/Android both
 * require requesting them in that order; requesting "always" directly is
 * rejected. Call this only after the justification screen, right before the
 * courier clocks in for the first time. */
export async function requestLocationPermissions(): Promise<{ granted: boolean; reason?: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { granted: false, reason: 'foreground' };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return { granted: false, reason: 'background' };
  }
  return { granted: true };
}

export async function hasLocationPermissions(): Promise<boolean> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return fg.status === 'granted' && bg.status === 'granted';
}

/** Starts pinging /delivery/location/ every ~12s in the background. Called
 * right after a successful clock-in; stopped on clock-out/logout. */
export async function startLocationTracking(): Promise<void> {
  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (already) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 12000,
    distanceInterval: 15, // meters — skip redundant pings if stationary
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'CHOHEALTH Courier',
      notificationBody: "You're on duty — sharing your location for deliveries.",
    },
    pausesUpdatesAutomatically: false,
  });
}

export async function stopLocationTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

/** One-off foreground fix — used for the "arrived" geofence photo step,
 * where we want the freshest possible position rather than the last
 * background ping. Balanced (not High/GPS-only) so it can still resolve
 * quickly indoors via wifi/cell positioning instead of holding out for a
 * clean GPS lock; falls back to the last known fix (e.g. from the
 * background ping) rather than failing the whole "arrived" flow outright. */
export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch (err) {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    throw err;
  }
}
