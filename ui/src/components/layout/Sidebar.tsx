import type React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Bell, Activity, Cpu, BookOpen,
  Users, Settings, Map, Shield, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { useAlertStore } from "@/store/alertStore";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
}

const NAV: NavItem[] = [
  { to: "/",        label: "Dashboard",  icon: LayoutDashboard },
  { to: "/alerts",  label: "Alerts",     icon: Bell,     badge: true },
  { to: "/events",  label: "Events",     icon: Activity },
  { to: "/sensors", label: "Sensors",    icon: Cpu },
  { to: "/rules",   label: "Rules",      icon: BookOpen },
  { to: "/users",   label: "Users",      icon: Users },
  { to: "/map",     label: "Map",        icon: Map },
  { to: "/settings",label: "Settings",   icon: Settings },
];

export function Sidebar() {
  const collapsed    = useUiStore((s) => s.sidebarCollapsed);
  const toggle       = useUiStore((s) => s.toggleSidebar);
  const unreadCount  = useAlertStore((s) => s.unreadCount);
  const router       = useRouterState();
  const currentPath  = router.location.pathname;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "relative flex flex-col shrink-0 border-r border-border bg-surface transition-all duration-300",
          collapsed ? "w-14" : "w-56",
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center gap-2.5 px-3 py-4 h-14", collapsed && "justify-center")}>
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight text-foreground">SentinelEdge</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, badge }) => {
            const active = to === "/" ? currentPath === "/" : currentPath.startsWith(to);
            const count  = badge && unreadCount > 0 ? unreadCount : 0;

            const item = (
              <Link
                to={to}
                key={to}
                className={cn(
                  "group flex items-center gap-2.5 px-2 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && count > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-sev-critical text-white text-[10px] font-bold">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              );
            }
            return item;
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className="absolute -right-3 top-16 z-10 flex items-center justify-center w-6 h-6 rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}
