"use client";

import { useEffect, useState } from "react";
import { adminApiFetch } from "../../lib/api";
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

  const [upiVpa, setUpiVpa] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [upiNotifySecret, setUpiNotifySecret] = useState("");

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
      const updated = await res.json();
      setSettings({
        upiVpa: updated.upiVpa,
        merchantName: updated.merchantName,
        upiNotifySecretSet: settings?.upiNotifySecretSet || !!(upiNotifySecret.trim()),
        updatedAt: updated.updatedAt,
      });
      setUpiNotifySecret("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function generateSecret() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setUpiNotifySecret(Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(""));
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">

            {/* UPI Merchant Details */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">UPI Merchant Details</div>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-40 shrink-0">
                    <div className="text-sm font-medium text-gray-700">UPI VPA / UPI ID</div>
                    <div className="mt-0.5 text-xs text-gray-400">e.g. name@okicici</div>
                  </div>
                  <input
                    type="text"
                    value={upiVpa}
                    onChange={e => setUpiVpa(e.target.value)}
                    placeholder="yourname@okicici"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-40 shrink-0">
                    <div className="text-sm font-medium text-gray-700">Merchant Name</div>
                    <div className="mt-0.5 text-xs text-gray-400">Shown on QR codes</div>
                  </div>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={e => setMerchantName(e.target.value)}
                    placeholder="My Store"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* UPI Auto-Verification */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">UPI Auto-Verification</div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  settings?.upiNotifySecretSet
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {settings?.upiNotifySecretSet ? "Configured" : "Not configured"}
                </span>
              </div>
              <div className="px-5 py-4">
                <p className="mb-4 text-sm text-gray-500">
                  The Android companion app on your phone will silently read Google Pay notifications
                  and automatically verify payments using this shared secret key.
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-40 shrink-0">
                    <div className="text-sm font-medium text-gray-700">Notify Secret</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {settings?.upiNotifySecretSet ? "Leave blank to keep" : "Min. 8 characters"}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-2">
                    <input
                      type="text"
                      value={upiNotifySecret}
                      onChange={e => setUpiNotifySecret(e.target.value)}
                      placeholder={settings?.upiNotifySecretSet ? "Enter new secret to replace..." : "Enter or generate..."}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (upiNotifySecret) {
                          navigator.clipboard.writeText(upiNotifySecret);
                          alert("Copied to clipboard!");
                        }
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      disabled={!upiNotifySecret}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={generateSecret}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* How It Works info box */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">How Auto-Verification Works</div>
              </div>
              <div className="px-5 py-4">
                <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
                  <li>Customer scans your UPI QR code and pays via Google Pay / PhonePe</li>
                  <li>Google Pay sends a notification to your phone: <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">₹500 received. Ref: dpay_abc123</span></li>
                  <li>The Devify Pay Android companion app reads this notification silently</li>
                  <li>It posts the reference to your server — payment is instantly marked Success</li>
                </ol>
              </div>
            </div>

            {/* Feedback */}
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">Settings saved successfully.</div>
            )}

            <div className="flex items-center justify-between">
              {settings?.updatedAt ? (
                <span className="text-xs text-gray-400">
                  Last updated: {new Date(settings.updatedAt).toLocaleString()}
                </span>
              ) : <span />}
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
