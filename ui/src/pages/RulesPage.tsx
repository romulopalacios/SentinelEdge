import { toast } from "sonner";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRules, useToggleRule } from "@/hooks/useRules";
import type { Severity } from "@/types";

export function RulesPage() {
  const { data, isLoading } = useRules();
  const { mutate: toggle } = useToggleRule();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Rules" subtitle="Alert trigger definitions" />
      <div className="flex-1 overflow-y-auto p-5 animate-fade-in">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !data?.data.length ? (
              <p className="p-5 text-xs text-muted-foreground">No rules defined</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium text-foreground">{rule.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{rule.condition.field} {rule.condition.operator} {String(rule.condition.value)}</TableCell>
                      <TableCell><Badge variant={rule.severity as Severity}>{rule.severity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{rule.actions.join(", ")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{rule.priority}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(active) => {
                            toggle({ id: rule.id, active });
                            toast.success(`Rule ${active ? "enabled" : "disabled"}`);
                          }}
                        />
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
