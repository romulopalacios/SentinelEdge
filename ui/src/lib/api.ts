import axios from "axios";

// ── Axios instance ───────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: "/",
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

// ── Request interceptor — attach Bearer token ────────────────────────────────

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — handle 401 ────────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

// ── API helpers ───────────────────────────────────────────────────────────────

export const authApi = {
  login:   (body: { email: string; password: string; tenant_slug: string }) =>
    api.post("/api/v1/auth/login", body),
  refresh: (token: string) =>
    api.post("/api/v1/auth/refresh", { refresh_token: token }),
  me:      () => api.get("/api/v1/users/me"),
};

export const alertsApi = {
  list:        (params?: Record<string, string | number | boolean>) =>
    api.get("/api/v1/alerts", { params }),
  get:         (id: string) => api.get(`/api/v1/alerts/${id}`),
  acknowledge: (id: string) => api.post(`/api/v1/alerts/${id}/acknowledge`),
  resolve:     (id: string) => api.post(`/api/v1/alerts/${id}/resolve`),
  stats:       () => api.get("/api/v1/alerts/stats"),
};

export const eventsApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/api/v1/events", { params }),
  get:  (id: string) => api.get(`/api/v1/events/${id}`),
  timeseries: (params?: Record<string, string | number>) =>
    api.get("/api/v1/events/timeseries", { params }),
};

export const sensorsApi = {
  list:   (params?: Record<string, string | number | boolean>) =>
    api.get("/api/v1/sensors", { params }),
  get:    (id: string) => api.get(`/api/v1/sensors/${id}`),
  create: (body: unknown) => api.post("/api/v1/sensors", body),
  update: (id: string, body: unknown) => api.put(`/api/v1/sensors/${id}`, body),
  delete: (id: string) => api.delete(`/api/v1/sensors/${id}`),
};

export const rulesApi = {
  list:   (params?: Record<string, string | number | boolean>) =>
    api.get("/api/v1/rules", { params }),
  get:    (id: string) => api.get(`/api/v1/rules/${id}`),
  create: (body: unknown) => api.post("/api/v1/rules", body),
  update: (id: string, body: unknown) => api.put(`/api/v1/rules/${id}`, body),
  delete: (id: string) => api.delete(`/api/v1/rules/${id}`),
  toggle: (id: string, active: boolean) =>
    api.patch(`/api/v1/rules/${id}`, { is_active: active }),
};

export const usersApi = {
  list:   (params?: Record<string, string | number | boolean>) =>
    api.get("/api/v1/users", { params }),
  get:    (id: string) => api.get(`/api/v1/users/${id}`),
  create: (body: unknown) => api.post("/api/v1/auth/register", body),
  update: (id: string, body: unknown) => api.put(`/api/v1/users/${id}`, body),
  delete: (id: string) => api.delete(`/api/v1/users/${id}`),
};
