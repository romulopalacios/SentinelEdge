import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSensors } from "@/hooks/useSensors";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<"online" | "offline", string> = {
  online:  "bg-status-online",
  offline: "bg-status-offline",
};

export function MapPage() {
  const { data } = useSensors();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Sensor Map" subtitle="Geographic distribution" />
      <div className="flex-1 overflow-y-auto p-5 animate-fade-in">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2 min-h-[420px] flex items-center justify-center">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <MapPin className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Interactive map coming soon</p>
              <p className="text-xs text-muted-foreground/60">Install a mapping library (e.g. react-leaflet) to enable this feature</p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sensor locations</p>
            {data?.data.map((sensor) => (
              <Card key={sensor.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", sensor.is_active ? STATUS_COLOR.online : STATUS_COLOR.offline)} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{sensor.name}</p>
                      <p className="text-xs text-muted-foreground">{sensor.location ?? "Unknown location"}</p>
                    </div>
                  </div>
                  <Badge variant={sensor.is_active ? "online" : "offline"} className="shrink-0">
                    {sensor.is_active ? "Online" : "Offline"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
