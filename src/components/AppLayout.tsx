import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { initials, formatDateLong } from "@/lib/format";
import { Search, Bell, LogOut } from "lucide-react";
import { ReactNode } from "react";

const Icon = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
    {children ?? <path d={d} />}
  </svg>
);

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/announcements": "Announcements",
  "/roas": "ROAS Calculator",
  "/roas-calculator": "ROAS Calculator",
  "/search": "Student Search",
  "/leadflow": "Daily Lead Flow",
  "/reports": "Reports & History",
  "/lead-qualifier": "Lead Qualifier",
  "/crm": "Calling CRM",
  "/crm/overview": "CRM Overview",
  "/team": "Team Directory",
  "/admin": "Admin Panel",
};

const NavItem = ({ to, children, badge }: { to: string; children: ReactNode; badge?: boolean }) => {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <NavLink to={to} data-active={active} className="nav-item">
      {children}
      {badge && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />}
    </NavLink>
  );
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, loginTime, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const title = PAGE_TITLES[loc.pathname] ?? "";

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
          <NavItem to="/">
            <Icon><><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></></Icon>
            Dashboard
          </NavItem>
          <NavItem to="/announcements" badge>
            <Icon><><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></></Icon>
            Announcements
          </NavItem>

          <span className="block uppercase font-sans text-[9px] tracking-[0.15em] text-[hsl(var(--muted-light))] px-3 mb-[5px] mt-5">Tools</span>
          <NavItem to="/roas-calculator">
            <Icon d="M2 8h3l2-5 2 10 2-5h3" />
            ROAS Calculator
          </NavItem>
          <NavItem to="/search">
            <Icon><><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></></Icon>
            Student Search
          </NavItem>
          <NavItem to="/leadflow">
            <Icon d="M2 12l4-4 3 3 5-6" />
            Daily Lead Flow
          </NavItem>
          <NavItem to="/lead-qualifier">
            <Icon><><path d="M3 3h10v10H3z"/><path d="M5 7h6M5 9h4"/></></Icon>
            Lead Qualifier
          </NavItem>
          <NavItem to="/crm">
            <Icon><><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M2 14c0-2 1.5-3 3-3s3 1 3 3M8 14c0-2 1.5-3 3-3s3 1 3 3"/></></Icon>
            Calling CRM
          </NavItem>

          <span className="block uppercase font-sans text-[9px] tracking-[0.15em] text-[hsl(var(--muted-light))] px-3 mb-[5px] mt-5">People</span>
          <NavItem to="/team">
            <Icon><><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5"/></></Icon>
            Team Directory
          </NavItem>
          {isAdmin && (
            <>
              <NavItem to="/admin">
                <Icon d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5 6.5 4z" />
                Admin Panel
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
            <button className="w-8 h-8 border border-line rounded-md bg-white flex items-center justify-center text-muted-foreground hover:text-black hover:border-[#bbb] transition-colors">
              <Bell className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <main className="flex-1 p-10">{children}</main>
      </div>
    </div>
  );
}
