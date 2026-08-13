/**
 * Devify Pay — Universal UPI Listener Android App (v1.0.2)
 *
 * Supports:
 *  - Google Pay (GPay / GPay Merchant)
 *  - Paytm (Paytm Consumer / Paytm Business / Soundbox)
 *  - PhonePe (PhonePe Consumer / PhonePe Business)
 *  - BHIM UPI, Amazon Pay, CRED, Mobikwik, WhatsApp Pay
 *  - All major Indian Banks (HDFC, SBI, ICICI, Axis, Kotak, etc.)
 */
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';

// Broad list of payment / banking package names to intercept
const UPI_PACKAGES = [
    'com.google.android.apps.nbu.paisa.user',       // Google Pay
    'com.google.android.apps.nbu.paisa.merchant',   // GPay Merchant
    'com.phonepe.app',                              // PhonePe
    'com.phonepe.app.business',                     // PhonePe Business
    'net.one97.paytm',                              // Paytm
    'com.paytm.business',                           // Paytm Business
    'in.org.npci.upiapp',                           // BHIM UPI
    'com.amazon.mShop.android.shopping',            // Amazon Pay
    'com.cred.club',                                // CRED
    'com.mobikwik',                                 // Mobikwik
    'com.freecharge.android',                       // Freecharge
    'com.whatsapp',                                 // WhatsApp Pay
];

// Memory cache to deduplicate recent notifications within a 3-minute window
const processedNotifCache = new Map();

function isDuplicateOrStale(appPackage, parsed, notificationPostTime) {
    const now = Date.now();

    if (notificationPostTime && typeof notificationPostTime === 'number') {
        const ageMs = now - notificationPostTime;
        if (ageMs > 3 * 60 * 1000) {
            console.log(`[DevifyPay] Stale notification ignored (Age: ${Math.round(ageMs / 1000)}s)`);
            return true;
        }
    }

    const key = parsed.type === 'PAY_ID'
        ? `pay_${parsed.payId}`
        : `amt_${appPackage}_${parsed.amountPaise}_${(parsed.senderName || 'unknown').toLowerCase().trim()}`;

    const lastSeenTime = processedNotifCache.get(key);

    if (lastSeenTime && (now - lastSeenTime) < 3 * 60 * 1000) {
        console.log(`[DevifyPay] Duplicate notification ignored for key: ${key} (Processed ${Math.round((now - lastSeenTime) / 1000)}s ago)`);
        return true;
    }

    processedNotifCache.set(key, now);

    for (const [k, time] of processedNotifCache.entries()) {
        if (now - time > 10 * 60 * 1000) {
            processedNotifCache.delete(k);
        }
    }

    return false;
}

/**
 * Universal payload parser: extracts payment publicId (e.g. pay_xxx)
 * OR amount in paise + sender name across GPay, Paytm, PhonePe, BHIM & bank apps.
 */
function parseNotificationPayload(title = '', body = '') {
    const fullText = `${title} ${body}`.trim();

    // 1. Direct Pay ID matching (e.g., pay_abc123)
    const payIdMatch = fullText.match(/pay_[a-zA-Z0-9]+/);
    if (payIdMatch) {
        return { type: 'PAY_ID', payId: payIdMatch[0] };
    }

    // 2. Extract monetary amount (₹50, Rs 50, Rs. 50.00, INR 50)
    const amountPatterns = [
        /(?:received|credited|deposited|got|paid|added)\s+(?:rs\.?|inr|₹)?\s*([\d,\.]+)/i,
        /(?:rs\.?|inr|₹)\s*([\d,\.]+)\s+(?:received|credited|deposited|got|added)/i,
        /received\s+(?:rs\.?|inr|₹)?\s*([\d,\.]+)\s+from\s+(.+)/i,
        /you(?:'ve|\s+have)?\s+received\s+(?:rs\.?|inr|₹)?\s*([\d,\.]+)/i,
        /(?:rs\.?|inr|₹)\s*([\d,\.]+)/i,
    ];

    let amountRupees = null;
    let senderName = null;

    for (const pattern of amountPatterns) {
        const match = fullText.match(pattern);
        if (match) {
            const cleanAmt = match[1].replace(/,/g, '');
            const parsedAmt = parseFloat(cleanAmt);
            if (!isNaN(parsedAmt) && parsedAmt > 0) {
                amountRupees = parsedAmt;
                if (match[2]) {
                    senderName = match[2].split(/\.|via|ref|upi|bank/i)[0].trim();
                }
                break;
            }
        }
    }

    // Attempt fallback sender extraction if not matched by pattern
    if (amountRupees && !senderName) {
        const senderPatterns = [
            /from\s+([A-Za-z0-9\s]+?)(?:\.|\s+via|\s+ref|\s+on|\s+at|\s+upi|\s*$)/i,
            /by\s+([A-Za-z0-9\s]+?)(?:\.|\s+via|\s+ref|\s+on|\s+at|\s+upi|\s*$)/i,
        ];
        for (const sp of senderPatterns) {
            const sm = fullText.match(sp);
            if (sm && sm[1]) {
                const candidate = sm[1].trim();
                if (candidate.length > 1 && !/bank|account|wallet|balance|nsdl/i.test(candidate)) {
                    senderName = candidate;
                    break;
                }
            }
        }
    }

    if (amountRupees) {
        return {
            type: 'AMOUNT',
            amountPaise: Math.round(amountRupees * 100),
            senderName,
        };
    }

    return null;
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
        console.log(`[DevifyPay] Backend response (${response.status}):`, respText);
    } catch (err) {
        console.error('[DevifyPay] Error in notification listener:', err);
    }
};

AppRegistry.registerHeadlessTask('RNAndroidNotificationListenerHeadlessTask', () => headlessNotificationListener);
registerRootComponent(App);
