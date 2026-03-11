import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Check, Facebook, Share2, Loader2, Plus, X } from "lucide-react";
import { Section, Grid, Field, Inp, Loading } from "./PortalTaxpayer";

interface Referral {
  id: string;
  referred_name: string;
  referred_email: string;
  tax_year: string;
  status: string;
  amount: number;
  paid: number;
  created_at: string;
}

interface ReferForm {
  referred_name: string;
  referred_email: string;
  tax_year: string;
}

const empty: ReferForm = { referred_name: "", referred_email: "", tax_year: "2025" };

export default function PortalReferrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [form, setForm] = useState<ReferForm>(empty);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const db = supabase as any;

  useEffect(() => { if (user?.email) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    // Try to find lead by email — optional, clients may not be in leads table
    try {
      const { data: lead } = await db.from("leads").select("id,organization_id").eq("email", user!.email).maybeSingle();
      if (lead) { setLeadId(lead.id); setOrgId(lead.organization_id); }
    } catch (_) {}
    await fetchReferrals(leadId);
    setLoading(false);
  }

  async function fetchReferrals(lid: string) {
    const { data } = await db.from("client_referrals")
      .select("*")
      .eq("referrer_lead_id", lid)
      .order("created_at", { ascending: false });
    setReferrals(data || []);
  }

  const referLink = leadId
    ? `${window.location.origin}/auth?ref=${leadId}`
    : "";

  async function copyLink() {
    await navigator.clipboard.writeText(referLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied!", description: "Share this with your friends." });
  }

  function shareVia(platform: "facebook" | "whatsapp") {
    const msg = encodeURIComponent(`File your taxes with Union Tax Hub! Use my referral link: ${referLink}`);
    const urls: Record<string, string> = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referLink)}`,
      whatsapp: `https://wa.me/?text=${msg}`,
    };
    window.open(urls[platform], "_blank");
  }

  async function handleRefer() {
    if (!form.referred_name || !form.referred_email) {
      toast({ title: "Missing fields", description: "Please fill in name and email.", variant: "destructive" });
      return;
    }
    if (!leadId) return;
    setSaving(true);

    const { error } = await db.from("client_referrals").insert({
      referrer_lead_id: leadId,
      organization_id: orgId,
      referred_name: form.referred_name,
      referred_email: form.referred_email,
      tax_year: form.tax_year,
      status: "pending",
      amount: 0,
      paid: 0,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Referral submitted!", description: `${form.referred_name} has been referred.` });
      setForm(empty);
      setShowForm(false);
      await fetchReferrals(leadId);
    }
    setSaving(false);
  }

  // Totals
  const totalAmt = referrals.reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = referrals.reduce((s, r) => s + (r.paid || 0), 0);
  const balance = totalAmt - totalPaid;

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Share section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-white font-semibold px-5 py-2 rounded-lg transition-all text-sm"
            >
              <Gift className="h-4 w-4" />
              Refer a Friend
            </button>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 hidden sm:block">Share Your Link:</span>
              <button onClick={() => shareVia("facebook")} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-all">
                <Facebook className="h-4 w-4" />
              </button>
              <button onClick={() => shareVia("whatsapp")} className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition-all">
                <Share2 className="h-4 w-4" />
              </button>
              <button onClick={copyLink} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Refer form */}
          {showForm && (
            <div className="mt-5 border-t border-gray-100 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Enter Referral Details</p>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Grid cols={3}>
                <Field label="Friend's Name" required>
                  <Inp value={form.referred_name} onChange={v => setForm(f => ({ ...f, referred_name: v }))} placeholder="Full Name" />
                </Field>
                <Field label="Friend's Email" required>
                  <Inp type="email" value={form.referred_email} onChange={v => setForm(f => ({ ...f, referred_email: v }))} placeholder="Email" />
                </Field>
                <Field label="Tax Year">
                  <Inp value={form.tax_year} onChange={v => setForm(f => ({ ...f, tax_year: v }))} placeholder="2025" />
                </Field>
              </Grid>
              <div className="flex justify-end">
                <button onClick={handleRefer} disabled={saving}
                  className="flex items-center gap-2 bg-[#1e2a4a] text-white font-semibold px-6 py-2 rounded-full text-sm transition-all disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Submit Referral
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Referrals table */}
        <Section title="Referral Details">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e2a4a] text-white">
                  <th className="px-4 py-3 text-left font-medium text-xs">S.No</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">E-mail</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Year</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-xs">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Date</th>
                </tr>
              </thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No referrals yet. Refer a friend to get started!
                    </td>
                  </tr>
                ) : (
                  referrals.map((r, i) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.referred_name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.referred_email}</td>
                      <td className="px-4 py-3 text-gray-600">{r.tax_year}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          r.status === "completed" ? "bg-green-50 text-green-600 border-green-200"
                          : r.status === "paid" ? "bg-blue-50 text-blue-600 border-blue-200"
                          : "bg-yellow-50 text-yellow-600 border-yellow-200"
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">${r.amount || 0}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
                {/* Totals row */}
                <tr className="bg-[#1e2a4a] text-white">
                  <td colSpan={4} />
                  <td className="px-4 py-3 text-xs font-medium">
                    <div>Total - ${totalAmt}</div>
                    <div>Paid - ${totalPaid}</div>
                    <div>Bal - ${balance}</div>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
