import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { AlertsPage }    from "@/pages/AlertsPage";
import { EventsPage }    from "@/pages/EventsPage";
import { SensorsPage }   from "@/pages/SensorsPage";
import { RulesPage }     from "@/pages/RulesPage";
import { UsersPage }     from "@/pages/UsersPage";
import { SettingsPage }  from "@/pages/SettingsPage";
import { MapPage }       from "@/pages/MapPage";
import { LoginPage }     from "@/pages/LoginPage";

function isAuthenticated() {
  return Boolean(localStorage.getItem("access_token"));
}

// Root route (layout wrapper)
const rootRoute = createRootRoute();

// Login
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: "/" });
  },
});

// Protected shell
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AppShell,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
});

const indexRoute    = createRoute({ getParentRoute: () => shellRoute, path: "/",         component: DashboardPage });
const alertsRoute   = createRoute({ getParentRoute: () => shellRoute, path: "/alerts",   component: AlertsPage });
const eventsRoute   = createRoute({ getParentRoute: () => shellRoute, path: "/events",   component: EventsPage });
const sensorsRoute  = createRoute({ getParentRoute: () => shellRoute, path: "/sensors",  component: SensorsPage });
const rulesRoute    = createRoute({ getParentRoute: () => shellRoute, path: "/rules",    component: RulesPage });
const usersRoute    = createRoute({ getParentRoute: () => shellRoute, path: "/users",    component: UsersPage });
const settingsRoute = createRoute({ getParentRoute: () => shellRoute, path: "/settings", component: SettingsPage });
const mapRoute      = createRoute({ getParentRoute: () => shellRoute, path: "/map",      component: MapPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    indexRoute,
    alertsRoute,
    eventsRoute,
    sensorsRoute,
    rulesRoute,
    usersRoute,
    settingsRoute,
    mapRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
