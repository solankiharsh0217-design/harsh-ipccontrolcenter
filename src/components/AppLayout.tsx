import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { initials, formatDateLong } from "@/lib/format";
import { Search, Bell, LogOut } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Icon = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
    {children ?? <path d={d} />}
  </svg>
);

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/founder-dashboard": "Founder Dashboard",
  "/announcements": "Announcements",
  "/roas": "ROAS Calculator",
  "/roas-calculator": "ROAS Calculator",
  "/search": "Student Search",
  "/daily-lead-reporting": "Daily Lead Reporting",
  "/reports": "Reports & History",
  "/lead-qualifier": "Lead Qualifier",
  "/crm": "Calling CRM",
  "/crm/overview": "CRM Overview",
   "/paid-pipeline": "Paid Pipeline",
  "/crm/paid-pipeline": "Paid Pipeline",
  "/paid-pipeline/access-readiness": "Access Readiness",
  "/follow-up-command-center": "Follow-Up Command Center",
  "/follow-up-board": "Follow-up Board",
  "/payment-recovery": "Payment Recovery",
  "/operations-crm": "Operations CRM",
  "/webinar-performance": "Webinar Performance",
  "/team": "Team Directory",
  "/admin": "Admin Panel",
  "/master-data": "Master Data",
  "/master-settings": "Master Settings",
  "/profit-statement": "Profit Statement",
  "/notifications": "Notifications",
  "/revenue-command-center": "Revenue Command Center",
  "/analytics-center": "Analytics Center",
  "/admin-center": "Admin Center",
  "/invoices": "Invoices",
  "/admin-center/item-catalog": "Invoice Item Catalog",
  "/admin-center/tax-codes": "SAC / HSN Master",
};

