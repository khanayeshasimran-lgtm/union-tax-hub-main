import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, DollarSign, Lock, Unlock, TrendingUp, Calendar, CreditCard } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

const METHODS = ["Zelle", "CashApp", "Bank Transfer", "Card", "Check", "Other"];

const STAGE_COLORS: Record<string, string> = {
  "Converted":           "bg-blue-100 text-blue-700",
  "File Received":       "bg-indigo-100 text-indigo-700",
  "Intake Submitted":    "bg-violet-100 text-violet-700",
  "Estimation Approved": "bg-cyan-100 text-cyan-700",
  "Filing In Progress":  "bg-amber-100 text-amber-700",
  "Filed":               "bg-green-100 text-green-700",
  "Closed":              "bg-gray-100 text-gray-600",
};

// Build last 6 months of revenue from entries
function buildMonthlyChart(entries: any[]) {
  const months: Record<string, number> = {};

  // Seed last 6 months with 0
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    months[key] = 0;
  }

  entries.forEach((e) => {
    if (!e.payment_date) return;
    const d = new Date(e.payment_date);
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (key in months) months[key] += Number(e.amount_usd || 0);
  });

  return Object.entries(months).map(([month, revenue]) => ({ month, revenue }));
}

export default function Revenue() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin" || role === "super_admin";

  const [entries, setEntries] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [form, setForm] = useState({
    case_id: "",
    amount_usd: "",
    payment_method: "",
    payment_date: "",
    reference: "",
  });

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterLocked, setFilterLocked] = useState("all");

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [rRes, cRes] = await Promise.all([
      supabase
        .from("revenue_entries")
        .select("*, cases(current_stage, leads(full_name))")
        .order("payment_date", { ascending: false }),
      supabase
        .from("cases")
        .select("id, current_stage, leads(full_name)")
        .neq("current_stage", "Closed"),
    ]);
    setEntries(rRes.data || []);
    setCases(cRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  // ── Create entry ─────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    const orgRes = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { error } = await supabase.from("revenue_entries").insert({
      organization_id: orgRes.data?.organization_id || undefined,
      case_id: form.case_id || null,
      agent_id: user.id,
      amount_usd: parseFloat(form.amount_usd),
      payment_method: form.payment_method,
      payment_date: form.payment_date,
      reference: form.reference || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment logged successfully" });
      setShowCreate(false);
      setForm({ case_id: "", amount_usd: "", payment_method: "", payment_date: "", reference: "" });
      fetchData();
    }
    setCreating(false);
  };

  // ── Admin unlock ──────────────────────────────────────────────────────────────
  const handleAdminUnlock = async (entryId: string) => {
    setUnlocking(entryId);
    const { error } = await supabase
      .from("revenue_entries")
      .update({ locked: false })
      .eq("id", entryId);

    if (error) {
      toast({ title: "Unlock failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entry unlocked by admin override" });
      fetchData();
    }
    setUnlocking(null);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const totalRevenue = entries.reduce((s, e) => s + Number(e.amount_usd), 0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthlyRevenue = entries
    .filter((e) => e.payment_date >= monthStart)
    .reduce((s, e) => s + Number(e.amount_usd), 0);
  const lockedCount = entries.filter((e) => e.locked).length;
  const chartData = buildMonthlyChart(entries);

  // ── Filtered entries ──────────────────────────────────────────────────────────
  const filtered = entries.filter((e) => {
    const methodMatch = filterMethod === "all" || e.payment_method === filterMethod;
    const lockedMatch =
      filterLocked === "all" ||
      (filterLocked === "locked" && e.locked) ||
      (filterLocked === "editable" && !e.locked);
    return methodMatch && lockedMatch;
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Revenue"
        description={`${entries.length} entries · $${totalRevenue.toLocaleString()} total`}
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Log Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Payment</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Case</Label>
                  <Select value={form.case_id} onValueChange={(v) => setForm({ ...form, case_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select case..." /></SelectTrigger>
                    <SelectContent>
                      {cases.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.leads?.full_name || c.id}
                          {c.current_stage ? ` — ${c.current_stage}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (USD) *</Label>
                  <Input
                    type="number" step="0.01" required placeholder="0.00"
                    value={form.amount_usd}
                    onChange={(e) => setForm({ ...form, amount_usd: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method *</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue placeholder="Select method..." /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payment Date *</Label>
                  <Input
                    type="date" required
                    value={form.payment_date}
                    onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input
                    placeholder="Transaction ID, check #, etc."
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={creating || !form.payment_method || !form.amount_usd}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Log Payment
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* ── Summary KPI Row ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="kpi-card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-xl font-bold text-foreground">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="text-xl font-bold text-foreground">${monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="kpi-card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Lock className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Locked Entries</p>
            <p className="text-xl font-bold text-foreground">{lockedCount}</p>
          </div>
        </div>
      </div>

      {/* ── Revenue Trend Chart ──────────────────────────────────────────────── */}
      <div className="kpi-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
          <span className="text-xs text-muted-foreground">Last 6 months</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              width={48}
            />
            <Tooltip
              formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#revenueGrad)"
              dot={{ fill: "#6366f1", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterMethod} onValueChange={setFilterMethod}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Payment method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterLocked} onValueChange={setFilterLocked}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Lock status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entries</SelectItem>
            <SelectItem value="locked">Locked Only</SelectItem>
            <SelectItem value="editable">Editable Only</SelectItem>
          </SelectContent>
        </Select>

        {(filterMethod !== "all" || filterLocked !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterMethod("all"); setFilterLocked("all"); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Pipeline Stage</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    {entries.length === 0 ? "No revenue entries yet" : "No entries match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const stage = e.cases?.current_stage;
                  const stageColor = stage ? STAGE_COLORS[stage] || "bg-muted text-muted-foreground" : "";
                  return (
                    <tr key={e.id} className="data-table-row">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {e.cases?.leads?.full_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {stage ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stageColor}`}>
                            {stage}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No case</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-green-500" />
                          {Number(e.amount_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CreditCard className="h-3.5 w-3.5" />
                          {e.payment_method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(e.payment_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.reference || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {e.locked ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" /> Locked
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => handleAdminUnlock(e.id)}
                                disabled={unlocking === e.id}
                                className="inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-600 hover:bg-orange-100 disabled:opacity-50"
                              >
                                {unlocking === e.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Unlock className="h-3 w-3" />
                                }
                                Override
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <TrendingUp className="h-3 w-3" /> Editable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {entries.length} entries
            </p>
            <p className="text-xs font-semibold text-foreground">
              Filtered Total: $
              {filtered.reduce((s, e) => s + Number(e.amount_usd), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}