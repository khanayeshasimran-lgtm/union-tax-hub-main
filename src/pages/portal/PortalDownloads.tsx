import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { Download, FileText, Loader2 } from "lucide-react";
import { Section, Loading } from "./PortalTaxpayer";

interface TaxReturn {
  id: string;
  file_name: string;
  file_type: string;
  tax_year: string;
  storage_path: string;
  created_at: string;
}

export default function PortalDownloads() {
  const { user } = useAuth();
  const [returns, setReturns] = useState<TaxReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const db = supabase as any;

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    let caseId: string | null = null;

    // Try lead by email or client_user_id
    try {
      const { data: lead } = await db.from("leads")
        .select("id")
        .or(`email.eq.${user!.email},client_user_id.eq.${user!.id}`)
        .maybeSingle();
      if (lead) {
        const { data: c } = await db.from("cases").select("id")
          .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (c) caseId = c.id;
      }
    } catch (_) {}

    // Fallback: via client_tax_profiles
    if (!caseId) {
      try {
        const { data: profile } = await db.from("client_tax_profiles")
          .select("lead_id").eq("user_id", user!.id).maybeSingle();
        if (profile?.lead_id) {
          const { data: c } = await db.from("cases").select("id")
            .eq("lead_id", profile.lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (c) caseId = c.id;
        }
      } catch (_) {}
    }

    if (caseId) {
      const { data } = await db.from("tax_return_files")
        .select("*").eq("case_id", caseId).order("created_at", { ascending: false });
      setReturns(data || []);
    }
    setLoading(false);
  }

  async function handleDownload(ret: TaxReturn) {
    setDownloading(ret.id);
    const { data } = await supabase.storage.from("client-documents").createSignedUrl(ret.storage_path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = ret.file_name;
      a.click();
    }
    setDownloading(null);
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Section title="Download Tax Returns">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e2a4a] text-white">
                  <th className="px-4 py-3 text-left font-medium text-xs">S.No</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Files</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Tax Year</th>
                  <th className="px-4 py-3 text-left font-medium text-xs">Date & Time</th>
                  <th className="px-4 py-3 text-center font-medium text-xs">Download</th>
                </tr>
              </thead>
              <tbody>
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No records found. Your filed tax returns will appear here once ready.
                    </td>
                  </tr>
                ) : (
                  returns.map((ret, i) => (
                    <tr key={ret.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                          <span className="font-medium text-gray-800 text-xs">{ret.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          ret.file_type === "e-filed"
                            ? "bg-green-50 text-green-600 border-green-200"
                            : "bg-blue-50 text-blue-600 border-blue-200"
                        }`}>
                          {ret.file_type || "e-filed"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ret.tax_year}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(ret.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDownload(ret)} disabled={downloading === ret.id}
                          className="flex items-center gap-1.5 mx-auto bg-[#1e2a4a] hover:bg-[#2d3a5c] text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                          {downloading === ret.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}