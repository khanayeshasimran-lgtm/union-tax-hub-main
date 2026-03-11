import { ReactNode, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { Menu, X } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f4f5f7]">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <div className="hidden md:flex">
        <AppSidebar />
      </div>

      {/* ── Mobile Sidebar Drawer ────────────────────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className="relative flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo center */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">Union</span>
            <span className="text-sm font-light text-blue-600">Tax</span>
          </div>

          <NotificationBell />
        </header>

        {/* Desktop top bar — just the accent line + bell */}
        <div className="hidden md:flex items-center justify-end px-6 py-2 border-b border-gray-100 bg-white/60 backdrop-blur-sm flex-shrink-0">
          <NotificationBell />
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}