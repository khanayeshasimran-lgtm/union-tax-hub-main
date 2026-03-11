import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Loader2, CheckCircle2, XCircle, Clock,
  DollarSign, Calendar, FileText, AlertTriangle,
  ThumbsUp, ThumbsDown, Eye
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: "Pending",  color: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700",       icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function Estimations() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin" || role === "super_admin";

  const [estimations, setEstimations] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [intakes, setIntakes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewItem, setViewItem] = useState<any | null>(null);
  const [rejectDialog, setRejectDialog] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actioning, setActioning] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const [form, setForm] = useState({
    case_id: "",
    intake_id: "",
    estimated_fee_usd: "",
    estimated_completion_days: "",
    notes: "",
  });

  const fetchData = async () => {
    setLoading(true);

    // Admins see all estimations. Agents only see estimations for their own cases.
    const estQuery = isAdmin
      ? supabase.from("estimations")
          .select("*, cases(current_stage, leads(full_name, assigned_agent_id)), profiles!estimations_approved_by_fkey(full_name)")
          .order("created_at", { ascending: false })
      : supabase.from("estimations")
          .select("*, cases!inner(current_stage, leads!inner(full_name, assigned_agent_id)), profiles!estimations_approved_by_fkey(full_name)")
          .eq("cases.leads.assigned_agent_id", user!.id)
          .order("created_at", { ascending: false });

    // Cases available for new estimation
    const caseQuery = isAdmin
      ? supabase.from("cases").select("id, current_stage, leads(full_name)").eq("current_stage", "Intake Submitted")
      : supabase.from("cases")
          .select("id, current_stage, leads!inner(full_name, assigned_agent_id)")
          .eq("current_stage", "Intake Submitted")
          .eq("leads.assigned_agent_id", user!.id);

    // Intake records
    const intakeQuery = isAdmin
      ? supabase.from("client_intake").select("id, full_legal_name, filing_status, w2_income, form_1099_income, business_income").order("created_at", { ascending: false })
      : supabase.from("client_intake").select("id, full_legal_name, filing_status, w2_income, form_1099_income, business_income").order("created_at", { ascending: false });

    const [estRes, caseRes, intakeRes] = await Promise.all([estQuery, caseQuery, intakeQuery]);
    setEstimations(estRes.data || []);
    setCases(caseRes.data || []);
    setIntakes(intakeRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleCaseSelect = (caseId: string) => {
    setForm((f) => ({ ...f, case_id: caseId, intake_id: "" }));
  };

  // Both agents AND admins can create estimations
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    const orgRes = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { error } = await supabase.from("estimations").insert({
      organization_id: orgRes.data?.organization_id,
      case_id: form.case_id || null,
      intake_id: form.intake_id || null,
      estimated_fee_usd: parseFloat(form.estimated_fee_usd),
      estimated_completion_days: form.estimated_completion_days
        ? parseInt(form.estimated_completion_days)
        : null,
      notes: form.notes || null,
      status: "pending",
      created_by: user.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estimation submitted", description: "Admin will review and approve shortly." });
      setShowCreate(false);
      setForm({ case_id: "", intake_id: "", estimated_fee_usd: "", estimated_completion_days: "", notes: "" });
      fetchData();
    }
    setCreating(false);
  };

  // ── Approve (admin only) ─────────────────────────────────────────────────────
  const handleApprove = async (estimation: any) => {
    if (!user || !isAdmin) return;
    setActioning(true);

    const { error } = await supabase.from("estimations")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimation.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setActioning(false);
      return;
    }

    if (estimation.case_id) {
      await supabase.from("cases").update({
        current_stage: "Estimation Approved",
        updated_at: new Date().toISOString(),
      }).eq("id", estimation.case_id);
    }

    toast({ title: "Estimation approved", description: "Case advanced to Estimation Approved." });
    setViewItem(null);
    fetchData();
    setActioning(false);
  };

  // ── Reject (admin only) ──────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!user || !isAdmin || !rejectDialog) return;
    setActioning(true);

    const { error } = await supabase.from("estimations")
      .update({
        status: "rejected",
        rejected_reason: rejectReason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rejectDialog.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estimation rejected" });
      setRejectDialog(null);
      setRejectReason("");
      fetchData();
    }
    setActioning(false);
  };

  const counts = {
    all: estimations.length,
    pending: estimations.filter((e) => e.status === "pending").length,
    approved: estimations.filter((e) => e.status === "approved").length,
    rejected: estimations.filter((e) => e.status === "rejected").length,
  };

  const filtered =
    filterStatus === "all"
      ? estimations
      : estimations.filter((e) => e.status === filterStatus);

  const avgFee = estimations.length
    ? estimations.reduce((s, e) => s + Number(e.estimated_fee_usd), 0) / estimations.length
    : 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Estimations"
        description={isAdmin ? "Review and approve filing fee estimates" : "Submit filing fee estimates for your cases"}
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> New Estimation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Estimation</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Case (Intake Submitted stage)</Label>
                  <select
                    value={form.case_id}
                    onChange={(e) => handleCaseSelect(e.target.value)}
                    className="w-full rounded-md border bg-background p-2 text-sm"
                  >
                    <option value="">Select case...</option>
                    {cases.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.leads?.full_name || c.id} — {c.current_stage}
                      </option>
                    ))}
                  </select>
                  {cases.length === 0 && (
                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      No cases in "Intake Submitted" stage yet
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Client Intake Record</Label>
                  <select
                    value={form.intake_id}
                    onChange={(e) => setForm((f) => ({ ...f, intake_id: e.target.value }))}
                    className="w-full rounded-md border bg-background p-2 text-sm"
                  >
                    <option value="">Select intake...</option>
                    {intakes.map((i: any) => (
                      <option key={i.id} value={i.id}>
                        {i.full_legal_name} — {i.filing_status || "No status"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Estimated Filing Fee (USD) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      className="pl-7"
                      placeholder="0.00"
                      value={form.estimated_fee_usd}
                      onChange={(e) => setForm((f) => ({ ...f, estimated_fee_usd: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Estimated Completion (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 14"
                    value={form.estimated_completion_days}
                    onChange={(e) => setForm((f) => ({ ...f, estimated_completion_days: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    placeholder="Reason for fee, complexity notes..."
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={creating || !form.estimated_fee_usd}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit for Approval
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-100">
            <Clock className="h-4 w-4 text-yellow-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-bold text-foreground">{counts.pending}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-xl font-bold text-foreground">{counts.approved}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
            <XCircle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rejected</p>
            <p className="text-xl font-bold text-foreground">{counts.rejected}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <DollarSign className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Fee</p>
            <p className="text-xl font-bold text-foreground">
              ${avgFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>

      {/* Pending alert — admin only */}
      {counts.pending > 0 && isAdmin && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-600" />
          <p className="text-sm font-medium text-yellow-800">
            {counts.pending} estimation{counts.pending > 1 ? "s" : ""} waiting for your approval
          </p>
        </div>
      )}

      {/* Agent pending notice */}
      {counts.pending > 0 && !isAdmin && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <Clock className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <p className="text-sm font-medium text-blue-800">
            {counts.pending} estimation{counts.pending > 1 ? "s" : ""} pending admin approval
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs rounded-full border capitalize transition-colors ${
              filterStatus === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            {s} ({counts[s as keyof typeof counts]})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Case Stage</th>
                <th className="px-4 py-3 font-medium">Est. Fee</th>
                <th className="px-4 py-3 font-medium">Completion</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Approved By</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No estimations found
                  </td>
                </tr>
              ) : (
                filtered.map((est: any) => (
                  <tr key={est.id} className="data-table-row">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {est.cases?.leads?.full_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {est.cases?.current_stage ? (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {est.cases.current_stage}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5 text-green-500" />
                        {Number(est.estimated_fee_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {est.estimated_completion_days
                        ? <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {est.estimated_completion_days} days
                          </div>
                        : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={est.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {est.profiles?.full_name || "—"}
                      {est.approved_at && (
                        <div className="text-xs opacity-60">
                          {new Date(est.approved_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(est.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setViewItem(est)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                        {isAdmin && est.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(est)}
                              disabled={actioning}
                            >
                              <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2 text-xs"
                              onClick={() => { setRejectDialog(est); setRejectReason(""); }}
                            >
                              <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2">
            <p className="text-xs text-muted-foreground">{filtered.length} of {estimations.length} estimations</p>
            <p className="text-xs font-semibold text-foreground">
              Total Approved: ${estimations.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.estimated_fee_usd), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>

      {/* View Detail Modal */}
      {viewItem && (
        <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-500" /> Estimation Detail
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Client</p><p className="font-medium">{viewItem.cases?.leads?.full_name || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={viewItem.status} /></div>
                <div><p className="text-xs text-muted-foreground">Estimated Fee</p><p className="text-lg font-bold">${Number(viewItem.estimated_fee_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                <div><p className="text-xs text-muted-foreground">Completion</p><p className="font-medium">{viewItem.estimated_completion_days ? `${viewItem.estimated_completion_days} days` : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Case Stage</p><p>{viewItem.cases?.current_stage || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Created</p><p>{new Date(viewItem.created_at).toLocaleDateString()}</p></div>
              </div>
              {viewItem.notes && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap">{viewItem.notes}</p>
                </div>
              )}
              {viewItem.status === "approved" && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-800">Approved by {viewItem.profiles?.full_name || "Admin"}</p>
                    <p className="text-xs text-green-700">{viewItem.approved_at ? new Date(viewItem.approved_at).toLocaleString() : ""}</p>
                  </div>
                </div>
              )}
              {viewItem.status === "rejected" && viewItem.rejected_reason && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-medium text-red-800 mb-1">Rejection Reason</p>
                  <p className="text-xs text-red-700">{viewItem.rejected_reason}</p>
                </div>
              )}
              {isAdmin && viewItem.status === "pending" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleApprove(viewItem)} disabled={actioning}>
                    {actioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} Approve
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => { setRejectDialog(viewItem); setViewItem(null); setRejectReason(""); }}>
                    <ThumbsDown className="mr-2 h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject Reason Modal */}
      {rejectDialog && (
        <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" /> Reject Estimation
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Rejecting estimation for <span className="font-medium text-foreground">{rejectDialog.cases?.leads?.full_name || "this client"}</span>. Provide a reason so the agent can revise.
              </p>
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea rows={3} placeholder="e.g. Fee too high, needs re-review..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={actioning}>
                  {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm Reject
                </Button>
                <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}