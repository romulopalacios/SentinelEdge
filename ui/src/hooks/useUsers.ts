import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import type { UsersResponse } from "@/types";

export const userKeys = {
  all:  ["users"] as const,
  list: (p?: Record<string, unknown>) => ["users", "list", p] as const,
};

export function useUsers(params?: Record<string, string | number | boolean>) {
  return useQuery<UsersResponse>({
    queryKey: userKeys.list(params),
    queryFn:  async () => { const { data } = await usersApi.list(params); return data; },
    staleTime: 120_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => usersApi.create(body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: userKeys.all }); },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: userKeys.all }); },
  });
}
