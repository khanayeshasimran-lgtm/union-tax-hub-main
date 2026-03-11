import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Phone, User } from "lucide-react";

interface PortalHeaderData {
  accountNo: string;
  status: string;
  contactName: string;
  directNo: string;
}

const STAGE_COLORS: Record<string, string> = {
  "Converted":           "text-blue-600",
  "File Received":       "text-yellow-600",
  "Intake Submitted":    "text-orange-500",
  "Estimation Approved": "text-purple-600",
  "Filing In Progress":  "text-indigo-600",
  "Filed":               "text-green-600",
  "Closed":              "text-gray-500",
};

export function PortalHeader() {
  const { user } = useAuth();
  const [data, setData] = useState<PortalHeaderData | null>(null);

  useEffect(() => {
    if (!user?.email) return;

    async function load() {
      const db = supabase as any;

      // 1. Find lead by email
      const { data: lead } = await db
        .from("leads")
        .select("id, assigned_agent_id")
        .eq("email", user!.email)
        .maybeSingle() as { data: { id: string; assigned_agent_id: string | null } | null };

      if (!lead) return;

      // 2. Find case for this lead
      const { data: caseRow } = await db
        .from("cases")
        .select("id, current_stage")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Find assigned agent profile
      let contactName = "Your Agent";
      let directNo    = "—";

      if (lead.assigned_agent_id) {
        const { data: agent } = await db
          .from("profiles")
          .select("full_name")
          .eq("id", lead.assigned_agent_id)
          .maybeSingle() as { data: { full_name: string } | null };

        if (agent) contactName = agent.full_name;
      }

      setData({
        accountNo:   caseRow?.id?.slice(0, 8).toUpperCase() ?? "—",
        status:      caseRow?.current_stage ?? "Scheduling Pending",
        contactName,
        directNo,
      });
    }

    load();
  }, [user]);

  if (!data) {
    return (
      <div className="w-full bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 animate-pulse">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-44 bg-gray-200 rounded ml-auto" />
      </div>
    );
  }

  const stageColor = STAGE_COLORS[data.status] ?? "text-blue-600";

  return (
    <div className="w-full bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">

        {/* Red accent bar — left border on the whole row */}
        <div className="flex items-center gap-6 border-l-4 border-red-500 pl-4">
          <div>
            <span className="text-gray-500 text-xs">Account No:</span>
            <p className="font-semibold text-blue-600">{data.accountNo}</p>
          </div>

          <div>
            <span className="text-gray-500 text-xs">Account Status:</span>
            <p className={`font-semibold underline cursor-default ${stageColor}`}>
              {data.status}
            </p>
          </div>
        </div>

        {/* Point of contact — pushed to the right */}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-600">
            <User className="h-4 w-4 text-gray-400" />
            <div>
              <span className="text-xs text-gray-400">Point Of Contact:</span>
              <p className="font-semibold text-gray-800 text-sm">{data.contactName}</p>
            </div>
          </div>

          {data.directNo !== "—" && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4 text-gray-400" />
              <div>
                <span className="text-xs text-gray-400">Direct No:</span>
                <p className="font-semibold text-gray-800 text-sm">{data.directNo}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}