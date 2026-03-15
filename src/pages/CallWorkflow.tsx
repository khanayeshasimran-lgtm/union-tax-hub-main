import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, PhoneCall, Copy, Check, Loader2, User,
  Mail, Hash, TrendingUp, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

const DISPOSITIONS = ["Not Answered","Not Interested","Other Firm","Follow-Up Required","Converted","Wrong Number"];

export default function CallWorkflow() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get("leadId");

  // Bug 6 fix: get role to determine if admin
  const isAdmin = role === "admin" || role === "super_admin";

  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Analytics
  const [analytics, setAnalytics] = useState({ callsToday: 0, notAnsweredToday: 0, convertedToday: 0, rotationQueue: 0 });
  const [systemSettings, setSystemSettings] = useState({ max_attempt_limit: 3 });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);

      // Bug 6 fix: agents only see their own leads, admins see all
      let leadsQuery = supabase
        .from("leads")
        .select("*")
        .in("status", ["New","Not Answered","Follow-Up","Follow-Up Required"])
        .order("created_at", { ascending: true });

      if (!isAdmin) {
        leadsQuery = leadsQuery.eq("assigned_agent_id", user.id);
      }

      const [leadsRes, analyticsRes, settingsRes, rotationRes] = await Promise.all([
        leadsQuery,
        supabase.from("call_dispositions").select("disposition_type").eq("agent_id", user.id).gte("created_at", new Date().toISOString().split("T")[0]),
        supabase.from("system_settings").select("max_attempt_limit").single(),
        supabase.from("leads").select("id", { count: "exact" }).eq("status", "Not Answered"),
      ]);

      const list = leadsRes.data || [];
      setLeads(list);
      if (leadId) {
        const found = list.find((l: any) => l.id === leadId);
        if (found) setSelectedLead(found);
        else {
          const { data: single } = await supabase.from("leads").select("*").eq("id", leadId).single();
          if (single) setSelectedLead(single);
        }
      }
      const disp = analyticsRes.data || [];
      setAnalytics({
        callsToday: disp.length,
        notAnsweredToday: disp.filter((d: any) => d.disposition_type === "Not Answered").length,
        convertedToday: disp.filter((d: any) => d.disposition_type === "Converted").length,
        rotationQueue: rotationRes.count || 0,
      });
      if (settingsRes.data) setSystemSettings(settingsRes.data);
      setLoading(false);
    };
    fetch();
  }, [user, leadId, isAdmin]);

  const copyPhone = () => {
    if (!selectedLead) return;
    navigator.clipboard.writeText(selectedLead.phone_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Phone number copied!" });
  };

  const handleSubmit = async () => {
    if (!selectedLead || !disposition || !user) return;
    if (disposition !== "Not Answered" && !notes.trim()) {
      toast({ title: "Notes required", description: "Add notes for answered calls.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();

    // Bug 1 fix: only insert disposition — DB trigger handles lead status + attempt_count update
    const { error } = await supabase.from("call_dispositions").insert({
      organization_id: profile?.organization_id || selectedLead.organization_id,
      lead_id: selectedLead.id, agent_id: user.id, disposition_type: disposition,
      notes: notes || null, attempt_count_at_time: selectedLead.attempt_count + 1,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    toast({ title: "Disposition logged" });
    setDisposition(""); setNotes(""); setSelectedLead(null);

    // Refresh leads queue with same agent filter
    let refreshQuery = supabase
      .from("leads")
      .select("*")
      .in("status", ["New","Not Answered","Follow-Up","Follow-Up Required"])
      .order("created_at", { ascending: true });

    if (!isAdmin) {
      refreshQuery = refreshQuery.eq("assigned_agent_id", user.id);
    }

    const { data } = await refreshQuery;
    setLeads(data || []);

    // Refresh analytics
    const { data: disp } = await supabase.from("call_dispositions").select("disposition_type").eq("agent_id", user.id).gte("created_at", new Date().toISOString().split("T")[0]);
    setAnalytics(prev => ({
      ...prev,
      callsToday: (disp || []).length,
      convertedToday: (disp || []).filter((d: any) => d.disposition_type === "Converted").length,
    }));
    setSubmitting(false);
  };

  const atLimit = selectedLead && selectedLead.attempt_count >= systemSettings.max_attempt_limit;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Call Queue" description="Select a lead to begin the call workflow" />

      {/* Daily Analytics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Calls Today",    value: analytics.callsToday,      icon: Phone,      color: "text-primary" },
          { label: "Not Answered",   value: analytics.notAnsweredToday, icon: TrendingUp, color: "text-yellow-500" },
          { label: "Converted Today",value: analytics.convertedToday,  icon: Check,      color: "text-green-500" },
          { label: "Rotation Queue", value: analytics.rotationQueue,    icon: RefreshCw,  color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="kpi-card flex items-center gap-3 p-4">
            <Icon className={`h-5 w-5 ${color}`} />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold text-foreground">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Queue List ─────────────────────────────────────────────────── */}
        <div className="kpi-card lg:col-span-1 overflow-hidden p-0">
          <div className="border-b bg-muted/30 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Queue ({leads.length})</h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading
              ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
              : leads.length === 0
                ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No leads in queue</p>
                : leads.map((lead) => (
                  <button key={lead.id}
                    onClick={() => { setSelectedLead(lead); setDisposition(""); setNotes(""); }}
                    className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 ${
                      selectedLead?.id === lead.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}>
                    <p className="text-sm font-medium text-foreground">{lead.full_name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={lead.status} />
                      <span className="text-xs text-muted-foreground">
                        Attempt {lead.attempt_count}/{systemSettings.max_attempt_limit}
                      </span>
                    </div>
                  </button>
                ))
            }
          </div>
        </div>

        {/* ── Call Panel ──────────────────────────────────────────────────── */}
        <div className="kpi-card lg:col-span-2 space-y-6">
          {!selectedLead ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Phone className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">Select a lead from the queue to start calling</p>
            </div>
          ) : (
            <>
              {atLimit && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  This lead has reached the max attempt limit ({systemSettings.max_attempt_limit}). It will be removed from rotation after this call.
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">{selectedLead.full_name}</h2>
                  <StatusBadge status={selectedLead.status} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedLead.full_name}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm truncate">{selectedLead.email || "No email"}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Attempt #{selectedLead.attempt_count + 1}</span>
                  </div>
                </div>

                {/* Attempt progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Attempt Progress</span>
                    <span>{selectedLead.attempt_count}/{systemSettings.max_attempt_limit}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${atLimit ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, (selectedLead.attempt_count / systemSettings.max_attempt_limit) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* ── Phone number — click to dial ──────────────────────── */}
                <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Phone className="h-6 w-6 text-primary shrink-0" />
                    <a
                      href={`tel:${selectedLead.phone_number}`}
                      className="text-2xl font-bold tracking-wide text-foreground hover:text-primary transition-colors select-all"
                      title="Click to call"
                    >
                      {selectedLead.phone_number}
                    </a>
                    <Button variant="outline" size="sm" onClick={copyPhone} className="ml-auto shrink-0">
                      {copied
                        ? <><Check className="mr-1.5 h-4 w-4 text-green-500" /> Copied</>
                        : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>
                      }
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">Tap the number</span> to open your dialer directly.
                      On desktop, use the Copy button and paste into your calling app.
                    </span>
                  </p>
                </div>
              </div>

              {/* ── Disposition form ───────────────────────────────────── */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-semibold text-foreground">Log Disposition</h3>
                <Select value={disposition} onValueChange={setDisposition}>
                  <SelectTrigger><SelectValue placeholder="Select disposition…" /></SelectTrigger>
                  <SelectContent>
                    {DISPOSITIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                {disposition && (
                  <Textarea
                    placeholder={disposition === "Not Answered" ? "Optional notes…" : "Notes (required)…"}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                )}
                <Button onClick={handleSubmit} disabled={!disposition || submitting} className="w-full">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Disposition
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}