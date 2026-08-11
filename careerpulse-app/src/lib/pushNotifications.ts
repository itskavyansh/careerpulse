import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';

/**
 * Registers the device for Expo push notifications and returns the token.
 *
 * Returns null if:
 *   - Running on a simulator/emulator (push doesn't work there)
 *   - The user denies notification permission
 *   - Token retrieval fails for any reason
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    // 1. Push notifications only work on physical devices.
    if (!Device.isDevice) {
        Alert.alert(
            'Physical device required',
            'Push notifications only work on a real device. Skipping token registration.',
        );
        return null;
    }

    // 2. Android requires a notification channel to be set up.
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2563eb',
        });
    }

    // 3. Request permission — reuse existing grant if already approved.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        Alert.alert(
            'Permission denied',
            'Notification permission was denied. You can enable it in Settings.',
        );
        return null;
    }

    // 4. Get the Expo push token.
    //    projectId comes from app.json extra.eas.projectId (preferred) or
    //    the EAS build config. Falls back gracefully for Expo Go testing.
    try {
        const projectId: string | undefined =
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId;

        const tokenData = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined,
        );
        console.log('[Push] Token registered:', tokenData.data);
        return tokenData.data;
    } catch (err) {
        console.warn('[Push] Failed to get push token:', err);
        return null;
    }
}
