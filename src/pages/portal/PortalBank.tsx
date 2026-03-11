import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Section, Grid, Field, Inp, RadioGroup, SaveBtn, Loading } from "./PortalTaxpayer";

interface BankForm {
  bank_name: string; bank_account_no: string;
  bank_routing_no: string; bank_account_type: string;
}

const empty: BankForm = { bank_name:"", bank_account_no:"", bank_routing_no:"", bank_account_type:"" };

export default function PortalBank() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<BankForm>(empty);
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

    const { data: ex } = await db.from("client_tax_profiles")
      .select("id,bank_name,bank_account_no,bank_routing_no,bank_account_type")
      .eq("user_id", user!.id).maybeSingle();

    if (ex) {
      setRecordId(ex.id);
      setForm({
        bank_name: ex.bank_name||"", bank_account_no: ex.bank_account_no||"",
        bank_routing_no: ex.bank_routing_no||"", bank_account_type: ex.bank_account_type||"",
      });
    }
    setLoading(false);
  }

  const set = (field: keyof BankForm, value: string) => setForm(f => ({ ...f, [field]: value }));

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    let error;
    if (recordId) {
      ({ error } = await db.from("client_tax_profiles").update(form).eq("id", recordId));
    } else {
      const { data: ins, error: err } = await db.from("client_tax_profiles")
        .insert({ ...form, user_id: user!.id, ...(leadId ? { lead_id: leadId } : {}), organization_id: orgId }).select("id").single();
      error = err;
      if (ins) setRecordId(ins.id);
    }
    setSaving(false);
    toast(error
      ? { title:"Error saving", description:error.message, variant:"destructive" }
      : { title:"Saved!", description:"Bank details updated." });
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Section title="Bank Details">
          <p className="text-sm text-gray-500">
            Please provide your Bank Details for direct deposit of your refunds from the departments.
          </p>
          <Grid cols={3}>
            <Field label="Bank Name" required>
              <Inp value={form.bank_name} onChange={v => set("bank_name",v)} placeholder="Enter Bank Name" />
            </Field>
            <Field label="Account No" required>
              <Inp value={form.bank_account_no} onChange={v => set("bank_account_no",v)} placeholder="Enter Account No" />
            </Field>
            <Field label="Routing No" required>
              <Inp value={form.bank_routing_no} onChange={v => set("bank_routing_no",v)} placeholder="Enter Routing No" />
            </Field>
          </Grid>
          <Field label="Type of Account" required>
            <RadioGroup
              name="bank_account_type"
              options={["checking Account","savings Account"]}
              value={form.bank_account_type}
              onChange={v => set("bank_account_type",v)}
            />
          </Field>
        </Section>

        <div className="flex justify-end pb-8">
          <SaveBtn saving={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}