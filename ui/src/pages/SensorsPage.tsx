import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSensors } from "@/hooks/useSensors";
import { formatRelativeTime } from "@/lib/utils";
import { Cpu, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<"online" | "offline", string> = {
  online:  "bg-status-online animate-ping-slow",
  offline: "bg-status-offline",
};

export function SensorsPage() {
  const { data, isLoading } = useSensors();

  const sensorsOnline = data ? data.data.filter((s) => s.is_active).length : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Sensors"
        subtitle={data ? `${sensorsOnline} online of ${data.total}` : "Loading..."}
      />
      <div className="flex-1 overflow-y-auto p-5 animate-fade-in">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : !data?.data.length ? (
          <p className="text-xs text-muted-foreground">No sensors registered</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.data.map((sensor) => {
              const statusKey = sensor.is_active ? "online" : "offline";
              return (
                <Card key={sensor.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative flex items-center justify-center">
                          <span className={cn("absolute inline-flex w-4 h-4 rounded-full opacity-50", STATUS_DOT[statusKey])} />
                          <Cpu className="w-4 h-4 relative text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{sensor.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{sensor.type}</p>
                        </div>
                      </div>
                      <Badge variant={sensor.is_active ? "online" : "offline"}>
                        {sensor.is_active ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    {sensor.location && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {sensor.location}
                      </div>
                    )}
                    {sensor.last_seen && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 shrink-0" />
                        Last seen {formatRelativeTime(sensor.last_seen)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
