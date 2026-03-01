import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUiStore } from "@/store/uiStore";

export function SettingsPage() {
  const { timeRange, setTimeRange, sidebarCollapsed, setSidebarCollapsed } = useUiStore();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Settings" subtitle="Interface preferences" />
      <div className="flex-1 overflow-y-auto p-5 space-y-5 animate-fade-in">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Interface and display settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <Label>Default time range</Label>
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as "1h" | "6h" | "24h" | "7d" | "30d")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last 1h</SelectItem>
                  <SelectItem value="6h">Last 6h</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7d</SelectItem>
                  <SelectItem value="30d">Last 30d</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Collapsed sidebar</Label>
              <Switch checked={sidebarCollapsed} onCheckedChange={setSidebarCollapsed} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
