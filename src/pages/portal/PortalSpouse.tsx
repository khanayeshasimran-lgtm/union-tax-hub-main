import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Section, Grid, Field, Inp, Sel, RadioGroup, SaveBtn, Loading } from "./PortalTaxpayer";

const VISA_TYPES = ["H1B","H4","L1","L2","F1","OPT","CPT","O1","TN","GC","US Citizen","Other"];

interface SpouseForm {
  spouse_first_name: string; spouse_middle_name: string; spouse_last_name: string;
  spouse_dob: string; spouse_occupation: string; spouse_visa_type: string;
  spouse_tax_id_type: string;
}

const empty: SpouseForm = {
  spouse_first_name:"", spouse_middle_name:"", spouse_last_name:"",
  spouse_dob:"", spouse_occupation:"", spouse_visa_type:"", spouse_tax_id_type:"",
};

export default function PortalSpouse() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<SpouseForm>(empty);
  const [leadId, setLeadId] = useState<string|null>(null);
  const [recordId, setRecordId] = useState<string|null>(null);
  const [orgId, setOrgId] = useState<string|null>(null);
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

    const { data: ex } = await db.from("client_tax_profiles").select("id,spouse_first_name,spouse_middle_name,spouse_last_name,spouse_dob,spouse_occupation,spouse_visa_type,spouse_tax_id_type").eq("user_id", user!.id).maybeSingle();
    if (ex) {
      setRecordId(ex.id);
      setForm({
        spouse_first_name: ex.spouse_first_name||"", spouse_middle_name: ex.spouse_middle_name||"",
        spouse_last_name: ex.spouse_last_name||"", spouse_dob: ex.spouse_dob||"",
        spouse_occupation: ex.spouse_occupation||"", spouse_visa_type: ex.spouse_visa_type||"",
        spouse_tax_id_type: ex.spouse_tax_id_type||"",
      });
    }
    setLoading(false);
  }

  const set = (field: keyof SpouseForm, value: string) => setForm(f => ({ ...f, [field]: value }));

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    let error;
    if (recordId) {
      ({ error } = await db.from("client_tax_profiles").update(form).eq("id", recordId));
    } else {
      const { data: ins, error: err } = await db.from("client_tax_profiles").insert({ ...form, user_id: user.id, ...(leadId ? { user_id: user!.id, ...(leadId ? { lead_id: leadId } : {}) } : {}), organization_id: orgId }).select("id").single();
      error = err;
      if (ins) setRecordId(ins.id);
    }
    setSaving(false);
    toast(error
      ? { title:"Error saving", description:error.message, variant:"destructive" }
      : { title:"Saved!", description:"Spouse information updated." });
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Section title="Spouse Information">
          <Grid cols={3}>
            <Field label="First Name"><Inp value={form.spouse_first_name} onChange={v => set("spouse_first_name",v)} placeholder="First Name" /></Field>
            <Field label="Middle Name"><Inp value={form.spouse_middle_name} onChange={v => set("spouse_middle_name",v)} placeholder="Middle Name" /></Field>
            <Field label="Last Name"><Inp value={form.spouse_last_name} onChange={v => set("spouse_last_name",v)} placeholder="Last Name" /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Date of Birth"><Inp type="date" value={form.spouse_dob} onChange={v => set("spouse_dob",v)} /></Field>
            <Field label="Occupation"><Inp value={form.spouse_occupation} onChange={v => set("spouse_occupation",v)} placeholder="Occupation in USA" /></Field>
            <Field label="Visa Type"><Sel value={form.spouse_visa_type} onChange={v => set("spouse_visa_type",v)} options={VISA_TYPES} placeholder="Select Visa Type" /></Field>
          </Grid>
          <Field label="Tax Id Type">
            <RadioGroup name="spouse_tax_id_type" options={["SSN/ITIN","APPLYING FOR ITIN"]} value={form.spouse_tax_id_type} onChange={v => set("spouse_tax_id_type",v)} />
          </Field>
        </Section>

        <div className="flex justify-end pb-8">
          <SaveBtn saving={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}
