/**
 * Devify Pay — Universal UPI Listener Android App
 *
 * Intercepts payment push notifications from Google Pay, Paytm, PhonePe,
 * BHIM, super.money, Mobikwik, CRED, and all Indian banking apps.
 * Parses payment ID or amount/sender and posts to /v1/upi-notify.
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
    'in.org.npci.upiapp',                           // BHIM
    'money.super.payments',                         // super.money
    'com.mobikwik_new',                             // Mobikwik
    'com.dreamplug.androidapp',                     // CRED
    'com.freecharge.android',                       // Freecharge
    'com.navi.passport',                            // Navi
    'com.icicibank.pockets',                        // ICICI Pockets / iMobile
    'com.sbi.upi',                                  // YONO SBI / BHIM SBI
    'com.axis.mobile',                              // Axis Pay
    'com.hdfcbank.payzapp',                         // PayZapp HDFC
];

const PAYMENT_ID_REGEX = /pay_[a-zA-Z0-9]+/;

/**
 * Universal notification parser for all Indian UPI & Banking apps.
 */
function parseNotificationPayload(title = '', body = '') {
    const fullText = `${title} ${body}`.replace(/\u00a0/g, ' ').trim();
    if (!fullText) return null;

    // 1. Check for Devify pay_ ID (Google Pay / UPI Notes)
    const payIdMatch = fullText.match(PAYMENT_ID_REGEX);
    if (payIdMatch) {
        return { type: 'PAY_ID', payId: payIdMatch[0] };
    }

    // 2. Extract amount in Rupees & optional Sender name
    let amountRupees = null;
    let senderName = null;

    // Regex 1: "Received ₹1 from Sameer" / "Received Rs 1.00 from..."
    const r1 = /received\s+(?:₹|rs\.?|inr)?\s*([\d,\.]+)\s+from\s+(.+?)(?:\.|$| deposited| in | on | at )/i;
    // Regex 2: "₹1 received from Sameer" / "Rs 1.00 received from..."
    const r2 = /(?:₹|rs\.?|inr)\s*([\d,\.]+)\s+(?:received|credited|deposited)\s+(?:from|by)\s+(.+?)(?:\.|$| in | on | at )/i;
    // Regex 3: "Received ₹1" / "Received Rs 1.00" / "Got ₹1"
    const r3 = /(?:received|credited|deposited|got)\s+(?:by\s+)?(?:for\s+)?[₹Rs\.\s]*([\d,\.]+)/i;
    // Regex 4: "₹1 received" / "Rs 1.00 credited"
    const r4 = /[₹Rs\.\s]*([\d,\.]+)\s+(?:received|credited|deposited)/i;
    // Regex 5: "Payment of ₹1" / "Credited with ₹1"
    const r5 = /(?:payment|amount|credited|deposited)\s+(?:of|with)?\s*[₹Rs\.\s]*([\d,\.]+)/i;

    let match = fullText.match(r1);
    if (match) {
        amountRupees = parseFloat(match[1].replace(/,/g, ''));
        senderName = match[2].trim();
    } else if ((match = fullText.match(r2))) {
        amountRupees = parseFloat(match[1].replace(/,/g, ''));
        senderName = match[2].trim();
    } else if ((match = fullText.match(r3))) {
        amountRupees = parseFloat(match[1].replace(/,/g, ''));
    } else if ((match = fullText.match(r4))) {
        amountRupees = parseFloat(match[1].replace(/,/g, ''));
    } else if ((match = fullText.match(r5))) {
        amountRupees = parseFloat(match[1].replace(/,/g, ''));
    }

    if (amountRupees !== null && !isNaN(amountRupees) && amountRupees > 0) {
        return {
            type: 'AMOUNT',
            amountPaise: Math.round(amountRupees * 100),
            senderName,
        };
    }

    return null;
}

// Memory cache to deduplicate recent notifications within a 3-minute window
const processedNotifCache = new Map();

