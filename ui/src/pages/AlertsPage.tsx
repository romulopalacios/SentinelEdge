import { useState } from "react";
import { toast } from "sonner";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useAcknowledgeAlert, useResolveAlert } from "@/hooks/useAlerts";
import { STATUS_COLOR, formatDateTime } from "@/lib/utils";
import type { AlertStatus, Severity } from "@/types";

export function AlertsPage() {
  const [statusFilter, setStatusFilter]   = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data, isLoading } = useAlerts({
    status:   statusFilter   !== "all" ? (statusFilter as AlertStatus) : undefined,
    severity: severityFilter !== "all" ? (severityFilter as Severity)  : undefined,
    page_size: 50,
  });

  const { mutate: acknowledge } = useAcknowledgeAlert();
  const { mutate: resolve }     = useResolveAlert();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Alerts" subtitle="Security alerts from rule engine" />
      <div className="flex-1 overflow-y-auto p-5 space-y-4 animate-fade-in">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">
            {data ? `${data.total} alerts` : ""}
          </span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !data?.data.length ? (
              <p className="p-5 text-xs text-muted-foreground">No alerts found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Sensor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell><Badge variant={alert.severity as Severity}>{alert.severity}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate text-foreground">{alert.title}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{alert.sensor_id?.slice(0,8) ?? "—"}</TableCell>
                      <TableCell><Badge className={STATUS_COLOR[alert.status as AlertStatus]}>{alert.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(alert.triggered_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {alert.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => {
                              acknowledge(alert.id);
                              toast.success("Alert acknowledged");
                            }}>Ack</Button>
                          )}
                          {alert.status !== "resolved" && (
                            <Button size="sm" variant="ghost" onClick={() => {
                              resolve(alert.id);
                              toast.success("Alert resolved");
                            }}>Resolve</Button>
                          )}
                        </div>
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
