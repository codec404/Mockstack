import { Routes } from "@angular/router";
import { adminGuard, authGuard } from "./core/guards/auth.guard";

export const routes: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./features/landing/landing-page.component").then((m) => m.LandingPageComponent),
  },
  {
    path: "auth",
    loadComponent: () =>
      import("./features/auth/auth-page.component").then((m) => m.AuthPageComponent),
  },
  {
    path: "dashboard",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/interview/interview-page.component").then((m) => m.InterviewPageComponent),
  },
  {
    path: "scheduling",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/scheduling/scheduling-page.component").then((m) => m.SchedulingPageComponent),
  },
  {
    path: "analytics",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/analytics/analytics-page.component").then((m) => m.AnalyticsPageComponent),
  },
  {
    path: "admin",
    canActivate: [adminGuard],
    loadComponent: () =>
      import("./features/admin/admin-page.component").then((m) => m.AdminPageComponent),
  },
  { path: "**", redirectTo: "" },
];
