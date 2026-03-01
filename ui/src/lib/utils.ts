import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Severity, AlertStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Severity helpers ────────────────────────────────────────────────────────

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "text-sev-critical",
  high:     "text-sev-high",
  medium:   "text-sev-medium",
  low:      "text-sev-low",
};

export const SEVERITY_BG: Record<Severity, string> = {
  critical: "bg-sev-critical/10 text-sev-critical border-sev-critical/20",
  high:     "bg-sev-high/10     text-sev-high     border-sev-high/20",
  medium:   "bg-sev-medium/10   text-sev-medium   border-sev-medium/20",
  low:      "bg-sev-low/10      text-sev-low      border-sev-low/20",
};

export const STATUS_COLOR: Record<AlertStatus, string> = {
  open:         "bg-sev-critical/10 text-sev-critical border-sev-critical/20",
  acknowledged: "bg-sev-medium/10   text-sev-medium   border-sev-medium/20",
  resolved:     "bg-status-online/10 text-status-online border-status-online/20",
};

export const SENSOR_STATUS_COLOR: Record<"online" | "offline", string> = {
  online:  "text-status-online",
  offline: "text-status-offline",
};

// ── Format helpers ────────────────────────────────────────────────────────

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs  = Math.floor(diff / 1000);
  const mins  = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);

  if (secs < 60)  return `${secs}s ago`;
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day:   "2-digit",
    hour:  "2-digit",
    minute:"2-digit",
    hour12: false,
  }).format(new Date(dateStr));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
