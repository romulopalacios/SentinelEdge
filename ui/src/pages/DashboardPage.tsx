import { Bell, Cpu, AlertTriangle, TrendingUp, ShieldAlert } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { EventVolumeChart } from "@/components/charts/EventVolumeChart";
import { SeverityDonut } from "@/components/charts/SeverityDonut";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useAlertStats } from "@/hooks/useAlerts";
import { useSensors } from "@/hooks/useSensors";
import { useEventTimeseries } from "@/hooks/useEvents";
import { STATUS_COLOR, formatRelativeTime } from "@/lib/utils";
import type { Severity, AlertStatus } from "@/types";

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAlertStats();
  const { data: sensors }  = useSensors();
  const { data: recentAlerts } = useAlerts({ page_size: 8, status: "open" });
  const { data: timeseries } = useEventTimeseries({ interval: "1h", limit: "24" });

  // Derive stats from the real API shape: { open, by_status, by_severity }
  const totalAlerts = stats
    ? stats.by_status.reduce((acc, b) => acc + b.total, 0)
    : undefined;
  const criticalAlerts = stats
    ? (stats.by_severity.find((b) => b.severity === "critical")?.total ?? 0)
    : undefined;

  const sevData = stats
    ? stats.by_severity.map((b) => ({ severity: b.severity, count: b.total }))
    : [];

  const tsData = Array.isArray(timeseries)
    ? timeseries
    : (timeseries as { data?: unknown[] })?.data ?? [];

  const sensorsOnline = sensors ? sensors.data.filter((s) => s.is_active).length : undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Dashboard"
        subtitle="Real-time security monitoring"
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5 animate-fade-in">
        {/* Stat row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Total Alerts"
            value={totalAlerts ?? "—"}
            icon={Bell}
            loading={statsLoading}
          />
          <StatCard
            label="Open Alerts"
            value={stats?.open ?? "—"}
            icon={AlertTriangle}
            accent="critical"
            loading={statsLoading}
          />
          <StatCard
            label="Critical Alerts"
            value={criticalAlerts ?? "—"}
            icon={ShieldAlert}
            accent="critical"
            loading={statsLoading}
          />
          <StatCard
            label="Sensors Online"
            value={
              sensors
                ? `${sensorsOnline}/${sensors.total}`
                : "—"
            }
            icon={Cpu}
            accent="success"
            loading={!sensors}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Event volume (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tsData.length > 0
                ? <EventVolumeChart data={tsData as Parameters<typeof EventVolumeChart>[0]["data"]} height={200} />
                : <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">No data</div>
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-sev-critical" />
                By severity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sevData.length > 0
                ? <SeverityDonut data={sevData} />
                : <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">No alerts</div>
              }
            </CardContent>
          </Card>
        </div>

        {/* Recent open alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Recent open alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!recentAlerts
              ? (
                  <div className="p-5 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                )
              : recentAlerts.data.length === 0
              ? (
                  <p className="p-5 text-xs text-muted-foreground">No open alerts</p>
                )
              : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Sensor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentAlerts.data.map((alert) => (
                        <TableRow key={alert.id} className="cursor-pointer">
                          <TableCell>
                            <Badge variant={alert.severity as Severity}>
                              {alert.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate text-foreground">
                            {alert.title}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {alert.sensor_id?.slice(0, 8) ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLOR[alert.status as AlertStatus]}>
                              {alert.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatRelativeTime(alert.triggered_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
