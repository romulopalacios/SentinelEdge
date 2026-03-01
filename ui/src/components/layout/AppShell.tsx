import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { useWebSocket } from "@/hooks/useWebSocket";

export function AppShell() {
  useWebSocket(); // establish WS connection globally

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
