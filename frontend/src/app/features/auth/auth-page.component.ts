import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { AlertComponent } from "../../shared/alert.component";
import { SpinnerComponent } from "../../shared/spinner.component";

@Component({
  selector: "app-auth-page",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AlertComponent, SpinnerComponent],
  template: `
    <div class="page">
      <div class="card">

        <!-- Header -->
        <div class="card__head">
          <a routerLink="/" class="wordmark">MockStack</a>
          <h1 class="card__title">{{ mode === "login" ? "Welcome back" : "Create your account" }}</h1>
          <p class="card__sub">{{ mode === "login" ? "Log in to continue your practice." : "Start practicing with AI today." }}</p>
        </div>

        <!-- OAuth row -->
        <div class="oauth-row">
          <button class="oauth-btn oauth-btn--google" (click)="socialNotice('Google')" type="button" title="Continue with Google">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button class="oauth-btn oauth-btn--github" (click)="socialNotice('GitHub')" type="button" title="Continue with GitHub">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </button>
        </div>

        <!-- Divider -->
        <div class="divider"><span>or continue with email</span></div>

        <!-- Fields -->
        <div class="field">
          <label for="email">Email address</label>
          <input id="email" [(ngModel)]="email" type="email" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="field">
          <div class="field__labelrow">
            <label for="password">Password</label>
            <a *ngIf="mode === 'login'" href="#" class="forgot-link" (click)="$event.preventDefault()">Forgot?</a>
          </div>
          <div class="input-wrap">
            <input id="password" [(ngModel)]="password" [type]="showPassword ? 'text' : 'password'"
              [placeholder]="mode === 'signup' ? 'Min. 8 characters' : '••••••••'"
              autocomplete="current-password" />
            <button type="button" class="eye-btn" (click)="showPassword = !showPassword"
              [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'"
              [attr.title]="showPassword ? 'Hide password' : 'Show password'">
              <!-- Eye open -->
              <svg *ngIf="!showPassword" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <!-- Eye off -->
              <svg *ngIf="showPassword" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="field" *ngIf="mode === 'signup'">
          <label for="role">Account type</label>
          <select id="role" [(ngModel)]="role">
            <option value="user">Candidate</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <button class="btn-submit" (click)="submit()" [disabled]="loading()">
          <app-spinner [loading]="loading()" />
          {{ mode === "login" ? "Log in" : "Create account" }}
        </button>

        <app-alert [message]="error()" type="error" />
        <app-alert [message]="success()" type="success" />
        <app-alert [message]="socialMsg()" type="info" />

        <!-- Footer toggle -->
        <p class="card__foot">
          {{ mode === "login" ? "No account?" : "Already have an account?" }}
          <button class="toggle-link" (click)="mode = mode === 'login' ? 'signup' : 'login'">
            {{ mode === "login" ? "Sign up free" : "Log in" }}
          </button>
        </p>

      </div>
    </div>
  `,
  styles: [`
    /* ── Page shell ────────────────────────────────────────────── */
    .page {
      display: flex; align-items: flex-start; justify-content: center;
      min-height: calc(100vh - 56px); padding: 56px 16px 40px;
      background: var(--bg);
    }

    /* ── Card ──────────────────────────────────────────────────── */
    .card {
      width: 100%; max-width: 380px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 32px 28px 26px;
      box-shadow: 0 8px 32px rgba(0,0,0,.18), 0 1px 0 rgba(255,255,255,.04) inset;
      transition: background var(--transition), border-color var(--transition);
    }

    /* ── Header ────────────────────────────────────────────────── */
    .card__head { margin-bottom: 22px; }
    .wordmark {
      display: inline-block; font-size: 13px; font-weight: 800;
      letter-spacing: -.2px; color: var(--text-muted); text-decoration: none;
      margin-bottom: 14px;
    }
    .wordmark:hover { color: var(--text); }
    .card__title {
      font-size: 22px; font-weight: 800; color: var(--text);
      margin: 0 0 4px; letter-spacing: -.4px; line-height: 1.2;
    }
    .card__sub { font-size: 13px; color: var(--text-muted); margin: 0; }

    /* ── OAuth row ─────────────────────────────────────────────── */
    .oauth-row { display: flex; gap: 8px; margin-bottom: 16px; }
    .oauth-btn {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      flex: 1; height: 38px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity .15s, transform .12s, box-shadow .15s;
      border: none;
    }
    .oauth-btn:hover { opacity: .88; transform: translateY(-1px); }
    .oauth-btn:active { transform: translateY(0); }

    .oauth-btn--google {
      background: #fff; color: #1a1a1a;
      box-shadow: 0 1px 3px rgba(0,0,0,.2);
    }
    .oauth-btn--github {
      background: #24292f; color: #f0f6fc;
      box-shadow: 0 1px 3px rgba(0,0,0,.3);
    }

    /* ── Divider ────────────────────────────────────────────────── */
    .divider {
      display: flex; align-items: center; gap: 10px;
      margin: 4px 0 18px; color: var(--text-muted); font-size: 11px;
      font-weight: 500; text-transform: uppercase; letter-spacing: .5px;
    }
    .divider::before, .divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }

    /* ── Input with icon overlay ────────────────────────────────── */
    .input-wrap { position: relative; }
    .input-wrap input { padding-right: 38px; }
    .eye-btn {
      position: absolute; right: 1px; top: 1px; bottom: 1px;
      width: 36px; border: none; background: transparent;
      color: var(--text-muted); cursor: pointer; border-radius: 0 7px 7px 0;
      display: flex; align-items: center; justify-content: center;
      transition: color var(--transition);
    }
    .eye-btn:hover { color: var(--text-2); }
    .eye-btn svg { display: block; flex-shrink: 0; }

    /* ── Fields ─────────────────────────────────────────────────── */
    .field { margin-bottom: 13px; }
    .field label, .field__labelrow label {
      display: block; font-size: 12px; font-weight: 700;
      color: var(--text-2); margin-bottom: 5px; letter-spacing: .1px;
    }
    .field__labelrow {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 5px;
    }
    .forgot-link {
      font-size: 12px; color: var(--accent-blue); text-decoration: none; font-weight: 500;
    }
    .forgot-link:hover { text-decoration: underline; }

    /* ── Submit ─────────────────────────────────────────────────── */
    .btn-submit {
      width: 100%; height: 40px; margin-top: 4px;
      background: var(--primary); color: var(--primary-fg);
      border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px;
      letter-spacing: -.1px;
      box-shadow: 0 1px 8px color-mix(in srgb, var(--primary) 35%, transparent);
      transition: background var(--transition), transform .12s, box-shadow var(--transition);
    }
    .btn-submit:disabled { opacity: .5; cursor: not-allowed; }
    .btn-submit:hover:not(:disabled) {
      background: var(--primary-hover); transform: translateY(-1px);
      box-shadow: 0 4px 16px color-mix(in srgb, var(--primary) 42%, transparent);
    }
    .btn-submit:active:not(:disabled) { transform: translateY(0); }

    /* ── Footer ─────────────────────────────────────────────────── */
    .card__foot {
      text-align: center; font-size: 12px;
      color: var(--text-muted); margin: 16px 0 0;
    }
    .toggle-link {
      background: none; border: none; color: var(--accent-blue);
      font-size: 12px; font-weight: 600; cursor: pointer; padding: 0;
    }
    .toggle-link:hover { text-decoration: underline; }
  `],
})
export class AuthPageComponent {
  mode: "login" | "signup" = "login";
  email = "";
  password = "";
  role = "user";
  showPassword = false;
  loading = signal(false);
  error = signal("");
  success = signal("");
  socialMsg = signal("");

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  socialNotice(provider: string) {
    this.socialMsg.set(`${provider} login coming soon — use email for now.`);
    setTimeout(() => this.socialMsg.set(""), 4000);
  }

  submit() {
    this.error.set(""); this.success.set(""); this.socialMsg.set("");
    this.loading.set(true);
    if (this.mode === "signup") {
      this.auth.signup(this.email, this.password, this.role).subscribe({
        next: () => { this.success.set("Account created. Logging you in…"); this._doLogin(); },
        error: (e) => { this.loading.set(false); this.error.set(typeof e.detail === "string" ? e.detail : "Signup failed"); },
      });
    } else {
      this._doLogin();
    }
  }

  private _doLogin() {
    this.auth.login(this.email, this.password).subscribe({
      next: () => { this.auth.setRole(this.role); this.loading.set(false); this.router.navigate(["/dashboard"]); },
      error: (e) => { this.loading.set(false); this.error.set(typeof e.detail === "string" ? e.detail : "Invalid credentials"); },
    });
  }
}
