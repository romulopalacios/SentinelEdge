import { create } from "zustand";
import type { Alert } from "@/types";

interface AlertStoreState {
  liveAlerts: Alert[];
  unreadCount: number;
  // actions
  addAlert: (alert: Alert) => void;
  updateAlert: (id: string, patch: Partial<Alert>) => void;
  markAllRead: () => void;
  clearLive: () => void;
}

export const useAlertStore = create<AlertStoreState>((set) => ({
  liveAlerts: [],
  unreadCount: 0,

  addAlert: (alert) =>
    set((s) => ({
      liveAlerts: [alert, ...s.liveAlerts].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    })),

  updateAlert: (id, patch) =>
    set((s) => ({
      liveAlerts: s.liveAlerts.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    })),

  markAllRead: () => set({ unreadCount: 0 }),

  clearLive: () => set({ liveAlerts: [], unreadCount: 0 }),
}));
