import { Injectable, signal, computed } from "@angular/core";
import { Router } from "@angular/router";
import { tap } from "rxjs";
import { ApiService } from "./api.service";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

@Injectable({ providedIn: "root" })
export class AuthService {
  readonly accessToken = signal<string>(localStorage.getItem("accessToken") ?? "");
  readonly role = signal<string>(localStorage.getItem("role") ?? "user");
  readonly isLoggedIn = computed(() => !!this.accessToken());
  readonly isAdmin = computed(() => this.role() === "admin");

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

  private storeTokens(tokens: TokenPair) {
    this.accessToken.set(tokens.access_token);
    localStorage.setItem("accessToken", tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem("refreshToken", tokens.refresh_token);
    }
  }

  private clearTokens() {
    this.accessToken.set("");
    this.role.set("user");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
  }

  setRole(role: string) {
    this.role.set(role);
    localStorage.setItem("role", role);
  }
}
