package com.lesimoes.androidnotificationlistener;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
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
 * Native Java HTTPS Dispatcher & SQLite Local Queue Processor for Devify Pay.
 * 
 * Reliability Architecture:
 * 1. Offline-First Task Persistence: Writes notification payload to SQLite database BEFORE network attempt.
 * 2. Instant Native Dispatch: Attempts HttpURLConnection immediately on Java background thread.
 * 3. Network Awareness: Detects offline/Doze states and queues tasks for WorkManager/AlarmManager retry.
 * 4. Idempotency: Attaches unique `operation_id` to prevent duplicate payment processing on backend.
 * 5. Automatic Queue Draining: Automatically retries PENDING/RETRY tasks when network becomes available.
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
     * SQLite Database Helper for persistent background task queue & diagnostic logs.
     */
    public static class QueueDbHelper extends SQLiteOpenHelper {
        private static final String DB_NAME = "devify_upi_queue.db";
        private static final int DB_VERSION = 1;

        public static final String TABLE_TASKS = "pending_tasks";
        public static final String TABLE_LOGS = "diagnostic_logs";

        public QueueDbHelper(Context context) {
            super(context, DB_NAME, null, DB_VERSION);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS " + TABLE_TASKS + " (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "operation_id TEXT UNIQUE, " +
                "endpoint TEXT, " +
                "payload TEXT, " +
                "status TEXT, " + // PENDING, PROCESSING, COMPLETED, FAILED
                "attempts INTEGER DEFAULT 0, " +
                "last_error TEXT, " +
                "created_at INTEGER, " +
                "updated_at INTEGER)"
            );

            db.execSQL(
                "CREATE TABLE IF NOT EXISTS " + TABLE_LOGS + " (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "timestamp INTEGER, " +
                "level TEXT, " +
                "message TEXT)"
            );
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            db.execSQL("DROP TABLE IF EXISTS " + TABLE_TASKS);
            db.execSQL("DROP TABLE IF EXISTS " + TABLE_LOGS);
            onCreate(db);
        }
    }

    /**
     * Process a notification, persist to SQLite queue, and send HTTPS.
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
                    return;
                }

                // Read backend URL and secret from SharedPreferences / SQLite
                String backendUrl = getAsyncStorageValue(context, "devify_backend_url");
                String secret = getAsyncStorageValue(context, "devify_upi_secret");

                if (backendUrl == null || backendUrl.isEmpty() || secret == null || secret.isEmpty()) {
                    logDiagnostic(context, "WARN", "Backend URL or secret not set in app settings");
                    return;
                }

                backendUrl = backendUrl.replaceAll("/+$", "");
                String endpoint = backendUrl + "/v1/upi-notify";

                String operationId = null;
                String jsonBody = null;

                // 1. Try Pay ID matching
                Matcher payIdMatcher = PAY_ID_PATTERN.matcher(fullText);
                if (payIdMatcher.find()) {
                    String payId = payIdMatcher.group();
                    operationId = "op_" + payId;
                    jsonBody = String.format(
                        "{\"tn\":\"%s\",\"note\":\"%s\",\"app\":\"%s\",\"operation_id\":\"%s\",\"timestamp\":%d}",
                        payId, escapeJson(fullText), escapeJson(pkg), operationId, System.currentTimeMillis()
                    );
                } else {
                    // 2. Try Amount matching
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
                                String sender = "unknown";
                                Matcher senderMatcher = SENDER_PATTERN.matcher(fullText);
                                if (senderMatcher.find()) {
                                    String candidate = senderMatcher.group(1).trim();
                                    if (candidate.length() > 1 && !candidate.toLowerCase().matches(".*(?:bank|account|wallet|balance|nsdl).*")) {
                                        sender = candidate;
                                    }
                                }

                                operationId = "op_amt_" + pkg + "_" + amountPaise + "_" + System.currentTimeMillis();
                                jsonBody = String.format(
                                    "{\"amount_paise\":%d,\"sender\":\"%s\",\"note\":\"%s\",\"app\":\"%s\",\"operation_id\":\"%s\",\"timestamp\":%d}",
                                    amountPaise, escapeJson(sender), escapeJson(fullText), escapeJson(pkg), operationId, System.currentTimeMillis()
                                );
                            }
                        }
                    }
                }

                if (operationId == null || jsonBody == null) {
                    logDiagnostic(context, "INFO", "No payment payload matched for text: " + fullText);
                    return;
                }

                // Step 1: Persist task in local SQLite queue BEFORE attempting network call
                long taskId = saveTaskToQueue(context, operationId, endpoint, jsonBody);

                // Step 2: Attempt instant network dispatch or drain queue
                if (isNetworkAvailable(context)) {
                    executeTask(context, taskId, endpoint, secret, jsonBody);
                } else {
                    logDiagnostic(context, "WARN", "Network offline/suspended during Doze. Task #" + taskId + " queued for WorkManager retry.");
                }

                // Step 3: Flush any other pending tasks in queue
                drainPendingQueue(context, secret);

            } catch (Exception e) {
                Log.e(TAG, "Error processing notification: " + e.getMessage(), e);
                logDiagnostic(context, "ERROR", "Exception in processAndSend: " + e.getMessage());
            }
        }).start();
    }

    /**
     * Write task to SQLite database queue.
     */
    private static synchronized long saveTaskToQueue(Context context, String operationId, String endpoint, String jsonBody) {
        long taskId = -1;
        try {
            QueueDbHelper dbHelper = new QueueDbHelper(context);
            SQLiteDatabase db = dbHelper.getWritableDatabase();

            ContentValues values = new ContentValues();
            values.put("operation_id", operationId);
            values.put("endpoint", endpoint);
            values.put("payload", jsonBody);
            values.put("status", "PENDING");
            values.put("attempts", 0);
            values.put("created_at", System.currentTimeMillis());
            values.put("updated_at", System.currentTimeMillis());

            taskId = db.insertWithOnConflict(QueueDbHelper.TABLE_TASKS, null, values, SQLiteDatabase.CONFLICT_IGNORE);
            db.close();

            logDiagnostic(context, "INFO", "Saved task #" + taskId + " (op_id: " + operationId + ") to SQLite queue");
        } catch (Exception e) {
            Log.e(TAG, "Failed to save task to SQLite: " + e.getMessage());
        }
        return taskId;
    }

    /**
     * Execute HTTPS POST for a single task and update status in SQLite queue.
     */
    public static boolean executeTask(Context context, long taskId, String endpoint, String secret, String jsonBody) {
        try {
            Log.d(TAG, "Executing task #" + taskId + " -> HTTPS POST: " + endpoint);
            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-upi-secret", secret);
            conn.setDoOutput(true);
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(12000);

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

            Log.d(TAG, "Task #" + taskId + " response (" + responseCode + "): " + response.toString());

            boolean isSuccess = (responseCode >= 200 && responseCode < 300);
            updateTaskStatus(context, taskId, isSuccess ? "COMPLETED" : "FAILED", "HTTP " + responseCode + ": " + response.toString());

            logDiagnostic(context, isSuccess ? "INFO" : "ERROR", "Task #" + taskId + " finished with HTTP " + responseCode);
            return isSuccess;

        } catch (Exception e) {
            Log.e(TAG, "Task #" + taskId + " failed: " + e.getMessage());
            updateTaskStatus(context, taskId, "RETRY", e.getMessage());
            logDiagnostic(context, "WARN", "Task #" + taskId + " failed with exception: " + e.getMessage());
            return false;
        }
    }

    /**
     * Drain all PENDING/RETRY tasks from SQLite queue when network is available.
     */
    public static void drainPendingQueue(Context context, String secret) {
        if (!isNetworkAvailable(context)) return;

        try {
            QueueDbHelper dbHelper = new QueueDbHelper(context);
            SQLiteDatabase db = dbHelper.getReadableDatabase();

            Cursor cursor = db.rawQuery(
                "SELECT id, endpoint, payload, attempts FROM " + QueueDbHelper.TABLE_TASKS +
                " WHERE status IN ('PENDING', 'RETRY') AND attempts < 5 ORDER BY id ASC LIMIT 10",
                null
            );

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    long id = cursor.getLong(0);
                    String endpoint = cursor.getString(1);
                    String payload = cursor.getString(2);

                    executeTask(context, id, endpoint, secret, payload);
                } while (cursor.moveToNext());
            }

            if (cursor != null) cursor.close();
            db.close();
        } catch (Exception e) {
            Log.e(TAG, "Error draining pending queue: " + e.getMessage());
        }
    }

    private static void updateTaskStatus(Context context, long taskId, String status, String lastError) {
        try {
            QueueDbHelper dbHelper = new QueueDbHelper(context);
            SQLiteDatabase db = dbHelper.getWritableDatabase();

            ContentValues values = new ContentValues();
            values.put("status", status);
            values.put("last_error", lastError);
            values.put("updated_at", System.currentTimeMillis());

            db.execSQL(
                "UPDATE " + QueueDbHelper.TABLE_TASKS + " SET status = ?, last_error = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?",
                new Object[]{status, lastError, System.currentTimeMillis(), taskId}
            );

            db.close();
        } catch (Exception e) {
            Log.e(TAG, "Failed to update task status: " + e.getMessage());
        }
    }

    public static void logDiagnostic(Context context, String level, String message) {
        try {
            QueueDbHelper dbHelper = new QueueDbHelper(context);
            SQLiteDatabase db = dbHelper.getWritableDatabase();

            ContentValues values = new ContentValues();
            values.put("timestamp", System.currentTimeMillis());
            values.put("level", level);
            values.put("message", message);

            db.insert(QueueDbHelper.TABLE_LOGS, null, values);

            // Keep log size bounded (max 100 rows)
            db.execSQL("DELETE FROM " + QueueDbHelper.TABLE_LOGS + " WHERE id NOT IN (SELECT id FROM " + QueueDbHelper.TABLE_LOGS + " ORDER BY id DESC LIMIT 100)");

            db.close();
        } catch (Exception e) {
            Log.e(TAG, "Failed to log diagnostic: " + e.getMessage());
        }
    }

    private static boolean isNetworkAvailable(Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    private static String getAsyncStorageValue(Context context, String key) {
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
            if (cursor != null) cursor.close();
        }

        try {
            SharedPreferences prefs = context.getSharedPreferences(ASYNC_STORAGE_PREFS, Context.MODE_PRIVATE);
            return prefs.getString(key, null);
        } catch (Exception e) {
            return null;
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
