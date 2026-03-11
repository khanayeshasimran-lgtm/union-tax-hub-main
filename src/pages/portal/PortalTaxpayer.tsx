import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

const VISA_TYPES = ["H1B","H4","L1","L2","F1","OPT","CPT","O1","TN","GC","US Citizen","Other"];
const FILING_STATUSES = ["Single","Married Filing Jointly","Married Filing Separately","Head of Household","Qualifying Widow(er)"];
const MARITAL_STATUSES = ["Single","Married","Divorced","Widowed"];
const TIMEZONES = ["IST","EST","CST","MST","PST"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

// ── YES/NO questions from Schedule A / Other Income / Adjustments ─────────────
const YES_NO_QUESTIONS = [
  // Insurance
  { section: "Insurance Details", key: "health_insurance_covered", label: "Are you and your family covered by Health Insurance for entire/part year?" },
  { section: "Insurance Details", key: "insurance_type", label: "Employer Insured / Market Place Insurance (1095 A / 1095 B / 1095 C)?" },
  // Schedule A
  { section: "Schedule A & Miscellaneous", key: "hsa_distributions", label: "Do you have any distributions from H.S.A for Medical expenses?" },
  { section: "Schedule A & Miscellaneous", key: "maternity_expenses", label: "Have you incurred any Maternity expenses?" },
  { section: "Schedule A & Miscellaneous", key: "real_estate_taxes", label: "Have you paid any Real Estate taxes in India or US?" },
  { section: "Schedule A & Miscellaneous", key: "personal_property_taxes", label: "Have you paid any Personal Property taxes (Car Tax, Registration Fee) in US?" },
  { section: "Schedule A & Miscellaneous", key: "motor_vehicle_tax_ct", label: "Have you Paid any motor vehicle tax in CT state?" },
  { section: "Schedule A & Miscellaneous", key: "home_mortgage_interest", label: "Have you paid any Home Mortgage Interest in India or US?" },
  { section: "Schedule A & Miscellaneous", key: "charitable_contributions", label: "Have you made any Charitable Contributions?" },
  // Other Income
  { section: "Other Income", key: "sold_stocks", label: "Have you sold any stocks in US/India?" },
  { section: "Other Income", key: "interest_income", label: "Have you earned any Interest Income in US or India?" },
  { section: "Other Income", key: "dividend_income", label: "Do you have any dividend Income in US or India?" },
  { section: "Other Income", key: "rental_business_income", label: "Do you have any Rental or Business Income/expenses in US or India?" },
  { section: "Other Income", key: "ira_distributions", label: "Do you have any Distributions from IRA (Pension Account)?" },
  // Adjustments
  { section: "Adjustments to Income", key: "relocation_expenses", label: "Have you incurred any Relocation Expenses/Moving expenses?" },
  { section: "Adjustments to Income", key: "education_expenses", label: "Have you incurred any Education expenses for you, your Spouse or Dependants?" },
  { section: "Adjustments to Income", key: "student_loan_interest", label: "Have you paid any Student Loan Interest?" },
  { section: "Adjustments to Income", key: "ira_contribution", label: "Do you have any IRA contribution (Retirement Plan)?" },
];

interface TaxpayerForm {
  first_name: string; middle_name: string; last_name: string;
  marital_status: string; date_of_marriage: string;
  gender: string; ssn_itin: string; date_of_birth: string;
  occupation: string; entry_date_usa: string; visa_type: string;
  filing_status: string; timezone: string;
  phone: string; work_phone: string; alt_phone: string; email: string;
  address: string; apt_number: string; city: string; state: string; zip: string;
  referred_by: string;
  employer_name_1: string; employer_name_2: string;
  notes: string;
  [key: string]: string; // for yes/no question keys
}

const empty: TaxpayerForm = {
  first_name:"", middle_name:"", last_name:"",
  marital_status:"", date_of_marriage:"",
  gender:"", ssn_itin:"", date_of_birth:"",
  occupation:"", entry_date_usa:"", visa_type:"",
  filing_status:"", timezone:"IST",
  phone:"", work_phone:"", alt_phone:"", email:"",
  address:"", apt_number:"", city:"", state:"", zip:"",
  referred_by:"",
  employer_name_1:"", employer_name_2:"",
  notes:"",
  // yes/no defaults
  ...Object.fromEntries(YES_NO_QUESTIONS.map(q => [q.key, ""])),
};

export default function PortalTaxpayer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<TaxpayerForm>(empty);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [referred, setReferred] = useState<"yes"|"no"|"">("");
  const db = supabase as any;

  useEffect(() => { if (user?.email) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);

    // Try to find lead by email (optional — links portal data to agent's lead)
    // This is best-effort; clients without a lead record can still save
    try {
      const { data: lead } = await db.from("leads").select("id, organization_id").eq("email", user!.email).maybeSingle();
      if (lead) {
        setLeadId(lead.id);
        setOrgId(lead.organization_id);
      }
    } catch (_) {}

    // Load existing profile by user_id (primary key for clients)
    const { data: ex } = await db.from("client_tax_profiles").select("*").eq("user_id", user!.id).maybeSingle();
    if (ex) {
      setRecordId(ex.id);
      const loaded: TaxpayerForm = { ...empty };
      Object.keys(empty).forEach(k => { if (ex[k] !== undefined && ex[k] !== null) loaded[k] = String(ex[k]); });
      loaded.email = loaded.email || user!.email || "";
      setForm(loaded);
      if (ex.referred_by) setReferred("yes");
    } else {
      setForm(f => ({ ...f, email: user!.email || "" }));
    }
    setLoading(false);
  }

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    // Strip fields that don't exist in client_tax_profiles
    const { email: _email, ...formData } = form;
    const payload = {
      ...formData,
      user_id: user.id,
      organization_id: orgId,
      ...(leadId ? { lead_id: leadId } : {}),
    };
    let error;
    if (recordId) {
      ({ error } = await db.from("client_tax_profiles").update(payload).eq("id", recordId));
    } else {
      const { data: ins, error: err } = await db.from("client_tax_profiles").insert(payload).select("id").single();
      error = err;
      if (ins) setRecordId(ins.id);
    }
    setSaving(false);
    toast(error
      ? { title:"Error saving", description:error.message, variant:"destructive" }
      : { title:"Saved!", description:"Information updated successfully." });
  }

  if (loading) return <Loading />;

  // Group yes/no questions by section
  const sections = [...new Set(YES_NO_QUESTIONS.map(q => q.section))];

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Personal Information */}
        <Section title="Personal Information">
          <Grid cols={3}>
            <Field label="Last Name (as per SSN card)" required><Inp value={form.last_name} onChange={v => set("last_name",v)} placeholder="Last Name" /></Field>
            <Field label="First Name" required><Inp value={form.first_name} onChange={v => set("first_name",v)} placeholder="First Name" /></Field>
            <Field label="Middle Name"><Inp value={form.middle_name} onChange={v => set("middle_name",v)} placeholder="Middle Name" /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Marital Status">
              <Sel value={form.marital_status} onChange={v => set("marital_status",v)} options={MARITAL_STATUSES} placeholder="- Select -" />
            </Field>
            <Field label="Date of Marriage"><Inp type="date" value={form.date_of_marriage} onChange={v => set("date_of_marriage",v)} /></Field>
            <Field label="Date of Birth"><Inp type="date" value={form.date_of_birth} onChange={v => set("date_of_birth",v)} /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="SSN/ITIN"><Inp value={form.ssn_itin} onChange={v => set("ssn_itin",v)} placeholder="SSN or 'Need to apply'" /></Field>
            <Field label="Current Visa Category"><Sel value={form.visa_type} onChange={v => set("visa_type",v)} options={VISA_TYPES} placeholder="Select Visa Type" /></Field>
            <Field label="Current Occupation"><Inp value={form.occupation} onChange={v => set("occupation",v)} placeholder="Occupation in USA" /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="First Entry Date into USA"><Inp type="date" value={form.entry_date_usa} onChange={v => set("entry_date_usa",v)} /></Field>
            <Field label="Filing Status"><Sel value={form.filing_status} onChange={v => set("filing_status",v)} options={FILING_STATUSES} placeholder="- Select -" /></Field>
            <Field label="Timezone"><Sel value={form.timezone} onChange={v => set("timezone",v)} options={TIMEZONES} placeholder="Timezone" /></Field>
          </Grid>
        </Section>

        {/* Contact Information */}
        <Section title="Contact Information">
          <Grid cols={3}>
            <Field label="Mobile Number"><Inp value={form.phone} onChange={v => set("phone",v)} placeholder="Mobile Number" /></Field>
            <Field label="Work Number"><Inp value={form.work_phone} onChange={v => set("work_phone",v)} placeholder="Work Number" /></Field>
            <Field label="Email ID"><Inp type="email" value={form.email} onChange={v => set("email",v)} placeholder="Email" /></Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Current Street Address">
              <Inp value={form.address} onChange={v => set("address",v)} placeholder="Street Address" />
            </Field>
            <Field label="Apt Number"><Inp value={form.apt_number} onChange={v => set("apt_number",v)} placeholder="Apt / Unit #" /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="City"><Inp value={form.city} onChange={v => set("city",v)} placeholder="City" /></Field>
            <Field label="State"><Sel value={form.state} onChange={v => set("state",v)} options={US_STATES} placeholder="Select state" /></Field>
            <Field label="Zip Code"><Inp value={form.zip} onChange={v => set("zip",v)} placeholder="Zipcode" /></Field>
          </Grid>
        </Section>

        {/* Employer Details */}
        <Section title="Employer Details (2025)">
          <Grid cols={2}>
            <Field label="Employer Name 1"><Inp value={form.employer_name_1} onChange={v => set("employer_name_1",v)} placeholder="Primary Employer" /></Field>
            <Field label="Employer Name 2"><Inp value={form.employer_name_2} onChange={v => set("employer_name_2",v)} placeholder="Secondary Employer (if any)" /></Field>
          </Grid>
        </Section>

        {/* Yes/No Question Sections */}
        {sections.map(section => (
          <Section key={section} title={section}>
            <div className="space-y-3">
              {YES_NO_QUESTIONS.filter(q => q.section === section).map(q => (
                <div key={q.key} className="flex items-start justify-between gap-6 py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700 flex-1">{q.label}</p>
                  <div className="flex gap-4 shrink-0">
                    {["Yes","No"].map(opt => (
                      <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                        <input type="radio" name={q.key} value={opt} checked={form[q.key] === opt}
                          onChange={() => set(q.key, opt)} className="accent-blue-600" />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ))}

        {/* Referrer */}
        <Section title="Referrer Information">
          <Field label="Have you been referred?">
            <div className="flex gap-5 mt-2">
              {(["Yes","No"]).map(opt => (
                <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                  <input type="radio" name="referred" value={opt} checked={referred === opt.toLowerCase()}
                    onChange={() => setReferred(opt.toLowerCase() as "yes"|"no")} className="accent-blue-600" />
                  {opt}
                </label>
              ))}
            </div>
          </Field>
          {referred === "yes" && (
            <Field label="Referred By"><Inp value={form.referred_by} onChange={v => set("referred_by",v)} placeholder="Referrer name" /></Field>
          )}
        </Section>

        {/* Notes */}
        <Section title="Additional Notes">
          <textarea value={form.notes} onChange={e => set("notes",e.target.value)}
            placeholder="Any additional notes for your tax preparer..."
            rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </Section>

        <div className="flex justify-end pb-8">
          <SaveBtn saving={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}

// ── Shared primitives exported for all portal pages ──────────────────────────
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h2 className="text-blue-600 font-semibold text-base border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  );
}
export function Grid({ cols, children }: { cols: 2|3; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 gap-4 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>{children}</div>;
}
export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
export function Inp({ value, onChange, placeholder, type="text" }: { value:string; onChange:(v:string)=>void; placeholder?:string; type?:string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />;
}
export function Sel({ value, onChange, options, placeholder }: { value:string; onChange:(v:string)=>void; options:string[]; placeholder?:string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
export function RadioGroup({ name, options, value, onChange }: { name:string; options:string[]; value:string; onChange:(v:string)=>void }) {
  return (
    <div className="flex gap-5 mt-2">
      {options.map(o => (
        <label key={o} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
          <input type="radio" name={name} value={o} checked={value===o} onChange={() => onChange(o)} className="accent-blue-600" />
          {o}
        </label>
      ))}
    </div>
  );
}
export function SaveBtn({ saving, onClick }: { saving:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-2 bg-[#1e2a4a] hover:bg-[#2d3a5c] text-white font-semibold px-8 py-2.5 rounded-full transition-all disabled:opacity-50">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      Save
    </button>
  );
}
export function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );
}