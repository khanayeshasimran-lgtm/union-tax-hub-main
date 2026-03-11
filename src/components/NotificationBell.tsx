import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Info, AlertTriangle, XCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type NotifType = "info" | "success" | "warning" | "error";

interface Notification {
  id: string;
  user_id: string;  // ← add this line
  title: string;
  message: string;
  type: NotifType;
  read: boolean;
  link: string | null;
  created_at: string;
}

const TYPE_STYLES: Record<NotifType, { icon: any; iconClass: string; bg: string; border: string }> = {
  info:    { icon: Info,          iconClass: "text-blue-500",   bg: "bg-blue-50",   border: "border-blue-100" },
  success: { icon: CheckCircle2,  iconClass: "text-green-500",  bg: "bg-green-50",  border: "border-green-100" },
  warning: { icon: AlertTriangle, iconClass: "text-amber-500",  bg: "bg-amber-50",  border: "border-amber-100" },
  error:   { icon: XCircle,       iconClass: "text-red-500",    bg: "bg-red-50",    border: "border-red-100" },
};

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const db = supabase as any;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef  = useRef<HTMLButtonElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  // ── Initial load ────────────────────────────────────────────────────────────
  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await db
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  // ── Realtime subscription — new notifications → show toast ─────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          // No server-side filter — filter client-side to avoid realtime RLS issues
        },
        (payload) => {
          const n = payload.new as Notification;

          // Client-side filter — only process notifications for this user
          if (n.user_id !== user.id) return;

          // Prepend to state
          setNotifications(prev => [n, ...prev]);

          // Show in-app toast
          const styles = TYPE_STYLES[n.type as NotifType] || TYPE_STYLES.info;
          const Icon = styles.icon;

          toast({
            duration: 5000,
            // Use the description slot to render a custom layout
            description: (
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", styles.bg)}>
                  <Icon className={cn("h-4 w-4", styles.iconClass)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                  {n.link && (
                    <button
                      onClick={() => { navigate(n.link!); }}
                      className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline"
                    >
                      View →
                    </button>
                  )}
                </div>
              </div>
            ) as any,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Polling fallback — re-fetch every 30s in case realtime misses events ────
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // ── Close panel on outside click ────────────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Mark one as read ────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await db.from("notifications").update({ read: true }).eq("id", id);
  };

  // ── Mark all as read ────────────────────────────────────────────────────────
  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await db.from("notifications").update({ read: true }).eq("user_id", user?.id).eq("read", false);
  };

  // ── Click notification ───────────────────────────────────────────────────────
  const handleClick = async (n: Notification) => {
    await markRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg transition-all",
          open ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        )}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-11 z-[9999] w-[380px] rounded-xl border border-gray-200 bg-white shadow-2xl shadow-black/10 overflow-hidden"
          style={{ position: 'fixed', top: bellRef.current ? bellRef.current.getBoundingClientRect().bottom + 8 : 48, right: 16 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unread > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[440px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                  <Bell className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">All caught up</p>
                <p className="text-xs text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const styles = TYPE_STYLES[n.type as NotifType] || TYPE_STYLES.info;
                const Icon = styles.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50",
                      !n.read && "bg-blue-50/40"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", styles.bg, styles.border)}>
                      <Icon className={cn("h-4 w-4", styles.iconClass)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm leading-tight", n.read ? "font-normal text-gray-700" : "font-semibold text-gray-900")}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                          {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 leading-snug line-clamp-2">{n.message}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-gray-400">{notifications.length} total notifications</p>
              <button
                onClick={async () => {
                  const ids = notifications.map(n => n.id);
                  if (ids.length > 0) {
                    await db.from("notifications").delete().in("id", ids);
                    setNotifications([]);
                  }
                }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}