import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useRoasAuth } from "@/lib/roas/auth";
import {
  BarChart3, Users, GraduationCap, AlertTriangle, Wallet,
  RefreshCw, Calculator, Database, CalendarDays, UserCog
} from "lucide-react";

type Item = { to: string; title: string; desc: string; Icon: any; admin?: boolean };

const items: Item[] = [
  { to: "/roas/dashboard", title: "ROAS Dashboard", desc: "Performance & attribution by media buyer", Icon: BarChart3 },
  { to: "/roas/leads", title: "Leads", desc: "Browse all attributed leads", Icon: Users },
  { to: "/roas/enrollments", title: "Enrollments", desc: "Sales mapped to webinars and buyers", Icon: GraduationCap },
  { to: "/roas/manual-review", title: "Manual Review", desc: "Resolve duplicate or unattributed sales", Icon: AlertTriangle },
  { to: "/roas/ad-spend", title: "Ad Spend", desc: "Record and track media spend", Icon: Wallet },
  { to: "/roas/sync", title: "Sync", desc: "Pull the latest data from sources", Icon: RefreshCw },
  { to: "/roas/calculator", title: "Simple Calculator", desc: "Quick standalone ROAS calculator", Icon: Calculator },
  { to: "/roas/setup/data-sources", title: "Data Sources", desc: "Connect Google Sheets feeds", Icon: Database, admin: true },
  { to: "/roas/setup/webinars", title: "Webinars", desc: "Manage webinar cycles & pricing", Icon: CalendarDays, admin: true },
  { to: "/roas/setup/media-buyers", title: "Media Buyers", desc: "Manage buyers and codes", Icon: UserCog, admin: true },
];

export default function RoasHub() {
  const { isAdmin } = useRoasAuth();
  const visible = items.filter(i => !i.admin || isAdmin);
  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ROAS Calculator</h1>
        <p className="text-sm text-muted-foreground">All ROAS attribution tools in one place.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map(({ to, title, desc, Icon }) => (
          <Link key={to} to={to}>
            <Card className="p-5 h-full hover:border-primary hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
