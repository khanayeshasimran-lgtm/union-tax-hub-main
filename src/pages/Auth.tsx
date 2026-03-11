import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";

const Illustration = () => (
  <svg viewBox="0 0 400 300" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="200" width="340" height="80" fill="rgba(59,130,246,0.08)" rx="8" />
    <rect x="30" y="180" width="340" height="20" fill="rgba(59,130,246,0.15)" rx="4" />
    <circle cx="120" cy="180" r="35" fill="rgba(139,92,246,0.15)" />
    <rect x="105" y="210" width="30" height="40" fill="rgba(139,92,246,0.15)" rx="4" />
    <circle cx="120" cy="110" r="25" fill="rgba(251,146,60,0.3)" />
    <rect x="100" y="135" width="40" height="50" fill="rgba(59,130,246,0.2)" rx="4" />
    <rect x="75" y="145" width="20" height="45" fill="rgba(251,146,60,0.25)" rx="8" />
    <rect x="145" y="145" width="20" height="45" fill="rgba(251,146,60,0.25)" rx="8" />
    <rect x="200" y="100" width="150" height="100" fill="rgba(30,144,255,0.1)" rx="8" stroke="rgba(59,130,246,0.3)" strokeWidth="2" />
    <rect x="220" y="120" width="20" height="30" fill="rgba(34,197,94,0.6)" rx="2" />
    <rect x="250" y="115" width="20" height="35" fill="rgba(34,197,94,0.6)" rx="2" />
    <rect x="280" y="125" width="20" height="25" fill="rgba(34,197,94,0.6)" rx="2" />
    <rect x="310" y="120" width="20" height="30" fill="rgba(34,197,94,0.6)" rx="2" />
    <polyline points="220,140 240,125 260,135 280,110 300,120 320,105" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="2" />
    <g transform="translate(280,60)">
      <rect x="0" y="0" width="60" height="50" fill="rgba(96,165,250,0.15)" rx="4" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
      <rect x="10" y="30" width="8" height="12" fill="rgba(34,197,94,0.7)" />
      <rect x="22" y="22" width="8" height="20" fill="rgba(34,197,94,0.7)" />
      <rect x="34" y="26" width="8" height="16" fill="rgba(34,197,94,0.7)" />
      <rect x="46" y="20" width="8" height="22" fill="rgba(34,197,94,0.7)" />
    </g>
    <g transform="translate(50,40)">
      <rect x="0" y="0" width="70" height="40" fill="rgba(226,232,240,0.8)" rx="6" stroke="rgba(59,130,246,0.4)" strokeWidth="1" />
      <text x="35" y="15" fontSize="11" fill="rgba(37,99,235,0.9)" textAnchor="middle" fontWeight="bold">+128%</text>
      <text x="35" y="28" fontSize="8" fill="rgba(96,125,139,0.7)" textAnchor="middle">Growth</text>
    </g>
  </svg>
);

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();
  const db = supabase as any;

  const reset = () => { setEmail(""); setPassword(""); setFullName(""); setPhone(""); setError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isLogin) {
      // ── LOGIN ──────────────────────────────────────────────────────────────
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("Incorrect email or password. Please try again.");
      } else {
        navigate("/");
      }

    } else {
      // ── REGISTER (client) ──────────────────────────────────────────────────

      // Detect duplicate: check identities array (Supabase returns fake success for dupes when email confirm is off)
      const { data: authData, error: signupErr } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, role: "client" } }
      });

      if (signupErr) { setError(signupErr.message); setLoading(false); return; }

      const isFakeDupe = authData?.user && (authData.user.identities?.length === 0);
      if (isFakeDupe) { setError("This email is already registered. Please sign in."); setLoading(false); return; }

      const userId = authData?.user?.id;
      if (!userId) { setError("Signup failed. Please try again."); setLoading(false); return; }

      // Get org
      const { data: org } = await db.from("organizations").select("id").limit(1).maybeSingle();
      const orgId = org?.id || null;

      // Round-robin agent assignment
      let agentId: string | null = null;
      try {
        const { data: agents } = await db.from("profiles").select("id").eq("role", "agent").limit(50);
        if (agents?.length) {
          const counts = await Promise.all(agents.map(async (a: any) => {
            const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("assigned_agent_id", a.id);
            return { id: a.id, count: count || 0 };
          }));
          counts.sort((a: any, b: any) => a.count - b.count);
          agentId = counts[0]?.id || null;
        }
      } catch (_) {}

      // Create lead
      const { error: leadErr } = await db.from("leads").insert({
        full_name: fullName,
        email,
        phone_number: phone || null,
        status: "New",
        lead_source: "Client Registration",
        organization_id: orgId,
        assigned_agent_id: agentId,
        client_user_id: userId,
      });

      if (leadErr) {
        console.error("Lead creation failed:", leadErr);
        // Still navigate to portal — lead can be created manually by agent
      }

      // Update profile role to client
      await db.from("profiles").update({ role: "client", full_name: fullName, organization_id: orgId }).eq("id", userId);

      navigate("/portal");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-6xl">
        <div className="rounded-3xl bg-white shadow-2xl overflow-hidden border border-gray-100">
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* Left */}
            <div className="hidden lg:flex flex-col justify-center items-center bg-gradient-to-br from-blue-100 via-blue-50 to-emerald-50 p-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-300/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-300/15 rounded-full blur-3xl" />
              <div className="relative z-10 flex flex-col items-center text-center space-y-8">
                <div className="space-y-2">
                  <h1 className="text-4xl font-bold text-gray-900 leading-tight">Tax Operations</h1>
                  <p className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">Made Simple</p>
                  <p className="text-gray-600 text-sm font-light pt-2">Unified platform for managing leads, filing taxes, and tracking operations</p>
                </div>
                <div className="relative w-full max-w-sm h-64"><Illustration /></div>
                <div className="space-y-3 pt-4">
                  {["Real-time collaboration", "Automated tax workflows", "Bank-level security"].map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-gray-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="text-sm">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="flex flex-col justify-between p-8 sm:p-12 bg-white">
              <div className="space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-gray-900">
                    {isLogin ? "Welcome Back" : "Create Account"}
                  </h2>
                  <p className="text-gray-600">
                    {isLogin ? "Sign in to your account" : "Register to access your tax portal"}
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {!isLogin && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">Full Name</Label>
                        <Input value={fullName} onChange={e => setFullName(e.target.value)}
                          placeholder="John Smith" required
                          className="h-11 bg-gray-50 border-gray-200 rounded-lg" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">Phone Number <span className="text-gray-400 font-normal">(optional)</span></Label>
                        <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                          placeholder="+1 555-0100"
                          className="h-11 bg-gray-50 border-gray-200 rounded-lg" />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">Email Address</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@email.com" required autoComplete="email"
                      className="h-11 bg-gray-50 border-gray-200 rounded-lg" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">Password</Label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••" required minLength={6}
                        className="h-11 bg-gray-50 border-gray-200 rounded-lg pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full h-11 mt-2 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 shadow-md">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isLogin ? "Sign In" : "Create Account"}
                  </button>
                </form>

                <div className="text-center text-sm space-y-1">
                  <p className="text-gray-600">{isLogin ? "New client?" : "Already have an account?"}</p>
                  <button type="button" onClick={() => { setIsLogin(!isLogin); reset(); }}
                    className="font-semibold text-blue-600 hover:text-blue-700">
                    {isLogin ? "Register here" : "Sign in instead"}
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t border-gray-200 mt-8">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-emerald-400 flex items-center justify-center text-white font-bold text-sm shrink-0">SC</div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-700 font-medium">"Got my maximum refund filed in under a week."</p>
                    <p className="text-xs text-gray-500">Sarah Chen, H1B Visa Holder</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}