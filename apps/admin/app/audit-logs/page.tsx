"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

interface AuditLogRow {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

export default function AuditLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await adminApiFetch("/v1/admin/audit-logs");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setLogs(data.data);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {logs === null ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No audit log entries yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium">{l.action}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {l.actorType}
                      {l.actorId ? ` (${l.actorId.slice(0, 8)}...)` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {l.resourceType}
                      {l.resourceId ? ` / ${l.resourceId.slice(0, 8)}...` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
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
