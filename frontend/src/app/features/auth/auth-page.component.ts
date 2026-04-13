import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../../core/auth.service";
import { AlertComponent } from "../../shared/alert.component";
import { SpinnerComponent } from "../../shared/spinner.component";

@Component({
  selector: "app-auth-page",
  standalone: true,
  imports: [CommonModule, FormsModule, AlertComponent, SpinnerComponent],
  template: `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-header">
          <h1>MockStack</h1>
          <p>AI-powered mock interview platform</p>
        </div>

        <div class="tab-row">
          <button [class.active]="mode === 'login'" (click)="mode = 'login'">Login</button>
          <button [class.active]="mode === 'signup'" (click)="mode = 'signup'">Sign Up</button>
        </div>

        <div class="field">
          <label>Email</label>
          <input [(ngModel)]="email" type="email" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="field">
          <label>Password</label>
          <input [(ngModel)]="password" type="password"
            [placeholder]="mode === 'signup' ? 'Min 8 chars with a number or symbol' : 'Your password'"
            autocomplete="current-password" />
        </div>
        <div class="field" *ngIf="mode === 'signup'">
          <label>Role</label>
          <select [(ngModel)]="role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <button class="btn-submit" (click)="submit()" [disabled]="loading()">
          {{ mode === 'login' ? 'Login' : 'Create Account' }}
          <app-spinner [loading]="loading()" />
        </button>

        <app-alert [message]="error()" type="error" />
        <app-alert [message]="success()" type="success" />

        <p class="auth-footer">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button class="link-btn" (click)="mode = mode === 'login' ? 'signup' : 'login'">
            {{ mode === 'login' ? 'Sign up' : 'Login' }}
          </button>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-wrap {
      display: flex; justify-content: center; align-items: flex-start;
      padding-top: 60px; min-height: 80vh;
    }
    .auth-card {
      width: 100%; max-width: 420px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-xl); padding: 36px 32px;
      box-shadow: var(--shadow-lg);
      transition: background var(--transition), border-color var(--transition);
    }
    .auth-header { text-align: center; margin-bottom: 24px; }
    .auth-header h1 { font-size: 26px; font-weight: 900; color: var(--text); margin: 0; }
    .auth-header p { color: var(--text-muted); font-size: 14px; margin: 4px 0 0; }
    .tab-row {
      display: flex; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 4px; margin-bottom: 20px; gap: 4px;
    }
    .tab-row button {
      flex: 1; border: none; padding: 8px; border-radius: var(--radius-sm);
      cursor: pointer; font-size: 14px; font-weight: 500;
      background: transparent; color: var(--text-muted);
      transition: background var(--transition), color var(--transition);
    }
    .tab-row button.active {
      background: var(--surface); color: var(--text);
      box-shadow: var(--shadow-sm);
    }
    .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
    .field label { font-size: 13px; font-weight: 600; color: var(--text-2); }
    .btn-submit {
      width: 100%; padding: 11px; margin-top: 4px;
      background: var(--primary); color: var(--primary-fg);
      border: none; border-radius: var(--radius); font-size: 15px; font-weight: 600;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background var(--transition), transform 0.1s;
    }
    .btn-submit:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-submit:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
    .auth-footer { text-align: center; font-size: 13px; color: var(--text-muted); margin-top: 16px; }
    .link-btn {
      background: none; border: none; color: var(--accent-blue);
      font-size: 13px; cursor: pointer; padding: 0; font-weight: 600;
    }
    .link-btn:hover { text-decoration: underline; }
  `],
})
export class AuthPageComponent {
  mode: "login" | "signup" = "login";
  email = "";
  password = "";
  role = "user";
  loading = signal(false);
  error = signal("");
  success = signal("");

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit() {
    this.error.set("");
    this.success.set("");
    this.loading.set(true);

    if (this.mode === "signup") {
      this.auth.signup(this.email, this.password, this.role).subscribe({
        next: () => {
          this.success.set("Account created. Logging you in…");
          this._doLogin();
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(typeof e.detail === "string" ? e.detail : "Signup failed");
        },
      });
    } else {
      this._doLogin();
    }
  }

  private _doLogin() {
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.auth.setRole(this.role);
        this.loading.set(false);
        this.router.navigate(["/dashboard"]);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(typeof e.detail === "string" ? e.detail : "Invalid credentials");
      },
    });
  }
}
