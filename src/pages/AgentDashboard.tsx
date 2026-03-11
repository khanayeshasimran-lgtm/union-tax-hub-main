import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Phone, CalendarClock, DollarSign, TrendingUp, Briefcase } from "lucide-react";

export default function AgentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0,
    followUpsDue: 0,
    openCases: 0,
    monthlyRevenue: 0,
    callsToday: 0,
    conversionRate: 0,
  });
  const [recentLeads, setRecentLeads] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [leadsRes, followupsRes, dispositionsRes, revenueRes] = await Promise.all([
        supabase.from("leads").select("*").eq("assigned_agent_id", user.id),
        supabase.from("followups").select("*").eq("agent_id", user.id).in("status", ["Upcoming", "Overdue"]),
        supabase.from("call_dispositions").select("*").eq("agent_id", user.id).gte("created_at", new Date().toISOString().split("T")[0]),
        supabase.from("revenue_entries").select("amount_usd").eq("agent_id", user.id),
      ]);

      const leads = leadsRes.data || [];
      const converted = leads.filter((l) => l.status === "Converted").length;

      // Bug 5 fix: query cases table for real open cases count
      const casesRes = await supabase
        .from("cases")
        .select("id")
        .in("lead_id", leads.map((l: any) => l.id))
        .neq("current_stage", "Closed");

      const openCases = casesRes.data?.length || 0;

      setStats({
        totalLeads: leads.length,
        followUpsDue: (followupsRes.data || []).length,
        openCases,
        monthlyRevenue: (revenueRes.data || []).reduce((s: number, r: any) => s + Number(r.amount_usd), 0),
        callsToday: (dispositionsRes.data || []).length,
        conversionRate: leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0,
      });

      setRecentLeads(leads.slice(0, 8));
    };
    fetchData();

    const channel = supabase
      .channel("agent-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `assigned_agent_id=eq.${user.id}` }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Dashboard" description="Your daily overview" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="My Leads" value={stats.totalLeads} icon={Users} />
        <KpiCard title="Calls Today" value={stats.callsToday} icon={Phone} />
        <KpiCard title="Follow-Ups Due" value={stats.followUpsDue} icon={CalendarClock} />
        <KpiCard title="Open Cases" value={stats.openCases} icon={Briefcase} />
        <KpiCard title="Revenue (MTD)" value={`$${stats.monthlyRevenue.toLocaleString()}`} icon={DollarSign} />
        <KpiCard title="Conversion Rate" value={`${stats.conversionRate}%`} icon={TrendingUp} />
      </div>

      <div className="kpi-card">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Leads</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Phone</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Attempts</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No leads assigned yet</td></tr>
              ) : (
                recentLeads.map((lead) => (
                  <tr key={lead.id} className="data-table-row">
                    <td className="py-3 font-medium text-foreground">{lead.full_name}</td>
                    <td className="py-3 text-muted-foreground">{lead.phone_number}</td>
                    <td className="py-3"><StatusBadge status={lead.status} /></td>
                    <td className="py-3 text-muted-foreground">{lead.attempt_count}</td>
                    <td className="py-3 text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}