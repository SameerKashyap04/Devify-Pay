/**
 * Devify Pay — UPI Listener Android App
 *
 * Intercepts incoming payment push notifications from Google Pay, Paytm,
 * PhonePe, BHIM, etc., extracts payment ID or amount/sender, and sends
 * to Devify Pay API (/v1/upi-notify) for instant auto-verification.
 */
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';

const UPI_PACKAGES = [
    'com.google.android.apps.nbu.paisa.user',       // Google Pay
    'com.google.android.apps.nbu.paisa.merchant',   // Google Pay Business
    'com.phonepe.app',                              // PhonePe
    'com.phonepe.app.business',                     // PhonePe Business
    'net.one97.paytm',                              // Paytm
    'com.paytm.business',                           // Paytm Business
    'in.org.npci.upiapp',                           // BHIM
    'money.super.payments',                         // super.money
    'com.mobikwik_new',                             // Mobikwik
    'com.dreamplug.androidapp',                     // CRED
    'com.freecharge.android',                       // Freecharge
    'com.navi.passport',                            // Navi
    'com.icicibank.pockets',                        // ICICI Pockets
    'com.sbi.upi',                                  // YONO SBI / BHIM SBI
    'com.axis.mobile',                              // Axis Pay
    'com.hdfcbank.payzapp',                         // PayZapp HDFC
];

const PAYMENT_ID_REGEX = /pay_[a-zA-Z0-9]+/;

/**
 * Universal notification parser for all Indian UPI & Banking apps.
 */
function parseNotification(title = '', body = '') {
    const fullText = `${title} ${body}`.trim().replace(/\u00a0/g, ' ');

    // 1. Pay ID match (Google Pay / UPI Notes)
    const payIdMatch = fullText.match(PAYMENT_ID_REGEX);
    if (payIdMatch) {
        return { payId: payIdMatch[0] };
    }

    // 2. Amount & Sender matching (Paytm / PhonePe / BHIM / Bank SMS/Push)
    const patterns = [
        // "Received ₹1 from Sameer Kashyap" / "Received Rs. 1 from Sameer"
        /received\s+[₹Rs\.\s]*([\d,\.]+)\s+from\s+(.+?)(?:\.|$| deposited| in | on | at )/i,
        
        // "Received ₹1" / "Received Rs 1.50"
        /received\s+[₹Rs\.\s]*([\d,\.]+)/i,

        // "You have received Rs. 500.00 from Sameer"
        /you have received\s+[₹Rs\.\s]*([\d,\.]+)(?:\s+from\s+(.+?))?(?:\.|$)/i,

        // "₹1 received from Sameer"
        /[₹Rs\.\s]*([\d,\.]+)\s+received\s+(?:from\s+(.+?))?(?:\.|$)/i,

        // "Credited by ₹1" / "Rs 1 credited"
        /(?:credited|deposited|added)\s+(?:by\s+)?(?:for\s+)?[₹Rs\.\s]*([\d,\.]+)/i,
        /[₹Rs\.\s]*([\d,\.]+)\s+(?:credited|deposited|added)/i,
    ];

    for (const pattern of patterns) {
        const match = fullText.match(pattern);
        if (match) {
            const amountStr = match[1].replace(/,/g, '');
            const amountRupees = parseFloat(amountStr);
            if (!isNaN(amountRupees) && amountRupees > 0) {
                const amountPaise = Math.round(amountRupees * 100);
                const sender = match[2] ? match[2].trim() : undefined;
                return { amountPaise, sender };
            }
        }
    }

    return null;
}

const headlessNotificationListener = async (data) => {
    if (!data) return;
    try {
        console.log('[DevifyPay] Raw notification data:', JSON.stringify(data));

        let notification = null;
        if (data.notification) {
            notification = typeof data.notification === 'string'
                ? JSON.parse(data.notification)
                : data.notification;
        } else {
            notification = typeof data === 'string' ? JSON.parse(data) : data;
        }
        if (!notification) return;

        const appPackage = (notification.app || notification.packageName || 'unknown').toLowerCase();
        const notifTitle = (notification.title || '').trim();
        const notifBody = (notification.text || notification.textBody || notification.bigText || '').trim();

        if (!notifTitle && !notifBody) {
            console.log('[DevifyPay] Skipping empty notification from:', appPackage);
            return;
        }

        console.log(`[DevifyPay] Notification from ${appPackage}: title="${notifTitle}" body="${notifBody}"`);

        // Check if package is a known UPI app OR text contains payment indicators
        const isKnownUpiApp = UPI_PACKAGES.includes(appPackage);
        const textHasPaymentKeywords = /pay_|received|credited|deposited|₹|rs/i.test(`${notifTitle} ${notifBody}`);

        if (!isKnownUpiApp && !textHasPaymentKeywords) {
            console.log('[DevifyPay] Ignoring non-payment notification from:', appPackage);
            return;
        }

        // Read config stored by App.tsx
        const rawBackendUrl = await AsyncStorage.getItem('devify_backend_url');
        const rawSecret = await AsyncStorage.getItem('devify_upi_secret');

        if (!rawBackendUrl || !rawSecret) {
            console.log('[DevifyPay] ERROR: Backend URL or secret not set. Open app to configure.');
            return;
        }

        const backendUrl = rawBackendUrl.trim().replace(/\/+$/, '');
        const secret = rawSecret.trim();

        const parsed = parseNotification(notifTitle, notifBody);

        if (!parsed) {
            console.log('[DevifyPay] Could not extract payment ID or amount from notification — skipping');
            return;
        }

        let reqBody = {};
        if (parsed.payId) {
            console.log('[DevifyPay] Strategy 1 (Pay ID match):', parsed.payId);
            reqBody = {
                tn: parsed.payId,
                note: `${notifTitle} | ${notifBody}`.trim(),
                app: appPackage,
                timestamp: Date.now(),
            };
        } else if (parsed.amountPaise) {
            console.log(`[DevifyPay] Strategy 2 (Amount match): ₹${parsed.amountPaise / 100}, Sender: ${parsed.sender || 'unknown'}`);
            reqBody = {
                amount_paise: parsed.amountPaise,
                sender: parsed.sender,
                note: `${notifTitle} | ${notifBody}`.trim(),
                app: appPackage,
                timestamp: Date.now(),
            };
        }

        const notifyEndpoint = `${backendUrl}/v1/upi-notify`;
        console.log('[DevifyPay] Posting auto-verify request to:', notifyEndpoint);

        const response = await fetch(notifyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-upi-secret': secret,
            },
            body: JSON.stringify(reqBody),
        });

        const respText = await response.text();
        console.log(`[DevifyPay] Server response (${response.status}):`, respText);

    } catch (error) {
        console.log('[DevifyPay] Headless listener error:', error);
    }
};

AppRegistry.registerHeadlessTask(
    'RNAndroidNotificationListenerHeadlessJs',
    () => headlessNotificationListener
);

registerRootComponent(App);
