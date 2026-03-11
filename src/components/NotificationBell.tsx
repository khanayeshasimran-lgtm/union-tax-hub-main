import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, X, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const TYPE_DOT: Record<string, string> = {
  info:    "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  error:   "bg-red-500",
};

const TYPE_BG: Record<string, string> = {
  info:    "bg-blue-50",
  success: "bg-green-50",
  warning: "bg-yellow-50",
  error:   "bg-red-50",
};

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  /* ── Fetch ─────────────────────────────────────────────────── */
  const fetchNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("notifications" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setNotifications(data);
  };

  /* ── Mount: fetch + subscribe ──────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications-bell-${user.id}`)   // unique channel name per user
      .on(
        "postgres_changes" as any,
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          setNotifications((prev) => [payload.new, ...prev].slice(0, 20));
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event:  "UPDATE",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? { ...n, ...payload.new } : n))
          );
        }
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR") {
          // Fallback: just poll
          fetchNotifications();
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);   // depend on user.id not full user object

  /* ── Close on outside click ────────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Mark one read ─────────────────────────────────────────── */
  const markRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    await supabase
      .from("notifications" as any)
      .update({ read: true })
      .eq("id", id);
  };

  /* ── Mark all read ─────────────────────────────────────────── */
  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications" as any)
      .update({ read: true })
      .in("id", unreadIds);
  };

  /* ── Click notification ────────────────────────────────────── */
  const handleClick = (n: any) => {
    if (!n.read) markRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  /* ── Relative time helper ──────────────────────────────────── */
  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)  return "Just now";
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  < 7)  return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div ref={ref} className="relative">
      {/* ── Bell button ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all duration-200"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown ────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute right-0 top-11 w-80 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
          style={{ zIndex: 9999 }}   // ← high z-index so it floats above everything
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unread > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                  <Bell className="h-5 w-5 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-400">No notifications yet</p>
                <p className="text-xs text-gray-300 mt-1">We'll let you know when something happens</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex gap-3 px-4 py-3 transition-colors group",
                    n.link ? "cursor-pointer hover:bg-gray-50" : "cursor-default",
                    !n.read ? (TYPE_BG[n.type] ?? "bg-blue-50") + "/40" : ""
                  )}
                >
                  {/* Dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    <div className={cn(
                      "h-2 w-2 rounded-full transition-opacity",
                      n.read ? "opacity-30" : "opacity-100",
                      TYPE_DOT[n.type] ?? TYPE_DOT.info
                    )} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs font-semibold leading-snug",
                      n.read ? "text-gray-500" : "text-gray-900"
                    )}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-400">{relativeTime(n.created_at)}</p>
                  </div>

                  {/* Mark read button */}
                  {!n.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      title="Mark as read"
                      className="flex-shrink-0 self-start mt-1 rounded p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5 text-center">
              <button
                onClick={() => { setOpen(false); navigate("/portal/notifications"); }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}