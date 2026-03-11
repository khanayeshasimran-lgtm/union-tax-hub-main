import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, CheckCircle, Upload, AlertTriangle, Clock, Calendar, Download, CheckCircle2 } from "lucide-react";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
}

function getPriorityClass(f: any) {
  if (f.status === "Overdue") return "border-l-4 border-l-destructive bg-destructive/5";
  if (f.status === "Upcoming" && new Date(f.follow_up_datetime) <= new Date(Date.now() + 24 * 3600000))
    return "border-l-4 border-l-yellow-400 bg-yellow-50/50";
  return "";
}

export default function FollowUps() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const csvRef = useRef<HTMLInputElement>(null);

  const [followups, setFollowups] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ lead_id: "", follow_up_datetime: "", notes: "" });
  const [filter, setFilter] = useState("All");

  // CSV
  const [showCSV, setShowCSV] = useState(false);
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [fRes, lRes] = await Promise.all([
      supabase.from("followups").select("*, leads(full_name, phone_number)").order("follow_up_datetime", { ascending: true }),
      supabase.from("leads").select("id, full_name"),
    ]);
    setFollowups(fRes.data || []);
    setLeads(lRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const { error } = await supabase.from("followups").insert({
      organization_id: profile?.organization_id,
      lead_id: form.lead_id, agent_id: user.id,
      follow_up_datetime: new Date(form.follow_up_datetime).toISOString(),
      notes: form.notes || null,
    });
    if (!error) await supabase.from("leads").update({ status: "Follow-Up" }).eq("id", form.lead_id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Follow-up scheduled" }); setShowCreate(false); setForm({ lead_id: "", follow_up_datetime: "", notes: "" }); fetchData(); }
    setCreating(false);
  };

  const markComplete = async (id: string) => {
    const { error } = await supabase.from("followups").update({ status: "Completed" }).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Follow-up completed" }); fetchData();
  };

  const handleCSVFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportResult(null);
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { toast({ title: "No valid rows", variant: "destructive" }); return; }
    setCsvRows(rows); setShowCSV(true);
  };

  const handleCSVImport = async () => {
    if (!user) return;
    setImporting(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    let success = 0, failed = 0;
    for (const row of csvRows) {
      const leadMatch = leads.find((l) => l.full_name.toLowerCase() === (row.lead_name || row.full_name || "").toLowerCase());
      if (!leadMatch) { failed++; continue; }
      const { error } = await supabase.from("followups").insert({
        organization_id: profile?.organization_id, lead_id: leadMatch.id,
        agent_id: user.id, follow_up_datetime: new Date(row.follow_up_datetime || row.date || "").toISOString(),
        notes: row.notes || null,
      });
      if (error) failed++; else success++;
    }
    setImportResult({ success, failed }); setImporting(false); fetchData();
  };

  const downloadTemplate = () => {
    const csv = "lead_name,follow_up_datetime,notes\nJohn Smith,2025-03-15T10:00,Call back about W2\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "followups_template.csv"; a.click();
  };

  const counts = { All: followups.length, Overdue: followups.filter((f) => f.status === "Overdue").length, Upcoming: followups.filter((f) => f.status === "Upcoming").length, Completed: followups.filter((f) => f.status === "Completed").length };
  const filtered = filter === "All" ? followups : followups.filter((f) => f.status === filter);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Follow-Ups" description="Manage your scheduled follow-ups"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-1.5 h-4 w-4" />Template</Button>
            <label className="inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent transition-colors">
              <Upload className="h-4 w-4" />Import CSV
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
            </label>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Schedule</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Schedule Follow-Up</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2"><Label>Lead *</Label>
                    <Select value={form.lead_id} onValueChange={(v) => setForm({ ...form, lead_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select lead…" /></SelectTrigger>
                      <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Date & Time *</Label><Input type="datetime-local" required value={form.follow_up_datetime} onChange={(e) => setForm({ ...form, follow_up_datetime: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={creating || !form.lead_id}>{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Schedule</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.All, icon: Calendar, color: "text-primary" },
          { label: "Overdue", value: counts.Overdue, icon: AlertTriangle, color: "text-destructive" },
          { label: "Upcoming", value: counts.Upcoming, icon: Clock, color: "text-yellow-500" },
          { label: "Completed", value: counts.Completed, icon: CheckCircle, color: "text-green-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="kpi-card flex items-center gap-3 p-4 cursor-pointer" onClick={() => setFilter(label === "Total" ? "All" : label)}>
            <Icon className={`h-5 w-5 ${color}`} /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
          </div>
        ))}
      </div>

      {/* CSV Import Dialog */}
      <Dialog open={showCSV} onOpenChange={setShowCSV}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Import {csvRows.length} Follow-Ups</DialogTitle></DialogHeader>
          {importResult ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <p className="text-lg font-semibold">{importResult.success} follow-ups imported</p>
              {importResult.failed > 0 && <p className="text-sm text-destructive">{importResult.failed} rows failed (lead name must match exactly)</p>}
              <Button onClick={() => { setShowCSV(false); setImportResult(null); if (csvRef.current) csvRef.current.value = ""; }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">CSV must have: lead_name, follow_up_datetime, notes (optional). Lead names must match existing leads.</p>
              <div className="overflow-x-auto rounded border text-xs">
                <table className="w-full"><thead className="bg-muted/50"><tr>{csvRows[0] && Object.keys(csvRows[0]).map((k) => <th key={k} className="px-3 py-2 text-left">{k}</th>)}</tr></thead>
                  <tbody>{csvRows.slice(0, 5).map((row, i) => <tr key={i} className="border-t">{Object.values(row).map((v: any, j) => <td key={j} className="px-3 py-2">{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCSVImport} disabled={importing} className="flex-1">{importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import All</Button>
                <Button variant="outline" onClick={() => setShowCSV(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["All","Overdue","Upcoming","Completed"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
            {s} {s !== "All" && `(${counts[s as keyof typeof counts]})`}
          </button>
        ))}
      </div>

      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Lead</th><th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Scheduled</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Notes</th><th className="px-4 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
              : filtered.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No follow-ups</td></tr>
              : filtered.map((f) => (
                <tr key={f.id} className={`data-table-row ${getPriorityClass(f)}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{f.leads?.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.leads?.phone_number || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(f.follow_up_datetime).toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{f.notes || "—"}</td>
                  <td className="px-4 py-3">
                    {f.status !== "Completed" && (
                      <Button variant="ghost" size="sm" onClick={() => markComplete(f.id)}><CheckCircle className="mr-1 h-4 w-4" />Complete</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}