function isDuplicateOrStale(appPackage, parsed, notificationPostTime) {
    const now = Date.now();

    // 1. If system timestamp is present and notification is older than 3 minutes, ignore
    if (notificationPostTime && typeof notificationPostTime === 'number') {
        const ageMs = now - notificationPostTime;
        if (ageMs > 3 * 60 * 1000) {
            console.log(`[DevifyPay] Stale notification ignored (Age: ${Math.round(ageMs / 1000)}s)`);
            return true;
        }
    }

    // 2. Build unique deduplication key per payment app + amount + sender or pay_ID
    const key = parsed.type === 'PAY_ID'
        ? `pay_${parsed.payId}`
        : `amt_${appPackage}_${parsed.amountPaise}_${(parsed.senderName || 'unknown').toLowerCase().trim()}`;

    const lastSeenTime = processedNotifCache.get(key);

    // If seen in the last 3 minutes (180,000 ms), ignore as duplicate!
    if (lastSeenTime && (now - lastSeenTime) < 3 * 60 * 1000) {
        console.log(`[DevifyPay] Duplicate notification ignored for key: ${key} (Last processed: ${Math.round((now - lastSeenTime) / 1000)}s ago)`);
        return true;
    }

    // Mark current timestamp for this key
    processedNotifCache.set(key, now);

    // Purge cache items older than 10 minutes to prevent memory leak
    for (const [k, time] of processedNotifCache.entries()) {
        if (now - time > 10 * 60 * 1000) {
            processedNotifCache.delete(k);
        }
    }

    return false;
}

const headlessNotificationListener = async (data) => {
    if (!data) return;
    try {
        console.log('[DevifyPay] Incoming notification raw data:', JSON.stringify(data));

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
        const postTime = notification.postTime || notification.time || notification.timestamp;

        if (!notifTitle && !notifBody) return;

        console.log(`[DevifyPay] Notification from ${appPackage}: title="${notifTitle}" body="${notifBody}"`);

        // Check if package is in known list OR notification text contains payment indicators
        const isKnownApp = UPI_PACKAGES.includes(appPackage);
        const hasPaymentText = /pay_|received|credited|deposited|₹|rs/i.test(`${notifTitle} ${notifBody}`);

        if (!isKnownApp && !hasPaymentText) {
            console.log('[DevifyPay] Ignoring non-payment notification from:', appPackage);
            return;
        }

        const rawUrl = await AsyncStorage.getItem('devify_backend_url');
        const rawSecret = await AsyncStorage.getItem('devify_upi_secret');

        if (!rawUrl || !rawSecret) {
            console.log('[DevifyPay] ERROR: Backend URL or secret not set in app settings.');
            return;
        }

        const backendUrl = rawUrl.trim().replace(/\/+$/, '');
        const secret = rawSecret.trim();

        const parsed = parseNotificationPayload(notifTitle, notifBody);

        if (!parsed) {
            console.log('[DevifyPay] Could not extract payment ID or amount from notification — skipping');
            return;
        }

        // Deduplication & stale notification check
        if (isDuplicateOrStale(appPackage, parsed, postTime)) {
            return;
        }

        let reqBody = {};
        if (parsed.type === 'PAY_ID') {
            console.log('[DevifyPay] Strategy 1 (Pay ID match):', parsed.payId);
            reqBody = {
                tn: parsed.payId,
                note: `${notifTitle} | ${notifBody}`.trim(),
                app: appPackage,
                timestamp: Date.now(),
            };
        } else if (parsed.type === 'AMOUNT') {
            console.log(`[DevifyPay] Strategy 2 (Amount match): ₹${parsed.amountPaise / 100}, Sender: ${parsed.senderName || 'unknown'}`);
            reqBody = {
                amount_paise: parsed.amountPaise,
                sender: parsed.senderName,
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
        console.log('[DevifyPay] Headless task error:', error);
    }
};

AppRegistry.registerHeadlessTask(
    'RNAndroidNotificationListenerHeadlessJs',
    () => headlessNotificationListener
);

registerRootComponent(App);
