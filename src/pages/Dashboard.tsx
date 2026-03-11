import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import AgentDashboard from "./AgentDashboard";
import AdminDashboard from "./AdminDashboard";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const { role, user } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Safety net: if role hasn't resolved in 3 seconds, stop blocking
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Still waiting for user
  if (!user && false) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // User loaded but role not yet — wait up to 3s then default to agent view
  if (!role && !timedOut) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role === "admin" || role === "super_admin") return <AdminDashboard />;
  return <AgentDashboard />;
}