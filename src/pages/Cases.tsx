import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Clock, History, X, FileBarChart, Save,
  Sparkles, ClipboardList, FileText, User, Search,
  BarChart2, Plus, CheckCircle, AlertCircle, Phone,
  ArrowRight, TrendingUp, Layers,
} from "lucide-react";

const STAGES = [
  "Converted", "File Received", "Intake Submitted",
  "Estimation Approved", "Filing In Progress", "Filed", "Closed",
];

const STAGE_CFG: Record<string, {
  accent: string; light: string; dot: string; pill: string;
  bar: string; textColor: string; emoji: string;
}> = {
  "Converted":           { accent:"#3b82f6", light:"#eff6ff", dot:"bg-blue-400",    pill:"bg-blue-50 text-blue-700 ring-blue-200",        bar:"bg-blue-400",    textColor:"text-blue-700",   emoji:"🔵" },
  "File Received":       { accent:"#6366f1", light:"#eef2ff", dot:"bg-indigo-400",  pill:"bg-indigo-50 text-indigo-700 ring-indigo-200",  bar:"bg-indigo-400",  textColor:"text-indigo-700", emoji:"📁" },
  "Intake Submitted":    { accent:"#8b5cf6", light:"#f5f3ff", dot:"bg-violet-400",  pill:"bg-violet-50 text-violet-700 ring-violet-200",  bar:"bg-violet-400",  textColor:"text-violet-700", emoji:"📋" },
  "Estimation Approved": { accent:"#0ea5e9", light:"#f0f9ff", dot:"bg-sky-400",     pill:"bg-sky-50 text-sky-700 ring-sky-200",           bar:"bg-sky-400",     textColor:"text-sky-700",    emoji:"✅" },
  "Filing In Progress":  { accent:"#f59e0b", light:"#fffbeb", dot:"bg-amber-400",   pill:"bg-amber-50 text-amber-700 ring-amber-200",     bar:"bg-amber-400",   textColor:"text-amber-700",  emoji:"⚡" },
  "Filed":               { accent:"#10b981", light:"#ecfdf5", dot:"bg-emerald-400", pill:"bg-emerald-50 text-emerald-700 ring-emerald-200",bar:"bg-emerald-400", textColor:"text-emerald-700",emoji:"🎉" },
  "Closed":              { accent:"#94a3b8", light:"#f8fafc", dot:"bg-slate-300",   pill:"bg-slate-100 text-slate-500 ring-slate-200",    bar:"bg-slate-300",   textColor:"text-slate-500",  emoji:"🔒" },
};

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days > 14) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
      <AlertCircle className="h-2.5 w-2.5" />{days}d
    </span>
  );
  if (days > 7) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-50 rounded-full px-2 py-0.5">
      <Clock className="h-2.5 w-2.5" />{days}d
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
      <Clock className="h-2.5 w-2.5" />{days === 0 ? "today" : `${days}d`}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const colors = [
    "from-blue-400 to-blue-600", "from-violet-400 to-violet-600",
    "from-emerald-400 to-emerald-600", "from-amber-400 to-amber-600",
    "from-sky-400 to-sky-600", "from-pink-400 to-pink-600",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Cases() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const db = supabase as any;
  const isAdmin = role === "admin" || role === "super_admin";

  const [cases, setCases]             = useState<any[]>([]);
  const [leads, setLeads]             = useState<any[]>([]);
  const [intakeMap, setIntakeMap]     = useState<Record<string, any>>({});
  const [portalMap, setPortalMap]     = useState<Record<string, boolean>>({});
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [dragging, setDragging]       = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState<string | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [selectedLead, setSelectedLead]   = useState("");
  const [selectedStage, setSelectedStage] = useState("Converted");
  const [creating, setCreating]       = useState(false);
  const [historyCase, setHistoryCase] = useState<any | null>(null);
  const [stageHistory, setStageHistory]   = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [summaryCase, setSummaryCase] = useState<any | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    let casesQuery: any;
    let leadsQuery: any;

    if (isAdmin) {
      casesQuery = db.from("cases")
        .select("*, leads(id, full_name, phone_number, email, assigned_agent_id)")
        .order("created_at", { ascending: false });
      leadsQuery = db.from("leads").select("id, full_name")
        .eq("status", "Converted").order("created_at", { ascending: false });
    } else {
      casesQuery = db.from("cases")
        .select("*, leads!inner(id, full_name, phone_number, email, assigned_agent_id)")
        .eq("leads.assigned_agent_id", user?.id)
        .order("created_at", { ascending: false });
      leadsQuery = db.from("leads").select("id, full_name")
        .eq("assigned_agent_id", user?.id).eq("status", "Converted")
        .order("created_at", { ascending: false });
    }

    const [cRes, lRes] = await Promise.all([casesQuery, leadsQuery]);
    const fetchedCases: any[] = cRes.data || [];

    if (isAdmin && fetchedCases.length > 0) {
      const agentIds = [...new Set(fetchedCases.map((c: any) => c.leads?.assigned_agent_id).filter(Boolean))];
      if (agentIds.length > 0) {
        const { data: agentProfiles } = await db.from("profiles").select("id, full_name").in("id", agentIds);
        const agentMap: Record<string, string> = {};
        (agentProfiles || []).forEach((p: any) => { agentMap[p.id] = p.full_name; });
        fetchedCases.forEach((c: any) => {
          if (c.leads?.assigned_agent_id) c.leads.agent_name = agentMap[c.leads.assigned_agent_id] || null;
        });
      }
    }

    setCases(fetchedCases);
    const leadIdsWithCase = new Set(fetchedCases.map((c: any) => c.lead_id));
    setLeads((lRes.data || []).filter((l: any) => !leadIdsWithCase.has(l.id)));

    const leadIds = fetchedCases.map((c: any) => c.lead_id).filter(Boolean);
    if (leadIds.length > 0) {
      const [intakesRes, profilesRes] = await Promise.all([
        db.from("client_intake").select("lead_id, full_legal_name, filing_status, ssn_last_four").in("lead_id", leadIds),
        db.from("client_tax_profiles").select("lead_id").in("lead_id", leadIds),
      ]);
      const iMap: Record<string, any> = {};
      (intakesRes.data || []).forEach((i: any) => { iMap[i.lead_id] = i; });
      setIntakeMap(iMap);
      const pMap: Record<string, boolean> = {};
      (profilesRes.data || []).forEach((p: any) => { pMap[p.lead_id] = true; });
      setPortalMap(pMap);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, caseId: string) => {
    if (!isAdmin) return;
    setDragging(caseId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (!dragging || !isAdmin) return;
    const c = cases.find(x => x.id === dragging);
    if (!c || c.current_stage === stage) { setDragging(null); setDragOver(null); return; }
    setCases(prev => prev.map(x => x.id === dragging ? { ...x, current_stage: stage } : x));
    const { error } = await supabase.from("cases").update({ current_stage: stage, updated_at: new Date().toISOString() }).eq("id", dragging);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); fetchData(); }
    else toast({ title: `Moved to ${stage}` });
    setDragging(null); setDragOver(null);
  };

  // ── History ──────────────────────────────────────────────────────────────────
  const openHistory = async (c: any) => {
    setHistoryCase(c); setHistoryLoading(true);
    const { data } = await supabase.from("case_stage_history")
      .select("*, profiles:changed_by(full_name)").eq("case_id", c.id)
      .order("created_at", { ascending: false });
    setStageHistory(data || []); setHistoryLoading(false);
  };

  // ── Tax Summary ──────────────────────────────────────────────────────────────
  const openSummary = (c: any) => { setSummaryCase(c); setSummaryText(c.tax_summary || ""); };
  const saveSummary = async () => {
    if (!summaryCase) return;
    setSavingSummary(true);
    const { error } = await supabase.from("cases").update({ tax_summary: summaryText }).eq("id", summaryCase.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Tax summary saved" });
      setCases(prev => prev.map(x => x.id === summaryCase.id ? { ...x, tax_summary: summaryText } : x));
      setSummaryCase(null);
    }
    setSavingSummary(false);
  };

  // ── Create Case ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!selectedLead || !user) return;
    setCreating(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const { error } = await supabase.from("cases")
      .insert({ organization_id: profile?.organization_id, lead_id: selectedLead, current_stage: selectedStage })
      .select("id").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      await supabase.from("leads").update({ status: "Converted" }).eq("id", selectedLead);
      toast({ title: "Case created" });
      setShowCreate(false); setSelectedLead(""); await fetchData();
    }
    setCreating(false);
  };

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = cases.filter(c => {
    const name = (c.leads?.full_name || "").toLowerCase();
    return (!search || name.includes(search.toLowerCase())) &&
           (stageFilter === "All" || c.current_stage === stageFilter);
  });
  const grouped = STAGES.reduce((acc, s) => {
    acc[s] = filtered.filter(c => c.current_stage === s);
    return acc;
  }, {} as Record<string, any[]>);

  const selfServeCount = Object.values(portalMap).filter(Boolean).length;
  const intakesCount   = Object.values(intakeMap).length;
  const activeCount    = cases.filter(c => !["Closed", "Filed"].includes(c.current_stage)).length;

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ background: "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="h-12 w-12 rounded-2xl bg-white shadow-lg border border-slate-200 flex items-center justify-center">
            <Layers className="h-5 w-5 text-slate-400" />
          </div>
          <div className="absolute inset-0 rounded-2xl animate-ping bg-blue-100 opacity-60" />
        </div>
        <p className="text-sm font-medium text-slate-500">Loading pipeline…</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)" }}>

      {/* ════════════ HEADER ════════════ */}
      <div className="flex-shrink-0 bg-white/90 backdrop-blur-sm border-b border-slate-200/80 px-6 pt-5 pb-4">

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shadow-blue-200">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Tax Cases Pipeline</h1>
            </div>
            <div className="flex items-center gap-3 ml-10">
              <span className="text-xs text-slate-400">{cases.length} total</span>
              <span className="text-slate-200">·</span>
              <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                <TrendingUp className="h-3 w-3" />{activeCount} active
              </span>
              <span className="text-slate-200">·</span>
              <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                <Sparkles className="h-3 w-3" />{selfServeCount} self-serve
              </span>
              <span className="text-slate-200">·</span>
              <span className="flex items-center gap-1 text-xs text-violet-600 font-medium">
                <ClipboardList className="h-3 w-3" />{intakesCount} intakes
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAnalytics(v => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all ${
                showAnalytics
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <BarChart2 className="h-4 w-4" /> Analytics
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 px-4 py-2 text-sm font-semibold text-white hover:from-blue-600 hover:to-blue-800 shadow-sm shadow-blue-200/60 transition-all"
            >
              <Plus className="h-4 w-4" /> Create Case
            </button>
          </div>
        </div>

        {/* Pipeline progress bar */}
        <div className="flex items-center rounded-full overflow-hidden h-1.5 bg-slate-100 mb-4 gap-0.5">
          {STAGES.map(stage => {
            const count = cases.filter(c => c.current_stage === stage).length;
            const pct = cases.length > 0 ? (count / cases.length) * 100 : 0;
            const cfg = STAGE_CFG[stage];
            return (
              <div key={stage} className={`${cfg.bar} h-full transition-all duration-700 rounded-full`}
                style={{ width: `${pct}%`, minWidth: count > 0 ? "6px" : "0" }}
                title={`${stage}: ${count}`}
              />
            );
          })}
        </div>

        {/* Search + filter row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search client…"
              className="pl-8 pr-8 py-1.5 w-48 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setStageFilter("All")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                stageFilter === "All" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              All
            </button>
            {STAGES.map(stage => {
              const count = cases.filter(c => c.current_stage === stage).length;
              const cfg = STAGE_CFG[stage];
              const active = stageFilter === stage;
              return (
                <button key={stage}
                  onClick={() => setStageFilter(active ? "All" : stage)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ring-1 ${
                    active ? `${cfg.pill} shadow-sm` : "bg-white text-slate-500 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                  {stage}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white/60" : "bg-slate-100 text-slate-500"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Analytics strip */}
      {showAnalytics && (
        <div className="flex-shrink-0 bg-white border-b border-slate-200/80 px-6 py-4">
          <div className="grid grid-cols-7 gap-2.5">
            {STAGES.map(stage => {
              const cnt = cases.filter(c => c.current_stage === stage).length;
              const cfg = STAGE_CFG[stage];
              return (
                <div key={stage} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-center">
                  <div className="text-2xl font-black mb-0.5" style={{ color: cfg.accent }}>{cnt}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-wide ${cfg.textColor} truncate`}>{stage}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════ KANBAN ════════════ */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3.5 h-full px-5 py-5 min-w-max">
          {STAGES.map(stage => {
            const cfg = STAGE_CFG[stage];
            const stageCases = grouped[stage] || [];
            const isOver = dragOver === stage && isAdmin;

            return (
              <div key={stage}
                className={`flex flex-col w-[268px] flex-shrink-0 rounded-2xl overflow-hidden transition-all duration-200 ${
                  isOver ? "ring-2" : ""
                }`}
                style={{ boxShadow: isOver ? `0 0 0 2px ${cfg.accent}40` : undefined }}
                onDragOver={e => { if (isAdmin) { e.preventDefault(); setDragOver(stage); } }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, stage)}
              >
                {/* Column header */}
                <div className="flex-shrink-0 bg-white border border-b-0 border-slate-200/70"
                  style={{ borderTop: `3px solid ${cfg.accent}` }}>
                  <div className="px-4 pt-3.5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm leading-none">{cfg.emoji}</span>
                        <span className="text-[13px] font-bold text-slate-800">{stage}</span>
                      </div>
                      {stageCases.length > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ backgroundColor: cfg.light, color: cfg.accent }}>
                          {stageCases.length}
                        </span>
                      )}
                    </div>
                    {/* Thin progress bar at bottom of header */}
                    <div className="mt-2.5 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${cfg.bar} transition-all duration-500`}
                        style={{ width: stageCases.length > 0 ? "100%" : "0%" }} />
                    </div>
                  </div>
                </div>

                {/* Column body */}
                <div className={`flex-1 min-h-[120px] max-h-[calc(100vh-290px)] overflow-y-auto border border-t-0 border-slate-200/70 p-2.5 space-y-2.5 transition-all duration-200 ${
                  isOver ? "bg-blue-50/60" : "bg-white/30 backdrop-blur-sm"
                }`}>
                  {stageCases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 h-24 select-none">
                      <div className="h-8 w-8 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                        <Plus className="h-3.5 w-3.5 text-slate-300" />
                      </div>
                      <p className="text-[11px] font-medium text-slate-300">No cases</p>
                    </div>
                  ) : (
                    stageCases.map((c: any) => {
                      const hasPortal  = portalMap[c.lead_id];
                      const intake     = intakeMap[c.lead_id];
                      const hasIntake  = !!intake;
                      const agentName  = isAdmin ? c.leads?.agent_name : null;
                      const isDragging = dragging === c.id;
                      const name       = c.leads?.full_name || "Unknown";

                      return (
                        <div key={c.id}
                          draggable={isAdmin}
                          onDragStart={e => handleDragStart(e, c.id)}
                          className={`group relative rounded-xl bg-white border overflow-hidden transition-all duration-150 ${
                            isDragging
                              ? "opacity-25 scale-95 border-slate-100"
                              : "border-slate-200/80 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:border-slate-300/80"
                          } ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""}`}
                        >
                          {/* Stage color accent — left edge */}
                          <div className="absolute left-0 inset-y-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            style={{ backgroundColor: cfg.accent }} />

                          <div className="p-3.5">
                            {/* Client info row */}
                            <div className="flex items-start gap-2.5 mb-2">
                              <Avatar name={name} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-[13px] font-bold text-slate-900 leading-tight truncate">{name}</p>
                                  {hasPortal && (
                                    <span className="shrink-0 flex items-center gap-0.5 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-1.5 py-0.5 text-[9px] font-black text-white tracking-wide">
                                      <Sparkles className="h-2 w-2" />SELF
                                    </span>
                                  )}
                                </div>
                                {c.leads?.phone_number && (
                                  <p className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                                    <Phone className="h-2.5 w-2.5" />{c.leads.phone_number}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Agent */}
                            {agentName && (
                              <div className="flex items-center gap-1.5 mb-2.5">
                                <div className="h-4 w-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-500 uppercase">
                                  {agentName[0]}
                                </div>
                                <span className="text-[11px] text-slate-400 font-medium truncate">{agentName}</span>
                              </div>
                            )}

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent my-2.5" />

                            {/* Status chips */}
                            <div className="space-y-1.5">
                              <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border ${
                                hasIntake
                                  ? "bg-violet-50 text-violet-700 border-violet-100"
                                  : "bg-slate-50 text-slate-400 border-slate-100"
                              }`}>
                                <ClipboardList className="h-3 w-3 shrink-0" />
                                {hasIntake
                                  ? <span>Intake filed <span className="font-mono opacity-60 ml-0.5">···{intake.ssn_last_four || "????"}</span></span>
                                  : "Intake pending"
                                }
                              </div>

                              {c.tax_summary && (
                                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle className="h-3 w-3 shrink-0" /> Tax summary ready
                                </div>
                              )}
                            </div>

                            {/* Footer */}
                            <div className="mt-2.5 flex items-center justify-between">
                              <AgeBadge createdAt={c.created_at} />
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
                                <button onClick={() => openSummary(c)} title="Write tax summary"
                                  className={`rounded-lg p-1.5 transition-colors ${
                                    c.tax_summary ? "text-emerald-500 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                  }`}>
                                  <FileBarChart className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => openHistory(c)} title="Stage history"
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                                  <History className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════ CREATE CASE MODAL ════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-[3px]">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/10 border border-slate-200/60 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Create New Case</h2>
                <p className="text-xs text-slate-400 mt-0.5">Documents uploaded by client will auto-link</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {leads.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 py-8 text-sm text-slate-400 text-center font-medium">
                  All converted leads already have cases
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Converted Lead</label>
                    <select value={selectedLead} onChange={e => setSelectedLead(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
                      <option value="">Select a lead…</option>
                      {leads.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Initial Stage</label>
                    <select value={selectedStage} onChange={e => setSelectedStage(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
                      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowCreate(false)}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleCreate} disabled={!selectedLead || creating}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 shadow-sm shadow-blue-200 transition-all hover:from-blue-600 hover:to-blue-800">
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Create Case
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════ STAGE HISTORY MODAL ════════════ */}
      {historyCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-[3px]">
          <div className="w-full max-w-lg max-h-[80vh] rounded-2xl bg-white shadow-2xl border border-slate-200/60 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Avatar name={historyCase.leads?.full_name || "?"} />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Stage History</h2>
                  <p className="text-xs text-slate-400">{historyCase.leads?.full_name}</p>
                </div>
              </div>
              <button onClick={() => setHistoryCase(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {historyLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : stageHistory.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">No transitions recorded yet</p>
              ) : (
                <div className="space-y-1">
                  {stageHistory.map((h: any, i: number) => {
                    const cfg = STAGE_CFG[h.new_stage] || STAGE_CFG["Closed"];
                    const isAuto = !h.profiles?.full_name;
                    return (
                      <div key={h.id} className="flex items-start gap-3">
                        <div className="flex flex-col items-center shrink-0">
                          <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-sm"
                            style={{ backgroundColor: cfg.accent }}>
                            {stageHistory.length - i}
                          </div>
                          {i < stageHistory.length - 1 && <div className="w-px flex-1 min-h-[20px] bg-slate-100 my-1" />}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {h.previous_stage && <span className="text-xs text-slate-400 line-through">{h.previous_stage}</span>}
                            {h.previous_stage && <ArrowRight className="h-3 w-3 text-slate-300" />}
                            <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 ring-1 ${cfg.pill}`}>{h.new_stage}</span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                            {isAuto
                              ? <><Sparkles className="h-3 w-3 text-indigo-400" /><span className="text-indigo-500 font-semibold">Auto — client portal</span></>
                              : <><User className="h-3 w-3" /><span className="font-medium">{h.profiles.full_name}</span></>
                            }
                            <span className="text-slate-200">·</span>
                            {new Date(h.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════ TAX SUMMARY MODAL ════════════ */}
      {summaryCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-[3px]">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200/60 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Tax Summary</h2>
                  <p className="text-xs text-slate-400">{summaryCase.leads?.full_name} · visible to client in portal</p>
                </div>
              </div>
              <button onClick={() => setSummaryCase(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                value={summaryText} onChange={e => setSummaryText(e.target.value)}
                placeholder="Write the client's tax summary here. They'll see it immediately in 'My Tax Summary' in their portal."
                rows={9}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none transition-all"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">Client sees this immediately upon saving.</p>
                <div className="flex gap-2">
                  <button onClick={() => setSummaryCase(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveSummary} disabled={savingSummary}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 shadow-sm shadow-emerald-200 transition-all">
                    {savingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Summary
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}