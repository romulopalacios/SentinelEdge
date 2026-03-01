import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rulesApi } from "@/lib/api";
import type { RulesResponse } from "@/types";

export const ruleKeys = {
  all:  ["rules"] as const,
  list: (p?: Record<string, unknown>) => ["rules", "list", p] as const,
};

export function useRules(params?: Record<string, string | number | boolean>) {
  return useQuery<RulesResponse>({
    queryKey: ruleKeys.list(params),
    queryFn:  async () => { const { data } = await rulesApi.list(params); return data; },
    staleTime: 60_000,
  });
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => rulesApi.toggle(id, active),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ruleKeys.all }); },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rulesApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ruleKeys.all }); },
  });
}
