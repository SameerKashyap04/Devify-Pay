"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

const REPORTS = [
  { key: "revenue", label: "Revenue Report", description: "Successful payments and their amounts" },
  { key: "payments", label: "Payment Report", description: "All payments across every status" },
  { key: "refunds", label: "Refund Report", description: "All refunds and their outcomes" },
  { key: "subscriptions", label: "Subscription Report", description: "All subscriptions across every status" },
  { key: "applications", label: "Application Report", description: "Per-application order/payment/customer counts" },
];

export default function ReportsPage() {
  const router = useRouter();
  const [selectedReport, setSelectedReport] = useState("revenue");
  const [days, setDays] = useState(30);
  const [reportData, setReportData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    const res = await adminApiFetch(`/v1/admin/reports/${selectedReport}?days=${days}`);
    setLoading(false);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setReportData(data.data || []);
  }, [selectedReport, days, router]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminApiFetch(`/v1/admin/reports/${selectedReport}?format=csv&days=${days}`);
      if (!res.ok) throw new Error("Failed to generate CSV");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedReport}-report-${days}days.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error downloading CSV report");
    } finally {
      setExporting(false);
    }
  };

  // Helper metrics
  const totalCount = reportData?.length ?? 0;
  const totalAmountRupees = reportData
    ? (
        reportData.reduce((sum, r) => sum + (typeof r.amount === "number" ? r.amount : 0), 0) / 100
      ).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Reports &amp; Analytics</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 1 year</option>
            </select>
            <button
              onClick={handleExportCsv}
              disabled={exporting || loading}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {exporting ? "Exporting CSV..." : "Export CSV"}
            </button>
          </div>
        </div>

        {/* Report selection cards */}
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {REPORTS.map((r) => {
            const active = selectedReport === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setSelectedReport(r.key)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? "border-indigo-600 bg-indigo-50/50 shadow-sm"
                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/50"
                }`}
              >
                <div className={`text-xs font-semibold ${active ? "text-indigo-600" : "text-gray-900"}`}>{r.label}</div>
                <div className="mt-1 line-clamp-2 text-[11px] text-gray-500">{r.description}</div>
              </button>
            );
          })}
        </div>

        {/* Summary Card Header */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Records</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{totalCount}</div>
          </div>
          {(selectedReport === "revenue" || selectedReport === "payments" || selectedReport === "refunds") && (
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Total Value</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">&#8377;{totalAmountRupees}</div>
            </div>
          )}
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Time Window</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{days} Days</div>
          </div>
        </div>

        {/* Report Data Table Preview */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              {REPORTS.find((r) => r.key === selectedReport)?.label} Preview
            </h2>
            <span className="text-xs text-gray-400">{totalCount} rows</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading report data...</div>
          ) : !reportData || reportData.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No records found for the selected time window.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    {Object.keys(reportData[0]).map((col) => (
                      <th key={col} className="px-6 py-3 font-semibold">
                        {col.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      {Object.entries(row).map(([colKey, val]) => (
                        <td key={colKey} className="whitespace-nowrap px-6 py-3 text-xs text-gray-700">
                          {colKey === "amount" && typeof val === "number" ? (
                            <span className="font-semibold text-gray-900">&#8377;{(val / 100).toFixed(2)}</span>
                          ) : colKey === "created_at" && typeof val === "string" ? (
                            new Date(val).toLocaleString()
                          ) : (
                            String(val ?? "N/A")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
