import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Clock, BarChart2, History, X, FileBarChart, Save,
  Sparkles, ClipboardList, FileText, User, Search, ChevronDown,
} from "lucide-react";

const STAGES = [
  "Converted", "File Received", "Intake Submitted",
  "Estimation Approved", "Filing In Progress", "Filed", "Closed",
];

const STAGE_COLORS: Record<string, string> = {
  "Converted":           "border-t-blue-400",
  "File Received":       "border-t-indigo-400",
  "Intake Submitted":    "border-t-violet-400",
  "Estimation Approved": "border-t-cyan-400",
  "Filing In Progress":  "border-t-amber-400",
  "Filed":               "border-t-green-400",
  "Closed":              "border-t-gray-400",
};

const STAGE_BADGE: Record<string, string> = {
  "Converted":           "bg-blue-50 text-blue-700",
  "File Received":       "bg-indigo-50 text-indigo-700",
  "Intake Submitted":    "bg-violet-50 text-violet-700",
  "Estimation Approved": "bg-cyan-50 text-cyan-700",
  "Filing In Progress":  "bg-amber-50 text-amber-700",
  "Filed":               "bg-green-50 text-green-700",
  "Closed":              "bg-gray-100 text-gray-600",
};

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  const color = days > 14 ? "text-red-500" : days > 7 ? "text-yellow-600" : "text-muted-foreground";
  return (
    <span className={`text-xs flex items-center gap-0.5 ${color}`}>
      <Clock className="h-3 w-3" />{days}d
    </span>
  );
}

