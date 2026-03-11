import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Loader2, Eye, EyeOff, User, DollarSign,
  MapPin, Phone, Mail, FileText, ChevronRight,
  CheckCircle2, Lock, Search, Sparkles, Building2,
  Heart, TrendingUp, Sliders, Users, Home, CreditCard,
  Calendar, Globe, Briefcase, CheckSquare, XSquare,
} from "lucide-react";

const FILING_STATUSES = [
  "Single","Married Filing Jointly","Married Filing Separately",
  "Head of Household","Qualifying Widow(er)",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function DecryptedSSN({ encrypted }: { encrypted: string }) {
  const [ssn, setSsn] = useState("Loading...");
  useEffect(() => {
    (supabase as any).rpc("decrypt_ssn", { encrypted_ssn: encrypted })
      .then(({ data }: any) => setSsn(data || "Error"));
  }, [encrypted]);
  return <span>{ssn}</span>;
}

function formatSSN(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function YesNo({ value }: { value: boolean | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return value
    ? <span className="flex items-center gap-1 text-green-600 font-medium"><CheckSquare className="h-3.5 w-3.5" /> Yes</span>
    : <span className="flex items-center gap-1 text-muted-foreground"><XSquare className="h-3.5 w-3.5" /> No</span>;
}

type IntakeFormData = {
  lead_id: string; case_id: string; full_legal_name: string; ssn: string;
  dob: string; filing_status: string; address: string; city: string;
  state: string; zip_code: string; phone: string; email: string;
  dependents: string; w2_income: string; form_1099_income: string;
  business_income: string; other_income: string; estimated_refund: string; notes: string;
};

const EMPTY_FORM: IntakeFormData = {
  lead_id: "", case_id: "", full_legal_name: "", ssn: "",
  dob: "", filing_status: "", address: "", city: "",
  state: "", zip_code: "", phone: "", email: "",
  dependents: "0", w2_income: "0", form_1099_income: "0",
  business_income: "0", other_income: "0", estimated_refund: "", notes: "",
};

type PortalFullData = {
  profile: any | null;
  spouse: any | null;
  dependents: any[];
  addresses: any[];
  appointment: any | null;
};

function SectionHeader({ icon: Icon, label, badge }: { icon: any; label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 border-b pb-2 mb-4">
      <Icon className="h-4 w-4 text-indigo-500" />
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      {badge && (
        <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
          <Sparkles className="h-3 w-3" /> {badge}
        </span>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

function FlagRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <YesNo value={value} />
    </div>
  );
}

export default function ClientIntake() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin" || role === "super_admin";

  const [intakes, setIntakes] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<IntakeFormData>(EMPTY_FORM);
  const [showSSN, setShowSSN] = useState(false);
  const [search, setSearch] = useState("");
  const [portalDataLoaded, setPortalDataLoaded] = useState(false);
  const [loadingPortalData, setLoadingPortalData] = useState(false);
  const [viewIntake, setViewIntake] = useState<any | null>(null);
  const [showViewSSN, setShowViewSSN] = useState(false);
  const [viewTab, setViewTab] = useState<"intake" | "portal">("intake");
  const [portalFull, setPortalFull] = useState<PortalFullData>({ profile: null, spouse: null, dependents: [], addresses: [], appointment: null });
  const [loadingPortalFull, setLoadingPortalFull] = useState(false);
  const db = supabase as any;

  const fetchData = async () => {
    setLoading(true);
    const [intakeRes, casesRes, leadsRes] = await Promise.all([
      supabase.from("client_intake")
        .select("*, leads(full_name, phone_number), cases(current_stage)")
        .order("created_at", { ascending: false }),
      supabase.from("cases").select("id, current_stage, leads(full_name)")
        .not("current_stage", "eq", "Closed"),
      supabase.from("leads").select("id, full_name, phone_number, email")
        .eq("status", "Converted"),
    ]);
    setIntakes(intakeRes.data || []);
    setCases(casesRes.data || []);
    setLeads(leadsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  // Fetch ALL portal data for a given lead_id (used in view modal)
  const loadFullPortalData = async (leadId: string) => {
    if (!leadId) return;
    setLoadingPortalFull(true);
    try {
      // 1. Tax profile (taxpayer form)
      const { data: profile } = await db.from("client_tax_profiles").select("*").eq("lead_id", leadId).maybeSingle();

      let uid = profile?.user_id;

      // Fallback: find user_id via auth email
      if (!uid) {
        const { data: lead } = await db.from("leads").select("email").eq("id", leadId).maybeSingle();
        if (lead?.email) {
          const { data: p } = await db.from("profiles").select("id").eq("email", lead.email).maybeSingle();
          uid = p?.id;
        }
      }

      const uidFilter = uid || "00000000-0000-0000-0000-000000000000";

      // 2. Spouse (stored in client_tax_profiles with spouse_ prefix OR separate table)
      //    Try separate table first, fallback to profile spouse fields
      let spouse = null;
      try {
        const { data: spouseData } = await db.from("client_spouse_profiles")
          .select("*")
          .or(`lead_id.eq.${leadId},user_id.eq.${uidFilter}`)
          .maybeSingle();
        spouse = spouseData;
      } catch {
        // If no separate table, spouse fields are in client_tax_profiles (spouse_first_name etc.)
        if (profile?.spouse_first_name) {
          spouse = {
            first_name: profile.spouse_first_name,
            last_name: profile.spouse_last_name,
            middle_name: profile.spouse_middle_name,
            dob: profile.spouse_dob,
            occupation: profile.spouse_occupation,
            visa_type: profile.spouse_visa_type,
            tax_id_type: profile.spouse_tax_id_type,
          };
        }
      }

      // 3. Dependents
      const { data: dependents } = await db.from("client_dependents")
        .select("*")
        .or(`lead_id.eq.${leadId},user_id.eq.${uidFilter}`)
        .order("created_at");

      // 4. Addresses
      const { data: addresses } = await db.from("client_addresses")
        .select("*")
        .or(`lead_id.eq.${leadId},user_id.eq.${uidFilter}`)
        .order("created_at");

      // 5. Appointment
      const { data: appointment } = await db.from("tax_appointments")
        .select("*")
        .or(`lead_id.eq.${leadId},user_id.eq.${uidFilter}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setPortalFull({
        profile: profile || null,
        spouse: spouse || null,
        dependents: dependents || [],
        addresses: addresses || [],
        appointment: appointment || null,
      });
    } catch (e) {
      console.error("Portal full data load error:", e);
    }
    setLoadingPortalFull(false);
  };

  // Auto-fill form when agent selects a lead (used in New Intake dialog)
  const handleLeadSelect = async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    setForm((f) => ({
      ...f,
      lead_id: leadId,
      full_legal_name: lead?.full_name || f.full_legal_name,
      phone: lead?.phone_number || f.phone,
      email: lead?.email || f.email,
    }));
    setPortalDataLoaded(false);
    if (!leadId) return;

    setLoadingPortalData(true);
    try {
      const { data: profile } = await db.from("client_tax_profiles").select("*").eq("lead_id", leadId).maybeSingle();

      let portalProfile = profile;
      if (!portalProfile && lead?.email) {
        const { data: authProfile } = await db.from("profiles").select("id").eq("email", lead.email).maybeSingle();
        if (authProfile?.id) {
          const { data: p2 } = await db.from("client_tax_profiles").select("*").eq("user_id", authProfile.id).maybeSingle();
          portalProfile = p2;
        }
      }

      if (portalProfile) {
        const uid = portalProfile.user_id || "00000000-0000-0000-0000-000000000000";
        const { data: address } = await db.from("client_addresses").select("*")
          .or(`lead_id.eq.${leadId},user_id.eq.${uid}`)
          .order("created_at").limit(1).maybeSingle();

        const depCount = await db.from("client_dependents")
          .select("id", { count: "exact", head: true })
          .or(`lead_id.eq.${leadId},user_id.eq.${uid}`);

        const fullName = [portalProfile.first_name, portalProfile.middle_name, portalProfile.last_name]
          .filter(Boolean).join(" ") || lead?.full_name || "";

        setForm((f) => ({
          ...f,
          full_legal_name: fullName || f.full_legal_name,
          dob: portalProfile.date_of_birth || f.dob,
          filing_status: portalProfile.filing_status || f.filing_status,
          dependents: (depCount.count ?? portalProfile.number_of_dependents ?? 0).toString(),
          phone: portalProfile.phone_number || portalProfile.phone || lead?.phone_number || f.phone,
          email: portalProfile.email || lead?.email || f.email,
          // Address from client_addresses
          address: address?.street_address || address?.address || f.address,
          city: address?.city || f.city,
          state: address?.state || f.state,
          zip_code: address?.zip_code || f.zip_code,
          // Income
          w2_income: portalProfile.w2_income?.toString() || f.w2_income,
          form_1099_income: (portalProfile.income_1099 ?? portalProfile.form_1099_income ?? 0).toString(),
          business_income: portalProfile.business_income?.toString() || f.business_income,
          other_income: portalProfile.other_income?.toString() || f.other_income,
          notes: portalProfile.additional_notes
            ? `[From client portal]\n${portalProfile.additional_notes}`
            : f.notes,
        }));
        setPortalDataLoaded(true);
        toast({ title: "Portal data loaded!", description: "Form pre-filled from client's portal submission." });
      }
    } catch (e) {
      // No portal data — fine
    }
    setLoadingPortalData(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const ssnDigits = form.ssn.replace(/\D/g, "");
    if (ssnDigits.length !== 9) {
      toast({ title: "Invalid SSN", description: "SSN must be 9 digits.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const orgRes = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const orgId = orgRes.data?.organization_id;
    const ssnLast4 = ssnDigits.slice(-4);
    const { data: encryptedData, error: encryptErr } = await db.rpc("encrypt_ssn", { plain_ssn: form.ssn });
    if (encryptErr || !encryptedData) {
      toast({ title: "Encryption failed", description: "Could not secure SSN.", variant: "destructive" });
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from("client_intake").upsert({
      organization_id: orgId,
      lead_id: form.lead_id || null,
      case_id: form.case_id || null,
      full_legal_name: form.full_legal_name,
      ssn_encrypted: encryptedData,
      ssn_last_four: ssnLast4,
      dob: form.dob || null,
      filing_status: form.filing_status || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip_code: form.zip_code || null,
      phone: form.phone || null,
      email: form.email || null,
      dependents: parseInt(form.dependents) || 0,
      w2_income: parseFloat(form.w2_income) || 0,
      form_1099_income: parseFloat(form.form_1099_income) || 0,
      business_income: parseFloat(form.business_income) || 0,
      other_income: parseFloat(form.other_income) || 0,
      estimated_refund: form.estimated_refund ? parseFloat(form.estimated_refund) : null,
      notes: form.notes || null,
      created_by: user.id,
    }, { onConflict: "lead_id" });
    if (error) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }
    if (form.case_id) {
      await supabase.from("cases").update({ current_stage: "Intake Submitted", updated_at: new Date().toISOString() }).eq("id", form.case_id);
    }
    toast({ title: "Intake submitted", description: `${form.full_legal_name}'s intake is complete.` });
    setShowForm(false);
    setForm(EMPTY_FORM);
    setPortalDataLoaded(false);
    fetchData();
    setSubmitting(false);
  };

  const f = (field: keyof IntakeFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const totalIncome =
    (parseFloat(form.w2_income) || 0) + (parseFloat(form.form_1099_income) || 0) +
    (parseFloat(form.business_income) || 0) + (parseFloat(form.other_income) || 0);

  const filtered = intakes.filter((i) =>
    (i.full_legal_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.leads?.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const openView = (intake: any) => {
    setViewIntake(intake);
    setShowViewSSN(false);
    setViewTab("intake");
    setPortalFull({ profile: null, spouse: null, dependents: [], addresses: [], appointment: null });
    if (intake.lead_id) loadFullPortalData(intake.lead_id);
  };

  const p = portalFull.profile;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Client Intake"
        description={`${intakes.length} intake submissions`}
        actions={
          <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setForm(EMPTY_FORM); setPortalDataLoaded(false); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> New Intake</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  Client Intake Form
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6 pt-2">
                {/* Lead + Case */}
                <div>
                  <SectionHeader icon={ChevronRight} label="Link to Lead & Case" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Converted Lead</Label>
                      <div className="relative">
                        <select value={form.lead_id} onChange={(e) => handleLeadSelect(e.target.value)}
                          className="w-full rounded-md border bg-background p-2 text-sm pr-8">
                          <option value="">Select lead...</option>
                          {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                        </select>
                        {loadingPortalData && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-indigo-500" />}
                      </div>
                      {portalDataLoaded && (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Form pre-filled from client portal
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Case <span className="ml-1 text-xs text-muted-foreground">(advances to Intake Submitted)</span></Label>
                      <select value={form.case_id} onChange={(e) => f("case_id", e.target.value)}
                        className="w-full rounded-md border bg-background p-2 text-sm">
                        <option value="">Select case...</option>
                        {cases.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.leads?.full_name || c.id} — {c.current_stage}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Personal */}
                <div>
                  <SectionHeader icon={User} label="Personal Information" badge={portalDataLoaded ? "Auto-filled from portal" : undefined} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Full Legal Name *</Label>
                      <Input required value={form.full_legal_name} onChange={(e) => f("full_legal_name", e.target.value)} placeholder="As it appears on tax documents" />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1"><Lock className="h-3 w-3 text-muted-foreground" /> SSN *</Label>
                      <div className="relative">
                        <Input required type={showSSN ? "text" : "password"} value={form.ssn}
                          onChange={(e) => f("ssn", formatSSN(e.target.value))} placeholder="123-45-6789" className="pr-10" maxLength={11} />
                        <button type="button" onClick={() => setShowSSN(!showSSN)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showSSN ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">Stored encrypted. Only last 4 digits shown after submission.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Date of Birth</Label>
                      <Input type="date" value={form.dob} onChange={(e) => f("dob", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Filing Status *</Label>
                      <Select value={form.filing_status} onValueChange={(v) => f("filing_status", v)}>
                        <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                        <SelectContent>{FILING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Dependents</Label>
                      <Input type="number" min="0" value={form.dependents} onChange={(e) => f("dependents", e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <SectionHeader icon={MapPin} label="Contact & Address" badge={portalDataLoaded ? "Auto-filled from portal" : undefined} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                      <Input value={form.phone} onChange={(e) => f("phone", e.target.value)} placeholder="555-0100" />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Street Address</Label>
                      <Input value={form.address} onChange={(e) => f("address", e.target.value)} placeholder="123 Main St" />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={form.city} onChange={(e) => f("city", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Select value={form.state} onValueChange={(v) => f("state", v)}>
                          <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                          <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>ZIP Code</Label>
                        <Input value={form.zip_code} onChange={(e) => f("zip_code", e.target.value)} placeholder="10001" maxLength={5} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Income */}
                <div>
                  <SectionHeader icon={DollarSign} label="Income Information (USD)" badge={portalDataLoaded ? "Auto-filled from portal" : undefined} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { label: "W-2 Income", field: "w2_income" as const },
                      { label: "1099 / Self-Employment Income", field: "form_1099_income" as const },
                      { label: "Business Income", field: "business_income" as const },
                      { label: "Other Income", field: "other_income" as const },
                    ].map(({ label, field }) => (
                      <div key={field} className="space-y-2">
                        <Label>{label}</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input type="number" min="0" step="0.01" className="pl-7" value={form[field]} onChange={(e) => f(field, e.target.value)} />
                        </div>
                      </div>
                    ))}
                    <div className="sm:col-span-2 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-indigo-800">Total Gross Income</span>
                      <span className="text-lg font-bold text-indigo-700">${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Refund / Liability</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input type="number" step="0.01" className="pl-7" placeholder="Optional" value={form.estimated_refund} onChange={(e) => f("estimated_refund", e.target.value)} />
                      </div>
                      <p className="text-xs text-muted-foreground">Positive = refund, negative = owes</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => f("notes", e.target.value)} placeholder="Any additional information relevant to filing..." rows={3} />
                </div>

                <Button type="submit" className="w-full" disabled={submitting || !form.full_legal_name || !form.ssn}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Intake & Advance Case
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="kpi-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Client Name</th>
                <th className="px-4 py-3 font-medium">SSN</th>
                <th className="px-4 py-3 font-medium">Filing Status</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Total Income</th>
                <th className="px-4 py-3 font-medium">Case Stage</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No intake submissions yet</td></tr>
              ) : (
                filtered.map((intake: any) => {
                  const total = Number(intake.w2_income || 0) + Number(intake.form_1099_income || 0) + Number(intake.business_income || 0) + Number(intake.other_income || 0);
                  return (
                    <tr key={intake.id} className="data-table-row">
                      <td className="px-4 py-3 font-medium text-foreground">{intake.full_legal_name}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">***-**-{intake.ssn_last_four || "????"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{intake.filing_status || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{intake.state || "—"}</td>
                      <td className="px-4 py-3 font-medium text-foreground">${total.toLocaleString()}</td>
                      <td className="px-4 py-3">{intake.cases?.current_stage ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{intake.cases.current_stage}</span> : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(intake.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3"><Button size="sm" variant="ghost" onClick={() => openView(intake)}>View</Button></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── View Modal ──────────────────────────────────────────────────── */}
      {viewIntake && (
        <Dialog open={!!viewIntake} onOpenChange={() => setViewIntake(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                {viewIntake.full_legal_name}
              </DialogTitle>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex gap-1 border-b mb-4">
              {[
                { id: "intake", label: "Intake Record" },
                { id: "portal", label: "Full Portal Data" },
              ].map((tab) => (
                <button key={tab.id} onClick={() => setViewTab(tab.id as any)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    viewTab === tab.id
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {tab.label}
                  {tab.id === "portal" && loadingPortalFull && (
                    <Loader2 className="inline ml-1.5 h-3 w-3 animate-spin" />
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab: Intake Record ── */}
            {viewTab === "intake" && (
              <div className="space-y-5">
                <div>
                  <SectionHeader icon={User} label="Personal Information" />
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">SSN</p>
                      <div className="flex items-center gap-2 font-mono">
                        {showViewSSN && isAdmin ? <DecryptedSSN encrypted={viewIntake.ssn_encrypted} /> : `***-**-${viewIntake.ssn_last_four || "????"}`}
                        {isAdmin && (
                          <button onClick={() => setShowViewSSN(!showViewSSN)} className="text-muted-foreground hover:text-foreground">
                            {showViewSSN ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {!isAdmin && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </div>
                    <InfoRow label="Date of Birth" value={viewIntake.dob} />
                    <InfoRow label="Filing Status" value={viewIntake.filing_status} />
                    <InfoRow label="Dependents" value={viewIntake.dependents} />
                  </div>
                </div>
                <div>
                  <SectionHeader icon={Phone} label="Contact & Address" />
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <InfoRow label="Phone" value={viewIntake.phone} />
                    <InfoRow label="Email" value={viewIntake.email} />
                    <div className="sm:col-span-2">
                      <InfoRow label="Address" value={[viewIntake.address, viewIntake.city, viewIntake.state, viewIntake.zip_code].filter(Boolean).join(", ")} />
                    </div>
                  </div>
                </div>
                <div>
                  <SectionHeader icon={DollarSign} label="Income Breakdown" />
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    {[
                      { label: "W-2 Income", value: viewIntake.w2_income },
                      { label: "1099 Income", value: viewIntake.form_1099_income },
                      { label: "Business Income", value: viewIntake.business_income },
                      { label: "Other Income", value: viewIntake.other_income },
                    ].map(({ label, value }) => (
                      <InfoRow key={label} label={label} value={`$${Number(value || 0).toLocaleString()}`} />
                    ))}
                    <div className="sm:col-span-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 flex justify-between">
                      <span className="text-sm font-medium text-indigo-800">Total Gross Income</span>
                      <span className="font-bold text-indigo-700">
                        ${(Number(viewIntake.w2_income || 0) + Number(viewIntake.form_1099_income || 0) + Number(viewIntake.business_income || 0) + Number(viewIntake.other_income || 0)).toLocaleString()}
                      </span>
                    </div>
                    {viewIntake.estimated_refund !== null && viewIntake.estimated_refund !== undefined && (
                      <div>
                        <p className="text-xs text-muted-foreground">Est. Refund / Liability</p>
                        <p className={`font-medium ${Number(viewIntake.estimated_refund) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {Number(viewIntake.estimated_refund) >= 0 ? "+" : ""}${Number(viewIntake.estimated_refund).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {viewIntake.notes && (
                  <div>
                    <SectionHeader icon={FileText} label="Notes" />
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewIntake.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Full Portal Data ── */}
            {viewTab === "portal" && (
              <div className="space-y-6">
                {loadingPortalFull && !p && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!loadingPortalFull && !p && (
                  <p className="text-center text-muted-foreground py-8 text-sm">Client has not submitted portal data yet.</p>
                )}

                {p && (
                  <>
                    {/* Personal + Visa */}
                    <div>
                      <SectionHeader icon={User} label="Taxpayer — Personal Details" />
                      <div className="grid gap-3 sm:grid-cols-3 text-sm">
                        <InfoRow label="First Name" value={p.first_name} />
                        <InfoRow label="Middle Name" value={p.middle_name} />
                        <InfoRow label="Last Name" value={p.last_name} />
                        <InfoRow label="Date of Birth" value={p.date_of_birth} />
                        <InfoRow label="Marital Status" value={p.marital_status || p.filing_status} />
                        <InfoRow label="Filing Status" value={p.filing_status} />
                        <InfoRow label="SSN / ITIN (client entered)" value={p.ssn_itin || p.ssn || "—"} />
                        <InfoRow label="Visa Category" value={p.visa_type || p.visa_category} />
                        <InfoRow label="Occupation" value={p.occupation || p.current_occupation} />
                        <InfoRow label="First Entry to USA" value={p.first_entry_date} />
                        <InfoRow label="Timezone" value={p.timezone} />
                        <InfoRow label="Date of Marriage" value={p.date_of_marriage} />
                      </div>
                    </div>

                    {/* Contact */}
                    <div>
                      <SectionHeader icon={Phone} label="Contact Information" />
                      <div className="grid gap-3 sm:grid-cols-3 text-sm">
                        <InfoRow label="Mobile" value={p.mobile_number || p.phone_number || p.phone} />
                        <InfoRow label="Work Number" value={p.work_number} />
                        <InfoRow label="Email" value={p.email} />
                        <InfoRow label="Street Address" value={p.street_address || p.address} />
                        <InfoRow label="Apt / Unit" value={p.apt_number} />
                        <InfoRow label="City" value={p.city} />
                        <InfoRow label="State" value={p.state} />
                        <InfoRow label="Zip Code" value={p.zip_code} />
                      </div>
                    </div>

                    {/* Employer */}
                    <div>
                      <SectionHeader icon={Briefcase} label="Employer Details" />
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <InfoRow label="Employer 1" value={p.employer_name_1 || p.employer_name} />
                        <InfoRow label="Employer 2" value={p.employer_name_2} />
                      </div>
                    </div>

                    {/* Bank Details */}
                    <div>
                      <SectionHeader icon={CreditCard} label="Bank Details (Direct Deposit)" />
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <InfoRow label="Bank Name" value={p.bank_name} />
                        <InfoRow label="Account Type" value={p.account_type} />
                        <InfoRow label="Account Number" value={p.account_number} />
                        <InfoRow label="Routing Number" value={p.routing_number} />
                      </div>
                    </div>

                    {/* Insurance */}
                    <div>
                      <SectionHeader icon={Heart} label="Insurance" />
                      <div className="rounded-lg border divide-y text-sm">
                        <FlagRow label="Health Insurance (full/part year)" value={p.health_insurance ?? p.has_health_insurance} />
                        <FlagRow label="Marketplace / 1095A/B/C Insurance" value={p.marketplace_insurance ?? p.has_marketplace_insurance} />
                      </div>
                    </div>

                    {/* Schedule A */}
                    <div>
                      <SectionHeader icon={FileText} label="Schedule A & Deductions" />
                      <div className="rounded-lg border divide-y text-sm">
                        <FlagRow label="HSA distributions for medical expenses" value={p.hsa_distributions ?? p.has_hsa} />
                        <FlagRow label="Maternity expenses" value={p.maternity_expenses ?? p.has_maternity} />
                        <FlagRow label="Real estate taxes (India or US)" value={p.real_estate_tax ?? p.has_real_estate_tax} />
                        <FlagRow label="Personal property taxes / car tax" value={p.personal_property_tax ?? p.has_personal_property_tax} />
                        <FlagRow label="Motor vehicle tax (CT state)" value={p.motor_vehicle_tax ?? p.has_motor_vehicle_tax} />
                        <FlagRow label="Home mortgage interest (India or US)" value={p.home_mortgage ?? p.has_home_mortgage} />
                        <FlagRow label="Charitable contributions" value={p.charitable_contributions ?? p.has_charitable} />
                      </div>
                    </div>

                    {/* Other Income */}
                    <div>
                      <SectionHeader icon={TrendingUp} label="Other Income Sources" />
                      <div className="rounded-lg border divide-y text-sm">
                        <FlagRow label="Sold stocks (US or India)" value={p.sold_stocks ?? p.has_stocks} />
                        <FlagRow label="Interest income (US or India)" value={p.interest_income ?? p.has_interest_income} />
                        <FlagRow label="Dividend income (US or India)" value={p.dividend_income ?? p.has_dividend} />
                        <FlagRow label="Rental / Business income (US or India)" value={p.rental_income ?? p.has_rental_income} />
                        <FlagRow label="IRA / Pension distributions" value={p.ira_distribution ?? p.has_ira_distribution} />
                      </div>
                    </div>

                    {/* Adjustments */}
                    <div>
                      <SectionHeader icon={Sliders} label="Adjustments to Income" />
                      <div className="rounded-lg border divide-y text-sm">
                        <FlagRow label="Relocation / Moving expenses" value={p.relocation_expenses ?? p.has_relocation} />
                        <FlagRow label="Education expenses (self, spouse, or dependents)" value={p.education_expenses ?? p.has_education} />
                        <FlagRow label="Student loan interest paid" value={p.student_loan ?? p.has_student_loan} />
                        <FlagRow label="IRA contribution / Retirement plan" value={p.ira_contribution ?? p.has_ira_contribution} />
                      </div>
                    </div>

                    {/* Additional Notes from portal */}
                    {p.additional_notes && (
                      <div>
                        <SectionHeader icon={FileText} label="Additional Notes (from client)" />
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{p.additional_notes}</p>
                      </div>
                    )}
                  </>
                )}

                {/* Spouse */}
                {portalFull.spouse && (
                  <div>
                    <SectionHeader icon={Users} label="Spouse Information" />
                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      <InfoRow label="First Name" value={portalFull.spouse.first_name} />
                      <InfoRow label="Middle Name" value={portalFull.spouse.middle_name} />
                      <InfoRow label="Last Name" value={portalFull.spouse.last_name} />
                      <InfoRow label="Date of Birth" value={portalFull.spouse.dob || portalFull.spouse.date_of_birth} />
                      <InfoRow label="Occupation" value={portalFull.spouse.occupation} />
                      <InfoRow label="Visa Type" value={portalFull.spouse.visa_type} />
                      <InfoRow label="Tax ID Type" value={portalFull.spouse.tax_id_type} />
                    </div>
                  </div>
                )}

                {/* Dependents */}
                {portalFull.dependents.length > 0 && (
                  <div>
                    <SectionHeader icon={Users} label={`Dependents (${portalFull.dependents.length})`} />
                    <div className="space-y-3">
                      {portalFull.dependents.map((dep: any, i: number) => (
                        <div key={dep.id || i} className="rounded-lg border p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Dependent {i + 1}</p>
                          <div className="grid gap-2 sm:grid-cols-3 text-sm">
                            <InfoRow label="Name" value={[dep.first_name, dep.middle_name, dep.last_name].filter(Boolean).join(" ")} />
                            <InfoRow label="Date of Birth" value={dep.dob || dep.date_of_birth} />
                            <InfoRow label="Relationship" value={dep.relationship} />
                            <InfoRow label="Gender" value={dep.gender} />
                            <InfoRow label="SSN / ITIN" value={dep.ssn_itin || dep.ssn} />
                            <InfoRow label="Visa Category" value={dep.visa_category || dep.visa_type} />
                            <InfoRow label="Tax ID Type" value={dep.tax_id_type} />
                            <div>
                              <p className="text-xs text-muted-foreground">Dependent Care Expenses</p>
                              <YesNo value={dep.dependent_care ?? dep.has_dependent_care} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Addresses */}
                {portalFull.addresses.length > 0 && (
                  <div>
                    <SectionHeader icon={Home} label={`Residency Periods (${portalFull.addresses.length})`} />
                    <div className="space-y-3">
                      {portalFull.addresses.map((addr: any, i: number) => (
                        <div key={addr.id || i} className="rounded-lg border p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Period {i + 1}</p>
                          <div className="grid gap-2 sm:grid-cols-3 text-sm">
                            <InfoRow label="Person" value={addr.person} />
                            <InfoRow label="State" value={addr.state} />
                            <InfoRow label="Rent Paid (incl. utilities)" value={addr.rent_paid ? `$${Number(addr.rent_paid).toLocaleString()}` : undefined} />
                            <InfoRow label="Start Date" value={addr.start_date || addr.from_date} />
                            <InfoRow label="End Date" value={addr.end_date || addr.to_date} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Appointment */}
                {portalFull.appointment && (
                  <div>
                    <SectionHeader icon={Calendar} label="Scheduled Appointment" />
                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      <InfoRow label="Date" value={portalFull.appointment.appointment_date} />
                      <InfoRow label="Time Slot" value={portalFull.appointment.time_slot} />
                      <InfoRow label="Status" value={portalFull.appointment.status} />
                    </div>
                  </div>
                )}

              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}