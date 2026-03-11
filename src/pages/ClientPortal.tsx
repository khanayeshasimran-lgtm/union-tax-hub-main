import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { User, Upload, Calendar, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStatus {
  basicInfo: boolean;
  documents: boolean;
  schedule:  boolean;
}

const steps = [
  {
    key:         "basicInfo" as keyof OnboardingStatus,
    number:      "01",
    title:       "BASIC INFORMATION",
    description: "Provide your basic personal information, spouse information (if married) and dependents information (child or any other) if you have.",
    icon:        User,
    to:          "/portal/taxpayer",
    color:       "bg-teal-500",
    numColor:    "text-teal-500",
  },
  {
    key:         "documents" as keyof OnboardingStatus,
    number:      "02",
    title:       "UPLOAD TAX RELATED DOCUMENTS",
    description: "Upload tax related documents such as W2-form, 1099 etc., or any other documents you want to Consider us.",
    icon:        Upload,
    to:          "/portal/documents",
    color:       "bg-amber-500",
    numColor:    "text-amber-500",
  },
  {
    key:         "schedule" as keyof OnboardingStatus,
    number:      "03",
    title:       "SCHEDULE FOR TAX NOTES",
    description: "Pick a time to talk with tax expert, which helps to provide accurate tax return and maximum refund Possible.",
    icon:        Calendar,
    to:          "/portal/schedule",
    color:       "bg-slate-500",
    numColor:    "text-slate-500",
  },
];

export default function ClientPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus>({
    basicInfo: false,
    documents: false,
    schedule:  false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    loadStatus();
  }, [user]);

  async function loadStatus() {
    setLoading(true);
    const db = supabase as any;

    // Try to find lead by email (optional)
    let leadId: string | null = null;
    try {
      const { data: lead } = await db.from("leads").select("id").eq("email", user!.email).maybeSingle();
      if (lead) leadId = lead.id;
    } catch (_) {}

    // 1. Basic info — check by user_id first, fallback to lead_id
    const { data: taxProfile } = await db
      .from("client_tax_profiles")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();

    // Also check by lead_id if no user_id match
    let hasBasicInfo = !!taxProfile;
    if (!hasBasicInfo && leadId) {
      const { data: tp2 } = await db.from("client_tax_profiles").select("id").eq("lead_id", leadId).maybeSingle();
      hasBasicInfo = !!tp2;
    }

    // 2. Documents — check by uploaded_by user_id
    let hasDocuments = false;
    const { data: docs } = await db
      .from("case_documents")
      .select("id")
      .eq("uploaded_by", user!.id)
      .eq("owner_role", "client")
      .limit(1);
    hasDocuments = (docs?.length ?? 0) > 0;

    // If not found by user, try via lead's case
    if (!hasDocuments && leadId) {
      const { data: caseRow } = await supabase.from("cases").select("id").eq("lead_id", leadId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (caseRow) {
        const { data: d2 } = await db.from("case_documents").select("id").eq("case_id", caseRow.id).eq("owner_role", "client").limit(1);
        hasDocuments = (d2?.length ?? 0) > 0;
      }
    }

    // 3. Schedule — check by user_id
    const { data: appt } = await db
      .from("tax_appointments")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();

    let hasSchedule = !!appt;
    if (!hasSchedule && leadId) {
      const { data: a2 } = await db.from("tax_appointments").select("id").eq("lead_id", leadId).maybeSingle();
      hasSchedule = !!a2;
    }

    setStatus({
      basicInfo: hasBasicInfo,
      documents: hasDocuments,
      schedule:  hasSchedule,
    });
    setLoading(false);
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const completedCount = Object.values(status).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Welcome message */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 mb-8">
          <p className="text-gray-800 text-base leading-relaxed">
            Dear{" "}
            <span className="text-blue-600 font-semibold">{profile?.full_name ?? "Valued Client"},</span>
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed">
            Welcome to Union Tax Hub. We thank you for giving us the opportunity to file your Tax Return.
            As our valued client, we retain your confidence by giving you the best service.
          </p>
          <p className="mt-3 text-gray-600 leading-relaxed">
            Please follow the steps below. You can then follow the progress of your tax return
            at each stage thanks to the dashboard in real time.
          </p>

          {/* Progress indicator */}
          {!loading && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / 3) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {completedCount}/3 steps complete
              </span>
            </div>
          )}
        </div>

        {/* 3 Steps */}
        <p className="text-center text-gray-700 font-semibold text-lg mb-6">
          Complete Just{" "}
          <span className="text-blue-600 font-bold text-2xl">3</span>{" "}
          steps below to start your tax return filing
        </p>

        <div className="space-y-4">
          {steps.map((step) => {
            const done = !loading && status[step.key];
            const Icon = step.icon;

            return (
              <button
                key={step.key}
                onClick={() => navigate(step.to)}
                className={cn(
                  "w-full text-left bg-white rounded-xl border shadow-sm overflow-hidden",
                  "hover:shadow-md hover:border-blue-200 transition-all duration-200",
                  done ? "border-green-200" : "border-gray-200"
                )}
              >
                <div className="flex items-stretch">
                  {/* Coloured icon panel */}
                  <div className={cn("flex items-center justify-center w-20 shrink-0", step.color)}>
                    {done
                      ? <CheckCircle2 className="h-8 w-8 text-white" />
                      : <Icon className="h-8 w-8 text-white" />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex items-center gap-5 px-6 py-5 flex-1">
                    {/* Big number */}
                    <span className={cn("text-5xl font-black leading-none tabular-nums", done ? "text-green-400" : step.numColor)}>
                      {done ? "✓" : step.number}
                    </span>

                    <div>
                      <p className={cn("font-bold text-sm tracking-wide", done ? "text-green-600" : "text-gray-800")}>
                        {step.title}
                      </p>
                      <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center pr-5">
                    {done
                      ? <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">Done ✓</span>
                      : <span className="text-xs font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">Pending</span>
                    }
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* All done state */}
        {!loading && completedCount === 3 && (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="font-bold text-green-800 text-lg">All steps complete!</p>
            <p className="text-green-600 text-sm mt-1">
              Our team has everything they need. You'll receive your Tax Summary within 24 hours.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}