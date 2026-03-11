import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  CheckCircle2, Clock, FileText, Download, Trash2, Plus,
  Loader2, Search, FolderOpen, AlertCircle, User, Shield, Eye
} from "lucide-react";

const REQUIRED_DOC_TYPES = [
  "W-2 Form", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-R",
  "1098 (Mortgage Interest)", "Schedule K-1", "Business Income / Expenses",
  "Rental Income / Expenses", "Social Security Statement",
  "Foreign Income", "Passport / ID", "Bank Statement", "Other",
];

const UPLOADER_BADGE: Record<string, { label: string; color: string }> = {
  client:    { label: "Client",    color: "bg-blue-100 text-blue-700" },
  agent:     { label: "Agent",     color: "bg-purple-100 text-purple-700" },
  processor: { label: "Processor", color: "bg-amber-100 text-amber-700" },
  admin:     { label: "Admin",     color: "bg-slate-100 text-slate-700" },
};

export default function Documents() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const db = supabase as any;

  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [uploads, setUploads] = useState<any[]>([]);
  const [required, setRequired] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCases, setLoadingCases] = useState(true);
  const [search, setSearch] = useState("");

  // Add required doc
  const [showAddReq, setShowAddReq] = useState(false);
  const [newReqType, setNewReqType] = useState("");
  const [newReqLabel, setNewReqLabel] = useState("");
  const [newReqNotes, setNewReqNotes] = useState("");
  const [addingReq, setAddingReq] = useState(false);

  // Upload by agent
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [agentDocType, setAgentDocType] = useState("");
  const [uploadingAgent, setUploadingAgent] = useState(false);

  useEffect(() => { fetchCases(); }, [user]);

  async function fetchCases() {
    setLoadingCases(true);
    const { data } = await db
      .from("cases")
      .select("id, current_stage, leads(full_name, email, phone_number, assigned_agent_id)")
      .not("current_stage", "eq", "Closed")
      .order("created_at", { ascending: false });
    setCases(data || []);
    setLoadingCases(false);
  }

  async function selectCase(c: any) {
    setSelectedCase(c);
    setLoading(true);
    await Promise.all([fetchUploads(c.id), fetchRequired(c.id)]);
    setLoading(false);
  }

  async function fetchUploads(cid: string) {
    const { data } = await db
      .from("case_documents")
      .select("id, document_name, document_type, storage_path, file_path, status, uploaded_by_role, owner_role, created_at, uploaded_by")
      .eq("case_id", cid)
      .order("created_at", { ascending: false });
    setUploads(data || []);
  }

  async function fetchRequired(cid: string) {
    const { data } = await db
      .from("required_documents")
      .select("id, document_type, label, status, notes, created_at")
      .eq("case_id", cid)
      .order("created_at");
    setRequired(data || []);
  }

  async function handleAddRequired(e: React.FormEvent) {
    e.preventDefault();
    if (!newReqType || !selectedCase) return;
    setAddingReq(true);
    const { data: orgData } = await db.from("profiles").select("organization_id").eq("id", user!.id).single();
    await db.from("required_documents").insert({
      case_id: selectedCase.id,
      lead_id: selectedCase.leads?.id || null,
      document_type: newReqType,
      label: newReqLabel || newReqType,
      notes: newReqNotes || null,
      status: "pending",
      requested_by: user!.id,
      organization_id: orgData?.organization_id,
    });
    toast({ title: "Document requested", description: `${newReqLabel || newReqType} added to checklist.` });
    setNewReqType(""); setNewReqLabel(""); setNewReqNotes("");
    setShowAddReq(false);
    await fetchRequired(selectedCase.id);
    setAddingReq(false);
  }

  async function markReceived(req: any) {
    await db.from("required_documents")
      .update({ status: "received", updated_at: new Date().toISOString() })
      .eq("id", req.id);
    await fetchRequired(selectedCase.id);
    toast({ title: "Marked as received" });
  }

  async function markPending(req: any) {
    await db.from("required_documents")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", req.id);
    await fetchRequired(selectedCase.id);
  }

  async function deleteRequired(req: any) {
    await db.from("required_documents").delete().eq("id", req.id);
    setRequired(prev => prev.filter(r => r.id !== req.id));
  }

  async function handleAgentUpload() {
    if (!agentFile || !agentDocType || !selectedCase) return;
    setUploadingAgent(true);

    const { data: orgData } = await db.from("profiles").select("organization_id").eq("id", user!.id).single();
    const orgId = orgData?.organization_id;
    const ext = agentFile.name.split(".").pop();
    const path = `${orgId}/${selectedCase.id}/agent/${Date.now()}.${ext}`;

    const { error: storageErr } = await supabase.storage
      .from("client-documents")
      .upload(path, agentFile, { upsert: false });

    if (storageErr) {
      toast({ title: "Upload failed", description: storageErr.message, variant: "destructive" });
      setUploadingAgent(false);
      return;
    }

    await db.from("case_documents").insert({
      case_id: selectedCase.id,
      uploaded_by: user!.id,
      uploaded_by_role: role || "agent",
      owner_role: role || "agent",
      document_type: agentDocType,
      document_name: agentFile.name,
      file_name: agentFile.name,
      file_path: path,
      storage_path: path,
      status: "uploaded",
      organization_id: orgId,
    });

    // Auto-match checklist
    const match = required.find(r => r.status === "pending" &&
      r.document_type.toLowerCase().includes(agentDocType.toLowerCase().split(" ")[0]));
    if (match) {
      await db.from("required_documents").update({ status: "received" }).eq("id", match.id);
    }

    toast({ title: "Uploaded", description: `${agentFile.name} added to case.` });
    setAgentFile(null); setAgentDocType("");
    await fetchUploads(selectedCase.id);
    await fetchRequired(selectedCase.id);
    setUploadingAgent(false);
  }

  async function getDownloadUrl(doc: any) {
    const path = doc.storage_path || doc.file_path;
    if (!path) return;
    const { data } = await supabase.storage.from("client-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function deleteUpload(doc: any) {
    const path = doc.storage_path || doc.file_path;
    if (path) await supabase.storage.from("client-documents").remove([path]);
    await db.from("case_documents").delete().eq("id", doc.id);
    setUploads(prev => prev.filter(d => d.id !== doc.id));
    toast({ title: "Deleted" });
  }

  const filteredCases = cases.filter(c =>
    (c.leads?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.leads?.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const receivedCount = required.filter(r => r.status === "received").length;
  const pendingCount = required.filter(r => r.status === "pending").length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Document Center" description="Manage client tax documents by case" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Case List ─────────────────────────────────────────────── */}
        <div className="kpi-card p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search cases..." className="pl-9 h-9 text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loadingCases ? (
            <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filteredCases.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active cases</p>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {filteredCases.map(c => {
                const isSelected = selectedCase?.id === c.id;
                return (
                  <button key={c.id} onClick={() => selectCase(c)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                      isSelected ? "bg-indigo-50 border border-indigo-200" : "hover:bg-muted/50 border border-transparent"
                    }`}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.leads?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.current_stage}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Document Detail ───────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedCase ? (
            <div className="kpi-card p-12 text-center">
              <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Select a case to view documents</p>
            </div>
          ) : loading ? (
            <div className="kpi-card p-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Case Header */}
              <div className="kpi-card p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{selectedCase.leads?.full_name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedCase.leads?.email} · {selectedCase.current_stage}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-600 font-medium">{receivedCount} received</span>
                  {pendingCount > 0 && <span className="text-amber-600 font-medium">{pendingCount} pending</span>}
                </div>
              </div>

              {/* Document Checklist */}
              <div className="kpi-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-500" /> Document Checklist
                  </h4>
                  <Dialog open={showAddReq} onOpenChange={setShowAddReq}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Plus className="h-3 w-3" /> Request Doc
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader><DialogTitle>Request Document</DialogTitle></DialogHeader>
                      <form onSubmit={handleAddRequired} className="space-y-3 pt-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Document Type *</label>
                          <select required value={newReqType} onChange={e => { setNewReqType(e.target.value); if (!newReqLabel) setNewReqLabel(e.target.value); }}
                            className="w-full rounded-md border bg-background p-2 text-sm">
                            <option value="">Select...</option>
                            {REQUIRED_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Label (shown to client)</label>
                          <Input value={newReqLabel} onChange={e => setNewReqLabel(e.target.value)} placeholder="e.g. W-2 from employer" className="h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
                          <Input value={newReqNotes} onChange={e => setNewReqNotes(e.target.value)} placeholder="Any instructions..." className="h-9 text-sm" />
                        </div>
                        <Button type="submit" size="sm" className="w-full" disabled={addingReq}>
                          {addingReq && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Add to Checklist
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                {required.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">No documents requested yet. Click "Request Doc" to add.</p>
                ) : (
                  <div className="space-y-2">
                    {required.map(req => (
                      <div key={req.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        req.status === "received" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                      }`}>
                        {req.status === "received"
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{req.label || req.document_type}</p>
                          {req.notes && <p className="text-xs text-muted-foreground">{req.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          {req.status === "pending" ? (
                            <button onClick={() => markReceived(req)}
                              className="text-xs text-emerald-600 hover:underline px-2">Mark received</button>
                          ) : (
                            <button onClick={() => markPending(req)}
                              className="text-xs text-muted-foreground hover:underline px-2">Undo</button>
                          )}
                          <button onClick={() => deleteRequired(req)} className="text-muted-foreground hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* All Uploaded Files */}
              <div className="kpi-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-500" /> All Files ({uploads.length})
                  </h4>

                  {/* Agent upload */}
                  <div className="flex items-center gap-2">
                    <select value={agentDocType} onChange={e => setAgentDocType(e.target.value)}
                      className="rounded-md border bg-background px-2 py-1 text-xs h-7">
                      <option value="">Type...</option>
                      {REQUIRED_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className="cursor-pointer h-7 px-2 text-xs rounded-md border bg-background flex items-center gap-1 hover:bg-muted/50 transition-colors">
                      <Plus className="h-3 w-3" />
                      {agentFile ? agentFile.name.slice(0, 12) + "..." : "Add File"}
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                        onChange={e => setAgentFile(e.target.files?.[0] || null)} />
                    </label>
                    <Button size="sm" className="h-7 text-xs px-2" disabled={!agentFile || !agentDocType || uploadingAgent}
                      onClick={handleAgentUpload}>
                      {uploadingAgent ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upload"}
                    </Button>
                  </div>
                </div>

                {uploads.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No files uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {uploads.map(doc => {
                      const badge = UPLOADER_BADGE[doc.uploaded_by_role || doc.owner_role] || UPLOADER_BADGE.agent;
                      return (
                        <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                          <FileText className="h-8 w-8 text-indigo-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{doc.document_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{doc.document_type}</span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}>
                            {badge.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => getDownloadUrl(doc)}
                              className="text-muted-foreground hover:text-indigo-600 transition-colors p-1">
                              <Download className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteUpload(doc)}
                              className="text-muted-foreground hover:text-red-500 transition-colors p-1">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}