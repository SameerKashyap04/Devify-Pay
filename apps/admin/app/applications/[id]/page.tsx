"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApiFetch } from "../../../lib/api";
import AppShell from "../../components/AppShell";

interface ApplicationData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

interface ApiKeyRow {
  id: string;
  environment: "TEST" | "LIVE";
  keyPrefix: string;
  status: "ACTIVE" | "REVOKED";
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [appData, setAppData] = useState<ApplicationData | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const [appRes, keysRes] = await Promise.all([
      adminApiFetch(`/v1/admin/applications/${params.id}`),
      adminApiFetch(`/v1/admin/applications/${params.id}/api-keys`),
    ]);
    if (appRes.status === 401 || keysRes.status === 401) {
      router.push("/login");
      return;
    }
    if (appRes.ok) {
      const data = await appRes.json();
      setAppData(data);
    }
    if (keysRes.ok) {
      const data = await keysRes.json();
      setKeys(data.data);
    }
  }, [params.id, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function createKey(environment: "TEST" | "LIVE") {
    setBusy(true);
    setNewSecret(null);
    try {
      const res = await adminApiFetch(`/v1/admin/applications/${params.id}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ environment }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewSecret(data.secret);
        await loadData();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!window.confirm("Revoke this API key? Requests using it will start failing immediately.")) return;
    setBusy(true);
    try {
      await adminApiFetch(`/v1/admin/api-keys/${keyId}/revoke`, { method: "POST" });
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  const handleCopyWebhookSecret = () => {
    if (appData?.webhookSecret) {
      navigator.clipboard.writeText(appData.webhookSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {appData?.name || `Application: ${params.id}`}
          </h1>
        </div>

        {appData && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Application Credentials & Settings</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-500">App Name / Slug</label>
                <div className="mt-1 text-sm font-semibold text-gray-900">{appData.name} ({appData.slug})</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Webhook Receiver URL</label>
                <div className="mt-1 text-xs font-mono text-gray-800 break-all">{appData.webhookUrl || "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">DEVIFY_WEBHOOK_SECRET</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type={showWebhookSecret ? "text" : "password"}
                    readOnly
                    value={appData.webhookSecret || "whsec_not_configured"}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-mono text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {showWebhookSecret ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyWebhookSecret}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    {copiedSecret ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {newSecret && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-800">
              Save this key now — it will not be shown again.
            </div>
            <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs">{newSecret}</code>
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <button
            disabled={busy}
            onClick={() => createKey("TEST")}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            + Create TEST key
          </button>
          <button
            disabled={busy}
            onClick={() => createKey("LIVE")}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            + Create LIVE key
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {keys === null ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : keys.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No API keys yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Env</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Used</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-4 py-3 font-mono text-xs">{k.keyPrefix}...</td>
                    <td className="px-4 py-3">{k.environment}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          k.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {k.status === "ACTIVE" && (
                        <button
                          disabled={busy}
                          onClick={() => revokeKey(k.id)}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
