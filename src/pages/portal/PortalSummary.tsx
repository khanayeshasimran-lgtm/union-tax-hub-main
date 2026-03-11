import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { FileBarChart, Clock } from "lucide-react";
import { Loading } from "./PortalTaxpayer";

export default function PortalSummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const db = supabase as any;

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    let caseRow: any = null;

    // Try lead by email or client_user_id
    try {
      const { data: lead } = await db.from("leads")
        .select("id")
        .or(`email.eq.${user!.email},client_user_id.eq.${user!.id}`)
        .maybeSingle();

      if (lead) {
        const { data } = await db.from("cases")
          .select("tax_summary")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        caseRow = data;
      }
    } catch (_) {}

    // Fallback: find case via client_tax_profiles user_id
    if (!caseRow) {
      try {
        const { data: profile } = await db.from("client_tax_profiles")
          .select("lead_id").eq("user_id", user!.id).maybeSingle();
        if (profile?.lead_id) {
          const { data } = await db.from("cases")
            .select("tax_summary")
            .eq("lead_id", profile.lead_id)
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle();
          caseRow = data;
        }
      } catch (_) {}
    }

    setSummary(caseRow?.tax_summary || null);
    setLoading(false);
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
            <FileBarChart className="h-5 w-5 text-blue-500" />
            <h2 className="text-blue-600 font-semibold text-base">TAX SUMMARY</h2>
          </div>
          {summary ? (
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
              {summary}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-600 font-medium">Your Tax Summary is being prepared</p>
              <p className="text-gray-400 text-sm mt-2 max-w-md">
                Your tax summary will appear here within 24 hours once our team completes your return.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}