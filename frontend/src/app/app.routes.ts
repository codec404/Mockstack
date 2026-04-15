import { Routes } from "@angular/router";
import { adminGuard, authGuard, guestGuard } from "./core/guards/auth.guard";


export const routes: Routes = [
  {
    path: "",
    canActivate: [guestGuard],
    loadComponent: () =>
      import("./features/landing/landing-page.component").then((m) => m.LandingPageComponent),
  },
  {
    path: "auth",
    canActivate: [guestGuard],
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
    path: "interview/rules",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/interview/rules-page.component").then((m) => m.RulesPageComponent),
  },
  {
    path: "interview/session",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/interview/session-page.component").then((m) => m.SessionPageComponent),
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
  {
    path: "leaderboard",
    loadComponent: () =>
      import("./features/leaderboard/leaderboard-page.component").then((m) => m.LeaderboardPageComponent),
  },
  {
    path: "profile/:handle",
    loadComponent: () =>
      import("./features/profile/profile-page.component").then((m) => m.ProfilePageComponent),
  },
  {
    path: "friends",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/friends/friends-page.component").then((m) => m.FriendsPageComponent),
  },
  { path: "**", redirectTo: "" },
];
