import { Injectable, signal, effect } from "@angular/core";

export type Theme = "light" | "dark";

@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly theme = signal<Theme>(
    (localStorage.getItem("theme") as Theme) ?? "light",
  );

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("theme", t);
    });
    // Apply immediately on load
    document.documentElement.setAttribute("data-theme", this.theme());
  }

  toggle() {
    this.theme.update((t) => (t === "light" ? "dark" : "light"));
  }
}
