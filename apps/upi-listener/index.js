/**
 * Devify Pay — UPI Listener Android App
 *
 * Adapted from GpayReader (MIT) by InventiveGit-12:
 *   https://github.com/InventiveGit-12/GpayReader
 */
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';

const UPI_PACKAGES = [
    'com.google.android.apps.nbu.paisa.user',       // Google Pay (consumer)
    'com.google.android.apps.nbu.paisa.merchant',   // Google Pay (merchant)
    'com.phonepe.app',                              // PhonePe
    'com.phonepe.app.business',                     // PhonePe Business
    'net.one97.paytm',                              // Paytm
    'com.paytm.business',                           // Paytm Business
];

const PAYMENT_ID_REGEX = /pay_[a-zA-Z0-9]+/;

// Paytm notification patterns: "Received ₹1 from Sameer Kashyap"
const PAYTM_RECEIVED_REGEX = /Received\s+[₹Rs\.\s]*([\d,\.]+)\s+from\s+(.+)/i;

// PhonePe notification patterns: "You have received Rs. 500.00 from Sameer"
const PHONEPE_RECEIVED_REGEX = /(?:received|you have received)\s+(?:[₹Rs\.]+)?\s*([\d,\.]+)/i;

function parsePaytmNotification(title = '', body = '') {
    const fullText = `${title} ${body}`;
    const match = fullText.match(PAYTM_RECEIVED_REGEX);
    if (!match) return null;

    const amountStr = match[1].replace(/,/g, '');
    const amountRupees = parseFloat(amountStr);
    if (isNaN(amountRupees) || amountRupees <= 0) return null;

    const amountPaise = Math.round(amountRupees * 100);
    const senderName = match[2].trim();

    return { amountPaise, senderName };
}

function parsePhonePeNotification(title = '', body = '') {
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

        if (!notifTitle && !notifBody) return;

        console.log(`[DevifyPay] Notification from ${appPackage}: title="${notifTitle}" body="${notifBody}"`);

        if (!UPI_PACKAGES.includes(appPackage)) {
            console.log('[DevifyPay] Ignoring non-UPI app:', appPackage);
            return;
        }

        const rawUrl = await AsyncStorage.getItem('devify_backend_url');
        const rawSecret = await AsyncStorage.getItem('devify_upi_secret');

        if (!rawUrl || !rawSecret) {
            console.log('[DevifyPay] ERROR: Backend URL or secret not configured.');
            return;
        }

        const backendUrl = rawUrl.trim().replace(/\/+$/, '');
        const secret = rawSecret.trim();

        // ---------------------------------------------------------------
        // Strategy 1: Extract Devify Pay payment ID from notification text (Google Pay)
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
        // ---------------------------------------------------------------
        let parsedAmount = null;
        let parsedSender = null;

        if (appPackage === 'net.one97.paytm' || appPackage === 'com.paytm.business') {
            const parsed = parsePaytmNotification(notifTitle, notifBody);
            if (parsed) {
                parsedAmount = parsed.amountPaise;
                parsedSender = parsed.senderName;
                console.log(`[DevifyPay] Strategy 2 (Paytm) — Amount: ₹${parsedAmount / 100}, Sender: ${parsedSender}`);
            }
        } else if (appPackage === 'com.phonepe.app' || appPackage === 'com.phonepe.app.business') {
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

AppRegistry.registerHeadlessTask(
    'RNAndroidNotificationListenerHeadlessJs',
    () => headlessNotificationListener
);

registerRootComponent(App);
