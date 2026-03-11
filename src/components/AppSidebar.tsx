import {
  LayoutDashboard, Users, Phone, CalendarClock, Briefcase, DollarSign,
  Trophy, FileSearch, Settings, LogOut, Building2, ChevronLeft, FileText,
  ChevronRight, ClipboardList, ClipboardCheck, TrendingDown, Sparkles,
  User, Users2, MapPin, CreditCard, Upload, Calendar, BarChart2,
  Gift, Download, HelpCircle, FolderOpen
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useState } from "react";

const agentMenu = [
  { label: "Dashboard",     icon: LayoutDashboard, to: "/",            end: true },
  { label: "My Leads",      icon: Users,            to: "/leads" },
  { label: "Call Queue",    icon: Phone,            to: "/calls" },
  { label: "Follow-Ups",    icon: CalendarClock,    to: "/followups" },
  { label: "My Cases",      icon: Briefcase,        to: "/cases" },
  { label: "Client Intake", icon: ClipboardList,    to: "/intake" },
  { label: "Estimations",   icon: ClipboardCheck,   to: "/estimations" },
  { label: "Revenue",       icon: DollarSign,       to: "/revenue" },
  { label: "Leaderboard",   icon: Trophy,           to: "/leaderboard" },
  { label: "Documents",     icon: FileText,         to: "/documents" },
];

const adminMenu = [
  { label: "Dashboard",     icon: LayoutDashboard, to: "/",            end: true },
  { label: "All Leads",     icon: Users,            to: "/leads" },
  { label: "Call Queue",    icon: Phone,            to: "/calls" },
  { label: "Follow-Ups",    icon: CalendarClock,    to: "/followups" },
  { label: "Cases",         icon: Briefcase,        to: "/cases" },
  { label: "Client Intake", icon: ClipboardList,    to: "/intake" },
  { label: "Estimations",   icon: ClipboardCheck,   to: "/estimations" },
  { label: "Revenue",       icon: DollarSign,       to: "/revenue" },
  { label: "Leaderboard",   icon: Trophy,           to: "/leaderboard" },
  { label: "Documents",     icon: FileText,         to: "/documents" },
  { label: "Rejections",    icon: TrendingDown,     to: "/rejections" },
  { label: "Audit Trail",   icon: FileSearch,       to: "/audit" },
  { label: "Settings",      icon: Settings,         to: "/settings" },
];

const clientMenu = [
  { label: "Dashboard",              icon: LayoutDashboard, to: "/portal",           end: true },
  { label: "Basic Information",      icon: User,            to: "/portal/taxpayer",  group: true },
  { label: "Taxpayer",               icon: User,            to: "/portal/taxpayer",  sub: true },
  { label: "Spouse",                 icon: Users2,          to: "/portal/spouse",    sub: true },
  { label: "Dependent",              icon: Users2,          to: "/portal/dependent", sub: true },
  { label: "Addresses in Tax Year",  icon: MapPin,          to: "/portal/addresses", sub: true },
  { label: "Bank Details",           icon: CreditCard,      to: "/portal/bank",      sub: true },
  { label: "Upload Tax Documents",   icon: Upload,          to: "/portal/documents" },
  { label: "Schedule for Tax Notes", icon: Calendar,        to: "/portal/schedule" },
  { label: "My Tax Summary",         icon: BarChart2,       to: "/portal/summary" },
  { label: "Referral Details",       icon: Gift,            to: "/portal/referrals" },
  { label: "Download Tax Returns",   icon: Download,        to: "/portal/downloads" },
  { label: "FBAR Questionnaire",     icon: HelpCircle,      to: "/portal/fbar" },
  { label: "Tax Organizer",          icon: FolderOpen,      to: "/portal/organizer" },
];

const ROLE_LABEL: Record<string, string> = {
  super_admin:   "Super Admin",
  admin:         "Admin",
  agent:         "Agent",
  tax_processor: "Tax Processor",
  client:        "Client",
};

const ROLE_GRADIENT: Record<string, { from: string; to: string }> = {
  super_admin:   { from: "from-amber-400",   to: "to-orange-500" },
  admin:         { from: "from-blue-400",    to: "to-emerald-600" },
  agent:         { from: "from-emerald-400", to: "to-teal-600" },
  tax_processor: { from: "from-cyan-400",    to: "to-blue-600" },
  client:        { from: "from-pink-400",    to: "to-rose-500" },
};

