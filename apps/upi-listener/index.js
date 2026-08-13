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
 *  6. Added Paytm notification parser — extracts amount from
 *     "Received ₹X from <Name>" pattern for amount-based payment matching
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

// Paytm notification patterns:
// Title: "Received ₹1 from Sameer Kashyap"
// Body:  "Deposited in your NSDL Payments Bank - 4792 on 13 August at 3:47 PM"
const PAYTM_RECEIVED_REGEX = /Received\s+[₹Rs\.]+([\d,\.]+)\s+from\s+(.+)/i;

// PhonePe notification patterns:
// "You have received Rs. 500.00 from Sameer Kashyap"
// "Payment of Rs 500 received from ..."
const PHONEPE_RECEIVED_REGEX = /(?:received|you have received)\s+(?:[₹Rs\.]+)?([\d,\.]+)/i;

/**
 * Parse a Paytm notification and extract amount in paise and sender name.
 * Returns null if not a payment-received notification.
 */
function parsePaytmNotification(title = '', body = '') {
    const match = title.match(PAYTM_RECEIVED_REGEX);
    if (!match) return null;

    const amountStr = match[1].replace(/,/g, ''); // remove thousand separators
    const amountRupees = parseFloat(amountStr);
    if (isNaN(amountRupees) || amountRupees <= 0) return null;

    const amountPaise = Math.round(amountRupees * 100);
    const senderName = match[2].trim();

    return { amountPaise, senderName };
}

/**
 * Parse a PhonePe notification and extract amount in paise.
 * Returns null if not a payment-received notification.
 */
function parsePhonePeNotification(title = '', body = '') {
    // PhonePe shows received payments in body or title
    const fullText = `${title} ${body}`;
    const match = fullText.match(PHONEPE_RECEIVED_REGEX);
    if (!match) return null;

    const amountStr = match[1].replace(/,/g, '');
    const amountRupees = parseFloat(amountStr);
    if (isNaN(amountRupees) || amountRupees <= 0) return null;

    return { amountPaise: Math.round(amountRupees * 100) };
}

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
        const notifTitle = (notification.title || '').trim();
        const notifBody = (notification.text || notification.textBody || notification.bigText || '').trim();
        const messageText = notifBody || notifTitle;

        if (!notifTitle && !notifBody) {
            console.log('[DevifyPay] Skipping empty notification from:', appPackage);
            return;
        }

        console.log(`[DevifyPay] Notification from ${appPackage}: title="${notifTitle}" body="${notifBody}"`);

        // Only process UPI app notifications
        if (!UPI_PACKAGES.includes(appPackage)) {
            console.log('[DevifyPay] Ignoring non-UPI app:', appPackage);
            return;
        }

        // Read config from AsyncStorage (set by the App.tsx settings screen)
        const backendUrl = await AsyncStorage.getItem('devify_backend_url');
        const secret = await AsyncStorage.getItem('devify_upi_secret');

        if (!backendUrl || !secret) {
            console.log('[DevifyPay] ERROR: Backend URL or secret not configured. Open the app to configure.');
            return;
        }

        // ---------------------------------------------------------------
        // Strategy 1: Extract Devify Pay payment ID from notification text
        // Works for: Google Pay (includes UPI note/txn desc in notification)
        // ---------------------------------------------------------------
        const payIdMatch = (notifTitle + ' ' + notifBody).match(PAYMENT_ID_REGEX);
        if (payIdMatch) {
            const paymentId = payIdMatch[0];
            console.log('[DevifyPay] Strategy 1 — Extracted pay_ ID:', paymentId);

            const response = await fetch(`${backendUrl}/v1/upi-notify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-upi-secret': secret,
                },
                body: JSON.stringify({
                    tn: paymentId,
                    note: messageText,
                    app: appPackage,
                    timestamp: Date.now(),
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('[DevifyPay] Payment verified:', result.message);
            } else {
                const errorText = await response.text();
                console.log('[DevifyPay] Server error:', response.status, errorText);
            }
            return;
        }

        // ---------------------------------------------------------------
        // Strategy 2: Amount-based matching for Paytm and PhonePe
        // Paytm: "Received ₹1 from Sameer Kashyap"
        //        "Deposited in your NSDL Payments Bank - 4792 on ..."
        // PhonePe: "You have received Rs. 500.00 from ..."
        // ---------------------------------------------------------------
        let parsedAmount = null;
        let parsedSender = null;

        if (appPackage === 'net.one97.paytm') {
            const parsed = parsePaytmNotification(notifTitle, notifBody);
            if (parsed) {
                parsedAmount = parsed.amountPaise;
                parsedSender = parsed.senderName;
                console.log(`[DevifyPay] Strategy 2 (Paytm) — Amount: ₹${parsedAmount / 100}, Sender: ${parsedSender}`);
            }
        } else if (appPackage === 'com.phonepe.app') {
            const parsed = parsePhonePeNotification(notifTitle, notifBody);
            if (parsed) {
                parsedAmount = parsed.amountPaise;
                console.log(`[DevifyPay] Strategy 2 (PhonePe) — Amount: ₹${parsedAmount / 100}`);
            }
        }

        if (parsedAmount) {
            const response = await fetch(`${backendUrl}/v1/upi-notify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-upi-secret': secret,
                },
                body: JSON.stringify({
                    amount_paise: parsedAmount,
                    sender: parsedSender,
                    note: `${notifTitle} | ${notifBody}`.trim(),
                    app: appPackage,
                    timestamp: Date.now(),
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('[DevifyPay] Payment verified (amount-match):', result.message);
            } else {
                const errorText = await response.text();
                console.log('[DevifyPay] Server error:', response.status, errorText);
            }
            return;
        }

        console.log('[DevifyPay] Could not identify payment from notification — skipping');

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
