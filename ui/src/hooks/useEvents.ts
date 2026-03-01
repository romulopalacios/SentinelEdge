import { useQuery } from "@tanstack/react-query";
import { eventsApi } from "@/lib/api";
import type { EventsResponse, EventsQueryParams } from "@/types";

export const eventKeys = {
  all:  ["events"] as const,
  list: (p: EventsQueryParams) => ["events", "list", p] as const,
  timeseries: (p: Record<string, string | number>) => ["events", "timeseries", p] as const,
};

export function useEvents(params: EventsQueryParams = {}) {
  return useQuery<EventsResponse>({
    queryKey: eventKeys.list(params),
    queryFn:  async () => {
      const { data } = await eventsApi.list(params as Record<string, string | number | boolean>);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useEventTimeseries(params: Record<string, string | number> = {}) {
  return useQuery({
    queryKey: eventKeys.timeseries(params),
    queryFn:  async () => { const { data } = await eventsApi.timeseries(params); return data; },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