const PORTAL_LABEL: Record<string, string> = {
  admin:         "Platform",
  super_admin:   "Platform",
  agent:         "Platform",
  tax_processor: "Platform",
  client:        "Client Portal",
};

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const { role, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [basicInfoOpen, setBasicInfoOpen] = useState(true);

  const isClient = (role as string) === "client";
  const isAdmin  = role === "admin" || role === "super_admin";

  const menu = isAdmin ? adminMenu : isClient ? clientMenu : agentMenu;

  const initials = profile?.full_name
    ?.split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  const roleGradient = ROLE_GRADIENT[role || "agent"] || ROLE_GRADIENT.agent;
  const portalLabel  = PORTAL_LABEL[role || "agent"] || "Platform";

  return (
    <aside
      className={cn(
        "relative flex flex-col h-screen transition-all duration-300 ease-in-out",
        "border-r border-gray-200",
        "bg-gradient-to-b from-slate-950 via-gray-900 to-slate-950",
        "w-[260px] md:w-auto",
        collapsed ? "md:w-[72px]" : "md:w-[260px]"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/5 via-transparent to-emerald-950/5 pointer-events-none" />

      {/* Logo */}
      <div className={cn(
        "relative z-10 flex h-[68px] items-center border-b border-gray-800 backdrop-blur-sm",
        collapsed ? "md:justify-center md:px-2 px-4 gap-3" : "px-4 gap-3"
      )}>
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-xl blur-lg opacity-70" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-emerald-600 shadow-xl shadow-blue-500/40">
            <Building2 className="h-6 w-6 text-white" />
          </div>
        </div>
        <div className={cn("min-w-0 flex-1", collapsed ? "md:hidden" : "")}>
          <div className="flex items-baseline gap-1">
            <p className="text-sm font-bold text-white tracking-tight">Union</p>
            <p className="text-sm font-light text-blue-200">Tax</p>
          </div>
          <p className="text-[9px] text-gray-400 tracking-widest uppercase mt-0.5">{portalLabel}</p>
        </div>
        <Sparkles className="absolute right-2 h-3 w-3 text-blue-400/40" />
      </div>

      {/* Collapse toggle — hidden for client */}
      {!isClient && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute -right-3 top-[82px] z-20 hidden md:flex",
            "h-6 w-6 items-center justify-center rounded-full",
            "bg-white border-2 border-gray-300 shadow-lg",
            "text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200 hover:scale-110"
          )}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      )}

      {/* Nav */}
      <nav className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden py-4 px-2.5 space-y-1 scrollbar-none">
        {menu.map((item) => {

          // ── Client: group header (Basic Information collapsible) ──
          if ("group" in item && item.group) {
            return (
              <button
                key="basic-info-group"
                onClick={() => setBasicInfoOpen(!basicInfoOpen)}
                className={cn(
                  "group w-full flex items-center gap-3 px-3.5 h-10 rounded-lg transition-all duration-200",
                  "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0 text-gray-500 group-hover:text-gray-300" />
                <span className="flex-1 text-left text-sm font-medium text-gray-400">{item.label}</span>
                <ChevronRight className={cn("h-3 w-3 text-gray-500 transition-transform duration-200", basicInfoOpen && "rotate-90")} />
              </button>
            );
          }

          // ── Client: sub-items under Basic Information ──
          if ("sub" in item && item.sub) {
            if (!basicInfoOpen) return null;
            return (
              <NavLink
                key={item.to + item.label}
                to={item.to}
                end
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 pl-9 pr-3 h-9 rounded-lg text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-blue-600/30 to-emerald-600/30 border border-blue-500/50 text-blue-100"
                      : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/50"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 rounded-r-full bg-gradient-to-b from-blue-400 to-emerald-500" />
                    )}
                    <item.icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-blue-300" : "text-gray-500")} />
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          }

          // ── Regular nav item (admin / agent / client top-level) ──
          return (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              end={"end" in item ? (item.end as boolean) : false}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center rounded-lg transition-all duration-200",
                  collapsed ? "md:justify-center md:h-11 md:w-11 md:mx-auto gap-3 px-3.5 h-10" : "gap-3 px-3.5 h-10",
                  isActive
                    ? "bg-gradient-to-r from-blue-600/30 to-emerald-600/30 border border-blue-500/50 text-blue-100 shadow-lg shadow-blue-600/20"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-gradient-to-b from-blue-400 to-emerald-500 shadow-lg shadow-blue-500/60" />
                  )}
                  <div className={cn("relative transition-all duration-200", isActive ? "text-blue-300" : "text-gray-500 group-hover:text-gray-300")}>
                    <item.icon className={cn("transition-all duration-200", collapsed ? "md:h-5 md:w-5 h-4 w-4" : "h-4 w-4")} />
                  </div>
                  <span className={cn(
                    "text-sm font-medium tracking-tight transition-colors duration-200",
                    collapsed ? "md:hidden" : "",
                    isActive ? "text-white font-semibold" : "text-gray-400"
                  )}>
                    {item.label}
                  </span>
                  {/* Tooltip when collapsed */}
                  {collapsed && (
                    <span className={cn(
                      "pointer-events-none absolute left-full ml-3 z-50 hidden md:block",
                      "whitespace-nowrap rounded-lg bg-gradient-to-r from-gray-800 to-slate-900 border border-gray-700",
                      "px-3 py-1.5 text-xs font-medium text-gray-100 shadow-xl backdrop-blur-sm",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    )}>
                      {item.label}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="relative z-10 mx-3 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />

      {/* Footer */}
      <div className={cn("relative z-10 p-3", collapsed ? "md:flex md:justify-center" : "")}>
        {/* Collapsed: icon-only sign out */}
        <div className={cn(collapsed ? "md:block hidden" : "hidden")}>
          <button
            onClick={signOut}
            title="Sign out"
            className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        {/* Expanded: full profile card */}
        <div className={cn(collapsed ? "md:hidden" : "")}>
          <div className="rounded-lg bg-gradient-to-r from-gray-800/50 to-gray-900/30 border border-gray-700 p-3 backdrop-blur-sm hover:border-gray-600 hover:from-gray-800/70 transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                "bg-gradient-to-br text-white text-xs font-bold shadow-lg",
                `${roleGradient.from} ${roleGradient.to}`
              )}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-semibold text-white leading-tight">
                  {profile?.full_name || "User"}
                </p>
                <p className={cn(
                  "text-[10px] font-medium tracking-wide mt-1",
                  "bg-gradient-to-r bg-clip-text text-transparent",
                  `${roleGradient.from} ${roleGradient.to}`
                )}>
                  {ROLE_LABEL[role || "agent"] || "Agent"}
                </p>
              </div>
              <button
                onClick={signOut}
                title="Sign out"
                className="rounded-md p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-all duration-200"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}