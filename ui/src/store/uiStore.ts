import { create } from "zustand";
import { persist } from "zustand/middleware";

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

interface UiStoreState {
  sidebarCollapsed: boolean;
  timeRange: TimeRange;
  wsConnected: boolean;
  // actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTimeRange: (r: TimeRange) => void;
  setWsConnected: (v: boolean) => void;
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      timeRange: "24h",
      wsConnected: false,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      setTimeRange: (r) => set({ timeRange: r }),

      setWsConnected: (v) => set({ wsConnected: v }),
    }),
    { name: "sentineledge-ui" },
  ),
);
