import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUsers } from "@/hooks/useUsers";
import { formatDateTime } from "@/lib/utils";
import { User } from "lucide-react";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin:    "default",
  operator: "secondary",
  viewer:   "outline",
};

export function UsersPage() {
  const { data, isLoading } = useUsers();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Users" subtitle="Access management" />
      <div className="flex-1 overflow-y-auto p-5 animate-fade-in">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !data?.data.length ? (
              <p className="p-5 text-xs text-muted-foreground">No users found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <User className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{user.full_name ?? user.username ?? user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
                      <TableCell><Badge variant={ROLE_VARIANT[user.role] ?? "outline"}>{user.role}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? "online" : "offline"}>{user.is_active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.last_login ? formatDateTime(user.last_login) : "Never"}
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
