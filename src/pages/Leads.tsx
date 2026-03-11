import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Loader2, Upload, Download, History, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
}

export default function Leads() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const csvRef = useRef<HTMLInputElement>(null);

  const [leads, setLeads] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone_number: "", email: "", lead_source: "", assigned_agent_id: "" });
  const [showCSV, setShowCSV] = useState(false);
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isAdmin = role === "admin" || role === "super_admin";
  const STATUSES = ["All", "New", "Not Answered", "Follow-Up", "Converted", "Not Interested", "Other Firm", "Closed"];

  const fetchLeads = async () => {
    setLoading(true);
    let query = supabase.from("leads").select("*").order("created_at", { ascending: false });

    // Agents only see their assigned leads
    if (!isAdmin) {
      query = query.eq("assigned_agent_id", user?.id);
    }

    const { data } = await query;
    setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchLeads();
    if (isAdmin) {
      supabase.from("profiles").select("id, full_name").eq("role", "agent")
        .then(({ data }) => setAgents(data || []));
    }
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    let assignTo = form.assigned_agent_id || user.id;
    if (isAdmin && !form.assigned_agent_id && agents.length > 0) {
      const { data: allLeads } = await supabase.from("leads").select("assigned_agent_id");
      const counts: Record<string, number> = {};
      agents.forEach((a) => (counts[a.id] = 0));
      (allLeads || []).forEach((l: any) => { if (counts[l.assigned_agent_id] !== undefined) counts[l.assigned_agent_id]++; });
      assignTo = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
    }
    const { error } = await supabase.from("leads").insert({ ...form, organization_id: profile?.organization_id, assigned_agent_id: assignTo });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Lead created", description: "Assigned via round-robin" }); setShowCreate(false); setForm({ full_name: "", phone_number: "", email: "", lead_source: "", assigned_agent_id: "" }); fetchLeads(); }
    setCreating(false);
  };

  const handleCSVFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(""); setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { setCsvError("No valid rows found."); return; }
    if (!rows[0].full_name && !rows[0]["full name"]) { setCsvError("CSV must have a 'full_name' column."); return; }
    setCsvRows(rows); setShowCSV(true);
  };

  const handleCSVImport = async () => {
    if (!user) return;
    setImporting(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    let success = 0, failed = 0;
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const assignTo = agents.length > 0 ? agents[i % agents.length].id : user.id;
      const { error } = await supabase.from("leads").insert({
        organization_id: profile?.organization_id,
        full_name: row.full_name || row["full name"] || "",
        phone_number: row.phone_number || row.phone || "",
        email: row.email || null,
        lead_source: row.lead_source || row.source || null,
        assigned_agent_id: assignTo,
        status: "New",
      });
      if (error) failed++; else success++;
    }
    setImportResult({ success, failed }); setImporting(false); fetchLeads();
  };

  const openHistory = async () => {
    setShowHistory(true); setHistoryLoading(true);
    const { data } = await supabase.from("lead_assignment_history").select("*, leads(full_name)").order("created_at", { ascending: false }).limit(100);
    setHistoryData(data || []); setHistoryLoading(false);
  };

  const downloadTemplate = () => {
    const csv = "full_name,phone_number,email,lead_source\nJohn Smith,555-0100,john@email.com,Website\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "leads_template.csv"; a.click();
  };

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    return (l.full_name.toLowerCase().includes(q) || (l.phone_number || "").includes(q) || (l.email || "").toLowerCase().includes(q))
      && (statusFilter === "All" || l.status === statusFilter);
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={isAdmin ? "All Leads" : "My Leads"}
        description={`${filtered.length} of ${leads.length} leads`}
        actions={
          <div className="flex gap-2 flex-wrap">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={openHistory}><History className="mr-1.5 h-4 w-4" />History</Button>
                <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-1.5 h-4 w-4" />Template</Button>
                <label className="inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent transition-colors">
                  <Upload className="h-4 w-4" />Import CSV
                  <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
                </label>
              </>
            )}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New Lead</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Lead</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2"><Label>Full Name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Lead Source</Label><Input value={form.lead_source} onChange={(e) => setForm({ ...form, lead_source: e.target.value })} /></div>
                  {isAdmin && agents.length > 0 && (
                    <div className="space-y-2">
                      <Label>Assign To <span className="text-xs text-muted-foreground">(blank = round-robin)</span></Label>
                      <select value={form.assigned_agent_id} onChange={(e) => setForm({ ...form, assigned_agent_id: e.target.value })} className="w-full border rounded-md p-2 text-sm">
                        <option value="">Auto Round-Robin</option>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                      </select>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={creating}>{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Lead</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {csvError && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{csvError}</div>}

      <Dialog open={showCSV} onOpenChange={setShowCSV}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Import {csvRows.length} Leads from CSV</DialogTitle></DialogHeader>
          {importResult ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <p className="text-lg font-semibold">{importResult.success} leads imported</p>
              {importResult.failed > 0 && <p className="text-sm text-destructive">{importResult.failed} rows failed</p>}
              <Button onClick={() => { setShowCSV(false); setImportResult(null); if (csvRef.current) csvRef.current.value = ""; }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Preview (first 5). Assigned round-robin across {agents.length} agents.</p>
              <div className="overflow-x-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50"><tr>{csvRows[0] && Object.keys(csvRows[0]).slice(0, 5).map((k) => <th key={k} className="px-3 py-2 text-left">{k}</th>)}</tr></thead>
                  <tbody>{csvRows.slice(0, 5).map((row, i) => <tr key={i} className="border-t">{Object.values(row).slice(0, 5).map((v: any, j) => <td key={j} className="px-3 py-2">{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCSVImport} disabled={importing} className="flex-1">{importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import All {csvRows.length} Leads</Button>
                <Button variant="outline" onClick={() => setShowCSV(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assignment History</DialogTitle></DialogHeader>
          {historyLoading ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground"><tr><th className="pb-2 pr-4 text-left">Lead</th><th className="pb-2 pr-4 text-left">Previous</th><th className="pb-2 pr-4 text-left">New Agent</th><th className="pb-2 text-left">Date</th></tr></thead>
                <tbody>{historyData.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No changes yet</td></tr> : historyData.map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="py-2 pr-4 font-medium">{h.leads?.full_name || "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{h.previous_agent_id || "Unassigned"}</td>
                    <td className="py-2 pr-4">{h.new_agent_id || "—"}</td>
                    <td className="py-2 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, phone, email…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Phone</th><th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Next Retry</th><th className="px-4 py-3 font-medium">Created</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
              : filtered.length === 0 ? <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No leads found</td></tr>
              : filtered.map((lead) => (
                <tr key={lead.id} className="data-table-row cursor-pointer" onClick={() => navigate(`/calls?leadId=${lead.id}`)}>
                  <td className="px-4 py-3 font-medium text-foreground">{lead.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.phone_number || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.lead_source || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.attempt_count}</td>
                  <td className="px-4 py-3 text-xs">
                    {lead.next_retry_date ? (new Date(lead.next_retry_date) < new Date()
                      ? <span className="text-destructive font-medium">Overdue</span>
                      : new Date(lead.next_retry_date).toLocaleDateString()) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}