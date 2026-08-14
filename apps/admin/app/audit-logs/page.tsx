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

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (pageToLoad = pagination.page, limitToLoad = pagination.limit) => {
      setLoading(true);
      const res = await adminApiFetch(`/v1/admin/audit-logs?page=${pageToLoad}&limit=${limitToLoad}`);
      setLoading(false);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setLogs(data.data || []);
      if (data.pagination) {
        setPagination(data.pagination);
      }
    },
    [router, pagination.page, pagination.limit]
  );

  useEffect(() => {
    load(1, pagination.limit);
  }, []);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    load(newPage, pagination.limit);
  };

  const handleLimitChange = (newLimit: number) => {
    load(1, newLimit);
  };

  const startEntry = (pagination.page - 1) * pagination.limit + 1;
  const endEntry = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pagination.limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-indigo-500"
            >
              <option value={10}>10 per page</option>
              <option value={15}>15 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
            <button
              onClick={() => load(pagination.page, pagination.limit)}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {logs === null || loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No audit log entries yet.</div>
          ) : (
            <>
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
                    <tr key={l.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{l.action}</td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {l.actorType}
                        </span>
                        {l.actorId ? <span className="ml-1 text-xs text-gray-400">({l.actorId.slice(0, 8)}...)</span> : ""}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className="font-mono text-xs text-gray-700">{l.resourceType}</span>
                        {l.resourceId ? <span className="ml-1 text-xs text-gray-400">/ {l.resourceId.slice(0, 8)}...</span> : ""}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination bar */}
              <div className="flex flex-wrap items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
                <div>
                  Showing <span className="font-medium text-gray-700">{pagination.total > 0 ? startEntry : 0}</span> to{" "}
                  <span className="font-medium text-gray-700">{endEntry}</span> of{" "}
                  <span className="font-medium text-gray-700">{pagination.total}</span> entries
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((p) => Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages)
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && p - prev > 1;
                      return (
                        <span key={p} className="flex items-center">
                          {showEllipsis && <span className="px-1 text-gray-400">...</span>}
                          <button
                            onClick={() => handlePageChange(p)}
                            className={`min-w-[28px] rounded-md px-2.5 py-1 text-xs font-medium ${
                              p === pagination.page
                                ? "bg-indigo-600 text-white"
                                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {p}
                          </button>
                        </span>
                      );
                    })}

                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
