import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, ChevronLeft, ChevronRight,
  Download, X, Calendar
} from "lucide-react";

const PAGE_SIZE = 50;
const ENTITY_TYPES = [
  "leads", "followups", "cases", "call_dispositions",
  "revenue_entries", "client_intake", "estimations", "storage_object",
];
const ACTION_TYPES = ["INSERT", "UPDATE", "DELETE", "UPLOAD"];

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  UPLOAD: "bg-purple-100 text-purple-700",
};

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function AuditTrail() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // ── Build query with all active filters ──────────────────────────────────────
  const buildQuery = (forExport = false) => {
    let query = supabase
      .from("audit_logs")
      .select("*, profiles:user_id(full_name)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
    if (actionFilter !== "all") query = query.eq("action_type", actionFilter);
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) {
      // Include full end day
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }

    if (!forExport) {
      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    }

    return query;
  };

  const fetchLogs = async () => {
    setLoading(true);
    const { data, count } = await buildQuery();
    setLogs(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [page, entityFilter, actionFilter, dateFrom, dateTo]);

  // Reset page when filters change
  const setFilter = (fn: () => void) => {
    setPage(0);
    fn();
  };

  // ── Client-side search (within current page) ─────────────────────────────────
  const filtered = search
    ? logs.filter((l) =>
        (l.action_type || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.entity_type || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.profiles?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.ip_address || "").includes(search)
      )
    : logs;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters =
    entityFilter !== "all" || actionFilter !== "all" || dateFrom || dateTo;

  // ── CSV Export ───────────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    setExporting(true);

    // Fetch ALL matching records (no pagination limit)
    const { data, error } = await buildQuery(true);

    if (error || !data) {
      setExporting(false);
      return;
    }

    const headers = [
      "Timestamp", "User", "Action", "Entity Type",
      "Entity ID", "IP Address", "Previous Value", "New Value",
    ];

    const rows = data.map((log: any) => [
      new Date(log.created_at).toLocaleString(),
      log.profiles?.full_name || "System",
      log.action_type || "",
      log.entity_type || "",
      log.entity_id || "",
      log.ip_address || "",
      log.previous_value ? JSON.stringify(log.previous_value) : "",
      log.new_value ? JSON.stringify(log.new_value) : "",
    ]);

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Build filename with active filters
    const dateSuffix = dateFrom || dateTo
      ? `_${dateFrom || "start"}_to_${dateTo || "end"}`
      : `_${new Date().toISOString().split("T")[0]}`;
    const entitySuffix = entityFilter !== "all" ? `_${entityFilter}` : "";
    const actionSuffix = actionFilter !== "all" ? `_${actionFilter}` : "";
    const filename = `audit_trail${entitySuffix}${actionSuffix}${dateSuffix}.csv`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const clearFilters = () => {
    setPage(0);
    setEntityFilter("all");
    setActionFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Audit Trail"
        description={`${totalCount.toLocaleString()} total records`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || loading}
          >
            {exporting
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Export CSV
            {hasActiveFilters && (
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                filtered
              </span>
            )}
          </Button>
        }
      />

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search user, action, entity, IP..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Entity type */}
        <Select
          value={entityFilter}
          onValueChange={(v) => setFilter(() => setEntityFilter(v))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {ENTITY_TYPES.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action type */}
        <Select
          value={actionFilter}
          onValueChange={(v) => setFilter(() => setActionFilter(v))}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date From */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            className="pl-9 w-40"
            value={dateFrom}
            onChange={(e) => setFilter(() => setDateFrom(e.target.value))}
            title="From date"
          />
        </div>

        {/* Date To */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            className="pl-9 w-40"
            value={dateTo}
            onChange={(e) => setFilter(() => setDateTo(e.target.value))}
            title="To date"
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* ── Active filter pills ──────────────────────────────────────────────── */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {entityFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
              Entity: {entityFilter}
              <button onClick={() => setFilter(() => setEntityFilter("all"))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {actionFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
              Action: {actionFilter}
              <button onClick={() => setFilter(() => setActionFilter("all"))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {dateFrom && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
              From: {dateFrom}
              <button onClick={() => setFilter(() => setDateFrom(""))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {dateTo && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
              To: {dateTo}
              <button onClick={() => setFilter(() => setDateTo(""))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <span className="text-xs text-muted-foreground self-center">
            {totalCount.toLocaleString()} matching records
          </span>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="data-table-row">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {log.profiles?.full_name || (
                        <span className="text-xs italic text-muted-foreground">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-mono font-medium ${
                        ACTION_COLORS[log.action_type] || "bg-muted text-muted-foreground"
                      }`}>
                        {log.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {log.entity_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {log.ip_address || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate"
                      title={log.new_value ? JSON.stringify(log.new_value) : undefined}>
                      {log.new_value
                        ? JSON.stringify(log.new_value).substring(0, 80) + (
                            JSON.stringify(log.new_value).length > 80 ? "…" : ""
                          )
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination + export summary ──────────────────────────────────── */}
        <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {totalPages > 1
              ? `Page ${page + 1} of ${totalPages} · ${totalCount.toLocaleString()} records`
              : `${totalCount.toLocaleString()} records`}
          </p>
          <div className="flex items-center gap-2">
            {totalCount > PAGE_SIZE && (
              <p className="text-xs text-muted-foreground">
                Export downloads all {totalCount.toLocaleString()} records
              </p>
            )}
            {totalPages > 1 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}