const NavItem = ({ to, children, badge, show = true }: { to: string; children: ReactNode; badge?: boolean; show?: boolean }) => {
  const loc = useLocation();
  if (!show) return null;
  const active = loc.pathname === to;
  return (
    <NavLink to={to} data-active={active} className="nav-item">
      {children}
      {badge && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />}
    </NavLink>
  );
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, hasModule, loginTime, signOut, user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const title = PAGE_TITLES[loc.pathname] ?? "";
  const [unread, setUnread] = useState(0);

  const canSeeNotifications = isAdmin || hasModule("notifications");

  useEffect(() => {
    if (!user || !canSeeNotifications) { setUnread(0); return; }
    let active = true;
    const load = async () => {
      try {
        const { count } = await (supabase as any)
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_user_id", user.id)
          .eq("status", "unread")
          .eq("is_deleted", false);
        if (active) setUnread(count ?? 0);
      } catch { /* noop */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { active = false; clearInterval(t); };
  }, [user, canSeeNotifications, loc.pathname]);

  const handleSignOut = async () => {
    await signOut();
    nav("/login");
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <nav className="w-[228px] bg-white border-r border-line flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="px-6 pt-[30px] pb-6 border-b border-line">
          <div className="flex items-center gap-[11px]">
            <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center flex-shrink-0">
              <span className="font-serif text-[11px] text-gold tracking-wider font-medium">IPC</span>
            </div>
            <div>
              <div className="font-serif text-sm font-medium text-black leading-tight">India Photographers Club</div>
              <div className="font-sans text-[9px] text-muted-foreground tracking-[0.15em] uppercase mt-[3px]">Control Center</div>
            </div>
          </div>
        </div>

        <div className="px-3 py-[18px] flex-1">
          <span className="block uppercase font-sans text-[9px] tracking-[0.15em] text-[hsl(var(--muted-light))] px-3 mb-[5px]">Overview</span>
          <NavItem to="/" show={hasModule("dashboard")}>
            <Icon><><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></></Icon>
            Dashboard
          </NavItem>
          <NavItem to="/announcements" badge show={hasModule("announcements")}>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></></Icon>
            Announcements
          </NavItem>
          <NavItem to="/notifications" show={canSeeNotifications}>
            <Icon><><path d="M3 12h10M5 12V7a3 3 0 016 0v5M7 14a1 1 0 002 0"/></></Icon>
            Notifications
          </NavItem>

          <span className="block uppercase font-sans text-[9px] tracking-[0.15em] text-[hsl(var(--muted-light))] px-3 mb-[5px] mt-5">Tools</span>
          <NavItem to="/roas-calculator" show={hasModule("roas")}>
            <Icon d="M2 8h3l2-5 2 10 2-5h3" />
            ROAS Calculator
          </NavItem>
          <NavItem to="/search" show={hasModule("search")}>
            <Icon><><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></></Icon>
            Student Search
          </NavItem>
          <NavItem to="/daily-lead-reporting" show={hasModule("daily-reporting")}>
            <Icon d="M2 12l4-4 3 3 5-6" />
            Daily Reporting
          </NavItem>
          <NavItem to="/reports" show={hasModule("reports")}>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></></Icon>
            Report History
          </NavItem>
          <NavItem to="/lead-qualifier" show={hasModule("lead-qualifier")}>
            <Icon><><path d="M3 3h10v10H3z"/><path d="M5 7h6M5 9h4"/></></Icon>
            Lead Qualifier
          </NavItem>
          <NavItem to="/crm" show={hasModule("crm") || hasModule("calling_crm")}>
            <Icon><><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M2 14c0-2 1.5-3 3-3s3 1 3 3M8 14c0-2 1.5-3 3-3s3 1 3 3"/></></Icon>
            Calling CRM
          </NavItem>
          {/* For admins these live inside Revenue/Admin Centers to keep the sidebar minimal.
              They appear directly only for team members that have explicit module access. */}
          <NavItem to="/paid-pipeline" show={!isAdmin && (hasModule("paid-pipeline") || hasModule("paid_pipeline"))}>
            <Icon d="M2 4h12v8H2z" />
            Paid Pipeline
          </NavItem>
          <NavItem to="/paid-pipeline/access-readiness" show={isAdmin || hasModule("paid-pipeline") || hasModule("paid_pipeline")}>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-5"/></></Icon>
            Access Readiness
          </NavItem>
          <NavItem to="/follow-up-board" show={isAdmin || hasModule("follow_up_command_center") || hasModule("crm") || hasModule("calling_crm")}>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></></Icon>
            Follow-up Board
          </NavItem>
          <NavItem to="/follow-up-command-center" show={!isAdmin && hasModule("follow_up_command_center")}>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></></Icon>
            Follow-Up Center
          </NavItem>
          <NavItem to="/payment-recovery" show={!isAdmin && hasModule("payment_recovery")}>
            <Icon d="M2 8h12M5 4l-3 4 3 4M11 4l3 4-3 4" />
            Payment Recovery
          </NavItem>
          <NavItem to="/operations-crm" show={!isAdmin && hasModule("operations_crm")}>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-5"/></></Icon>
            Operations CRM
          </NavItem>

          {isAdmin && (
            <>
              <span className="block uppercase font-sans text-[9px] tracking-[0.15em] text-[hsl(var(--muted-light))] px-3 mb-[5px] mt-5">Centers</span>
              <NavItem to="/revenue-command-center">
                <Icon><><path d="M2 4h12v8H2z"/><path d="M2 7h12M5 10h2"/></></Icon>
                Revenue Center
              </NavItem>
              <NavItem to="/invoices">
                <Icon><><path d="M3 1h8l2 2v12H3z"/><path d="M5 5h6M5 8h6M5 11h4"/></></Icon>
                Invoices
              </NavItem>
              <NavItem to="/analytics-center">
                <Icon d="M2 13l3-4 3 2 5-7" />
                Analytics Center
              </NavItem>
              <NavItem to="/admin-center">
                <Icon d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5 6.5 4z" />
                Admin Center
              </NavItem>
            </>
          )}
        </div>

        <div className="px-3 py-[14px] border-t border-line">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-off">
            <div className="w-[30px] h-[30px] rounded-full bg-black flex items-center justify-center font-serif text-[11px] text-gold font-medium flex-shrink-0">
              {initials(profile?.full_name ?? "U")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-serif text-[15px] font-medium text-black leading-none truncate">{profile?.full_name ?? "—"}</div>
              <div className="font-sans text-[10px] text-muted-foreground mt-0.5 truncate">{profile?.role ?? ""}</div>
            </div>
            {loginTime && <div className="font-sans text-[10px] text-muted-foreground whitespace-nowrap">{loginTime}</div>}
          </div>
          <button onClick={handleSignOut} className="nav-item mt-2">
            <LogOut className="!w-3.5 !h-3.5 opacity-40" />
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <div className="h-14 border-b border-line flex items-center justify-between px-10 bg-white sticky top-0 z-50">
          <div className="font-serif text-[19px] font-normal text-black">{title}</div>
          <div className="flex items-center gap-2.5">
            <div className="font-sans text-xs text-muted-foreground mr-1.5">{formatDateLong()}</div>
            <button className="w-8 h-8 border border-line rounded-md bg-white flex items-center justify-center text-muted-foreground hover:text-black hover:border-[#bbb] transition-colors">
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => canSeeNotifications && nav("/notifications")}
              disabled={!canSeeNotifications}
              className="relative w-8 h-8 border border-line rounded-md bg-white flex items-center justify-center text-muted-foreground hover:text-black hover:border-[#bbb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#B91C1C] text-white text-[9px] font-medium flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          </div>
        </div>
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
