"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

interface AppRow {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "DISABLED" | "SUSPENDED";
  webhookUrl: string | null;
  createdAt: string;
  _count: { orders: number; payments: number; apiKeys: number };
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await adminApiFetch("/v1/admin/applications");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setApps(data.data);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function createApp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
    try {
      const res = await adminApiFetch("/v1/admin/applications", {
        method: "POST",
        body: JSON.stringify({ name, slug: cleanSlug, webhook_url: webhookUrl || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Failed to create application");
        return;
      }
      setName("");
      setSlug("");
      setWebhookUrl("");
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Applications</h1>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            {showForm ? "Cancel" : "+ New Application"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={createApp} className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Stocky"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
              <input
                required
                pattern="[a-z0-9-]+"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="stocky"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Webhook URL (optional)</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="https://api.stocky.example.com/webhooks/devify-pay"
              />
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Application"}
            </button>
          </form>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {apps === null ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : apps.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No applications yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Webhook</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Payments</th>
                  <th className="px-4 py-3">API Keys</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {apps.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/applications/${a.id}`} className="font-medium text-gray-900 hover:underline">
                        {a.name}
                      </Link>
                      <div className="text-xs text-gray-400">{a.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          a.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.webhookUrl ?? "—"}</td>
                    <td className="px-4 py-3">{a._count.orders}</td>
                    <td className="px-4 py-3">{a._count.payments}</td>
                    <td className="px-4 py-3">{a._count.apiKeys}</td>
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
