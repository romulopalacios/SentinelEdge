import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents } from "@/hooks/useEvents";
import { formatDateTime } from "@/lib/utils";
import type { Severity } from "@/types";

export function EventsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const { data, isLoading } = useEvents({
    severity: severityFilter !== "all" ? (severityFilter as Severity) : undefined,
    page_size: 50,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Events" subtitle="Raw sensor events from ingestion pipeline" />
      <div className="flex-1 overflow-y-auto p-5 space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
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
          <span className="ml-auto text-xs text-muted-foreground">{data ? `${data.total} events` : ""}</span>
        </div>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !data?.data.length ? (
              <p className="p-5 text-xs text-muted-foreground">No events found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Sensor</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-mono text-xs">{ev.event_type}</TableCell>
                      <TableCell><Badge variant={ev.severity as Severity}>{ev.severity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{ev.sensor_id?.slice(0,8) ?? "—"}</TableCell>
                      <TableCell>
                        <span className={ev.processed ? "text-status-online" : "text-sev-medium"}>{ev.processed ? "Yes" : "No"}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(ev.created_at)}</TableCell>
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
