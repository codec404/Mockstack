import { Component, inject, ViewChildren, QueryList, ElementRef, AfterViewChecked, AfterViewInit, OnDestroy, ChangeDetectorRef, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter, map } from "rxjs";
import { Subscription } from "rxjs";
import { trigger, transition, style, animate, query, group } from "@angular/animations";
import { AuthService } from "./core/auth.service";
import { ThemeService } from "./core/theme.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  animations: [
    trigger("routeAnimation", [
      transition("* <=> *", [
        query(":enter, :leave", [
          style({ position: "absolute", width: "100%", top: 0, left: 0 }),
        ], { optional: true }),
        group([
          query(":leave", [
            animate("160ms ease", style({ opacity: 0, transform: "translateY(-6px)" })),
          ], { optional: true }),
          query(":enter", [
            style({ opacity: 0, transform: "translateY(14px)" }),
            animate("300ms 80ms cubic-bezier(0.4,0,0.2,1)",
              style({ opacity: 1, transform: "translateY(0)" })),
          ], { optional: true }),
        ]),
      ]),
    ]),
  ],
  template: `
    <div class="shell">

      <header class="topbar">
        <div class="topbar__brand">
          <a routerLink="/" class="topbar__logo">MockStack</a>
          <span class="topbar__badge">Beta</span>
        </div>

        <nav class="topbar__nav" #navEl *ngIf="auth.isLoggedIn()">
          <a #navItem routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{exact:false}"
            [class.active]="isInterviewRoute()">Interview</a>
          <a #navItem routerLink="/scheduling" routerLinkActive="active">Schedule</a>
          <a #navItem routerLink="/analytics" routerLinkActive="active">Analytics</a>
          <a #navItem routerLink="/leaderboard" routerLinkActive="active">Leaderboard</a>
          <a #navItem routerLink="/admin" routerLinkActive="active" *ngIf="auth.isAdmin()">Admin</a>
          <span class="nav-glider"
            [style.transform]="'translateX(' + gliderLeft + 'px)'"
            [style.width.px]="gliderWidth"
            [class.nav-glider--ready]="gliderReady">
          </span>
        </nav>

        <!-- Leaderboard link visible to logged-out users in topbar -->
        <nav class="topbar__nav topbar__nav--guest" *ngIf="!auth.isLoggedIn()">
          <a routerLink="/leaderboard" routerLinkActive="active">Leaderboard</a>
        </nav>

        <div class="topbar__actions">
          <button
            class="theme-btn"
            (click)="theme.toggle()"
            [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            [attr.title]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <!-- Sun icon (shown in dark mode → click to go light) -->
            <svg *ngIf="theme.theme() === 'dark'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
            <!-- Moon icon (shown in light mode → click to go dark) -->
            <svg *ngIf="theme.theme() === 'light'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>

          <!-- Logged-in: avatar dropdown -->
          <ng-container *ngIf="auth.isLoggedIn(); else guestTpl">
            <div class="user-menu" [class.user-menu--open]="menuOpen">
              <button class="user-menu__trigger" (click)="toggleMenu()" aria-label="User menu">
                <img *ngIf="auth.avatar()" [src]="auth.avatar()" class="user-menu__avatar-img" alt="avatar" />
                <span *ngIf="!auth.avatar()" class="user-menu__initials">{{ initials }}</span>
              </button>

              <div class="user-menu__dropdown" *ngIf="menuOpen">
                <div class="user-menu__header">
                  <div class="user-menu__avatar-lg">
                    <img *ngIf="auth.avatar()" [src]="auth.avatar()" class="user-menu__avatar-img" alt="avatar" />
                    <span *ngIf="!auth.avatar()">{{ initials }}</span>
                  </div>
                  <div>
                    <div class="user-menu__handle">{{ '@' + auth.handle() }}</div>
                    <div class="user-menu__role">{{ auth.role() }}</div>
                  </div>
                </div>
                <div class="user-menu__divider"></div>
                <a class="user-menu__item" [routerLink]="['/profile', auth.handle()]" (click)="menuOpen = false">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  View Profile
                </a>
                <a class="user-menu__item" routerLink="/friends" (click)="menuOpen = false">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Friends
                </a>
                <div class="user-menu__divider"></div>
                <button class="user-menu__item user-menu__item--danger" (click)="logout()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Log out
                </button>
              </div>
            </div>
          </ng-container>
          <ng-template #guestTpl>
            <ng-container *ngIf="isLanding()">
              <a routerLink="/auth" class="btn-login">Log in</a>
              <a routerLink="/auth" class="btn-signup">Get Started</a>
            </ng-container>
          </ng-template>
        </div>
      </header>

      <main [class]="isLanding() ? 'main-content main-content--full' : 'main-content'">
        <div class="route-wrapper" [@routeAnimation]="getRouteState(outlet)">
          <router-outlet #outlet="outlet"></router-outlet>
        </div>
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
    .topbar__nav {
      display: flex; gap: 2px; flex: 1;
      position: relative; align-items: center;
    }
    .topbar__nav a {
      padding: 6px 12px; border-radius: var(--radius-sm);
      font-size: 14px; font-weight: 500; color: var(--text-muted);
      text-decoration: none; position: relative; z-index: 1;
      transition: color 0.18s ease;
    }
    .topbar__nav a:hover { color: var(--text); text-decoration: none; }
    .topbar__nav a.active { color: var(--accent-blue); }
    .topbar__nav--guest { flex: unset; }

    /* Sliding background pill */
    .nav-glider {
      position: absolute; top: 50%; height: 32px;
      background: var(--accent-blue-bg);
      border-radius: 8px; z-index: 0; pointer-events: none;
      transform: translateX(0); width: 80px;
      /* transition only kicks in after first render */
      transition: none;
    }
    .nav-glider--ready {
      transition: transform 0.25s cubic-bezier(0.4,0,0.2,1),
                  width 0.25s cubic-bezier(0.4,0,0.2,1);
    }
    /* Keep vertical centering separate from horizontal movement */
    .nav-glider { margin-top: -16px; }
    .topbar__actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }

    /* ── Theme toggle — icon only ─────────────────────────────────────────── */
    .theme-btn {
      display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: var(--radius-sm);
      border: 1px solid var(--border-2);
      background: var(--surface-2); color: var(--text-2);
      cursor: pointer; flex-shrink: 0;
      transition: background var(--transition), border-color var(--transition),
                  color var(--transition), transform 0.12s;
    }
    .theme-btn:hover {
      background: var(--accent-blue-bg); border-color: var(--accent-blue);
      color: var(--accent-blue); transform: scale(1.08);
    }
    .theme-btn svg { display: block; }

    /* ── User menu dropdown ───────────────────────────────────────────────── */
    .user-menu { position: relative; }

    .user-menu__trigger {
      width: 34px; height: 34px; border-radius: 50%;
      border: 2px solid var(--border-2); background: var(--surface-2);
      cursor: pointer; overflow: hidden; padding: 0;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .user-menu__trigger:hover,
    .user-menu--open .user-menu__trigger {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-blue) 20%, transparent);
    }
    .user-menu__avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .user-menu__initials {
      font-size: 12px; font-weight: 900; color: var(--accent-blue);
      letter-spacing: -0.5px; pointer-events: none;
    }

    .user-menu__dropdown {
      position: absolute; top: calc(100% + 10px); right: 0;
      min-width: 210px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,.25); z-index: 500;
      overflow: hidden;
      animation: dropIn 0.15s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-6px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1); }
    }

    .user-menu__header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 14px 12px;
    }
    .user-menu__avatar-lg {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      background: var(--accent-blue-bg); border: 2px solid var(--accent-blue);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 900; color: var(--accent-blue);
      overflow: hidden;
    }
    .user-menu__avatar-lg img { width: 100%; height: 100%; object-fit: cover; }
    .user-menu__handle { font-size: 13px; font-weight: 800; color: var(--text); }
    .user-menu__role {
      font-size: 10px; font-weight: 700; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .4px; margin-top: 1px;
    }

    .user-menu__divider { height: 1px; background: var(--border); margin: 0; }

    .user-menu__item {
      display: flex; align-items: center; gap: 9px;
      padding: 10px 14px; width: 100%; box-sizing: border-box;
      font-size: 13px; font-weight: 500; color: var(--text-2);
      background: transparent; border: none; cursor: pointer;
      text-decoration: none; transition: background 0.14s, color 0.14s;
    }
    .user-menu__item:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
    .user-menu__item--danger { color: var(--accent-red-fg); }
    .user-menu__item--danger:hover { background: var(--accent-red-bg); color: var(--accent-red); }
    .btn-login {
      color: var(--text-2); padding: 6px 14px; border-radius: var(--radius-sm);
      font-size: 13px; font-weight: 500; text-decoration: none;
      border: 1px solid var(--border-2); background: transparent;
      transition: color var(--transition), border-color var(--transition), background var(--transition);
    }
    .btn-login:hover { color: var(--text); border-color: var(--border-2); background: var(--surface-2); text-decoration: none; }
    .btn-signup {
      background: var(--primary); color: var(--primary-fg);
      padding: 6px 16px; border-radius: var(--radius-sm);
      font-size: 13px; font-weight: 600; text-decoration: none;
      box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent);
      transition: background var(--transition), box-shadow var(--transition);
    }
    .btn-signup:hover { background: var(--primary-hover); text-decoration: none; }

    /* ── Content area ─────────────────────────────────────────────────────── */
    .main-content {
      flex: 1; padding: 28px;
      max-width: 1100px; width: 100%;
      margin: 0 auto; box-sizing: border-box;
      position: relative;
    }
    .main-content--full {
      flex: 1; padding: 0 28px;
      max-width: 1100px; width: 100%;
      margin: 0 auto; box-sizing: border-box;
      position: relative;
    }
    .route-wrapper {
      position: relative;
      width: 100%;
    }
  `],
})
export class AppComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private _routeSub?: Subscription;

  menuOpen = false;

  get initials() {
    const h = this.auth.handle();
    return h ? h.slice(0, 2).toUpperCase() : "?";
  }

  toggleMenu() { this.menuOpen = !this.menuOpen; }

  logout() { this.menuOpen = false; this.auth.logout(); }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".user-menu")) this.menuOpen = false;
  }

  @ViewChildren("navItem") navItems?: QueryList<ElementRef<HTMLAnchorElement>>;

  gliderLeft = 0;
  gliderWidth = 0;     // 0 = hidden until first measured
  gliderReady = false;
  private _dirty = true; // measure on next AfterViewChecked

  readonly isLanding = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects === "/"),
    ),
    { initialValue: this.router.url === "/" },
  );

  readonly isInterviewRoute = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith("/dashboard") || e.urlAfterRedirects.startsWith("/interview")),
    ),
    { initialValue: this.router.url.startsWith("/dashboard") || this.router.url.startsWith("/interview") },
  );

  ngAfterViewInit() {
    // Re-measure on each navigation (routerLinkActive applies after NavigationEnd)
    this._routeSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => { this._dirty = true; });

    // Re-measure when nav items list changes (e.g. admin link toggles)
    this.navItems?.changes.subscribe(() => { this._dirty = true; });
  }

  ngAfterViewChecked() {
    if (!this._dirty) return;
    const items = this.navItems?.toArray() ?? [];
    if (!items.length) return;   // nav not rendered yet — try again next cycle

    this._dirty = false;

    // Use rAF so routerLinkActive has had time to apply the .active class
    requestAnimationFrame(() => {
      const active = items.find((i) => i.nativeElement.classList.contains("active"));
      if (!active) { this.gliderWidth = 0; this.cdr.markForCheck(); return; }

      const newLeft = active.nativeElement.offsetLeft;
      const newWidth = active.nativeElement.offsetWidth;

      if (!this.gliderReady) {
        // First measurement: snap without transition
        this.gliderLeft = newLeft;
        this.gliderWidth = newWidth;
        this.cdr.markForCheck();
        requestAnimationFrame(() => { this.gliderReady = true; this.cdr.markForCheck(); });
      } else {
        this.gliderLeft = newLeft;
        this.gliderWidth = newWidth;
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy() { this._routeSub?.unsubscribe(); }

  getRouteState(outlet: RouterOutlet) {
    return outlet.isActivated ? outlet.activatedRoute : "";
  }
}
