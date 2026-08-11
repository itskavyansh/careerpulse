/**
 * testPush.ts — One-off manual push notification test
 *
 * Usage:
 *   npx tsx src/testPush.ts "ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]"
 *
 * Sends a single test push to the given Expo push token via the
 * Expo push API (https://exp.host/--/api/v2/push/send) and prints
 * the full response so you can confirm delivery was accepted.
 *
 * No expo-server-sdk needed — plain fetch is enough for a one-off test.
 */

const token = process.argv[2];

if (!token) {
    console.error('Usage: npx tsx src/testPush.ts "ExponentPushToken[...]"');
    process.exit(1);
}

if (!token.startsWith('ExponentPushToken[')) {
    console.warn(
        '⚠️  Warning: token does not look like an Expo push token.',
        'Expected format: ExponentPushToken[xxxx]',
    );
}

console.log('📤 Sending test push to:', token);

const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
        to: token,
        title: '🔔 CareerPulse test',
        body: 'Push notification plumbing works! 🎉',
        sound: 'default',
        priority: 'high',
    }),
});

console.log('📥 HTTP status:', response.status, response.statusText);

const json = await response.json();
console.log('📋 Response body:', JSON.stringify(json, null, 2));

if (json?.data?.status === 'ok') {
    console.log('✅ Expo accepted the push — check your phone!');
} else if (json?.data?.status === 'error') {
    console.error('❌ Expo returned an error:', json.data.message ?? json.data.details);
} else {
    console.log('ℹ️  Full response logged above, check status manually.');
}
