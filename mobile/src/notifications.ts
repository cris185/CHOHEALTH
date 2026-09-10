import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';
import { deliveryPerson } from '@/api';

// expo-notifications' remote-push code throws as soon as it's imported when
// running inside Expo Go on Android (removed from Expo Go in SDK 53 — it
// only works in a real dev/production build). require() it lazily, only
// once we've already bailed out of Expo Go below, so Expo Go never
// evaluates that module at all.
const isExpoGo = Constants.appOwnership === 'expo';

/** Requests notification permission, grabs an Expo push token, and saves it
 * on the courier's profile — call once after login/clock-in. No-ops quietly
 * on Expo Go, a simulator, or before an EAS project id is configured, since
 * none of those can receive a real push anyway. */
export async function registerForPushNotifications(token: string): Promise<void> {
  if (isExpoGo || !Device.isDevice) return;

  // Must stay a lazy require(), not a static import, so Expo Go never evaluates it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications: typeof NotificationsType = require('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('delivery-offers', {
      name: 'Delivery offers',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    // EAS hasn't been configured yet for this app — nothing to register
    // against. The rest of the app works fine without push; offers still
    // show up via the /delivery/offers/mine/ poll on the home screen.
    return;
  }

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const formData = new FormData();
  formData.append('expo_push_token', expoPushToken);
  await deliveryPerson.updateProfile(formData, token).catch(() => {});
}
