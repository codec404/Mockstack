import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter, map } from "rxjs";
import { AuthService } from "./core/auth.service";
import { ThemeService } from "./core/theme.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">

      <header class="topbar">
        <div class="topbar__brand">
          <a routerLink="/" class="topbar__logo">MockStack</a>
          <span class="topbar__badge">Beta</span>
        </div>

        <nav class="topbar__nav" *ngIf="auth.isLoggedIn()">
          <a routerLink="/dashboard" routerLinkActive="active">Interview</a>
          <a routerLink="/scheduling" routerLinkActive="active">Schedule</a>
          <a routerLink="/analytics" routerLinkActive="active">Analytics</a>
          <a routerLink="/admin" routerLinkActive="active" *ngIf="auth.isAdmin()">Admin</a>
        </nav>

        <div class="topbar__actions">
          <button
            class="theme-btn"
            (click)="theme.toggle()"
            [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <span class="theme-btn__icon">{{ theme.theme() === 'dark' ? '☀️' : '🌙' }}</span>
            <span class="theme-btn__label">{{ theme.theme() === 'dark' ? 'Light' : 'Dark' }}</span>
          </button>

          <ng-container *ngIf="auth.isLoggedIn(); else guestTpl">
            <span class="role-chip">{{ auth.role() }}</span>
            <button class="btn-logout" (click)="auth.logout()">Logout</button>
          </ng-container>
          <ng-template #guestTpl>
            <a *ngIf="isLanding()" routerLink="/auth" class="btn-signin">Sign In</a>
          </ng-template>
        </div>
      </header>

      <main [class]="isLanding() ? 'main-content main-content--full' : 'main-content'">
        <router-outlet></router-outlet>
      </main>

    </div>
  `,
  styles: [`
    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      transition: background var(--transition);
    }

    /* ── Topbar ───────────────────────────────────────────────────────────── */
    .topbar {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 0 28px;
      height: 56px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 200;
      transition: background var(--transition), border-color var(--transition);
    }
    .topbar__brand { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .topbar__logo {
      font-size: 18px; font-weight: 900; color: var(--text);
      letter-spacing: -0.5px; text-decoration: none;
      transition: color var(--transition);
    }
    .topbar__badge {
      background: var(--accent-blue-bg); color: var(--accent-blue-fg);
      font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 5px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .topbar__nav { display: flex; gap: 2px; flex: 1; }
    .topbar__nav a {
      padding: 6px 12px; border-radius: var(--radius-sm);
      font-size: 14px; font-weight: 500; color: var(--text-muted);
      text-decoration: none;
      transition: background var(--transition), color var(--transition);
    }
    .topbar__nav a:hover, .topbar__nav a.active {
      background: var(--accent-blue-bg); color: var(--accent-blue);
    }
    .topbar__actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }

    /* ── Theme toggle ─────────────────────────────────────────────────────── */
    .theme-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 11px; border-radius: var(--radius-sm);
      border: 1px solid var(--border-2);
      background: var(--surface-2); color: var(--text-2);
      cursor: pointer; font-size: 13px; font-weight: 500;
      transition:
        background var(--transition), border-color var(--transition),
        color var(--transition), transform 0.12s;
    }
    .theme-btn:hover {
      background: var(--accent-blue-bg); border-color: var(--accent-blue);
      color: var(--accent-blue); transform: scale(1.04);
    }
    .theme-btn__icon { font-size: 14px; line-height: 1; }
    .theme-btn__label { font-size: 12px; }

    /* ── User controls ────────────────────────────────────────────────────── */
    .role-chip {
      font-size: 11px; padding: 3px 9px; border-radius: 999px;
      background: var(--surface-2); color: var(--text-muted);
      border: 1px solid var(--border); font-weight: 600; text-transform: capitalize;
    }
    .btn-logout {
      border: 1px solid var(--border-2); background: transparent;
      color: var(--text-2); padding: 5px 12px; border-radius: var(--radius-sm);
      cursor: pointer; font-size: 13px; font-weight: 500;
      transition: background var(--transition), color var(--transition), border-color var(--transition);
    }
    .btn-logout:hover {
      background: var(--accent-red-bg); color: var(--accent-red);
      border-color: var(--accent-red);
    }
    .btn-signin {
      background: var(--primary); color: var(--primary-fg);
      padding: 6px 16px; border-radius: var(--radius-sm);
      font-size: 13px; font-weight: 600; text-decoration: none;
      transition: background var(--transition);
    }
    .btn-signin:hover { background: var(--primary-hover); text-decoration: none; }

    /* ── Content area ─────────────────────────────────────────────────────── */
    .main-content {
      flex: 1; padding: 28px;
      max-width: 1100px; width: 100%;
      margin: 0 auto; box-sizing: border-box;
    }
    .main-content--full {
      flex: 1; padding: 0 28px;
      max-width: 1100px; width: 100%;
      margin: 0 auto; box-sizing: border-box;
    }
  `],
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  private readonly router = inject(Router);

  readonly isLanding = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects === "/"),
    ),
    { initialValue: this.router.url === "/" },
  );
}