export default function Cases() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const db = supabase as any;
  const isAdmin = role === "admin" || role === "super_admin";

  const [cases, setCases] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [intakeMap, setIntakeMap] = useState<Record<string, any>>({});     // lead_id → intake row
  const [portalMap, setPortalMap] = useState<Record<string, boolean>>({}); // lead_id → has portal data
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Create case dialog
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLead, setSelectedLead] = useState("");
  const [selectedStage, setSelectedStage] = useState("Converted");
  const [creating, setCreating] = useState(false);

  // Stage history modal
  const [historyCase, setHistoryCase] = useState<any | null>(null);
  const [stageHistory, setStageHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Tax Summary modal
  const [summaryCase, setSummaryCase] = useState<any | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);

  // Analytics
  const [showAnalytics, setShowAnalytics] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const agentId = user?.id;

    // ── Cases query ─────────────────────────────────────────────────────────
    // For agents: join through leads to filter by assigned_agent_id
    // We also pull email so we can match portal data
    let casesQuery: any;
    let leadsQuery: any;

    if (isAdmin) {
      casesQuery = db
        .from("cases")
        .select("*, leads(id, full_name, phone_number, email, assigned_agent_id)")
        .order("created_at", { ascending: false });

      leadsQuery = db
        .from("leads")
        .select("id, full_name")
        .eq("status", "Converted")
        .order("created_at", { ascending: false });
    } else {
      // Use inner join — this is the key fix for auto-created cases being visible
      casesQuery = db
        .from("cases")
        .select("*, leads!inner(id, full_name, phone_number, email, assigned_agent_id)")
        .eq("leads.assigned_agent_id", agentId)
        .order("created_at", { ascending: false });

      leadsQuery = db
        .from("leads")
        .select("id, full_name")
        .eq("assigned_agent_id", agentId)
        .eq("status", "Converted")
        .order("created_at", { ascending: false });
    }

    const [cRes, lRes] = await Promise.all([casesQuery, leadsQuery]);
    const fetchedCases: any[] = cRes.data || [];

    // Build agent name map from profiles (avoid broken nested FK join)
    if (isAdmin && fetchedCases.length > 0) {
      const agentIds = [...new Set(fetchedCases.map((c: any) => c.leads?.assigned_agent_id).filter(Boolean))];
      if (agentIds.length > 0) {
        const { data: agentProfiles } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", agentIds);
        const agentMap: Record<string, string> = {};
        (agentProfiles || []).forEach((p: any) => { agentMap[p.id] = p.full_name; });
        // Merge agent name into leads object
        fetchedCases.forEach((c: any) => {
          if (c.leads?.assigned_agent_id) {
            c.leads.agent_name = agentMap[c.leads.assigned_agent_id] || null;
          }
        });
      }
    }
    setCases(fetchedCases);

    // Filter out leads that already have a case
    const leadIdsWithCase = new Set(fetchedCases.map((c: any) => c.lead_id));
    setLeads((lRes.data || []).filter((l: any) => !leadIdsWithCase.has(l.id)));

    // ── Pull intake records for all case lead_ids ───────────────────────────
    const leadIds = fetchedCases.map((c: any) => c.lead_id).filter(Boolean);
    if (leadIds.length > 0) {
      const { data: intakes } = await db
        .from("client_intake")
        .select("lead_id, full_legal_name, filing_status, ssn_last_four, created_at")
        .in("lead_id", leadIds);

      const iMap: Record<string, any> = {};
      (intakes || []).forEach((i: any) => { iMap[i.lead_id] = i; });
      setIntakeMap(iMap);

      // ── Check which leads have portal data (client_tax_profiles) ──────────
      const { data: profiles } = await db
        .from("client_tax_profiles")
        .select("lead_id")
        .in("lead_id", leadIds);

      const pMap: Record<string, boolean> = {};
      (profiles || []).forEach((p: any) => { pMap[p.lead_id] = true; });
      setPortalMap(pMap);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  // ── Migrate orphaned docs from lead → new case ──────────────────────────────
  async function migrateLeadDocsToCaseOnConvert(leadId: string, caseId: string) {
    try {
      await db.from("case_documents").update({ case_id: caseId }).eq("lead_id", leadId).is("case_id", null);
      const { data: lead } = await db.from("leads").select("client_user_id").eq("id", leadId).maybeSingle();
      if (lead?.client_user_id) {
        await db.from("case_documents")
          .update({ case_id: caseId, lead_id: leadId })
          .eq("case_id", lead.client_user_id)
          .is("lead_id", null);
      }
      await db.from("required_documents").update({ case_id: caseId }).eq("lead_id", leadId).is("case_id", null);
    } catch (e) {
      console.warn("Doc migration warning:", e);
    }
  }

  // ── Drag and Drop (admin only) ───────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, caseId: string) => {
    if (!isAdmin) return;
    setDragging(caseId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (!dragging || !isAdmin) return;
    const c = cases.find(c => c.id === dragging);
    if (!c || c.current_stage === stage) { setDragging(null); setDragOver(null); return; }

    setCases(prev => prev.map(x => x.id === dragging ? { ...x, current_stage: stage } : x));
    const { error } = await supabase.from("cases")
      .update({ current_stage: stage, updated_at: new Date().toISOString() })
      .eq("id", dragging);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      fetchData();
    } else {
      toast({ title: `Moved to ${stage}` });
    }
    setDragging(null);
    setDragOver(null);
  };

  // ── Stage History ────────────────────────────────────────────────────────────
  const openHistory = async (c: any) => {
    setHistoryCase(c);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("case_stage_history")
      .select("*, profiles:changed_by(full_name)")
      .eq("case_id", c.id)
      .order("created_at", { ascending: false });
    setStageHistory(data || []);
    setHistoryLoading(false);
  };

  // ── Tax Summary ──────────────────────────────────────────────────────────────
  const openSummary = (c: any) => {
    setSummaryCase(c);
    setSummaryText(c.tax_summary || "");
  };

  const handleSaveSummary = async () => {
    if (!summaryCase) return;
    setSavingSummary(true);
    const { error } = await supabase.from("cases")
      .update({ tax_summary: summaryText })
      .eq("id", summaryCase.id);
    if (error) {
      toast({ title: "Error saving summary", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tax summary saved", description: "Client can now view it in their portal." });
      setCases(prev => prev.map(x => x.id === summaryCase.id ? { ...x, tax_summary: summaryText } : x));
      setSummaryCase(null);
    }
    setSavingSummary(false);
  };

  // ── Create Case ──────────────────────────────────────────────────────────────
  const handleCreateCase = async () => {
    if (!selectedLead || !user) return;
    setCreating(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const { data: newCase, error } = await supabase.from("cases").insert({
      organization_id: profile?.organization_id,
      lead_id: selectedLead,
      current_stage: selectedStage,
    }).select("id").single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("leads").update({ status: "Converted" }).eq("id", selectedLead);
      if (newCase?.id) await migrateLeadDocsToCaseOnConvert(selectedLead, newCase.id);
      toast({ title: "Case created", description: "Client's pre-uploaded documents linked." });
      setShowCreate(false);
      setSelectedLead("");
      await fetchData();
    }
    setCreating(false);
  };

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filteredCases = cases.filter((c) => {
    const name = (c.leads?.full_name || "").toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStage = stageFilter === "All" || c.current_stage === stageFilter;
    return matchSearch && matchStage;
  });

  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = filteredCases.filter(c => c.current_stage === stage);
    return acc;
  }, {} as Record<string, any[]>);

  // ── Analytics ────────────────────────────────────────────────────────────────
  const stageAnalytics = STAGES.map(stage => {
    const stageCases = (cases.filter(c => c.current_stage === stage)) || [];
    const avgAge = stageCases.length > 0
      ? Math.round(stageCases.reduce((s, c) => s + (Date.now() - new Date(c.created_at).getTime()) / 86400000, 0) / stageCases.length)
      : 0;
    return { stage, count: stageCases.length, avgAge };
  });

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Tax Cases Pipeline"
        description={`${cases.length} total cases`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAnalytics(!showAnalytics)}>
              <BarChart2 className="mr-1.5 h-4 w-4" /> Analytics
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>+ Create Case</Button>
          </div>
        }
      />

      {/* Search + Stage Filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client..."
            className="pl-9 pr-3 py-2 rounded-md border bg-background text-sm w-52 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="relative">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-md border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="All">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {/* Summary stats */}
        <div className="ml-auto flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            {Object.values(portalMap).filter(Boolean).length} self-serve
          </span>
          <span className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3 text-violet-500" />
            {Object.keys(intakeMap).length} intakes filed
          </span>
        </div>
      </div>

      {/* Analytics Bar */}
      {showAnalytics && (
        <div className="kpi-card overflow-x-auto">
          <h3 className="mb-3 text-sm font-semibold">Pipeline Analytics</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium">Cases</th>
                <th className="pb-2 font-medium">Avg Age</th>
                <th className="pb-2 font-medium">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {stageAnalytics.map(s => (
                <tr key={s.stage} className="border-b last:border-0">
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[s.stage]}`}>{s.stage}</span>
                  </td>
                  <td className="py-2 text-muted-foreground">{s.count}</td>
                  <td className={`py-2 text-xs ${s.avgAge > 14 ? "text-red-500 font-medium" : s.avgAge > 7 ? "text-yellow-600" : "text-muted-foreground"}`}>
                    {s.count > 0 ? `${s.avgAge}d` : "—"}
                  </td>
                  <td className="py-2 w-40">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${cases.length > 0 ? (s.count / cases.length) * 100 : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Kanban Board ──────────────────────────────────────────────────────── */}
      <div className="flex gap-4 overflow-x-auto pb-6">
        {STAGES.map(stage => (
          <div
            key={stage}
            className="min-w-[250px] flex-shrink-0"
            onDragOver={(e) => { if (isAdmin) { e.preventDefault(); setDragOver(stage); } }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, stage)}
          >
            {/* Column header */}
            <div className={`rounded-t-lg border-t-4 ${STAGE_COLORS[stage]} bg-card px-3 py-2.5 border-x border-b-0 border-border`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{stage}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
                  {grouped[stage]?.length || 0}
                </span>
              </div>
            </div>

            {/* Column body */}
            <div className={`space-y-2 rounded-b-lg border border-t-0 p-2 min-h-[200px] transition-colors ${dragOver === stage && isAdmin ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-border"}`}>
              {(grouped[stage] || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No cases</p>
              ) : (
                grouped[stage].map((c: any) => {
                  const hasPortal   = portalMap[c.lead_id];
                  const hasIntake   = !!intakeMap[c.lead_id];
                  const intake      = intakeMap[c.lead_id];
                  const agentName   = isAdmin ? c.leads?.agent_name : null;

                  return (
                    <div
                      key={c.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, c.id)}
                      className={`rounded-lg border bg-card p-3 shadow-sm transition-all ${isAdmin ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "hover:shadow-md"} ${dragging === c.id ? "opacity-40 scale-95" : "opacity-100"}`}
                    >
                      {/* Name + portal badge */}
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-sm font-semibold text-foreground leading-tight">{c.leads?.full_name || "Unknown"}</p>
                        {hasPortal && (
                          <span title="Client submitted portal data" className="shrink-0 flex items-center gap-0.5 rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                            <Sparkles className="h-2.5 w-2.5" /> Self-serve
                          </span>
                        )}
                      </div>

                      {/* Phone */}
                      {c.leads?.phone_number && (
                        <p className="text-xs text-muted-foreground mb-2">{c.leads.phone_number}</p>
                      )}

                      {/* Agent name (admin view only) */}
                      {agentName && (
                        <div className="flex items-center gap-1 mb-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{agentName}</span>
                        </div>
                      )}

                      {/* Intake status */}
                      <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs mb-2 ${hasIntake ? "bg-violet-50 text-violet-700" : "bg-muted text-muted-foreground"}`}>
                        <ClipboardList className="h-3 w-3" />
                        {hasIntake ? (
                          <span>Intake filed · <span className="font-mono">***-**-{intake.ssn_last_four || "????"}</span></span>
                        ) : (
                          <span>Intake pending</span>
                        )}
                      </div>

                      {/* Tax summary indicator */}
                      {c.tax_summary && (
                        <div className="flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 mb-2">
                          <FileText className="h-3 w-3" />
                          <span>Tax summary written</span>
                        </div>
                      )}

                      {/* Footer: age + actions */}
                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-border">
                        <AgeBadge createdAt={c.created_at} />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openSummary(c)}
                            title="Write / edit tax summary"
                            className={`rounded p-1 transition-colors hover:bg-muted ${c.tax_summary ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <FileBarChart className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openHistory(c)}
                            title="Stage history"
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Create Case Modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[420px] space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Create Case</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pre-uploaded documents will be auto-linked.</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {leads.length === 0 ? (
              <div className="rounded-lg bg-muted/50 border p-4 text-sm text-muted-foreground text-center">
                All converted leads already have cases.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Converted Lead</label>
                  <select value={selectedLead} onChange={(e) => setSelectedLead(e.target.value)}
                    className="w-full border rounded-md p-2 text-sm bg-background">
                    <option value="">Select lead...</option>
                    {leads.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Initial Stage</label>
                  <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)}
                    className="w-full border rounded-md p-2 text-sm bg-background">
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Button onClick={handleCreateCase} disabled={!selectedLead || creating} className="w-full">
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Case
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Stage History Modal ───────────────────────────────────────────────── */}
      {historyCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Stage History</h2>
                <p className="text-sm text-muted-foreground">{historyCase.leads?.full_name || "Unknown"}</p>
              </div>
              <button onClick={() => setHistoryCase(null)} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : stageHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No stage transitions recorded yet</p>
            ) : (
              <div className="space-y-2">
                {stageHistory.map((h: any) => (
                  <div key={h.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p>
                        <span className="text-muted-foreground line-through text-xs">{h.previous_stage || "Created"}</span>
                        <span className="text-muted-foreground mx-1.5">→</span>
                        <span className={`font-semibold text-xs rounded-full px-2 py-0.5 ${STAGE_BADGE[h.new_stage] || "bg-muted text-muted-foreground"}`}>{h.new_stage}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {h.profiles?.full_name === null || !h.profiles?.full_name ? (
                          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-indigo-400" /> Auto (client portal)</span>
                        ) : h.profiles?.full_name} · {new Date(h.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tax Summary Modal ─────────────────────────────────────────────────── */}
      {summaryCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[540px] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Tax Summary</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {summaryCase.leads?.full_name || "Unknown"} — visible to client in their portal
                </p>
              </div>
              <button onClick={() => setSummaryCase(null)} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Summary</label>
              <textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                placeholder="Enter tax summary for this client. This will appear in their portal under 'My Tax Summary'."
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400">The client will see this immediately after you save.</p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setSummaryCase(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={handleSaveSummary} disabled={savingSummary}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2 rounded-lg transition-all disabled:opacity-50 text-sm">
                {savingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}