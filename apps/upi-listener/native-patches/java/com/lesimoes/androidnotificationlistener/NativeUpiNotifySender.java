package com.lesimoes.androidnotificationlistener;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Native Java HTTP sender for Devify Pay UPI auto-verification.
 * Bypasses React Native JS bridge entirely — works even when app is killed.
 */
public class NativeUpiNotifySender {
    private static final String TAG = "DevifyPayNativeSender";

    // SharedPreferences key matching AsyncStorage's internal key prefix
    private static final String ASYNC_STORAGE_PREFS = "RN_AsyncLocalStorage_V1";

    // Regex patterns for payment detection
    private static final Pattern PAY_ID_PATTERN = Pattern.compile("pay_[a-zA-Z0-9_\\-]+");
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:received|credited|deposited|got|added|you\\s+have\\s+received)\\s+(?:rs\\.?|inr|₹)?\\s*([\\d,\\.]+)|" +
        "(?:rs\\.?|inr|₹)\\s*([\\d,\\.]+)\\s+(?:received|credited|deposited|got|added)|" +
        "(?:rs\\.?|inr|₹)\\s*([\\d,\\.]+)",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SENDER_PATTERN = Pattern.compile(
        "from\\s+([A-Za-z0-9\\s]+?)(?:\\.|\\s+via|\\s+ref|\\s+on|\\s+at|\\s+upi|\\s*$)",
        Pattern.CASE_INSENSITIVE
    );

    // UPI app packages to intercept
    private static final String[] UPI_PACKAGES = {
        "com.google.android.apps.nbu.paisa.user",
        "com.google.android.apps.nbu.paisa.merchant",
        "com.phonepe.app",
        "com.phonepe.app.business",
        "net.one97.paytm",
        "com.paytm.business",
        "in.org.npci.upiapp",
        "com.amazon.mShop.android.shopping",
        "com.cred.club",
        "com.mobikwik",
        "com.freecharge.android",
        "com.whatsapp",
    };

    /**
     * Process a notification and send HTTPS to the server if it's a payment.
     * Runs entirely in native Java - no React Native dependency.
     */
    public static void processAndSend(Context context, String appPackage, String title, String body) {
        new Thread(() -> {
            try {
                String pkg = appPackage != null ? appPackage.toLowerCase() : "unknown";
                String fullText = ((title != null ? title : "") + " " + (body != null ? body : "")).trim();

                if (fullText.isEmpty()) return;

                // Check if it's a known UPI app or contains payment keywords
                boolean isKnownApp = false;
                for (String upiPkg : UPI_PACKAGES) {
                    if (pkg.equals(upiPkg)) {
                        isKnownApp = true;
                        break;
                    }
                }
                boolean hasPaymentText = fullText.toLowerCase().matches(".*(?:pay_|received|credited|deposited|₹|rs).*");
                if (!isKnownApp && !hasPaymentText) {
                    Log.d(TAG, "Ignoring non-payment notification from: " + pkg);
                    return;
                }

                // Read backend URL and secret from SharedPreferences (AsyncStorage backend)
                String backendUrl = getAsyncStorageValue(context, "devify_backend_url");
                String secret = getAsyncStorageValue(context, "devify_upi_secret");

                if (backendUrl == null || backendUrl.isEmpty() || secret == null || secret.isEmpty()) {
                    Log.e(TAG, "Backend URL or secret not configured in app settings.");
                    return;
                }

                backendUrl = backendUrl.replaceAll("/+$", "");

                // Try to extract pay_ID first
                Matcher payIdMatcher = PAY_ID_PATTERN.matcher(fullText);
                if (payIdMatcher.find()) {
                    String payId = payIdMatcher.group();
                    Log.d(TAG, "Strategy 1 (Pay ID match): " + payId);
                    String jsonBody = String.format(
                        "{\"tn\":\"%s\",\"note\":\"%s\",\"app\":\"%s\",\"timestamp\":%d}",
                        payId, escapeJson(fullText), escapeJson(pkg), System.currentTimeMillis()
                    );
                    sendHttpPost(backendUrl + "/v1/upi-notify", secret, jsonBody);
                    return;
                }

                // Try to extract amount
                Matcher amountMatcher = AMOUNT_PATTERN.matcher(fullText);
                if (amountMatcher.find()) {
                    String amountStr = null;
                    for (int i = 1; i <= amountMatcher.groupCount(); i++) {
                        if (amountMatcher.group(i) != null) {
                            amountStr = amountMatcher.group(i);
                            break;
                        }
                    }
                    if (amountStr != null) {
                        amountStr = amountStr.replace(",", "");
                        double amountRupees = Double.parseDouble(amountStr);
                        if (amountRupees > 0) {
                            int amountPaise = (int) Math.round(amountRupees * 100);

                            // Extract sender name
                            String sender = "unknown";
                            Matcher senderMatcher = SENDER_PATTERN.matcher(fullText);
                            if (senderMatcher.find()) {
                                String candidate = senderMatcher.group(1).trim();
                                if (candidate.length() > 1 && !candidate.toLowerCase().matches(".*(?:bank|account|wallet|balance|nsdl).*")) {
                                    sender = candidate;
                                }
                            }

                            Log.d(TAG, "Strategy 2 (Amount match): ₹" + (amountPaise / 100.0) + ", Sender: " + sender);
                            String jsonBody = String.format(
                                "{\"amount_paise\":%d,\"sender\":\"%s\",\"note\":\"%s\",\"app\":\"%s\",\"timestamp\":%d}",
                                amountPaise, escapeJson(sender), escapeJson(fullText), escapeJson(pkg), System.currentTimeMillis()
                            );
                            sendHttpPost(backendUrl + "/v1/upi-notify", secret, jsonBody);
                            return;
                        }
                    }
                }

                Log.d(TAG, "Could not extract payment ID or amount from notification — skipping");
            } catch (Exception e) {
                Log.e(TAG, "Error processing notification: " + e.getMessage(), e);
            }
        }).start();
    }

    /**
     * Read a value from AsyncStorage's underlying SharedPreferences.
     */
    private static String getAsyncStorageValue(Context context, String key) {
        try {
            // React Native AsyncStorage stores values in SQLite database
            // But we can also try SharedPreferences approach
            // AsyncStorage on newer RN versions uses a database file
            android.database.Cursor cursor = null;
            try {
                android.database.sqlite.SQLiteDatabase db = context.openOrCreateDatabase(
                    "RKStorage", Context.MODE_PRIVATE, null
                );
                cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", new String[]{key});
                if (cursor != null && cursor.moveToFirst()) {
                    String value = cursor.getString(0);
                    db.close();
                    return value;
                }
                if (cursor != null) cursor.close();
                db.close();
            } catch (Exception e) {
                Log.d(TAG, "RKStorage lookup failed, trying SharedPreferences: " + e.getMessage());
                if (cursor != null) cursor.close();
            }

            // Fallback: try SharedPreferences
            SharedPreferences prefs = context.getSharedPreferences(ASYNC_STORAGE_PREFS, Context.MODE_PRIVATE);
            return prefs.getString(key, null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to read AsyncStorage value for key: " + key, e);
            return null;
        }
    }

    /**
     * Send HTTP POST request to the Devify Pay server.
     */
    private static void sendHttpPost(String urlStr, String secret, String jsonBody) {
        try {
            Log.d(TAG, "Sending HTTPS POST to: " + urlStr);
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-upi-secret", secret);
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            byte[] input = jsonBody.getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(input, 0, input.length);
            os.flush();
            os.close();

            int responseCode = conn.getResponseCode();
            BufferedReader br = new BufferedReader(new InputStreamReader(
                responseCode >= 200 && responseCode < 400 ? conn.getInputStream() : conn.getErrorStream(),
                StandardCharsets.UTF_8
            ));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                response.append(line);
            }
            br.close();
            conn.disconnect();

            Log.d(TAG, "Server response (" + responseCode + "): " + response.toString());
        } catch (Exception e) {
            Log.e(TAG, "HTTP POST failed: " + e.getMessage(), e);
        }
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
