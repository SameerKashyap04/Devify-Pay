/**
 * Devify Pay — UPI Listener Android App
 *
 * Adapted from GpayReader (MIT) by InventiveGit-12:
 *   https://github.com/InventiveGit-12/GpayReader
 *
 * Key changes from the original:
 *  1. Regex updated to match Devify Pay publicId format: /pay_[a-zA-Z0-9]+/
 *  2. Endpoint changed to /v1/upi-notify (Devify Pay API)
 *  3. Added x-upi-secret auth header for security
 *  4. Added PhonePe and Paytm package support alongside Google Pay
 *  5. BACKEND_URL and SECRET read from AsyncStorage (set via App.tsx settings screen)
 */
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';

// UPI app package names to intercept (Google Pay + PhonePe + Paytm)
const UPI_PACKAGES = [
    'com.google.android.apps.nbu.paisa.user',       // Google Pay (consumer)
    'com.google.android.apps.nbu.paisa.merchant',   // Google Pay (merchant)
    'com.phonepe.app',                              // PhonePe
    'net.one97.paytm',                              // Paytm
];

// Regex to find Devify Pay payment publicId in notification text
// GPay sends something like: "₹500 received from Sameer. Note: pay_xyz123"
const PAYMENT_ID_REGEX = /pay_[a-zA-Z0-9]+/;

const headlessNotificationListener = async (data) => {
    if (!data) return;
    try {
        console.log('[DevifyPay] Incoming notification:', JSON.stringify(data));

        // Normalise: GpayReader pattern for handling string vs object
        let notification = null;
        if (data.notification) {
            notification = typeof data.notification === 'string'
                ? JSON.parse(data.notification)
                : data.notification;
        } else {
            notification = typeof data === 'string' ? JSON.parse(data) : data;
        }
        if (!notification) return;

        const appPackage = notification.app || notification.packageName || 'unknown';
        const messageText = (notification.text || notification.textBody || notification.title || '').trim();

        if (!messageText) {
            console.log('[DevifyPay] Skipping empty notification from:', appPackage);
            return;
        }

        console.log(`[DevifyPay] Notification from ${appPackage}: "${messageText}"`);

        // Only process UPI app notifications
        if (!UPI_PACKAGES.includes(appPackage)) {
            console.log('[DevifyPay] Ignoring non-UPI app:', appPackage);
            return;
        }

        // Extract Devify Pay payment ID from notification text
        const match = messageText.match(PAYMENT_ID_REGEX);
        if (!match) {
            console.log('[DevifyPay] No pay_ ID found in notification — not a Devify Pay transaction');
            return;
        }

        const paymentId = match[0];
        console.log('[DevifyPay] Extracted payment ID:', paymentId);

        // Read config from AsyncStorage (set by the App.tsx settings screen)
        const backendUrl = await AsyncStorage.getItem('devify_backend_url');
        const secret = await AsyncStorage.getItem('devify_upi_secret');

        if (!backendUrl || !secret) {
            console.log('[DevifyPay] ERROR: Backend URL or secret not configured. Open the app to configure.');
            return;
        }

        // Forward to Devify Pay API — adapted from GpayReader webhook POST
        const response = await fetch(`${backendUrl}/v1/upi-notify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-upi-secret': secret,          // Security: missing from original GpayReader
            },
            body: JSON.stringify({
                tn: paymentId,
                note: messageText,
                app: appPackage,
                timestamp: Date.now()
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('[DevifyPay] Payment verified:', result.message);
        } else {
            const errorText = await response.text();
            console.log('[DevifyPay] Server error:', response.status, errorText);
        }

    } catch (error) {
        console.log('[DevifyPay] Headless task error:', error);
    }
};

// Register headless task — runs even when app is killed / screen is off
// This is the core mechanism from GpayReader
AppRegistry.registerHeadlessTask(
    'RNAndroidNotificationListenerHeadlessJs',
    () => headlessNotificationListener
);

registerRootComponent(App);
