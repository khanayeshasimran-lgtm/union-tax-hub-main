import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Loader2, DollarSign, RefreshCw, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [productivity, setProductivity] = useState<any[]>([]);
  const [conversion, setConversion] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"revenue" | "productivity" | "conversion" | "archive">("revenue");

  // Archive state
  const [archivePeriods, setArchivePeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [archiveData, setArchiveData] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [lbRes, prodRes, convRes, profRes] = await Promise.all([
      supabase.from("leaderboard_metrics").select("*"),
      supabase.from("agent_productivity").select("*").order("total_revenue", { ascending: false }),
      supabase.from("conversion_performance").select("*").order("conversion_rate", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);

    const nameMap: Record<string, string> = {};
    (profRes.data || []).forEach((p: any) => { nameMap[p.id] = p.full_name || "Unknown"; });

    setProfiles(nameMap);
    setLeaderboard(lbRes.data || []);
    setProductivity(prodRes.data || []);
    setConversion(convRes.data || []);
    setLoading(false);
  };

  const fetchArchivePeriods = async () => {
    const { data } = await (supabase as any)
      .from("leaderboard_archive")
      .select("period")
      .order("period", { ascending: false });

    if (data) {
      const unique = [...new Set(data.map((r: any) => r.period))] as string[];
      setArchivePeriods(unique);
      if (unique.length > 0 && !selectedPeriod) setSelectedPeriod(unique[0]);
    }
  };

  const fetchArchiveData = async (period: string) => {
    if (!period) return;
    setArchiveLoading(true);
    const { data } = await (supabase as any)
      .from("leaderboard_archive")
      .select("*")
      .eq("period", period)
      .order("rank", { ascending: true });
    setArchiveData(data || []);
    setArchiveLoading(false);
  };

  useEffect(() => { fetchData(); fetchArchivePeriods(); }, []);

  useEffect(() => {
    if (tab === "archive" && selectedPeriod) fetchArchiveData(selectedPeriod);
  }, [tab, selectedPeriod]);

  const MEDAL = ["🥇", "🥈", "🥉"];
  const name = (id: string) => profiles[id] || id?.slice(0, 8) || "—";
  const sortedLeaderboard = [...leaderboard].sort((a, b) => b.monthly_revenue - a.monthly_revenue);

  const formatPeriod = (period: string) => {
    const [year, month] = period.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leaderboard"
        description="Agent performance rankings"
        actions={
          <Button size="sm" variant="outline" onClick={fetchData}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Tab Switcher */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        {(["revenue", "productivity", "conversion", "archive"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm capitalize transition-colors flex items-center gap-1.5 ${
              tab === t ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "archive" && <Archive className="h-3.5 w-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {loading && tab !== "archive" ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Revenue Tab ─────────────────────────────────────────────────── */}
          {tab === "revenue" && (
            <div className="space-y-4">
              {sortedLeaderboard.slice(0, 3).length > 0 && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {sortedLeaderboard.slice(0, 3).map((a, i) => (
                    <div key={a.agent_id} className={`kpi-card text-center ${i === 0 ? "border-yellow-300 bg-yellow-50" : ""}`}>
                      <div className="text-3xl mb-2">{MEDAL[i]}</div>
                      <p className="text-sm font-semibold text-foreground">{name(a.agent_id)}</p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        ${Number(a.monthly_revenue || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">This month</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ${Number(a.yearly_revenue || 0).toLocaleString()} YTD
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="kpi-card overflow-hidden p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Rank</th>
                      <th className="px-4 py-3 font-medium">Agent</th>
                      <th className="px-4 py-3 font-medium">Monthly Revenue</th>
                      <th className="px-4 py-3 font-medium">YTD Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaderboard.length === 0 ? (
                      <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">No revenue data yet</td></tr>
                    ) : sortedLeaderboard.map((a, i) => (
                      <tr key={a.agent_id} className="data-table-row">
                        <td className="px-4 py-3 text-muted-foreground">{MEDAL[i] || `#${i + 1}`}</td>
                        <td className="px-4 py-3 font-medium">{name(a.agent_id)}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-green-600 font-semibold">
                            <DollarSign className="h-3.5 w-3.5" />
                            {Number(a.monthly_revenue || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          ${Number(a.yearly_revenue || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Productivity Tab ─────────────────────────────────────────────── */}
          {tab === "productivity" && (
            <div className="kpi-card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Total Calls</th>
                    <th className="px-4 py-3 font-medium">Follow-Ups</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {productivity.length === 0 ? (
                    <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">No data yet</td></tr>
                  ) : productivity.map((a: any) => (
                    <tr key={a.agent_id} className="data-table-row">
                      <td className="px-4 py-3 font-medium">{a.full_name || name(a.agent_id)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.total_calls}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.total_followups}</td>
                      <td className="px-4 py-3 font-semibold text-green-600">
                        ${Number(a.total_revenue || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Conversion Tab ───────────────────────────────────────────────── */}
          {tab === "conversion" && (
            <div className="kpi-card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Converted</th>
                    <th className="px-4 py-3 font-medium">Total Leads</th>
                    <th className="px-4 py-3 font-medium">Conversion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {conversion.length === 0 ? (
                    <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">No data yet</td></tr>
                  ) : conversion.map((a: any) => (
                    <tr key={a.agent_id} className="data-table-row">
                      <td className="px-4 py-3 font-medium">{a.full_name || name(a.agent_id)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.total_conversions}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.total_leads}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(a.conversion_rate || 0, 100)}%` }} />
                          </div>
                          <span className="font-semibold text-foreground">{a.conversion_rate || 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Archive Tab ──────────────────────────────────────────────────── */}
          {tab === "archive" && (
            <div className="space-y-4">
              {archivePeriods.length === 0 ? (
                <div className="kpi-card flex flex-col items-center justify-center py-16 text-center">
                  <Archive className="h-10 w-10 text-muted-foreground opacity-30 mb-3" />
                  <p className="text-sm text-muted-foreground">No archived periods yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Archives are created automatically on the 1st of each month.
                  </p>
                </div>
              ) : (
                <>
                  {/* Period selector */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-muted-foreground">Period</label>
                    <select
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                      className="rounded-md border bg-background px-3 py-1.5 text-sm"
                    >
                      {archivePeriods.map((p) => (
                        <option key={p} value={p}>{formatPeriod(p)}</option>
                      ))}
                    </select>
                  </div>

                  {archiveLoading ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Podium for top 3 */}
                      {archiveData.slice(0, 3).length > 0 && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          {archiveData.slice(0, 3).map((a, i) => (
                            <div key={a.id} className={`kpi-card text-center ${i === 0 ? "border-yellow-300 bg-yellow-50" : ""}`}>
                              <div className="text-3xl mb-2">{MEDAL[i]}</div>
                              <p className="text-sm font-semibold text-foreground">{a.full_name || name(a.agent_id)}</p>
                              <p className="mt-1 text-lg font-bold text-foreground">
                                ${Number(a.revenue || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatPeriod(a.period)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {a.conversions} conversions · {a.conversion_rate}%
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Full archive table */}
                      <div className="kpi-card overflow-hidden p-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                              <th className="px-4 py-3 font-medium">Rank</th>
                              <th className="px-4 py-3 font-medium">Agent</th>
                              <th className="px-4 py-3 font-medium">Revenue</th>
                              <th className="px-4 py-3 font-medium">Conversions</th>
                              <th className="px-4 py-3 font-medium">Calls</th>
                              <th className="px-4 py-3 font-medium">Conv. Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archiveData.length === 0 ? (
                              <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No data for this period</td></tr>
                            ) : archiveData.map((a: any, i: number) => (
                              <tr key={a.id} className="data-table-row">
                                <td className="px-4 py-3 text-muted-foreground">{MEDAL[i] || `#${a.rank}`}</td>
                                <td className="px-4 py-3 font-medium">{a.full_name || name(a.agent_id)}</td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-1 text-green-600 font-semibold">
                                    <DollarSign className="h-3.5 w-3.5" />
                                    {Number(a.revenue || 0).toLocaleString()}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{a.conversions}</td>
                                <td className="px-4 py-3 text-muted-foreground">{a.total_calls}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                      <div className="h-full bg-primary" style={{ width: `${Math.min(a.conversion_rate || 0, 100)}%` }} />
                                    </div>
                                    <span className="font-semibold">{a.conversion_rate || 0}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}