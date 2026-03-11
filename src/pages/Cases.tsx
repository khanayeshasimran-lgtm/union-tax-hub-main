import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Clock, BarChart2, History, X, FileBarChart, Save
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

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  const color = days > 14 ? "text-red-500" : days > 7 ? "text-yellow-600" : "text-muted-foreground";
  return <span className={`text-xs ${color}`}><Clock className="inline h-3 w-3 mr-0.5" />{days}d old</span>;
}

export default function Cases() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const db = supabase as any;
  const isAdmin = role === "admin" || role === "super_admin";

  const [cases, setCases] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

    let casesQuery: any;
    let leadsQuery: any;

    if (isAdmin) {
      casesQuery = supabase.from("cases")
        .select("*, leads(full_name, phone_number)")
        .order("created_at", { ascending: false });
      leadsQuery = supabase.from("leads")
        .select("id, full_name")
        .eq("status", "Converted")
        .order("created_at", { ascending: false });
    } else {
      casesQuery = supabase.from("cases")
        .select("*, leads!inner(full_name, phone_number, assigned_agent_id)")
        .eq("leads.assigned_agent_id", agentId)
        .order("created_at", { ascending: false });
      leadsQuery = supabase.from("leads")
        .select("id, full_name")
        .eq("assigned_agent_id", agentId)
        .eq("status", "Converted")
        .order("created_at", { ascending: false });
    }

    const [cRes, lRes] = await Promise.all([casesQuery, leadsQuery]);
    setCases(cRes.data || []);
    setLeads(lRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Migrate orphaned docs from lead → new case ──────────────────────────────
  async function migrateLeadDocsToCaseOnConvert(leadId: string, caseId: string) {
    try {
      // Migrate case_documents uploaded before case existed (stored by lead_id)
      await db.from("case_documents")
        .update({ case_id: caseId })
        .eq("lead_id", leadId)
        .is("case_id", null);

      // Migrate docs stored under client's user_id as pseudo-case_id (our old workaround)
      const { data: lead } = await db.from("leads")
        .select("client_user_id")
        .eq("id", leadId)
        .maybeSingle();

      if (lead?.client_user_id) {
        await db.from("case_documents")
          .update({ case_id: caseId, lead_id: leadId })
          .eq("case_id", lead.client_user_id)
          .is("lead_id", null);
      }

      // Migrate required_documents checklist items
      await db.from("required_documents")
        .update({ case_id: caseId })
        .eq("lead_id", leadId)
        .is("case_id", null);
    } catch (e) {
      // Non-fatal — docs may not exist yet
      console.warn("Doc migration warning:", e);
    }
  }

  // ── Drag and Drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, caseId: string) => {
    setDragging(caseId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (!dragging) return;
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

    const { data: profile } = await supabase.from("profiles")
      .select("organization_id").eq("id", user.id).single();

    const { data: newCase, error } = await supabase.from("cases").insert({
      organization_id: profile?.organization_id,
      lead_id: selectedLead,
      current_stage: selectedStage,
    }).select("id").single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Mark lead as Converted
      await supabase.from("leads")
        .update({ status: "Converted" })
        .eq("id", selectedLead);

      // Migrate any docs the client uploaded before case existed
      if (newCase?.id) {
        await migrateLeadDocsToCaseOnConvert(selectedLead, newCase.id);
      }

      toast({ title: "Case created", description: "Client's pre-uploaded documents linked to this case." });
      setShowCreate(false);
      setSelectedLead("");
      await fetchData();
    }
    setCreating(false);
  };

  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = cases.filter(c => c.current_stage === stage);
    return acc;
  }, {} as Record<string, any[]>);

  // ── Analytics ────────────────────────────────────────────────────────────────
  const stageAnalytics = STAGES.map(stage => {
    const stageCases = grouped[stage] || [];
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
    <div className="p-6 space-y-6">
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
                  <td className="py-2 font-medium">{s.stage}</td>
                  <td className="py-2 text-muted-foreground">{s.count}</td>
                  <td className={`py-2 ${s.avgAge > 14 ? "text-red-500" : s.avgAge > 7 ? "text-yellow-600" : "text-muted-foreground"}`}>
                    {s.count > 0 ? `${s.avgAge}d` : "—"}
                  </td>
                  <td className="py-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${cases.length > 0 ? (s.count / cases.length) * 100 : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stage => (
          <div
            key={stage}
            className="min-w-[240px] flex-shrink-0"
            onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <div className={`rounded-t-lg border-t-4 ${STAGE_COLORS[stage]} bg-card px-3 py-2 border-x border-b-0 border-border`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{stage}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{grouped[stage]?.length || 0}</span>
              </div>
            </div>
            <div className={`space-y-2 rounded-b-lg border border-t-0 p-2 min-h-[120px] transition-colors ${dragOver === stage ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-border"}`}>
              {(grouped[stage] || []).length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No cases</p>
              ) : (
                grouped[stage].map((c: any) => (
                  <div
                    key={c.id}
                    draggable={isAdmin}
                    onDragStart={(e) => handleDragStart(e, c.id)}
                    className={`rounded-lg border bg-card p-3 shadow-sm transition-opacity ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === c.id ? "opacity-40" : "opacity-100"}`}
                  >
                    <p className="text-sm font-medium">{c.leads?.full_name || "Unknown"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.leads?.phone_number || ""}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <AgeBadge createdAt={c.created_at} />
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            onClick={() => openSummary(c)}
                            className="text-xs text-muted-foreground hover:text-blue-600 transition-colors"
                            title="Edit tax summary"
                          >
                            <FileBarChart className={`h-3.5 w-3.5 ${c.tax_summary ? "text-blue-500" : ""}`} />
                          </button>
                        )}
                        <button
                          onClick={() => openHistory(c)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                          title="View stage history"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Case Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[400px] space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Create Case</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Client's uploaded documents will be automatically linked.</p>
              </div>
              <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div>
              <label className="text-sm font-medium">Converted Lead</label>
              <select value={selectedLead} onChange={(e) => setSelectedLead(e.target.value)}
                className="w-full mt-1 border rounded-md p-2 text-sm">
                <option value="">Select lead...</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Initial Stage</label>
              <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full mt-1 border rounded-md p-2 text-sm">
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Button onClick={handleCreateCase} disabled={!selectedLead || creating} className="w-full">
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Case
            </Button>
          </div>
        </div>
      )}

      {/* Stage History Modal */}
      {historyCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[480px] max-h-[80vh] overflow-y-auto shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Stage History</h2>
              <button onClick={() => setHistoryCase(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">{historyCase.leads?.full_name || "Unknown"}</p>
            {historyLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : stageHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No stage transitions recorded yet</p>
            ) : (
              <div className="space-y-3">
                {stageHistory.map((h: any) => (
                  <div key={h.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                    <div>
                      <p>
                        <span className="text-muted-foreground line-through">{h.previous_stage || "Created"}</span>
                        {" → "}
                        <span className="font-medium text-foreground">{h.new_stage}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {h.profiles?.full_name || "System"} · {new Date(h.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tax Summary Modal */}
      {summaryCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[520px] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Tax Summary</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {summaryCase.leads?.full_name || "Unknown"} — visible to client in their portal
                </p>
              </div>
              <button onClick={() => setSummaryCase(null)}>
                <X className="h-5 w-5 text-muted-foreground" />
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
                className="flex items-center gap-2 bg-[#1e2a4a] hover:bg-[#2d3a5c] text-white font-semibold px-5 py-2 rounded-lg transition-all disabled:opacity-50 text-sm">
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