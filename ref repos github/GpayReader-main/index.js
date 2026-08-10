import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Local:      'http://IP:backend-port'
// Production: 'https://xxxxx.vercel.app'  (update after deploy)
const BACKEND_URL = 'https://xxxxx.vercel.app';
// ───────────────────────────────────────────────────────────────


const GPAY_PACKAGES = [
    'com.google.android.apps.nbu.paisa.user',
    'com.google.android.apps.nbu.paisa.merchant'
];


const headlessNotificationListener = async (data) => {
    if (!data) return;
    try {
        console.log(" [Incoming Raw Data Cluster]:", JSON.stringify(data));
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
            console.log(` Skipping empty notification event from: ${appPackage}`);
            return;
        }
        console.log(`⚡ [Headless Task Intercepted]: ${appPackage} -> "${messageText}"`);
        if (GPAY_PACKAGES.includes(appPackage)) {

            let extractedTn = null;
            let cleanedAmount = 1;

            const tnMatch = messageText.match(/user_id_[a-zA-Z0-9]+_\d+/);
            if (tnMatch) {
                extractedTn = tnMatch[0];
                console.log(`Extracted TN: ${extractedTn}`);
            } else {
                console.log(`Could not find a valid transaction note in message: "${messageText}"`);
                return;
            }

            console.log(`Forwarding payload to backend...`);

            const response = await fetch(`${BACKEND_URL}/webhook/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    app: appPackage,
                    tn: extractedTn,            
                    note: messageText,         
                    amount: cleanedAmount,
                    timestamp: Date.now()
                })
            });

            if (response.ok) {
                console.log(`Transmission complete. Status: ${response.status}`);
            } else {
                const errorText = await response.text();
                console.log(`Server rejected webhook transmission. Status: ${response.status}. Error: ${errorText}`);
            }
        } else {
            console.log(`Ignoring notification from package: ${appPackage}`);
        }

    } catch (error) {
        console.log("Headless execution error thread crashed:", error);
    }
};

AppRegistry.registerHeadlessTask(
    'RNAndroidNotificationListenerHeadlessJs',
    () => headlessNotificationListener
);


registerRootComponent(App);