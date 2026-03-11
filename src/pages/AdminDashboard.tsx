import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import {
  Users, DollarSign, Briefcase, PhoneOff,
  TrendingUp, AlertTriangle, ArrowRight, Clock
} from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalLeads: 0, convertedLeads: 0, notAnswered: 0,
    monthlyRevenue: 0, activeCases: 0, overdueFollowups: 0,
  });
  const [funnel, setFunnel] = useState<any>(null);
  const [bottlenecks, setBottlenecks] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [leadsRes, revenueRes, casesRes, followupsRes, funnelRes, bottleneckRes] = await Promise.all([
        supabase.from("leads").select("status"),
        supabase.from("revenue_entries").select("amount_usd, payment_date"),
        supabase.from("cases").select("current_stage"),
        supabase.from("followups").select("status").eq("status", "Overdue"),
        supabase.from("funnel_analytics").select("*").single(),
        supabase.from("pipeline_bottlenecks").select("*"),
      ]);

      const leads = leadsRes.data || [];
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthlyRev = (revenueRes.data || [])
        .filter((r: any) => r.payment_date >= monthStart)
        .reduce((s: number, r: any) => s + Number(r.amount_usd), 0);

      setStats({
        totalLeads: leads.length,
        convertedLeads: leads.filter((l) => l.status === "Converted").length,
        notAnswered: leads.filter((l) => l.status === "Not Answered").length,
        monthlyRevenue: monthlyRev,
        activeCases: (casesRes.data || []).filter((c: any) => c.current_stage !== "Closed").length,
        overdueFollowups: (followupsRes.data || []).length,
      });

      setFunnel(funnelRes.data);
      setBottlenecks(bottleneckRes.data || []);
    };
    fetchData();
  }, []);

  const convRate = stats.totalLeads > 0 ? Math.round((stats.convertedLeads / stats.totalLeads) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Admin Dashboard" description="Organization overview" />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Total Leads" value={stats.totalLeads} icon={Users} />
        <KpiCard title="Conversion Rate" value={`${convRate}%`} icon={TrendingUp} />
        <KpiCard title="Not Answered" value={stats.notAnswered} icon={PhoneOff} />
        <KpiCard title="Revenue (MTD)" value={`$${stats.monthlyRevenue.toLocaleString()}`} icon={DollarSign} />
        <KpiCard title="Active Cases" value={stats.activeCases} icon={Briefcase} />
        <KpiCard title="Overdue Follow-Ups" value={stats.overdueFollowups} icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lead Distribution */}
        <div className="kpi-card">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Lead Distribution</h3>
          <p className="text-xs text-muted-foreground">
            {stats.convertedLeads} converted · {stats.notAnswered} not answered · {stats.totalLeads - stats.convertedLeads - stats.notAnswered} other
          </p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted">
            {stats.totalLeads > 0 && (
              <>
                <div className="bg-green-500" style={{ width: `${(stats.convertedLeads / stats.totalLeads) * 100}%` }} />
                <div className="bg-red-400" style={{ width: `${(stats.notAnswered / stats.totalLeads) * 100}%` }} />
              </>
            )}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span><span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1" />Converted</span>
            <span><span className="inline-block h-2 w-2 rounded-full bg-red-400 mr-1" />Not Answered</span>
            <span><span className="inline-block h-2 w-2 rounded-full bg-muted mr-1" />Other</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="kpi-card">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Quick Actions</h3>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            <p>• {stats.overdueFollowups} overdue follow-ups need attention</p>
            <p>• {stats.notAnswered} leads in rotation queue</p>
            <p>• {stats.activeCases} active cases in pipeline</p>
          </div>
        </div>
      </div>

      {/* Funnel Analytics */}
      {funnel && (
        <div className="kpi-card">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Lead → Revenue Funnel</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "Total Leads", value: funnel.total_leads, color: "bg-blue-500" },
              { label: "Cases Created", value: funnel.total_cases, color: "bg-indigo-500" },
              { label: "Payments", value: funnel.total_revenue_entries, color: "bg-green-500" },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="text-center">
                  <div className={`${step.color} text-white rounded-lg px-4 py-3 min-w-[100px]`}>
                    <p className="text-xl font-bold">{step.value || 0}</p>
                    <p className="text-xs opacity-90">{step.label}</p>
                  </div>
                  {i > 0 && arr[i - 1].value > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.round((step.value / arr[i - 1].value) * 100)}% rate
                    </p>
                  )}
                </div>
                {i < arr.length - 1 && <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Bottlenecks */}
      {bottlenecks.length > 0 && (
        <div className="kpi-card">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Pipeline Bottlenecks</h3>
          <p className="mb-3 text-xs text-muted-foreground">Stages sorted by average time spent</p>
          <div className="space-y-3">
            {bottlenecks.map((b: any) => {
              const avgDays = Math.round(b.avg_days_in_stage || 0);
              const isBottleneck = avgDays > 7;
              return (
                <div key={b.current_stage} className="flex items-center gap-3">
                  <div className="w-36 flex-shrink-0">
                    <p className="text-xs font-medium text-foreground truncate">{b.current_stage}</p>
                    <p className="text-xs text-muted-foreground">{b.total_cases} cases</p>
                  </div>
                  <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${isBottleneck ? "bg-red-500" : "bg-primary"}`}
                      style={{ width: `${Math.min(avgDays * 5, 100)}%` }}
                    />
                  </div>
                  <div className={`flex items-center gap-1 text-xs w-16 flex-shrink-0 ${isBottleneck ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                    <Clock className="h-3 w-3" />{avgDays}d avg
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}