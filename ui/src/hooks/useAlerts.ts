import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alertsApi } from "@/lib/api";
import type { Alert, AlertStats, AlertsResponse, AlertsQueryParams } from "@/types";

export const alertKeys = {
  all:    ["alerts"] as const,
  list:   (p: AlertsQueryParams) => ["alerts", "list", p] as const,
  detail: (id: string) => ["alerts", id] as const,
  stats:  () => ["alerts", "stats"] as const,
};

export function useAlerts(params: AlertsQueryParams = {}) {
  return useQuery<AlertsResponse>({
    queryKey: alertKeys.list(params),
    queryFn:  async () => {
      const { data } = await alertsApi.list(params as Record<string, string | number | boolean>);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAlert(id: string) {
  return useQuery<Alert>({
    queryKey: alertKeys.detail(id),
    queryFn:  async () => { const { data } = await alertsApi.get(id); return data; },
    enabled:  Boolean(id),
  });
}

export function useAlertStats() {
  return useQuery<AlertStats>({
    queryKey: alertKeys.stats(),
    queryFn:  async () => { const { data } = await alertsApi.stats(); return data; },
    staleTime: 60_000,
    refetchInterval: 30_000,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: alertKeys.all }); },
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertsApi.resolve(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: alertKeys.all }); },
  });
}
