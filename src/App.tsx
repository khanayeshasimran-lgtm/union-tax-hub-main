import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MFAChallenge } from "@/components/MFAChallenge";
import { useState, useEffect } from "react";

// Existing pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import CallWorkflow from "./pages/CallWorkflow";
import FollowUps from "./pages/FollowUps";
import Cases from "./pages/Cases";
import Revenue from "./pages/Revenue";
import Leaderboard from "./pages/Leaderboard";
import AuditTrail from "./pages/AuditTrail";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Documents from "./pages/Documents";
import ClientIntake from "./pages/ClientIntake";
import Estimations from "./pages/Estimations";
import RejectionAnalytics from "./pages/RejectionAnalytics";

// ── Client Portal pages ──────────────────────────────────────────────────────
import ClientPortal from "./pages/ClientPortal";
import PortalTaxpayer from "./pages/portal/PortalTaxpayer";
import PortalSpouse from "./pages/portal/PortalSpouse";
import PortalDependent from "./pages/portal/PortalDependent";
import PortalAddresses from "./pages/portal/PortalAddresses";
import PortalBank from "./pages/portal/PortalBank";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalSchedule from "./pages/portal/PortalSchedule";
import PortalSummary from "./pages/portal/PortalSummary";
import PortalReferrals from "./pages/portal/PortalReferrals";
import PortalDownloads from "./pages/portal/PortalDownloads";
import PortalFBAR from "./pages/portal/PortalFBAR";
import PortalOrganizer from "./pages/portal/PortalOrganizer";

const queryClient = new QueryClient();

// ─────────────────────────────────────────────────────────────────────────────
// Protected Route
// ─────────────────────────────────────────────────────────────────────────────
function ClientRedirect() {
  const { role, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (role === "client") return <Navigate to="/portal" replace />;
  return null;
}

function ProtectedRoute({ children, label, clientAllowed = false }: { children: React.ReactNode; label: string; clientAllowed?: boolean }) {
  const { user, loading, role } = useAuth();
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.nextLevel === "aal2" && data?.currentLevel === "aal1") {
        supabase.auth.mfa.listFactors().then(({ data: factors }) => {
          const totp = factors?.totp?.[0];
          if (totp) setMfaFactorId(totp.id);
        });
      }
    });
  }, [user]);

  if (loading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!loading && !user) return <Navigate to="/auth" replace />;
  if (mfaFactorId) return <MFAChallenge factorId={mfaFactorId} onSuccess={() => setMfaFactorId(null)} />;
  // Clients can only access portal routes
  if (!loading && role === "client" && !clientAllowed) return <Navigate to="/portal" replace />;

  return (
    <AppLayout>
      <ErrorBoundary label={label}>{children}</ErrorBoundary>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Route
// ─────────────────────────────────────────────────────────────────────────────
function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <ErrorBoundary label="Auth"><Auth /></ErrorBoundary>;
}

// ─────────────────────────────────────────────────────────────────────────────
// App Root
// ─────────────────────────────────────────────────────────────────────────────
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            {/* ── Admin / Agent routes ─────────────────────────────────── */}
            <Route path="/" element={<ProtectedRoute label="Dashboard"><ClientRedirect /><Dashboard /></ProtectedRoute>} />
            <Route path="/leads" element={<ProtectedRoute label="Leads"><Leads /></ProtectedRoute>} />
            <Route path="/calls" element={<ProtectedRoute label="Call Queue"><CallWorkflow /></ProtectedRoute>} />
            <Route path="/followups" element={<ProtectedRoute label="Follow-Ups"><FollowUps /></ProtectedRoute>} />
            <Route path="/cases" element={<ProtectedRoute label="Cases"><Cases /></ProtectedRoute>} />
            <Route path="/intake" element={<ProtectedRoute label="Client Intake"><ClientIntake /></ProtectedRoute>} />
            <Route path="/estimations" element={<ProtectedRoute label="Estimations"><Estimations /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute label="Documents"><Documents /></ProtectedRoute>} />
            <Route path="/revenue" element={<ProtectedRoute label="Revenue"><Revenue /></ProtectedRoute>} />
            <Route path="/leaderboard" element={<ProtectedRoute label="Leaderboard"><Leaderboard /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute label="Audit Trail"><AuditTrail /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute label="Settings"><SettingsPage /></ProtectedRoute>} />
            <Route path="/rejections" element={<ProtectedRoute label="Rejection Analytics"><RejectionAnalytics /></ProtectedRoute>} />

            {/* ── Client Portal routes ─────────────────────────────────── */}
            <Route path="/portal" element={<ProtectedRoute label="Client Portal" clientAllowed><ClientPortal /></ProtectedRoute>} />
            <Route path="/portal/taxpayer" element={<ProtectedRoute label="Taxpayer Info" clientAllowed><PortalTaxpayer /></ProtectedRoute>} />
            <Route path="/portal/spouse" element={<ProtectedRoute label="Spouse Info" clientAllowed><PortalSpouse /></ProtectedRoute>} />
            <Route path="/portal/dependent" element={<ProtectedRoute label="Dependent Info" clientAllowed><PortalDependent /></ProtectedRoute>} />
            <Route path="/portal/addresses" element={<ProtectedRoute label="Addresses" clientAllowed><PortalAddresses /></ProtectedRoute>} />
            <Route path="/portal/bank" element={<ProtectedRoute label="Bank Details" clientAllowed><PortalBank /></ProtectedRoute>} />
            <Route path="/portal/documents" element={<ProtectedRoute label="Upload Documents" clientAllowed><PortalDocuments /></ProtectedRoute>} />
            <Route path="/portal/schedule" element={<ProtectedRoute label="Schedule" clientAllowed><PortalSchedule /></ProtectedRoute>} />
            <Route path="/portal/summary" element={<ProtectedRoute label="Tax Summary" clientAllowed><PortalSummary /></ProtectedRoute>} />
            <Route path="/portal/referrals" element={<ProtectedRoute label="Referrals" clientAllowed><PortalReferrals /></ProtectedRoute>} />
            <Route path="/portal/downloads" element={<ProtectedRoute label="Downloads" clientAllowed><PortalDownloads /></ProtectedRoute>} />
            <Route path="/portal/fbar" element={<ProtectedRoute label="FBAR" clientAllowed><PortalFBAR /></ProtectedRoute>} />
            <Route path="/portal/organizer" element={<ProtectedRoute label="Tax Organizer" clientAllowed><PortalOrganizer /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;