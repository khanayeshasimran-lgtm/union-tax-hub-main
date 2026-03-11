import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Download, Search, X, Calendar,
  TrendingDown, Users, Phone, AlertCircle
} from "lucide-react";

const REJECTION_TYPES = [
  "Not Interested",
  "Other Firm",
  "Not Answered",
  "Closed",
];

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function RejectionAnalytics() {
  const { toast } = useToast();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const PAGE_SIZE = 50;

  // ── Monthly trend data ──────────────────────────────────────────────────────
  const [trendData, setTrendData] = useState<Record<string, number>>({});

  const fetchAgents = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "agent");
    setAgents(data || []);
  };

  const buildQuery = (forExport = false) => {
    let query = supabase
      .from("call_dispositions")
      .select(`
        id, disposition_type, notes, created_at,
        leads(full_name, phone_number, email, lead_source),
        profiles:agent_id(full_name)
      `, { count: "exact" })
      .in("disposition_type", ["Not Interested", "Other Firm", "Not Answered", "Closed"])
      .order("created_at", { ascending: false });

    if (agentFilter !== "all") query = query.eq("agent_id", agentFilter);
    if (typeFilter !== "all") query = query.eq("disposition_type", typeFilter);
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) {
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

    // Build monthly trend from current result
    const trend: Record<string, number> = {};
    (data || []).forEach((d: any) => {
      const month = new Date(d.created_at).toLocaleDateString("en-US", {
        month: "short", year: "numeric",
      });
      trend[month] = (trend[month] || 0) + 1;
    });
    setTrendData(trend);

    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);
  useEffect(() => { fetchLogs(); }, [page, agentFilter, typeFilter, dateFrom, dateTo]);

  const setFilter = (fn: () => void) => { setPage(0); fn(); };

  const filtered = search
    ? logs.filter((l) =>
        (l.leads?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.leads?.phone_number || "").includes(search) ||
        ((l.profiles as any)?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.notes || "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasFilters = agentFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo;

  // ── KPI counts ──────────────────────────────────────────────────────────────
  const typeCounts = logs.reduce((acc: Record<string, number>, l) => {
    acc[l.disposition_type] = (acc[l.disposition_type] || 0) + 1;
    return acc;
  }, {});

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    const { data, error } = await buildQuery(true);

    if (error || !data) {
      toast({ title: "Export failed", variant: "destructive" });
      setExporting(false);
      return;
    }

    const headers = [
      "Date", "Lead Name", "Phone", "Email", "Lead Source",
      "Agent", "Rejection Type", "Notes",
    ];

    const rows = data.map((d: any) => [
      new Date(d.created_at).toLocaleString(),
      d.leads?.full_name || "",
      d.leads?.phone_number || "",
      d.leads?.email || "",
      d.leads?.lead_source || "",
      (d.profiles as any)?.full_name || "System",
      d.disposition_type || "",
      d.notes || "",
    ]);

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((r: any[]) => r.map(escapeCSV).join(",")),
    ].join("\n");

    const dateSuffix = `_${new Date().toISOString().split("T")[0]}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rejection_analytics${dateSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: `Exported ${data.length} records` });
    setExporting(false);
  };

  const TYPE_COLORS: Record<string, string> = {
    "Not Interested": "bg-red-100 text-red-700",
    "Other Firm":     "bg-orange-100 text-orange-700",
    "Not Answered":   "bg-yellow-100 text-yellow-700",
    "Closed":         "bg-gray-100 text-gray-600",
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Rejection Analytics"
        description="All rejected and closed leads — filter, analyze, export"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || loading}
          >
            {exporting
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Export CSV
            {hasFilters && (
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                filtered
              </span>
            )}
          </Button>
        }
      />

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
            <TrendingDown className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Rejections</p>
            <p className="text-xl font-bold">{totalCount.toLocaleString()}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Not Interested</p>
            <p className="text-xl font-bold">{typeCounts["Not Interested"] || 0}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-100">
            <Phone className="h-4 w-4 text-yellow-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Other Firm</p>
            <p className="text-xl font-bold">{typeCounts["Other Firm"] || 0}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Users className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Not Answered</p>
            <p className="text-xl font-bold">{typeCounts["Not Answered"] || 0}</p>
          </div>
        </div>
      </div>

      {/* ── Monthly Trend ───────────────────────────────────────────────────── */}
      {Object.keys(trendData).length > 0 && (
        <div className="kpi-card space-y-3">
          <h3 className="text-sm font-semibold">Monthly Rejection Trend</h3>
          <div className="flex items-end gap-2 h-20">
            {Object.entries(trendData)
              .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
              .map(([month, count]) => {
                const max = Math.max(...Object.values(trendData));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={month} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-xs text-muted-foreground font-medium">{count}</span>
                    <div
                      className="w-full rounded-t bg-red-400 transition-all"
                      style={{ height: `${Math.max(pct, 4)}%`, minHeight: "4px" }}
                    />
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">
                      {month}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search lead, agent, notes..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => setFilter(() => setTypeFilter(v))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Rejection type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {REJECTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={agentFilter} onValueChange={(v) => setFilter(() => setAgentFilter(v))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            className="pl-9 w-40"
            value={dateFrom}
            onChange={(e) => setFilter(() => setDateFrom(e.target.value))}
          />
        </div>

        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            className="pl-9 w-40"
            value={dateTo}
            onChange={(e) => setFilter(() => setDateTo(e.target.value))}
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAgentFilter("all");
              setTypeFilter("all");
              setDateFrom("");
              setDateTo("");
              setPage(0);
            }}
          >
            <X className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No rejection records found
                  </td>
                </tr>
              ) : (
                filtered.map((log: any) => (
                  <tr key={log.id} className="data-table-row">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {log.leads?.full_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.leads?.phone_number || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.leads?.lead_source || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(log.profiles as any)?.full_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[log.disposition_type] || "bg-muted text-muted-foreground"
                      }`}>
                        {log.disposition_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate"
                      title={log.notes}>
                      {log.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {totalCount.toLocaleString()} total rejections
            {hasFilters && " (filtered)"}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="sm" variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}