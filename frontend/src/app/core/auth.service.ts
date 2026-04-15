import { Injectable, signal, computed } from "@angular/core";
import { Router } from "@angular/router";
import { tap } from "rxjs";
import { ApiService } from "./api.service";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  handle?: string;
  exp?: number;
}

const COOKIE_NAME = "mockstack_session";
const SESSION_DAYS = 7;

@Injectable({ providedIn: "root" })
export class AuthService {
  readonly accessToken = signal<string>(localStorage.getItem("accessToken") ?? "");
  readonly role   = signal<string>(localStorage.getItem("role")   ?? "user");
  readonly handle = signal<string>(localStorage.getItem("handle") ?? "");
  readonly avatar = signal<string>(localStorage.getItem("avatar") ?? "");
  readonly isLoggedIn = computed(() => !!this.accessToken());
  readonly isAdmin    = computed(() => this.role() === "admin");

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
  ) {}

  signup(email: string, password: string, role: string) {
    return this.api.post<{ id: string; email: string; role: string }>("/auth/signup", { email, password, role });
  }

  login(email: string, password: string) {
    return this.api.post<TokenPair>("/auth/login", { email, password }).pipe(
      tap((tokens) => this.storeTokens(tokens)),
    );
  }

  refreshToken() {
    const refresh = localStorage.getItem("refreshToken") ?? "";
    return this.api.post<TokenPair>("/auth/refresh", { refresh_token: refresh }).pipe(
      tap((tokens) => this.storeTokens(tokens)),
    );
  }

  logout() {
    const access = this.accessToken();
    const refresh = localStorage.getItem("refreshToken") ?? "";
    this.clearTokens();
    if (access) {
      this.api.post("/auth/logout", { access_token: access, refresh_token: refresh }).subscribe();
    }
    this.router.navigate(["/"]);
  }

  setRole(role: string) {
    this.role.set(role);
    localStorage.setItem("role", role);
    this._patchCookieRole(role);
  }

  // ── token storage ─────────────────────────────────────────────────────────

  storeTokens(tokens: TokenPair) {
    const payload = this._decodeJwt(tokens.access_token);
    const role   = payload.role   ?? localStorage.getItem("role")   ?? "user";
    const email  = payload.email  ?? "";
    const handle = payload.handle ?? localStorage.getItem("handle") ?? email.split("@")[0];

    this.accessToken.set(tokens.access_token);
    this.role.set(role);
    this.handle.set(handle);
    localStorage.setItem("accessToken", tokens.access_token);
    localStorage.setItem("role", role);
    localStorage.setItem("handle", handle);
    if (tokens.refresh_token) {
      localStorage.setItem("refreshToken", tokens.refresh_token);
    }

    this._writeCookie({ email, role, handle });
  }

  updateHandle(newHandle: string) {
    this.handle.set(newHandle);
    localStorage.setItem("handle", newHandle);
    const existing = this._readCookie();
    if (existing) this._writeCookie({ ...existing, handle: newHandle });
  }

  updateAvatar(url: string) {
    this.avatar.set(url);
    if (url) localStorage.setItem("avatar", url);
    else localStorage.removeItem("avatar");
  }

  private clearTokens() {
    this.accessToken.set("");
    this.role.set("user");
    this.handle.set("");
    this.avatar.set("");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    localStorage.removeItem("handle");
    localStorage.removeItem("avatar");
    this._deleteCookie();
  }

  // ── cookie helpers ─────────────────────────────────────────────────────────

  private _writeCookie(data: { email: string; role: string; handle?: string }) {
    const expires = new Date();
    expires.setDate(expires.getDate() + SESSION_DAYS);
    const value = encodeURIComponent(JSON.stringify({ ...data, ts: Date.now() }));
    document.cookie = `${COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
  }

  private _patchCookieRole(role: string) {
    const existing = this._readCookie();
    if (existing) this._writeCookie({ ...existing, role });
  }

  private _readCookie(): { email: string; role: string; handle?: string } | null {
    const match = document.cookie.split("; ").find((c) => c.startsWith(COOKIE_NAME + "="));
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
    } catch {
      return null;
    }
  }

  private _deleteCookie() {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
  }

  // ── JWT decode (client-side, no verification) ─────────────────────────────

  private _decodeJwt(token: string): JwtPayload {
    try {
      const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64));
    } catch {
      return {};
    }
  }
}
