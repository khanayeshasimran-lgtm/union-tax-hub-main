import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Section, Loading } from "./PortalTaxpayer";

const DOC_TYPES = [
  "W-2 Form", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV",
  "1099-R", "1098 (Mortgage Interest)", "Schedule K-1",
  "Business Income / Expenses", "Rental Income / Expenses",
  "Social Security Statement", "Foreign Income", "Passport / ID", "Other",
];

interface UploadedDoc {
  id: string;
  document_name: string;
  document_type: string;
  storage_path: string;
  status: string;
  uploaded_by_role: string;
  created_at: string;
}

interface RequiredDoc {
  id: string;
  document_type: string;
  label: string;
  status: string; // pending | received
  notes: string;
}

export default function PortalDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const db = supabase as any;

  const [caseId, setCaseId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [required, setRequired] = useState<RequiredDoc[]>([]);
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);

    // 1. Find lead by email
    let foundLeadId: string | null = null;
    let foundCaseId: string | null = null;
    let foundOrgId: string | null = null;

    try {
      const { data: lead } = await db.from("leads")
        .select("id, organization_id")
        .or(`email.eq.${user!.email},client_user_id.eq.${user!.id}`)
        .maybeSingle();
      if (lead) {
        foundLeadId = lead.id;
        foundOrgId = lead.organization_id;
        setLeadId(lead.id);
        setOrgId(lead.organization_id);

        // 2. Find linked case
        const { data: caseRow } = await db.from("cases").select("id")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (caseRow) {
          foundCaseId = caseRow.id;
          setCaseId(caseRow.id);
        }
      }
    } catch (_) {}

    // 3. Load uploads — by case_id if we have one, else by lead_id, else by uploaded_by
    await fetchDocs(foundCaseId, foundLeadId);

    // 4. Load required documents checklist
    await fetchRequired(foundCaseId, foundLeadId);

    setLoading(false);
  }

  async function fetchDocs(cid: string | null, lid: string | null) {
    let query = db.from("case_documents")
      .select("id, document_name, document_type, storage_path, status, uploaded_by_role, created_at")
      .order("created_at", { ascending: false });

    if (cid) {
      query = query.eq("case_id", cid);
    } else if (lid) {
      query = query.eq("lead_id", lid);
    } else {
      query = query.eq("uploaded_by", user!.id);
    }

    const { data } = await query;
    setDocs(data || []);
  }

  async function fetchRequired(cid: string | null, lid: string | null) {
    if (!cid && !lid) return;
    let query = db.from("required_documents")
      .select("id, document_type, label, status, notes")
      .order("created_at");
    if (cid) query = query.eq("case_id", cid);
    else if (lid) query = query.eq("lead_id", lid);
    const { data } = await query;
    setRequired(data || []);
  }

  async function handleUpload() {
    if (!file || !docType) {
      toast({ title: "Missing fields", description: "Please select a document type and file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 10MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const folder = caseId || leadId || user!.id;
    const path = `${orgId || "public"}/${folder}/client/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("client-documents")
      .upload(path, file, { upsert: false });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // Save record
    const { error: insertError } = await db.from("case_documents").insert({
      case_id: caseId || null,
      lead_id: leadId || null,
      uploaded_by: user!.id,
      uploaded_by_role: "client",
      owner_role: "client",
      document_type: docType,
      document_name: file.name,
      file_name: file.name,
      file_path: path,
      storage_path: path,
      status: "uploaded",
      organization_id: orgId || null,
    });

    if (insertError) {
      toast({ title: "Save failed", description: insertError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // Auto-match required documents
    const matchedReq = required.find(r =>
      r.status === "pending" &&
      r.document_type.toLowerCase().includes(docType.toLowerCase().split(" ")[0])
    );
    if (matchedReq) {
      await db.from("required_documents")
        .update({ status: "received", updated_at: new Date().toISOString() })
        .eq("id", matchedReq.id);
    }

    toast({ title: "Uploaded!", description: `${file.name} uploaded successfully.` });
    setFile(null);
    setDocType("");
    if (fileRef.current) fileRef.current.value = "";
    await fetchDocs(caseId, leadId);
    await fetchRequired(caseId, leadId);
    setUploading(false);
  }

  async function handleDelete(doc: UploadedDoc) {
    await supabase.storage.from("client-documents").remove([doc.storage_path]);
    await db.from("case_documents").delete().eq("id", doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    toast({ title: "Removed", description: `${doc.document_name} deleted.` });
  }

  if (loading) return <Loading />;

  const pendingRequired = required.filter(r => r.status === "pending");
  const receivedRequired = required.filter(r => r.status === "received");

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Required Documents Checklist — only if agent has requested any */}
        {required.length > 0 && (
          <Section title="Document Checklist">
            <div className="space-y-2">
              {required.map(req => (
                <div key={req.id} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                  req.status === "received"
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-center gap-3">
                    {req.status === "received"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                    }
                    <div>
                      <p className="text-sm font-medium text-foreground">{req.label || req.document_type}</p>
                      {req.notes && <p className="text-xs text-muted-foreground">{req.notes}</p>}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    req.status === "received"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {req.status === "received" ? "✓ Received" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
            {pendingRequired.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {pendingRequired.length} document{pendingRequired.length > 1 ? "s" : ""} still needed. Upload below to complete your checklist.
              </p>
            )}
          </Section>
        )}

        {/* Upload Section */}
        <Section title="Upload Tax Documents">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Document Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                <option value="">Select document type...</option>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">File</label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  file ? "border-indigo-400 bg-indigo-50" : "border-muted-foreground/25 hover:border-indigo-400 hover:bg-indigo-50/50"
                }`}
              >
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-indigo-700">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-muted-foreground">Click to select file</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — max 10MB</p>
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || !file || !docType}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4" /> Upload Document</>}
            </button>
          </div>
        </Section>

        {/* Uploaded Files */}
        <Section title={`Uploaded Files (${docs.length})`}>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                  <FileText className="h-8 w-8 text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.document_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{doc.document_type}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                    ✓ Submitted
                  </span>
                  <button onClick={() => handleDelete(doc)}
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {!caseId && (
          <p className="text-xs text-muted-foreground text-center pb-4">
            Your documents are saved. Once your agent creates your case, they'll be automatically linked.
          </p>
        )}
      </div>
    </div>
  );
}