import { Bell, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAlertStore } from "@/store/alertStore";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const unreadCount  = useAlertStore((s) => s.unreadCount);
  const markAllRead  = useAlertStore((s) => s.markAllRead);
  const wsConnected  = useUiStore((s) => s.wsConnected);

  return (
    <header className="flex items-center justify-between h-14 shrink-0 border-b border-border bg-surface px-5">
      {/* Title */}
      <div>
        <h1 className="text-sm font-semibold text-foreground leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* WS status */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
            wsConnected
              ? "text-status-online bg-status-online/10"
              : "text-muted-foreground bg-elevated",
          )}
        >
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{wsConnected ? "Live" : "Offline"}</span>
        </div>

        {/* Alert bell */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={markAllRead}
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-sev-critical text-white text-[9px] font-bold px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}
