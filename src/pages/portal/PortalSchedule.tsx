import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Calendar, CheckCircle2, Loader2 } from "lucide-react";
import { Section, Grid, Field, Inp, Sel, SaveBtn, Loading } from "./PortalTaxpayer";

const TIME_SLOTS = [
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM",
  "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
  "5:00 PM", "5:30 PM", "6:00 PM",
];

interface AppointmentForm {
  appointment_date: string;
  time_slot: string;
}

export default function PortalSchedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [apptId, setApptId] = useState<string | null>(null);
  const [form, setForm] = useState<AppointmentForm>({ appointment_date: "", time_slot: "" });
  const [existing, setExisting] = useState<AppointmentForm | null>(null);
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

    const { data: appt } = await db.from("tax_appointments").select("*").eq("user_id", user!.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (appt) {
      setApptId(appt.id);
      setExisting({ appointment_date: appt.appointment_date, time_slot: appt.time_slot });
      setForm({ appointment_date: appt.appointment_date || "", time_slot: appt.time_slot || "" });
    }
    setLoading(false);
  }

  const set = (field: keyof AppointmentForm, value: string) => setForm(f => ({ ...f, [field]: value }));

  async function handleSave() {
    if (!form.appointment_date || !form.time_slot) {
      toast({ title: "Missing fields", description: "Please select a date and time slot.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      user_id: user!.id,
      ...(leadId ? { lead_id: leadId } : {}),
      ...(orgId ? { organization_id: orgId } : {}),
      appointment_date: form.appointment_date,
      time_slot: form.time_slot,
      status: "pending",
    };

    let error;
    if (apptId) {
      ({ error } = await db.from("tax_appointments").update(payload).eq("id", apptId));
    } else {
      const { data: ins, error: err } = await db.from("tax_appointments").insert(payload).select("id").single();
      error = err;
      if (ins) setApptId(ins.id);
    }

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setExisting({ ...form });
      toast({ title: "Scheduled!", description: `Appointment set for ${form.appointment_date} at ${form.time_slot} CST.` });
    }
  }

  if (loading) return <Loading />;

  // Today's date as min for date picker
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Existing appointment banner */}
        {existing?.appointment_date && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
            <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 text-sm">Appointment Scheduled</p>
              <p className="text-green-700 text-sm mt-0.5">
                {existing.appointment_date} at {existing.time_slot} CST
              </p>
            </div>
          </div>
        )}

        <Section title="Schedule For Tax Notes">
          <p className="text-sm text-gray-500">
            Please select the date and time at your convenience to give us some important Tax Notes
            which is necessary to prepare your Tax Return.
          </p>

          <Grid cols={2}>
            <Field label="Choose Date">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  min={today}
                  value={form.appointment_date}
                  onChange={e => set("appointment_date", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </Field>
            <Field label="Select Time Slot">
              <Sel
                value={form.time_slot}
                onChange={v => set("time_slot", v)}
                options={TIME_SLOTS}
                placeholder="- Select One -"
              />
              <p className="text-xs text-gray-400 mt-1">Based on CST time zone only</p>
            </Field>
          </Grid>
        </Section>

        <div className="flex justify-end pb-8">
          <SaveBtn saving={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}