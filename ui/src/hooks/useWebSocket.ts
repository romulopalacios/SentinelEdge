import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wsManager } from "@/lib/ws";
import { useAlertStore } from "@/store/alertStore";
import { useUiStore } from "@/store/uiStore";
import type { Alert } from "@/types";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

export function useWebSocket() {
  const queryClient   = useQueryClient();
  const addAlert      = useAlertStore((s) => s.addAlert);
  const updateAlert   = useAlertStore((s) => s.updateAlert);
  const setWsConnected= useUiStore((s) => s.setWsConnected);

  useEffect(() => {
    wsManager.connect(WS_URL);

    const handleNew = (msg: { data: Alert }) => {
      addAlert(msg.data);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    };

    const handleUpdate = (msg: { data: Alert }) => {
      updateAlert(msg.data.id, msg.data);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    };

    wsManager.on("new_alert",    handleNew);
    wsManager.on("alert_updated",handleUpdate);

    // Poll connection state every 5s
    const timer = setInterval(() => {
      setWsConnected(wsManager.isConnected);
    }, 5_000);

    return () => {
      wsManager.off("new_alert",    handleNew);
      wsManager.off("alert_updated",handleUpdate);
      clearInterval(timer);
    };
  }, [addAlert, updateAlert, setWsConnected, queryClient]);
}
