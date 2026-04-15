import { Component, OnInit, OnDestroy, signal, computed, inject, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../core/api.service";
import { AuthService } from "../../core/auth.service";
import { AlertComponent } from "../../shared/alert.component";
import { SpinnerComponent } from "../../shared/spinner.component";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

interface ProfileData {
  handle: string;
  rank_tier: string;
  total_points: number;
  total_interviews: number;
  avg_score: number;
  avg_clarity: number;
  friend_count: number;
  is_self: boolean;
  is_friend: boolean;
  email?: string;
  avatar_url?: string;
}

interface PointsEntry {
  date: string;
  points_earned: number;
  cumulative_points: number;
  domain: string;
  difficulty: string;
  avg_score: number;
  clarity_score: number;
}

const PAGE_SIZE = 5;

const TIER_COLOR: Record<string, string> = {
  Newbie: "#9ca3af", Apprentice: "#4ade80", Specialist: "#22d3ee",
  Expert: "#60a5fa", "Candidate Master": "#c084fc", Master: "#fb923c", Grandmaster: "#f87171",
};

@Component({
  selector: "app-profile-page",
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AlertComponent, SpinnerComponent],
  template: `
    <div class="profile-wrap">

      <app-spinner [loading]="loading()" />
      <app-alert [message]="error()" type="error" />
      <app-alert [message]="success()" type="success" />

      <div *ngIf="!loading() && profile" class="profile">

        <!-- ── Avatar + Header ───────────────────────────────── -->
        <div class="hero" [style]="'--tc:' + tierColor">
          <!-- Avatar: clickable for own profile to upload picture -->
          <div class="hero__avatar" [style.background]="tierColor + '22'" [style.border-color]="tierColor"
               [class.hero__avatar--clickable]="profile.is_self"
               (click)="profile.is_self && fileInput.click()">
            <img *ngIf="profile.avatar_url" [src]="profile.avatar_url" class="hero__avatar-img" alt="profile picture" />
            <span *ngIf="!profile.avatar_url">{{ initials }}</span>
            <div *ngIf="profile.is_self" class="hero__avatar-overlay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <!-- Hidden file input for avatar upload -->
          <input #fileInput type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                 style="display:none" (change)="onAvatarFile($event)" />

          <div class="hero__info">
            <div class="hero__handle">{{ "@" + profile.handle }}</div>
            <div class="hero__email" *ngIf="profile.is_self && profile.email">{{ profile.email }}</div>
            <div class="hero__tier" [style.color]="tierColor"
                 [style.border-color]="tierColor + '55'"
                 [style.background]="tierColor + '15'">
              {{ profile.rank_tier }}
            </div>
          </div>

          <!-- Actions -->
          <div class="hero__actions">
            <!-- Own profile: edit handle -->
            <div *ngIf="profile.is_self" class="handle-edit">
              <ng-container *ngIf="!editingHandle">
                <button class="btn btn--ghost" (click)="editingHandle = true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit handle
                </button>
              </ng-container>
              <ng-container *ngIf="editingHandle">
                <div class="handle-form">
                  <span class="handle-form__at">&#64;</span>
                  <input [(ngModel)]="newHandle" placeholder="your_handle"
                         maxlength="50" class="handle-input" (keydown.enter)="saveHandle()" />
                  <button class="btn btn--primary btn--sm" (click)="saveHandle()" [disabled]="savingHandle()">Save</button>
                  <button class="btn btn--ghost btn--sm" (click)="cancelEdit()">Cancel</button>
                </div>
              </ng-container>
            </div>

            <!-- Other user: add / remove friend -->
            <ng-container *ngIf="!profile.is_self && auth.isLoggedIn()">
              <button *ngIf="!profile.is_friend" class="btn btn--primary"
                      (click)="addFriend()" [disabled]="friendLoading()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Add Friend
              </button>
              <button *ngIf="profile.is_friend" class="btn btn--ghost btn--danger"
                      (click)="removeFriend()" [disabled]="friendLoading()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Remove Friend
              </button>
            </ng-container>

            <!-- Not logged in: prompt to sign in to add friend -->
            <a *ngIf="!profile.is_self && !auth.isLoggedIn()" routerLink="/auth"
               class="btn btn--ghost">Sign in to add friend</a>
          </div>
        </div>

        <!-- ── Stats ─────────────────────────────────────────── -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-card__val" [style.color]="tierColor">{{ profile.total_points | number }}</div>
            <div class="stat-card__lbl">Rating Points</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__val">{{ profile.total_interviews }}</div>
            <div class="stat-card__lbl">Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__val">{{ profile.avg_score }}<span>/10</span></div>
            <div class="stat-card__lbl">Avg Score</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__val">{{ profile.avg_clarity }}<span>/10</span></div>
            <div class="stat-card__lbl">Avg Clarity</div>
          </div>
          <div class="stat-card stat-card--link" [routerLink]="profile.is_self ? '/friends' : null"
               [class.clickable]="profile.is_self">
            <div class="stat-card__val">{{ profile.friend_count }}</div>
            <div class="stat-card__lbl">
              Friends
              <svg *ngIf="profile.is_self" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        </div>

        <!-- ── Points history chart + table (publicly visible) ── -->
        <div class="chart-card">
          <div class="chart-card__head">
            <div>
              <div class="chart-card__title">Rating History</div>
              <div class="chart-card__sub">Cumulative points across all sessions</div>
            </div>
            <span class="chart-card__total" [style.color]="tierColor">
              {{ profile.total_points | number }} pts
            </span>
          </div>

          <div *ngIf="pointsHistory.length === 0 && !chartLoading()" class="chart-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".35"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <p>No completed sessions yet</p>
          </div>

          <div class="chart-wrap" *ngIf="pointsHistory.length > 0">
            <canvas #pointsChart></canvas>
          </div>

          <!-- Paginated sessions table (same as analytics page) -->
          <ng-container *ngIf="pointsHistory.length > 0">
            <div class="table-header">
              <div class="chart-card__sub" style="margin:14px 0 0">
                {{ pointsHistory.length }} sessions &bull; page {{ tablePage() + 1 }} of {{ totalPages() }}
              </div>
            </div>
            <div class="sessions-table">
              <div class="sessions-row sessions-row--head">
                <span>Domain</span><span>Diff</span><span>Score</span><span>Clarity</span><span>Pts</span>
              </div>
              <div class="sessions-row" *ngFor="let e of pagedSessions()">
                <span class="domain-tag">{{ domainLabel(e.domain) }}</span>
                <span class="diff-tag" [attr.data-diff]="e.difficulty">{{ e.difficulty | titlecase }}</span>
                <span class="score-tag">{{ e.avg_score }}/10</span>
                <span class="score-tag">{{ e.clarity_score }}/10</span>
                <span class="pts-tag">+{{ e.points_earned }}</span>
              </div>
              <div class="sessions-row sessions-row--empty" *ngFor="let _ of emptyRows()">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div class="pagination" *ngIf="totalPages() > 1">
              <button class="pag-btn" (click)="prevPage()" [disabled]="tablePage() === 0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div class="pag-pages">
                <button *ngFor="let p of pageNumbers()"
                  class="pag-num" [class.pag-num--active]="p === tablePage()"
                  (click)="goToPage(p)">{{ p + 1 }}</button>
              </div>
              <button class="pag-btn" (click)="nextPage()" [disabled]="tablePage() === totalPages() - 1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </ng-container>
        </div>

      </div>

      <!-- Not found -->
      <div *ngIf="!loading() && !profile && !error()" class="not-found">
        <p>Profile not found.</p>
        <a routerLink="/leaderboard">← Back to Leaderboard</a>
      </div>

    </div>
  `,
  styles: [`
    .profile-wrap { max-width: 700px; margin: 0 auto; padding-bottom: 40px; }

    /* ── Hero ────────────────────────────────── */
    .hero {
      display: flex; align-items: flex-start; gap: 20px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 18px; padding: 28px; margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .hero__avatar {
      width: 70px; height: 70px; border-radius: 50%; border: 2px solid;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      font-size: 26px; font-weight: 900; color: var(--tc);
      position: relative; overflow: hidden;
    }
    .hero__avatar--clickable { cursor: pointer; }
    .hero__avatar--clickable:hover .hero__avatar-overlay { opacity: 1; }
    .hero__avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .hero__avatar-overlay {
      position: absolute; inset: 0; background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; opacity: 0; transition: opacity 0.18s;
      color: #fff;
    }
    .hero__info { flex: 1; min-width: 140px; }
    .hero__handle { font-size: 22px; font-weight: 900; color: var(--text); letter-spacing: -.4px; }
    .hero__email  { font-size: 12px; color: var(--text-muted); margin: 3px 0 6px; }
    .hero__tier   {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 999px; border: 1px solid;
      font-size: 11px; font-weight: 900; letter-spacing: .3px;
      margin-top: 6px;
    }
    .hero__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }

    /* ── Buttons ─────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 700;
      cursor: pointer; border: 1px solid; transition: background var(--transition), transform .1s;
    }
    .btn--primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
    .btn--primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn--ghost { background: var(--surface-2); color: var(--text-2); border-color: var(--border-2); }
    .btn--ghost:hover { background: var(--bg-alt); }
    .btn--danger { color: var(--accent-red-fg); border-color: color-mix(in srgb, var(--accent-red) 40%, transparent); }
    .btn--sm { padding: 6px 10px; font-size: 11px; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Handle edit ─────────────────────────── */
    .handle-form {
      display: flex; align-items: center; gap: 6px;
      background: var(--bg); border: 1px solid var(--border-2);
      border-radius: 8px; padding: 4px 8px;
    }
    .handle-form__at { color: var(--text-muted); font-weight: 700; font-size: 13px; }
    .handle-input {
      background: transparent; border: none; outline: none;
      color: var(--text); font-size: 13px; font-weight: 700; width: 120px;
    }

    /* ── Stats row ───────────────────────────── */
    .stats-row {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 10px; margin-bottom: 16px;
    }
    @media (max-width: 600px) { .stats-row { grid-template-columns: repeat(3, 1fr); } }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 16px 14px; text-align: center;
    }
    .stat-card.clickable { cursor: pointer; transition: border-color .18s; }
    .stat-card.clickable:hover { border-color: var(--accent-blue); }
    .stat-card__val { font-size: 26px; font-weight: 900; color: var(--text); line-height: 1; }
    .stat-card__val span { font-size: 12px; font-weight: 600; color: var(--text-muted); }
    .stat-card__lbl {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .5px; color: var(--text-muted); margin-top: 5px;
      display: flex; align-items: center; justify-content: center; gap: 3px;
    }

    /* ── Points chart ────────────────────────── */
    .chart-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px; margin-bottom: 16px;
    }
    .chart-card__head {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 16px;
    }
    .chart-card__title { font-size: 15px; font-weight: 800; color: var(--text); }
    .chart-card__sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .chart-card__total { font-size: 20px; font-weight: 900; }

    .chart-wrap { position: relative; height: 240px; }
    .chart-wrap canvas { width: 100% !important; height: 100% !important; }

    .chart-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 140px; gap: 8px; color: var(--text-muted);
    }
    .chart-empty p { font-size: 13px; }

    /* ── Sessions table (mirrors analytics page) ─── */
    .table-header { display: flex; align-items: flex-start; justify-content: space-between; }
    .sessions-table { overflow-x: auto; margin-top: 2px; }
    .sessions-row {
      display: grid; grid-template-columns: 1.6fr .8fr .6fr .6fr .5fr;
      gap: 8px; padding: 8px 4px; align-items: center;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
    }
    .sessions-row--head {
      color: var(--text-muted); font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid var(--border-2);
    }
    .sessions-row--empty { opacity: 0; pointer-events: none; }
    .domain-tag { color: var(--text-2); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .diff-tag { padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; width: fit-content; }
    .diff-tag[data-diff="easy"]   { background: #0a2318; color: #56d364; }
    .diff-tag[data-diff="medium"] { background: #1f1a08; color: #e3b341; }
    .diff-tag[data-diff="hard"]   { background: var(--accent-red-bg); color: var(--accent-red-fg); }
    .diff-tag[data-diff="expert"] { background: #1e0942; color: #c4b5fd; }
    .score-tag { color: var(--text); font-weight: 700; }
    .pts-tag   { color: #4ade80; font-weight: 800; }

    /* ── Pagination ──────────────────────────── */
    .pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; margin-top: 12px; padding-top: 10px;
      border-top: 1px solid var(--border);
    }
    .pag-btn {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 8px;
      border: 1px solid var(--border-2); background: var(--surface-2);
      color: var(--text-2); cursor: pointer;
      transition: background var(--transition), border-color var(--transition), color var(--transition);
    }
    .pag-btn:hover:not(:disabled) { background: var(--bg-alt); border-color: var(--accent-blue); color: var(--accent-blue); }
    .pag-btn:disabled { opacity: .35; cursor: not-allowed; }
    .pag-pages { display: flex; gap: 4px; }
    .pag-num {
      width: 30px; height: 30px; border-radius: 8px;
      border: 1px solid transparent; background: transparent;
      color: var(--text-muted); font-size: 12px; font-weight: 700; cursor: pointer;
      transition: background var(--transition), color var(--transition), border-color var(--transition);
    }
    .pag-num:hover { background: var(--surface-2); color: var(--text); }
    .pag-num--active { background: var(--accent-blue); color: #fff; border-color: var(--accent-blue); }

    /* ── Not found ───────────────────────────── */
    .not-found { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .not-found a { color: var(--accent-blue); font-weight: 600; font-size: 14px; text-decoration: none; }
  `],
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  private readonly route  = inject(ActivatedRoute);
  private readonly api    = inject(ApiService);
  readonly auth           = inject(AuthService);

  @ViewChild("fileInput") fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild("pointsChart") chartCanvas?: ElementRef<HTMLCanvasElement>;

  loading        = signal(true);
  error          = signal("");
  success        = signal("");
  friendLoading  = signal(false);
  savingHandle   = signal(false);
  uploadingAvatar = signal(false);
  chartLoading   = signal(false);

  profile: ProfileData | null = null;
  editingHandle = false;
  newHandle = "";
  pointsHistory: PointsEntry[] = [];
  private _chart: Chart | null = null;

  tablePage = signal(0);
  private _historySignal = signal<PointsEntry[]>([]);
  private _reversed = computed(() => [...this._historySignal()].reverse());
  totalPages   = computed(() => Math.max(1, Math.ceil(this._reversed().length / PAGE_SIZE)));
  pagedSessions = computed(() => {
    const p = this.tablePage();
    return this._reversed().slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  });
  emptyRows = computed(() => {
    const len = this.pagedSessions().length;
    return len < PAGE_SIZE ? Array(PAGE_SIZE - len) : [];
  });
  pageNumbers = computed(() => {
    const total = this.totalPages(), cur = this.tablePage();
    let start = Math.max(0, cur - 2);
    let end   = Math.min(total, start + 5);
    start = Math.max(0, end - 5);
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  prevPage()  { if (this.tablePage() > 0) this.tablePage.update(p => p - 1); }
  nextPage()  { if (this.tablePage() < this.totalPages() - 1) this.tablePage.update(p => p + 1); }
  goToPage(p: number) { this.tablePage.set(p); }

  get tierColor() { return TIER_COLOR[this.profile?.rank_tier ?? "Newbie"] ?? "#9ca3af"; }
  get initials()  { return (this.profile?.handle ?? "?").slice(0, 2).toUpperCase(); }

  domainLabel(d: string) {
    const map: Record<string, string> = {
      dsa: "DSA", cs_fundamentals: "CS Fund.", lld: "LLD", hld: "HLD",
    };
    return map[d] ?? d;
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const handle = params.get("handle") ?? "";
      this._destroyChart();
      this.pointsHistory = [];
      this._historySignal.set([]);
      this.tablePage.set(0);
      this.loadProfile(handle);
    });
  }

  ngOnDestroy() { this._destroyChart(); }

  loadProfile(handle: string) {
    this.loading.set(true);
    this.error.set("");
    this.api.get<ProfileData>(`/profile/${handle}`).subscribe({
      next: (p) => {
        this.profile = p;
        this.newHandle = p.handle;
        if (p.is_self) this.auth.updateAvatar(p.avatar_url ?? "");
        this.loading.set(false);
        this.loadPointsHistory(handle);
      },
      error: (e) => { this.error.set(e.detail ?? "Profile not found"); this.loading.set(false); },
    });
  }

  loadPointsHistory(handle: string) {
    this.chartLoading.set(true);
    this.api.get<{ entries: PointsEntry[] }>(`/profile/${handle}/points-history`).subscribe({
      next: (res) => {
        this.pointsHistory = res.entries;
        this._historySignal.set(res.entries);
        this.tablePage.set(0);
        this.chartLoading.set(false);
        if (res.entries.length > 0) {
          setTimeout(() => this._drawChart(), 0);
        }
      },
      error: () => this.chartLoading.set(false),
    });
  }

  private _drawChart() {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) return;
    this._destroyChart();

    const labels = this.pointsHistory.map((e, i) => `#${i + 1}`);
    const data   = this.pointsHistory.map(e => e.cumulative_points);
    const tc     = this.tierColor;

    // Tier bands drawn as a beforeDraw plugin
    const TIER_BANDS = [
      { min: 0,    max: 300,    color: "#9ca3af", label: "Newbie" },
      { min: 300,  max: 600,    color: "#4ade80", label: "Apprentice" },
      { min: 600,  max: 1000,   color: "#22d3ee", label: "Specialist" },
      { min: 1000, max: 1500,   color: "#60a5fa", label: "Expert" },
      { min: 1500, max: 2000,   color: "#c084fc", label: "Cand. Master" },
      { min: 2000, max: 2500,   color: "#fb923c", label: "Master" },
      { min: 2500, max: Infinity, color: "#f87171", label: "Grandmaster" },
    ];

    const tierBandsPlugin = {
      id: "tierBands",
      beforeDraw(chart: any) {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
        if (!y) return;
        ctx.save();
        for (const band of TIER_BANDS) {
          const bandBottom = Math.min(bottom, y.getPixelForValue(band.min));
          const bandTop    = band.max === Infinity
            ? top
            : Math.max(top, y.getPixelForValue(band.max));
          if (bandBottom <= bandTop) continue;

          // Filled background
          ctx.fillStyle = band.color + "18";
          ctx.fillRect(left, bandTop, right - left, bandBottom - bandTop);

          // Threshold line at the bottom of each band (except ground)
          if (band.min > 0) {
            ctx.strokeStyle = band.color + "55";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(left, bandBottom);
            ctx.lineTo(right, bandBottom);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Band label on the right edge
          const midY = (bandTop + bandBottom) / 2;
          if (bandBottom - bandTop > 16) {
            ctx.fillStyle = band.color + "cc";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(band.label.toUpperCase(), right - 4, midY);
          }
        }
        ctx.restore();
      },
    };

    this._chart = new Chart(canvas, {
      type: "line",
      plugins: [tierBandsPlugin],
      data: {
        labels,
        datasets: [{
          label: "Rating Points",
          data,
          fill: true,
          tension: 0.4,
          borderColor: tc,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: tc,
          pointBorderColor: "#0d1b22",
          pointBorderWidth: 2,
          backgroundColor: (ctx: any) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, tc + "50");
            gradient.addColorStop(1, tc + "00");
            return gradient;
          },
          order: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1e2a31",
            borderColor: "#2e3f47",
            borderWidth: 1,
            titleColor: "#e2e8f0",
            bodyColor: "#94a3b8",
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const e = this.pointsHistory[ctx.dataIndex];
                return [
                  ` ${ctx.formattedValue} pts total`,
                  ` +${e.points_earned} this session`,
                  ` ${this.domainLabel(e.domain)} · ${e.difficulty} · score ${e.avg_score}/10`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "#ffffff0a" },
            ticks: { color: "#64748b", font: { size: 11 } },
          },
          y: {
            grid: { color: "#ffffff0a" },
            ticks: {
              color: "#64748b", font: { size: 11 },
              // Show tier thresholds as tick marks
              callback: (v: any) => v >= 1000 ? `${v/1000}k` : String(v),
            },
            beginAtZero: true,
          },
        },
      },
    });
  }

  private _destroyChart() {
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  }

  saveHandle() {
    if (!this.newHandle.trim()) return;
    this.savingHandle.set(true);
    this.api.patch<{ handle: string }>("/users/me/handle", { handle: this.newHandle.trim() }).subscribe({
      next: (r) => {
        this.profile!.handle = r.handle;
        this.auth.updateHandle(r.handle);
        this.editingHandle = false;
        this.savingHandle.set(false);
        this.success.set("Handle updated!");
        setTimeout(() => this.success.set(""), 3000);
      },
      error: (e) => {
        this.savingHandle.set(false);
        this.error.set(e.detail ?? "Failed to update handle");
      },
    });
  }

  cancelEdit() { this.editingHandle = false; this.newHandle = this.profile?.handle ?? ""; }

  onAvatarFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      this.error.set("Image must be smaller than 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.uploadingAvatar.set(true);
      this.api.patch<{ avatar_url: string }>("/users/me/avatar", { avatar: dataUrl }).subscribe({
        next: (r) => {
          this.profile!.avatar_url = r.avatar_url;
          this.auth.updateAvatar(r.avatar_url);
          this.uploadingAvatar.set(false);
          this.success.set("Profile picture updated!");
          setTimeout(() => this.success.set(""), 3000);
        },
        error: (e) => {
          this.error.set(e.detail ?? "Failed to upload avatar");
          this.uploadingAvatar.set(false);
        },
      });
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    input.value = "";
  }

  addFriend() {
    this.friendLoading.set(true);
    this.api.post(`/friends/${this.profile!.handle}`, {}).subscribe({
      next: () => { this.profile!.is_friend = true; this.profile!.friend_count++; this.friendLoading.set(false); },
      error: (e) => { this.error.set(e.detail ?? "Failed to add friend"); this.friendLoading.set(false); },
    });
  }

  removeFriend() {
    this.friendLoading.set(true);
    this.api.delete(`/friends/${this.profile!.handle}`).subscribe({
      next: () => { this.profile!.is_friend = false; this.profile!.friend_count--; this.friendLoading.set(false); },
      error: (e) => { this.error.set(e.detail ?? "Failed to remove friend"); this.friendLoading.set(false); },
    });
  }
}
