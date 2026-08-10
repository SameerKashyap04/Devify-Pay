"use client";

import { useEffect, useState } from "react";
import { adminApiFetch } from "@/lib/api";
import AppShell from "../components/AppShell";
import { useRouter } from "next/navigation";

interface Settings {
  upiVpa: string | null;
  merchantName: string | null;
  upiNotifySecretSet: boolean;
  updatedAt: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [upiVpa, setUpiVpa] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [upiNotifySecret, setUpiNotifySecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await adminApiFetch("/v1/admin/settings");
      if (res.status === 401) { router.push("/login"); return; }
      const data: Settings = await res.json();
      setSettings(data);
      setUpiVpa(data.upiVpa ?? "");
      setMerchantName(data.merchantName ?? "");
      setLoading(false);
    })();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const body: Record<string, string | null> = {
        upiVpa: upiVpa.trim() || null,
        merchantName: merchantName.trim() || null,
      };
      if (upiNotifySecret.trim()) {
        body.upiNotifySecret = upiNotifySecret.trim();
      }
      const res = await adminApiFetch("/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error?.message ?? "Save failed");
        return;
      }
      const updated: Settings = await res.json();
      setSettings({ ...updated, upiNotifySecretSet: !!(updated as any).upiNotifySecretSet || !!(upiNotifySecret.trim()) });
      setUpiNotifySecret(""); // clear after save
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  // Generate a random secret
  function generateSecret() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setUpiNotifySecret(Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(""));
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-8">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Configure your UPI merchant details and auto-verification settings.</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />)}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">

            {/* UPI Merchant Details */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-900">UPI Merchant Details</h2>
              <p className="mb-5 text-sm text-gray-500">
                These details are embedded into the QR codes shown to customers on your checkout page.
                Money goes directly to your UPI account — no intermediary!
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    UPI VPA / UPI ID
                    <span className="ml-1 text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={upiVpa}
                    onChange={e => setUpiVpa(e.target.value)}
                    placeholder="e.g. yourname@okicici or yourname@ybl"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Your UPI address from Google Pay, PhonePe, Paytm, or your bank app.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Merchant Display Name</label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={e => setMerchantName(e.target.value)}
                    placeholder="e.g. Devify Store"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    This name appears on the QR code and in the customer's payment confirmation.
                  </p>
                </div>
              </div>
            </div>

            {/* UPI Auto-Verify Secret */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">UPI Auto-Verification</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${settings?.upiNotifySecretSet ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                  {settings?.upiNotifySecretSet ? "✓ Configured" : "Not configured"}
                </span>
              </div>
              <p className="mb-5 text-sm text-gray-500">
                When configured, the Devify Pay Android companion app on your phone will silently read 
                Google Pay notifications and automatically verify payments — no manual approval needed!
              </p>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">UPI Notify Secret</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={upiNotifySecret}
                      onChange={e => setUpiNotifySecret(e.target.value)}
                      placeholder={settings?.upiNotifySecretSet ? "Enter new secret to replace existing..." : "Enter or generate a secret key..."}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecret ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generateSecret}
                    className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Leave blank to keep the existing secret unchanged. Copy this value into the Android companion app.
                </p>
              </div>
            </div>

            {/* How it Works */}
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <h3 className="mb-2 text-sm font-semibold text-amber-900">⚡ How Auto-Verification Works</h3>
              <ol className="space-y-1 text-xs text-amber-800 list-decimal list-inside">
                <li>Customer scans your UPI QR code and pays via Google Pay / PhonePe</li>
                <li>Google Pay sends a push notification to your phone: "₹500 received. Ref: dpay_abc123"</li>
                <li>The Devify Pay companion app (running silently in background) reads this notification</li>
                <li>It extracts the payment reference and posts it to your Devify Pay server</li>
                <li>Payment is instantly marked as <strong>SUCCESS</strong> — zero manual work!</li>
              </ol>
            </div>

            {/* Status Messages */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                ✓ Settings saved successfully!
              </div>
            )}

            {/* Save Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>

            {settings?.updatedAt && (
              <p className="text-center text-xs text-gray-400">
                Last updated: {new Date(settings.updatedAt).toLocaleString()}
              </p>
            )}
          </form>
        )}
      </div>
    </AppShell>
  );
}
