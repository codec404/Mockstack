import { Component, OnInit, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../core/api.service";
import { AuthService } from "../../core/auth.service";
import { SpinnerComponent } from "../../shared/spinner.component";
import { AlertComponent } from "../../shared/alert.component";

interface LeaderboardEntry {
  rank: number;
  handle: string;
  rank_tier: string;
  total_points: number;
  total_interviews: number;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total_users: number;
}

const TIER_COLORS: Record<string, string> = {
  "Newbie":           "#9ca3af",
  "Apprentice":       "#4ade80",
  "Specialist":       "#22d3ee",
  "Expert":           "#60a5fa",
  "Candidate Master": "#c084fc",
  "Master":           "#fb923c",
  "Grandmaster":      "#f87171",
};

@Component({
  selector: "app-leaderboard-page",
  standalone: true,
  imports: [CommonModule, RouterLink, SpinnerComponent, AlertComponent],
  template: `
    <div class="lb-wrap">

      <!-- Hero header -->
      <div class="lb-hero">
        <div class="lb-hero__icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
          </svg>
        </div>
        <div>
          <h1>Global Leaderboard</h1>
          <p>Top performers across MockStack — ranked by rating points earned in interviews.</p>
        </div>
        <div class="lb-hero__meta" *ngIf="response">
          <div class="meta-pill">
            <span class="meta-pill__val">{{ response.total_users | number }}</span>
            <span class="meta-pill__lbl">registered users</span>
          </div>
          <div class="meta-pill">
            <span class="meta-pill__val">{{ response.entries.length }}</span>
            <span class="meta-pill__lbl">ranked players</span>
          </div>
        </div>
      </div>

      <app-alert [message]="error()" type="error" />

      <div class="loading-wrap" *ngIf="loading()">
        <app-spinner [loading]="true" />
      </div>

      <ng-container *ngIf="!loading() && response">

        <!-- Empty state -->
        <div class="empty-state" *ngIf="response.entries.length === 0">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".3">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>No ranked players yet. Complete an interview to claim your spot!</p>
          <a routerLink="/dashboard">Start an interview →</a>
        </div>

        <ng-container *ngIf="response.entries.length > 0">

          <!-- Podium (top 3) -->
          <div class="podium" *ngIf="response.entries.length >= 3">
            <!-- 2nd place -->
            <div class="podium__card podium__card--silver">
              <div class="podium__crown silver-crown">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#9ca3af"><path d="M2 20h20v2H2v-2ZM4 18l4-8 4 5 4-10 4 13H4Z"/></svg>
              </div>
              <div class="podium__rank">2nd</div>
              <a class="podium__name" [routerLink]="['/profile', response.entries[1].handle]">{{ '@' + response.entries[1].handle }}</a>
              <div class="podium__tier-badge" [style.color]="tierColor(response.entries[1].rank_tier)" [style.border-color]="tierColor(response.entries[1].rank_tier)">
                {{ response.entries[1].rank_tier }}
              </div>
              <div class="podium__pts">{{ response.entries[1].total_points | number }}</div>
              <div class="podium__pts-lbl">points</div>
              <div class="podium__bar podium__bar--silver"></div>
            </div>
            <!-- 1st place -->
            <div class="podium__card podium__card--gold">
              <div class="podium__crown gold-crown">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#f59e0b"><path d="M2 20h20v2H2v-2ZM4 18l4-8 4 5 4-10 4 13H4Z"/></svg>
              </div>
              <div class="podium__rank podium__rank--gold">1st</div>
              <a class="podium__name" [routerLink]="['/profile', response.entries[0].handle]">{{ '@' + response.entries[0].handle }}</a>
              <div class="podium__tier-badge" [style.color]="tierColor(response.entries[0].rank_tier)" [style.border-color]="tierColor(response.entries[0].rank_tier)">
                {{ response.entries[0].rank_tier }}
              </div>
              <div class="podium__pts podium__pts--gold">{{ response.entries[0].total_points | number }}</div>
              <div class="podium__pts-lbl">points</div>
              <div class="podium__bar podium__bar--gold"></div>
            </div>
            <!-- 3rd place -->
            <div class="podium__card podium__card--bronze">
              <div class="podium__crown bronze-crown">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#b45309"><path d="M2 20h20v2H2v-2ZM4 18l4-8 4 5 4-10 4 13H4Z"/></svg>
              </div>
              <div class="podium__rank">3rd</div>
              <a class="podium__name" [routerLink]="['/profile', response.entries[2].handle]">{{ '@' + response.entries[2].handle }}</a>
              <div class="podium__tier-badge" [style.color]="tierColor(response.entries[2].rank_tier)" [style.border-color]="tierColor(response.entries[2].rank_tier)">
                {{ response.entries[2].rank_tier }}
              </div>
              <div class="podium__pts">{{ response.entries[2].total_points | number }}</div>
              <div class="podium__pts-lbl">points</div>
              <div class="podium__bar podium__bar--bronze"></div>
            </div>
          </div>

          <!-- Tier legend -->
          <div class="tier-legend">
            <div class="tier-legend__item" *ngFor="let t of tierList">
              <span class="tier-legend__dot" [style.background]="t.color"></span>
              <span class="tier-legend__name" [style.color]="t.color">{{ t.name }}</span>
              <span class="tier-legend__range">{{ t.range }}</span>
            </div>
          </div>

          <!-- Full ranked table -->
          <div class="lb-table-wrap">
            <div class="lb-table-head">
              <span>#</span>
              <span>User</span>
              <span>Tier</span>
              <span>Points</span>
              <span>Sessions</span>
            </div>
            <div
              class="lb-row"
              *ngFor="let e of response.entries"
              [class.lb-row--gold]="e.rank === 1"
              [class.lb-row--silver]="e.rank === 2"
              [class.lb-row--bronze]="e.rank === 3">
              <span class="lb-rank">
                <span class="lb-rank__medal" *ngIf="e.rank <= 3">{{ e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉' }}</span>
                <span *ngIf="e.rank > 3" class="lb-rank__num">{{ e.rank }}</span>
              </span>
              <a class="lb-name" [routerLink]="['/profile', e.handle]">{{ '@' + e.handle }}</a>
              <span class="lb-tier">
                <span class="lb-tier__badge" [style.color]="tierColor(e.rank_tier)" [style.border-color]="tierColor(e.rank_tier)">
                  {{ e.rank_tier }}
                </span>
              </span>
              <span class="lb-pts" [style.color]="tierColor(e.rank_tier)">{{ e.total_points | number }}</span>
              <span class="lb-sessions">{{ e.total_interviews }}</span>
            </div>
          </div>

          <div class="lb-footer">
            Rankings update automatically after each completed interview.
            <a routerLink="/auth" *ngIf="!auth.isLoggedIn()">Sign up and join the leaderboard →</a>
            <a routerLink="/dashboard" *ngIf="auth.isLoggedIn()">Start an interview →</a>
          </div>

        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [`
    .lb-wrap { max-width: 860px; margin: 0 auto; }

    /* ── Hero ────────────────────────────────────────── */
    .lb-hero {
      display: flex; align-items: flex-start; gap: 18px;
      margin-bottom: 28px; flex-wrap: wrap;
    }
    .lb-hero__icon {
      width: 60px; height: 60px; border-radius: 14px; flex-shrink: 0;
      background: var(--accent-blue-bg); border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent);
      display: flex; align-items: center; justify-content: center; color: var(--accent-blue);
    }
    .lb-hero h1 { font-size: 24px; font-weight: 900; color: var(--text); margin: 0; letter-spacing: -.4px; }
    .lb-hero p  { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }
    .lb-hero__meta { margin-left: auto; display: flex; gap: 12px; flex-shrink: 0; }
    .meta-pill {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 10px 16px; text-align: center;
    }
    .meta-pill__val { display: block; font-size: 22px; font-weight: 900; color: var(--text); line-height: 1; }
    .meta-pill__lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted); }

    /* ── Podium ──────────────────────────────────────── */
    .podium {
      display: flex; align-items: flex-end; justify-content: center;
      gap: 12px; margin-bottom: 28px;
    }
    .podium__card {
      display: flex; flex-direction: column; align-items: center;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px 16px 0; width: 220px;
      position: relative; overflow: hidden;
    }
    .podium__card--gold   { border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.05); }
    .podium__card--silver { border-color: rgba(156,163,175,.35); background: rgba(156,163,175,.04); }
    .podium__card--bronze { border-color: rgba(180,83,9,.35);   background: rgba(180,83,9,.04); }
    .podium__crown { margin-bottom: 6px; }
    .podium__rank { font-size: 11px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; color: var(--text-muted); }
    .podium__rank--gold { color: #f59e0b; font-size: 13px; }
    .podium__name { font-size: 13px; font-weight: 800; color: var(--text); margin: 8px 0 6px; text-align: center; word-break: break-all; text-decoration: none; display: block; }
    .podium__name:hover { color: var(--accent-blue); }
    .podium__tier-badge {
      border: 1.5px solid; border-radius: 999px;
      padding: 2px 10px; font-size: 10px; font-weight: 900;
      letter-spacing: .3px; margin-bottom: 8px;
    }
    .podium__pts { font-size: 28px; font-weight: 900; color: var(--text); line-height: 1; }
    .podium__pts--gold { font-size: 34px; color: #f59e0b; }
    .podium__pts-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted); margin: 3px 0 14px; }
    .podium__bar { width: 100%; height: 8px; border-radius: 0 0 4px 4px; }
    .podium__bar--gold   { background: #f59e0b; }
    .podium__bar--silver { background: #9ca3af; }
    .podium__bar--bronze { background: #b45309; }

    /* ── Tier legend ─────────────────────────────────── */
    .tier-legend {
      display: flex; flex-wrap: wrap; gap: 8px 16px;
      margin-bottom: 20px; padding: 14px 18px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    }
    .tier-legend__item { display: flex; align-items: center; gap: 6px; }
    .tier-legend__dot  { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .tier-legend__name { font-size: 11px; font-weight: 800; }
    .tier-legend__range { font-size: 10px; color: var(--text-muted); }

    /* ── Table ───────────────────────────────────────── */
    .lb-table-wrap {
      background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
      overflow: hidden; margin-bottom: 16px;
    }
    .lb-table-head, .lb-row {
      display: grid;
      grid-template-columns: 52px 1fr 160px 100px 80px;
      padding: 10px 18px; align-items: center; gap: 8px;
    }
    .lb-table-head {
      font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px;
      color: var(--text-muted); border-bottom: 2px solid var(--border-2);
    }
    .lb-row {
      border-bottom: 1px solid var(--border);
      transition: background .15s;
    }
    .lb-row:last-child { border-bottom: none; }
    .lb-row:hover { background: var(--bg-alt); }
    .lb-row--gold   { background: rgba(245,158,11,.06); }
    .lb-row--silver { background: rgba(156,163,175,.05); }
    .lb-row--bronze { background: rgba(180,83,9,.05); }
    .lb-rank { display: flex; align-items: center; }
    .lb-rank__medal { font-size: 20px; }
    .lb-rank__num { font-size: 13px; font-weight: 800; color: var(--text-muted); }
    .lb-name { font-size: 13px; font-weight: 700; color: var(--text); text-decoration: none; }
    .lb-name:hover { color: var(--accent-blue); }
    .lb-tier__badge {
      border: 1.5px solid; border-radius: 999px;
      padding: 2px 10px; font-size: 10px; font-weight: 900; width: fit-content;
    }
    .lb-pts { font-size: 14px; font-weight: 900; }
    .lb-sessions { font-size: 13px; color: var(--text-muted); font-weight: 600; }

    .lb-footer { text-align: center; font-size: 12px; color: var(--text-muted); padding: 12px 0; }
    .lb-footer a { color: var(--accent-blue); font-weight: 600; margin-left: 4px; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 56px 0; color: var(--text-muted); text-align: center; }
    .empty-state p { font-size: 14px; }
    .empty-state a { color: var(--accent-blue); font-weight: 600; }
    .loading-wrap { display: flex; justify-content: center; padding: 80px; }

    @media (max-width: 640px) {
      .podium { flex-direction: column; align-items: center; }
      .podium__card { width: 100%; max-width: 300px; }
      .lb-table-head, .lb-row { grid-template-columns: 44px 1fr 90px 70px; }
      .lb-table-head span:nth-child(5), .lb-row > span:nth-child(5) { display: none; }
    }
  `],
})
export class LeaderboardPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  loading  = signal(true);
  error    = signal("");
  response: LeaderboardResponse | null = null;

  readonly tierList = [
    { name: "Grandmaster",      color: "#f87171", range: "2500+" },
    { name: "Master",           color: "#fb923c", range: "2000–2499" },
    { name: "Candidate Master", color: "#c084fc", range: "1500–1999" },
    { name: "Expert",           color: "#60a5fa", range: "1000–1499" },
    { name: "Specialist",       color: "#22d3ee", range: "600–999" },
    { name: "Apprentice",       color: "#4ade80", range: "300–599" },
    { name: "Newbie",           color: "#9ca3af", range: "0–299" },
  ];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true); this.error.set("");
    this.api.get<LeaderboardResponse>("/leaderboard").subscribe({
      next: (r) => { this.response = r; this.loading.set(false); },
      error: (e) => { this.error.set(e?.detail ?? "Failed to load leaderboard"); this.loading.set(false); },
    });
  }

  tierColor(tier: string): string { return TIER_COLORS[tier] ?? "#9ca3af"; }
}
