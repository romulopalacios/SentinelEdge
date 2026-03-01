import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  delta?: string;
  deltaUp?: boolean;
  accent?: "default" | "critical" | "warning" | "success";
  loading?: boolean;
}

const ACCENT_CLASSES: Record<string, string> = {
  default:  "bg-primary/10 text-primary",
  critical: "bg-sev-critical/10 text-sev-critical",
  warning:  "bg-sev-medium/10 text-sev-medium",
  success:  "bg-status-online/10 text-status-online",
};

export function StatCard({ label, value, icon: Icon, delta, deltaUp, accent = "default", loading }: StatCardProps) {
  return (
    <Card className="animate-fade-in">
      <CardContent className="flex items-start justify-between pt-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          {loading
            ? <Skeleton className="h-8 w-16" />
            : <p className="text-3xl font-bold text-foreground tabular-nums">{value}</p>
          }
          {delta && !loading && (
            <p className={cn("text-xs font-medium", deltaUp ? "text-status-online" : "text-sev-critical")}>
              {delta}
            </p>
          )}
        </div>
        <div className={cn("flex items-center justify-center w-10 h-10 rounded-lg shrink-0", ACCENT_CLASSES[accent])}>
          <Icon className="w-5 h-5" />
        </div>
      </CardContent>
    </Card>
  );
}
