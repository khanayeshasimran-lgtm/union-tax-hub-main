import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { Section, Grid, Field, Inp, Sel, RadioGroup, SaveBtn, Loading } from "./PortalTaxpayer";

const VISA_TYPES = ["H1B","H4","L1","L2","F1","OPT","CPT","GC","US Citizen","Other"];
const RELATIONSHIPS = ["Son","Daughter","Father","Mother","Brother","Sister","Other"];

interface Dependent {
  id?: string;
  first_name: string; middle_name: string; last_name: string;
  gender: string; date_of_birth: string; relationship: string;
  visa_type: string; tax_id_type: string; ssn_itin: string;
  entry_date_usa: string; dependent_care_expenses: string;
}

const newDep = (): Dependent => ({
  first_name:"", middle_name:"", last_name:"",
  gender:"", date_of_birth:"", relationship:"",
  visa_type:"", tax_id_type:"", ssn_itin:"",
  entry_date_usa:"", dependent_care_expenses:"",
});

export default function PortalDependent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leadId, setLeadId] = useState<string|null>(null);
  const [orgId, setOrgId] = useState<string|null>(null);
  const [deps, setDeps] = useState<Dependent[]>([newDep()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const db = supabase as any;

  useEffect(() => { if (user?.email) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    // Try to find lead by email — optional, clients may not be in leads table
    try {
      const { data: lead } = await db.from("leads").select("id,organization_id").eq("email", user!.email).maybeSingle();
      if (lead) { setLeadId(lead.id); setOrgId(lead.organization_id); }
    } catch (_) {}

    const { data: existing } = await db.from("client_dependents").select("*").eq("user_id", user!.id).order("created_at");
    if (existing?.length) {
      setDeps(existing.map((d: any) => ({
        id: d.id,
        first_name: d.first_name||"", middle_name: d.middle_name||"",
        last_name: d.last_name||"", gender: d.gender||"",
        date_of_birth: d.date_of_birth||"", relationship: d.relationship||"",
        visa_type: d.visa_type||"", tax_id_type: d.tax_id_type||"",
        ssn_itin: d.ssn_itin||"", entry_date_usa: d.entry_date_usa||"",
        dependent_care_expenses: d.dependent_care_expenses||"",
      })));
    }
    setLoading(false);
  }

  function setDep(index: number, field: keyof Dependent, value: string) {
    setDeps(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    for (const dep of deps) {
      const payload = { ...dep, user_id: user!.id, ...(leadId ? { user_id: user!.id, ...(leadId ? { lead_id: leadId } : {}) } : {}), organization_id: orgId };
      if (dep.id) {
        await db.from("client_dependents").update(payload).eq("id", dep.id);
      } else {
        const { data: ins } = await db.from("client_dependents").insert(payload).select("id").single();
        if (ins) dep.id = ins.id;
      }
    }
    setSaving(false);
    toast({ title:"Saved!", description:"Dependent information updated." });
  }

  async function removeDep(index: number) {
    const dep = deps[index];
    if (dep.id) await db.from("client_dependents").delete().eq("id", dep.id);
    setDeps(prev => prev.filter((_,i) => i !== index));
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {deps.map((dep, i) => (
          <Section key={i} title={`Dependent ${i + 1}`}>
            <div className="flex justify-end">
              {deps.length > 1 && (
                <button onClick={() => removeDep(i)} className="text-red-400 hover:text-red-600 flex items-center gap-1 text-xs">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>

            {/* Name */}
            <Grid cols={3}>
              <Field label="First Name"><Inp value={dep.first_name} onChange={v => setDep(i,"first_name",v)} placeholder="First Name" /></Field>
              <Field label="Middle Name"><Inp value={dep.middle_name} onChange={v => setDep(i,"middle_name",v)} placeholder="Middle Name" /></Field>
              <Field label="Last Name"><Inp value={dep.last_name} onChange={v => setDep(i,"last_name",v)} placeholder="Last Name" /></Field>
            </Grid>

            {/* DOB, Relationship, Gender */}
            <Grid cols={3}>
              <Field label="Date of Birth"><Inp type="date" value={dep.date_of_birth} onChange={v => setDep(i,"date_of_birth",v)} /></Field>
              <Field label="Relationship">
                <Sel value={dep.relationship} onChange={v => setDep(i,"relationship",v)} options={RELATIONSHIPS} placeholder="-Select One-" />
              </Field>
              <Field label="Gender">
                <RadioGroup name={`gender_${i}`} options={["Male","Fe-Male"]} value={dep.gender} onChange={v => setDep(i,"gender",v)} />
              </Field>
            </Grid>

            {/* SSN, Visa, Entry Date */}
            <Grid cols={3}>
              <Field label="SSN/ITIN">
                <Inp value={dep.ssn_itin} onChange={v => setDep(i,"ssn_itin",v)} placeholder="SSN or 'Need to Apply'" />
              </Field>
              <Field label="Visa Category">
                <Sel value={dep.visa_type} onChange={v => setDep(i,"visa_type",v)} options={VISA_TYPES} placeholder="Select Visa" />
              </Field>
              <Field label="First Entry Date into USA">
                <Inp type="date" value={dep.entry_date_usa} onChange={v => setDep(i,"entry_date_usa",v)} />
              </Field>
            </Grid>

            {/* Tax ID Type + Dependent Care */}
            <Grid cols={2}>
              <Field label="Tax Id Type">
                <RadioGroup name={`tax_id_${i}`} options={["SSN/ITIN","APPLYING FOR ITIN"]} value={dep.tax_id_type} onChange={v => setDep(i,"tax_id_type",v)} />
              </Field>
              <Field label="Have you incurred any Dependent Care expenses?">
                <RadioGroup name={`dep_care_${i}`} options={["Yes","No"]} value={dep.dependent_care_expenses} onChange={v => setDep(i,"dependent_care_expenses",v)} />
              </Field>
            </Grid>
          </Section>
        ))}

        <button onClick={() => setDeps(prev => [...prev, newDep()])}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50 transition-all">
          <Plus className="h-4 w-4" /> Add Another Dependent
        </button>

        <div className="flex justify-end pb-8">
          <SaveBtn saving={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}
