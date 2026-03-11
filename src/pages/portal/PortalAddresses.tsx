import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { Section, Grid, Field, Inp, Sel, SaveBtn, Loading } from "./PortalTaxpayer";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

interface AddressEntry {
  id?: string;
  person: string; state: string; from_date: string; to_date: string;
  rent_paid: string;
}

const newEntry = (): AddressEntry => ({ person:"", state:"", from_date:"", to_date:"", rent_paid:"" });

export default function PortalAddresses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leadId, setLeadId] = useState<string|null>(null);
  const [orgId, setOrgId] = useState<string|null>(null);
  const [entries, setEntries] = useState<AddressEntry[]>([newEntry()]);
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

    const { data: existing } = await db.from("client_addresses").select("*").eq("user_id", user!.id).order("created_at");
    if (existing?.length) {
      setEntries(existing.map((a: any) => ({
        id: a.id, person: a.person||"", state: a.state||"",
        from_date: a.from_date||"", to_date: a.to_date||"",
        rent_paid: a.rent_paid ? String(a.rent_paid) : "",
      })));
    }
    setLoading(false);
  }

  function setEntry(index: number, field: keyof AddressEntry, value: string) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    for (const entry of entries) {
      const payload = { ...entry, rent_paid: entry.rent_paid ? parseFloat(entry.rent_paid) : null, user_id: user!.id, ...(leadId ? { lead_id: leadId } : {}), organization_id: orgId };
      if (entry.id) {
        await db.from("client_addresses").update(payload).eq("id", entry.id);
      } else {
        const { data: ins } = await db.from("client_addresses").insert(payload).select("id").single();
        if (ins) entry.id = ins.id;
      }
    }
    setSaving(false);
    toast({ title:"Saved!", description:"Addresses updated." });
  }

  async function removeEntry(index: number) {
    const entry = entries[index];
    if (entry.id) await db.from("client_addresses").delete().eq("id", entry.id);
    setEntries(prev => prev.filter((_,i) => i !== index));
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-blue-600 font-semibold text-base border-b border-gray-100 pb-2 mb-4">
            Addresses &amp; Residency in Tax Year 2025
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Please provide the period and state where the taxpayer and spouse lived during the Tax Year,
            including rent paid (including Gas, Water and Electricity) per state.
          </p>

          {entries.map((entry, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-4 mb-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Residency Period {i+1}</span>
                {entries.length > 1 && (
                  <button onClick={() => removeEntry(i)} className="text-red-400 hover:text-red-600 flex items-center gap-1 text-xs">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
              <Grid cols={3}>
                <Field label="Person">
                  <Sel value={entry.person} onChange={v => setEntry(i,"person",v)} options={["Taxpayer","Spouse"]} placeholder="- Select Person -" />
                </Field>
                <Field label="State">
                  <Sel value={entry.state} onChange={v => setEntry(i,"state",v)} options={US_STATES} placeholder="- Select State -" />
                </Field>
                <Field label="Rent Paid incl. Gas/Water/Electric ($)">
                  <Inp value={entry.rent_paid} onChange={v => setEntry(i,"rent_paid",v)} placeholder="0.00" type="number" />
                </Field>
              </Grid>
              <Grid cols={2}>
                <Field label="Start Date"><Inp type="date" value={entry.from_date} onChange={v => setEntry(i,"from_date",v)} /></Field>
                <Field label="End Date"><Inp type="date" value={entry.to_date} onChange={v => setEntry(i,"to_date",v)} /></Field>
              </Grid>
            </div>
          ))}

          <button onClick={() => setEntries(prev => [...prev, newEntry()])}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50 transition-all">
            <Plus className="h-4 w-4" /> Add Another Period
          </button>
        </div>

        <div className="flex justify-end pb-8">
          <SaveBtn saving={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}