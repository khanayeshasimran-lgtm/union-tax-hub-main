import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PortalHeader } from "@/components/PortalHeader";
import { User, Upload, Calendar, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStatus {
  basicInfo: boolean;
  documents: boolean;
  schedule: boolean;
}

const steps = [
  {
    key: "basicInfo" as keyof OnboardingStatus,
    number: 1,
    label: "Basic Info",
    title: "Basic Information",
    description: "Provide your personal details, spouse information (if married), and any dependents.",
    icon: User,
    to: "/portal/taxpayer",
  },
  {
    key: "documents" as keyof OnboardingStatus,
    number: 2,
    label: "Documents",
    title: "Upload Documents",
    description: "Upload W-2s, 1099s, and any other tax-related documents you want us to review.",
    icon: Upload,
    to: "/portal/documents",
  },
  {
    key: "schedule" as keyof OnboardingStatus,
    number: 3,
    label: "Schedule",
    title: "Schedule a Call",
    description: "Pick a time to speak with our team — we'll ensure you get the maximum refund possible.",
    icon: Calendar,
    to: "/portal/schedule",
  },
];

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  .portal-light * { box-sizing: border-box; }
  .portal-light { font-family: 'Plus Jakarta Sans', sans-serif; }

  @keyframes fadeUp {
    from { opacity:0; transform:translateY(14px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes popIn {
    0%   { transform: scale(0.5); opacity:0; }
    70%  { transform: scale(1.15); }
    100% { transform: scale(1);   opacity:1; }
  }

  .fade-up { animation: fadeUp 0.5s ease forwards; opacity:0; }
  .d1 { animation-delay: 0.05s; }
  .d2 { animation-delay: 0.15s; }
  .d3 { animation-delay: 0.25s; }
  .d4 { animation-delay: 0.35s; }
  .d5 { animation-delay: 0.45s; }
  .d6 { animation-delay: 0.55s; }

  .step-node {
    width: 46px; height: 46px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 1rem;
    position: relative; z-index: 2;
    flex-shrink: 0;
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
  }
  .step-node.done {
    background: #2563eb; color: white;
    box-shadow: 0 0 0 5px rgba(37,99,235,0.14);
    animation: popIn 0.35s ease forwards;
  }
  .step-node.active {
    background: white; color: #2563eb;
    border: 2.5px solid #2563eb;
    box-shadow: 0 0 0 5px rgba(37,99,235,0.12);
  }
  .step-node.pending {
    background: white; color: #94a3b8;
    border: 2.5px solid #cbd5e1;
  }

  .connector {
    flex: 1; height: 3px;
    background: #e2e8f0;
    position: relative; z-index: 1;
    border-radius: 2px; overflow: hidden;
  }
  .connector-fill {
    height: 100%; background: #2563eb;
    border-radius: 2px;
    transition: width 0.7s cubic-bezier(0.34,1.2,0.64,1);
  }

  .step-card {
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 16px;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    overflow: hidden;
  }
  .step-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(37,99,235,0.09);
    border-color: #bfdbfe;
  }
  .step-card.done  { border-color: #bbf7d0; background: #f0fdf4; }
  .step-card.active { border-color: #bfdbfe; box-shadow: 0 4px 18px rgba(37,99,235,0.09); }

  .card-icon {
    width: 44px; height: 44px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: transform 0.2s;
  }
  .step-card:hover .card-icon { transform: scale(1.1) rotate(-4deg); }

  .badge {
    font-size: 0.67rem; font-weight: 700;
    letter-spacing: 0.07em; text-transform: uppercase;
    border-radius: 99px; padding: 2px 9px;
  }
  .b-done    { background:#dcfce7; color:#16a34a; }
  .b-next    { background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; }
  .b-pending { background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; }

  .arrow-btn {
    width:32px; height:32px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    background:#f1f5f9; border:1px solid #e2e8f0;
    transition:all 0.18s; flex-shrink:0;
  }
  .step-card:hover .arrow-btn { background:#2563eb; border-color:#2563eb; }
  .step-card:hover .arrow-btn svg { color:white !important; }
`;

export default function ClientPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus>({
    basicInfo: false,
    documents: false,
    schedule: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    loadStatus();
  }, [user]);

  async function loadStatus() {
    setLoading(true);
    const db = supabase as any;
    let leadId: string | null = null;
    try {
      const { data: lead } = await db.from("leads").select("id").eq("email", user!.email).maybeSingle();
      if (lead) leadId = lead.id;
    } catch (_) {}

    const { data: taxProfile } = await db.from("client_tax_profiles").select("id").eq("user_id", user!.id).maybeSingle();
    let hasBasicInfo = !!taxProfile;
    if (!hasBasicInfo && leadId) {
      const { data: tp2 } = await db.from("client_tax_profiles").select("id").eq("lead_id", leadId).maybeSingle();
      hasBasicInfo = !!tp2;
    }

    let hasDocuments = false;
    const { data: docs } = await db.from("case_documents").select("id").eq("uploaded_by", user!.id).eq("owner_role", "client").limit(1);
    hasDocuments = (docs?.length ?? 0) > 0;
    if (!hasDocuments && leadId) {
      const { data: caseRow } = await supabase.from("cases").select("id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (caseRow) {
        const { data: d2 } = await db.from("case_documents").select("id").eq("case_id", caseRow.id).eq("owner_role", "client").limit(1);
        hasDocuments = (d2?.length ?? 0) > 0;
      }
    }

    const { data: appt } = await db.from("tax_appointments").select("id").eq("user_id", user!.id).maybeSingle();
    let hasSchedule = !!appt;
    if (!hasSchedule && leadId) {
      const { data: a2 } = await db.from("tax_appointments").select("id").eq("lead_id", leadId).maybeSingle();
      hasSchedule = !!a2;
    }

    setStatus({ basicInfo: hasBasicInfo, documents: hasDocuments, schedule: hasSchedule });
    setLoading(false);
  }

  const completedCount = Object.values(status).filter(Boolean).length;
  const allDone = !loading && completedCount === 3;
  const activeIdx = loading ? -1 : steps.findIndex(s => !status[s.key]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="portal-light min-h-screen" style={{ background: "#f0f4f8" }}>
        <PortalHeader />

        <div style={{ maxWidth: 660, margin: "0 auto", padding: "36px 20px 80px" }}>

          {/* ── Welcome card ─────────────────────────────────────── */}
          <div className="fade-up d1" style={{
            background: "white", borderRadius: 20,
            border: "1.5px solid #e2e8f0", padding: "26px 30px",
            marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap",
          }}>
            <div>
              <p style={{ margin:0, fontSize:"0.72rem", color:"#94a3b8", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase" }}>
                Union Tax Hub · Client Portal
              </p>
              <h1 style={{ margin:"6px 0 0", fontSize:"1.5rem", fontWeight:800, color:"#0f172a", lineHeight:1.2 }}>
                Welcome, <span style={{ color:"#2563eb" }}>{profile?.full_name?.split(" ")[0] ?? "there"} 👋</span>
              </h1>
              <p style={{ margin:"7px 0 0", color:"#64748b", fontSize:"0.86rem", lineHeight:1.6, maxWidth:380 }}>
                Complete three quick steps to begin your tax return filing.
              </p>
            </div>

            {!loading && (
              <div style={{
                background: allDone ? "#f0fdf4" : "#eff6ff",
                border: `1.5px solid ${allDone ? "#bbf7d0" : "#bfdbfe"}`,
                borderRadius: 14, padding: "10px 18px", textAlign: "center", flexShrink: 0,
              }}>
                <p style={{ margin:0, fontWeight:800, fontSize:"1.5rem", lineHeight:1, color: allDone ? "#16a34a" : "#2563eb" }}>
                  {completedCount}/3
                </p>
                <p style={{ margin:"3px 0 0", fontSize:"0.68rem", fontWeight:600, color: allDone ? "#16a34a" : "#3b82f6" }}>
                  {allDone ? "All done!" : "complete"}
                </p>
              </div>
            )}
          </div>

          {/* ── Horizontal tracker ───────────────────────────────── */}
          <div className="fade-up d2" style={{
            background: "white", borderRadius: 20,
            border: "1.5px solid #e2e8f0", padding: "26px 32px 22px",
            marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          }}>
            {/* Nodes row */}
            <div style={{ display:"flex", alignItems:"center" }}>
              {steps.map((step, idx) => {
                const done = !loading && status[step.key];
                const isActive = !loading && idx === activeIdx;
                return (
                  <div key={step.key} style={{ display:"contents" }}>
                    <div
                      className={cn("step-node", done ? "done" : isActive ? "active" : "pending")}
                      onClick={() => navigate(step.to)}
                      title={`Go to ${step.title}`}
                    >
                      {done ? <CheckCircle2 size={21} strokeWidth={2.5} /> : step.number}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="connector">
                        <div className="connector-fill" style={{ width: done ? "100%" : "0%" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Labels row */}
            <div style={{ display:"flex", marginTop:10 }}>
              {steps.map((step, idx) => {
                const done = !loading && status[step.key];
                const isActive = !loading && idx === activeIdx;
                // Distribute labels evenly under nodes
                const isLast = idx === steps.length - 1;
                return (
                  <div
                    key={step.key}
                    style={{
                      flex: isLast ? "0 0 46px" : 1,
                      paddingRight: isLast ? 0 : 0,
                    }}
                  >
                    <p style={{
                      margin:0, fontSize:"0.75rem", fontWeight:700,
                      color: done ? "#2563eb" : isActive ? "#2563eb" : "#94a3b8",
                    }}>
                      {step.label}
                    </p>
                    <p style={{ margin:"1px 0 0", fontSize:"0.62rem", fontWeight:600,
                      color: done ? "#22c55e" : isActive ? "#60a5fa" : "#cbd5e1",
                    }}>
                      {done ? "✓ Done" : isActive ? "Up next" : "Pending"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Step detail cards ────────────────────────────────── */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {steps.map((step, idx) => {
              const done = !loading && status[step.key];
              const isActive = !loading && idx === activeIdx;
              const Icon = step.icon;

              return (
                <div
                  key={step.key}
                  className={cn("step-card fade-up", `d${idx + 3}`, done ? "done" : isActive ? "active" : "")}
                  onClick={() => navigate(step.to)}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:14, padding:"18px 22px" }}>
                    {/* Icon */}
                    <div className="card-icon" style={{
                      background: done ? "#dcfce7" : isActive ? "#eff6ff" : "#f8fafc",
                      border: `1.5px solid ${done ? "#bbf7d0" : isActive ? "#bfdbfe" : "#e2e8f0"}`,
                    }}>
                      {done
                        ? <CheckCircle2 size={21} style={{ color:"#16a34a" }} />
                        : <Icon size={21} style={{ color: isActive ? "#2563eb" : "#94a3b8" }} />
                      }
                    </div>

                    {/* Text */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:"0.93rem", color: done ? "#166534" : "#0f172a" }}>
                          {step.title}
                        </span>
                        <span className={cn("badge", done ? "b-done" : isActive ? "b-next" : "b-pending")}>
                          {done ? "Completed" : isActive ? "Up next" : "Pending"}
                        </span>
                      </div>
                      <p style={{ margin:0, fontSize:"0.79rem", color:"#64748b", lineHeight:1.5 }}>
                        {step.description}
                      </p>
                    </div>

                    {/* Step label + arrow */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                      <span style={{
                        fontSize:"0.62rem", fontWeight:800, letterSpacing:"0.1em",
                        textTransform:"uppercase",
                        color: done ? "#16a34a" : isActive ? "#2563eb" : "#cbd5e1",
                      }}>
                        Step {String(step.number).padStart(2, "0")}
                      </span>
                      <div className="arrow-btn">
                        <ArrowRight size={13} style={{ color:"#64748b" }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── All done ─────────────────────────────────────────── */}
          {allDone && (
            <div className="fade-up d6" style={{
              marginTop:20,
              background:"linear-gradient(135deg,#f0fdf4,#eff6ff)",
              border:"1.5px solid #bbf7d0",
              borderRadius:20, padding:"28px 30px", textAlign:"center",
            }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>🎉</div>
              <h3 style={{ margin:"0 0 6px", fontWeight:800, fontSize:"1.15rem", color:"#0f172a" }}>
                All steps complete!
              </h3>
              <p style={{ margin:0, color:"#16a34a", fontSize:"0.86rem", fontWeight:500, lineHeight:1.6 }}>
                Our team has everything they need to file your return.<br />
                Expect your <strong>Tax Summary within 24 hours</strong>.
              </p>
              <div style={{
                display:"inline-flex", alignItems:"center", gap:6,
                marginTop:16, background:"white",
                border:"1.5px solid #bbf7d0", borderRadius:99,
                padding:"8px 18px", fontSize:"0.78rem", color:"#16a34a", fontWeight:700,
              }}>
                <Sparkles size={13} />
                Sit back &amp; relax — we've got this
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}