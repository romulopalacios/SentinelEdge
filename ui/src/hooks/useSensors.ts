import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sensorsApi } from "@/lib/api";
import type { SensorsResponse } from "@/types";

export const sensorKeys = {
  all:    ["sensors"] as const,
  list:   (p?: Record<string, unknown>) => ["sensors", "list", p] as const,
  detail: (id: string) => ["sensors", id] as const,
};

export function useSensors(params?: Record<string, string | number | boolean>) {
  return useQuery<SensorsResponse>({
    queryKey: sensorKeys.list(params),
    queryFn:  async () => {
      const { data } = await sensorsApi.list(params);
      return data;
    },
    staleTime: 60_000,
    refetchInterval: 30_000,
  });
}

export function useCreateSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => sensorsApi.create(body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: sensorKeys.all }); },
  });
}

export function useDeleteSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sensorsApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: sensorKeys.all }); },
  });
}
