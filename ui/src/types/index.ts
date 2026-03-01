// ── Domain Types ────────────────────────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type UserRole = "admin" | "operator" | "viewer";

// ── Alert ───────────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  tenant_id: string;
  sensor_id: string | null;
  rule_id: string;
  correlation_id: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface AlertsResponse {
  data: Alert[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Alert Stats ──────────────────────────────────────────────────────────────

export interface AlertStats {
  open: number;
  by_status: { status: string; total: number }[];
  by_severity: { severity: string; total: number }[];
}

// ── Event ───────────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  tenant_id: string;
  sensor_id: string;
  correlation_id: string;
  event_type: string;
  severity: Severity;
  processed: boolean;
  created_at: string;
}

export interface EventsResponse {
  data: Event[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Sensor ──────────────────────────────────────────────────────────────────

export interface Sensor {
  id: string;
  external_id: string;
  name: string;
  type: string;
  location: string | null;
  is_active: boolean;
  last_seen: string | null;
  created_at: string;
}

export interface SensorsResponse {
  data: Sensor[];
  total: number;
}

// ── Rule ────────────────────────────────────────────────────────────────────

export interface RuleConditionDef {
  field: string;
  operator: string;
  value: string | number | boolean;
}

export interface Rule {
  id: string;
  name: string;
  description: string | null;
  condition: RuleConditionDef;
  severity: Severity;
  actions: string[];
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RulesResponse {
  data: Rule[];
  total: number;
}

// ── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username?: string;
  email: string;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  last_login?: string;
}

export interface UsersResponse {
  data: User[];
  total: number;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  tenant_slug: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

// ── WebSocket ───────────────────────────────────────────────────────────────

export type WsEventType = "new_alert" | "alert_updated" | "sensor_status" | "ping";

export interface WsMessage<T = unknown> {
  type: WsEventType;
  data: T;
  timestamp: string;
}

// ── Stats / Dashboard ────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  label?: string;
}

// ── Query Params ─────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

export interface AlertsQueryParams extends PaginationParams {
  status?: AlertStatus;
  severity?: Severity;
  sensor_id?: string;
  search?: string;
}

export interface EventsQueryParams extends PaginationParams {
  event_type?: string;
  severity?: Severity;
  sensor_id?: string;
  processed?: boolean;
}
