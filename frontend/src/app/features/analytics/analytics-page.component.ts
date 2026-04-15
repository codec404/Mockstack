import {
  Component, OnInit, signal, computed,
  ViewChild, ElementRef, AfterViewInit, OnDestroy, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../core/api.service";
import { SpinnerComponent } from "../../shared/spinner.component";
import { AlertComponent } from "../../shared/alert.component";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

interface Analytics {
  total_interviews: number;
  avg_score: number;
  avg_clarity: number;
  total_points: number;
  rank_tier: string;
}

interface HistoryEntry {
  date: string;
  domain: string;
  difficulty: string;
  avg_score: number;
  clarity_score: number;
  points_earned: number;
}

interface DomainBreakdown { domain: string; avg_score: number; count: number; }

interface HistoryResponse {
  history: HistoryEntry[];
  domain_breakdown: DomainBreakdown[];
}

const TIER_CONFIG: Record<string, { color: string; bg: string; next: string; nextPts: number }> = {
  "Newbie":           { color: "#9ca3af", bg: "rgba(156,163,175,.12)", next: "Apprentice",      nextPts: 300 },
  "Apprentice":       { color: "#4ade80", bg: "rgba(74,222,128,.12)",  next: "Specialist",      nextPts: 600 },
  "Specialist":       { color: "#22d3ee", bg: "rgba(34,211,238,.12)",  next: "Expert",          nextPts: 1000 },
  "Expert":           { color: "#60a5fa", bg: "rgba(96,165,250,.12)",  next: "Candidate Master", nextPts: 1500 },
  "Candidate Master": { color: "#c084fc", bg: "rgba(192,132,252,.12)", next: "Master",          nextPts: 2000 },
  "Master":           { color: "#fb923c", bg: "rgba(251,146,60,.12)",  next: "Grandmaster",     nextPts: 2500 },
  "Grandmaster":      { color: "#f87171", bg: "rgba(248,113,113,.12)", next: "",                nextPts: 99999 },
};

const TIER_THRESHOLDS = [0, 300, 600, 1000, 1500, 2000, 2500];

const DOMAIN_LABELS: Record<string, string> = {
  dsa: "DSA", cs_fundamentals: "CS Fundamentals", lld: "Low-Level Design", hld: "High-Level Design",
};

const PAGE_SIZE = 5;

@Component({
  selector: "app-analytics-page",
  standalone: true,
  imports: [CommonModule, RouterLink, SpinnerComponent, AlertComponent],
  template: `
    <div class="ana-wrap">

      <!-- Header -->
      <div class="ana-header">
        <div>
          <h2>My Analytics</h2>
          <p>Performance across all completed sessions.</p>
        </div>
        <button class="btn-refresh" (click)="loadAll()" [disabled]="loading()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
          <app-spinner [loading]="loading()" />
        </button>
      </div>

      <app-alert [message]="error()" type="error" />

      <div *ngIf="!loading() && data">

        <!-- Row 1: Rank card + stat pills -->
        <div class="row row--top">

          <!-- Rank card -->
          <div class="rank-card" [style.border-color]="tierCfg()?.color" [style.background]="tierCfg()?.bg">
            <div class="rank-badge" [style.color]="tierCfg()?.color" [style.border-color]="tierCfg()?.color">
              {{ data.rank_tier }}
            </div>
            <div class="rank-pts">{{ data.total_points | number }} <span>pts</span></div>
            <div class="rank-label">Rating Points</div>

            <div class="rank-progress" *ngIf="data.rank_tier !== 'Grandmaster'">
              <div class="rank-progress__labels">
                <span>{{ tierStart() }} pts</span>
                <span>{{ tierCfg()?.next }}</span>
                <span>{{ tierCfg()?.nextPts }} pts</span>
              </div>
              <div class="rank-progress__bar">
                <div class="rank-progress__fill"
                     [style.width]="progressPct() + '%'"
                     [style.background]="tierCfg()?.color">
                </div>
              </div>
              <div class="rank-progress__remain">
                {{ (tierCfg()?.nextPts ?? 0) - data.total_points }} pts to next tier
              </div>
            </div>
            <div class="rank-max" *ngIf="data.rank_tier === 'Grandmaster'">
              Peak tier achieved
            </div>
          </div>

          <!-- Stat pills -->
          <div class="stat-grid">
            <div class="stat-pill stat-pill--blue">
              <div class="stat-pill__val">{{ data.total_interviews }}</div>
              <div class="stat-pill__lbl">Sessions</div>
            </div>
            <div class="stat-pill stat-pill--green">
              <div class="stat-pill__val">{{ data.avg_score }}<span>/10</span></div>
              <div class="stat-pill__lbl">Avg Score</div>
            </div>
            <div class="stat-pill stat-pill--purple">
              <div class="stat-pill__val">{{ data.avg_clarity }}<span>/10</span></div>
              <div class="stat-pill__lbl">Avg Clarity</div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div class="empty-state" *ngIf="data.total_interviews === 0">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".35">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
          <p>No completed sessions yet.</p>
          <a routerLink="/dashboard">Start your first interview →</a>
        </div>

        <ng-container *ngIf="data.total_interviews > 0 && history">

          <!-- Row 2: Line chart + Radar chart -->
          <div class="row row--charts">
            <div class="chart-card">
              <div class="chart-card__title">Score Trend</div>
              <div class="chart-card__sub">Last {{ history.history.length }} sessions</div>
              <div class="chart-wrap">
                <canvas #lineChart></canvas>
              </div>
            </div>
            <div class="chart-card">
              <div class="chart-card__title">Domain Performance</div>
              <div class="chart-card__sub">Average score per domain</div>
              <div class="chart-wrap chart-wrap--radar">
                <canvas #radarChart></canvas>
              </div>
            </div>
          </div>

          <!-- Row 3: Donut + Recent sessions -->
          <div class="row row--bottom">
            <div class="chart-card chart-card--donut">
              <div class="chart-card__title">Difficulty Mix</div>
              <div class="chart-card__sub">Interviews by difficulty</div>
              <div class="chart-wrap chart-wrap--donut">
                <canvas #donutChart></canvas>
              </div>
              <div class="donut-legend">
                <div class="donut-legend__item" *ngFor="let d of donutLegend">
                  <span class="donut-legend__dot" [style.background]="d.color"></span>
                  <span class="donut-legend__lbl">{{ d.label }}</span>
                  <span class="donut-legend__val">{{ d.val }}</span>
                </div>
              </div>
            </div>
            <div class="chart-card chart-card--table">
              <div class="table-header">
                <div>
                  <div class="chart-card__title">Recent Sessions</div>
                  <div class="chart-card__sub">{{ history.history.length }} completed &bull; page {{ tablePage() + 1 }} of {{ totalPages() }}</div>
                </div>
              </div>
              <div class="sessions-table">
                <div class="sessions-row sessions-row--head">
                  <span>Domain</span><span>Diff</span><span>Score</span><span>Clarity</span><span>Pts</span>
                </div>
                <div class="sessions-row" *ngFor="let h of pagedSessions()">
                  <span class="domain-tag">{{ domainLabel(h.domain) }}</span>
                  <span class="diff-tag" [attr.data-diff]="h.difficulty">{{ h.difficulty | titlecase }}</span>
                  <span class="score-tag">{{ h.avg_score }}/10</span>
                  <span class="score-tag">{{ h.clarity_score }}/10</span>
                  <span class="pts-tag">+{{ h.points_earned }}</span>
                </div>
                <!-- Empty rows to keep table height stable -->
                <div class="sessions-row sessions-row--empty"
                     *ngFor="let _ of emptyRows()">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
              </div>
              <!-- Pagination controls -->
              <div class="pagination" *ngIf="totalPages() > 1">
                <button class="pag-btn" (click)="prevPage()" [disabled]="tablePage() === 0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="pag-pages">
                  <button *ngFor="let p of pageNumbers()"
                    class="pag-num"
                    [class.pag-num--active]="p === tablePage()"
                    (click)="goToPage(p)">
                    {{ p + 1 }}
                  </button>
                </div>
                <button class="pag-btn" (click)="nextPage()" [disabled]="tablePage() === totalPages() - 1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          </div>

        </ng-container>
      </div>

      <div class="loading-wrap" *ngIf="loading()">
        <app-spinner [loading]="true" />
      </div>

    </div>
  `,
  styles: [`
    .ana-wrap { max-width: 980px; margin: 0 auto; }
    .ana-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .ana-header h2 { margin: 0; font-size: 22px; font-weight: 900; color: var(--text); letter-spacing: -.3px; }
    .ana-header p  { color: var(--text-muted); font-size: 13px; margin: 4px 0 0; }
    .btn-refresh {
      display: inline-flex; align-items: center; gap: 6px;
      border: 1px solid var(--border-2); background: var(--surface-2); color: var(--text-2);
      padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
      transition: background var(--transition), border-color var(--transition);
    }
    .btn-refresh:hover:not(:disabled) { background: var(--bg-alt); border-color: var(--accent-blue); color: var(--accent-blue); }
    .btn-refresh:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Rows ──────────────────────────────────────────── */
    .row { display: grid; gap: 16px; margin-bottom: 16px; }
    .row--top    { grid-template-columns: 340px 1fr; }
    .row--charts { grid-template-columns: 1fr 1fr; }
    .row--bottom { grid-template-columns: 300px 1fr; }
    @media (max-width: 820px) {
      .row--top, .row--charts, .row--bottom { grid-template-columns: 1fr; }
    }

    /* ── Rank card ────────────────────────────────────── */
    .rank-card {
      border: 1px solid var(--border); border-radius: 16px;
      padding: 24px 22px; background: var(--surface);
      display: flex; flex-direction: column; gap: 8px;
      transition: border-color .3s, background .3s;
    }
    .rank-badge {
      display: inline-flex; align-items: center; justify-content: center;
      border: 2px solid; border-radius: 999px;
      padding: 5px 16px; font-size: 13px; font-weight: 900;
      letter-spacing: .4px; width: fit-content;
    }
    .rank-pts { font-size: 42px; font-weight: 900; color: var(--text); line-height: 1; margin-top: 8px; }
    .rank-pts span { font-size: 18px; font-weight: 600; color: var(--text-muted); }
    .rank-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); }
    .rank-max { font-size: 12px; color: var(--text-muted); font-style: italic; margin-top: 4px; }

    .rank-progress { margin-top: 12px; }
    .rank-progress__labels {
      display: flex; justify-content: space-between;
      font-size: 10px; color: var(--text-muted); font-weight: 600; margin-bottom: 5px;
    }
    .rank-progress__bar {
      height: 7px; background: var(--border-2); border-radius: 999px; overflow: hidden;
    }
    .rank-progress__fill {
      height: 100%; border-radius: 999px;
      transition: width .6s cubic-bezier(.4,0,.2,1);
    }
    .rank-progress__remain {
      font-size: 11px; color: var(--text-muted); margin-top: 5px; text-align: right;
    }

    /* ── Stat pills ───────────────────────────────────── */
    .stat-grid { display: grid; grid-template-columns: 1fr; gap: 12px; align-content: start; }
    @media (min-width: 820px) { .stat-grid { grid-template-columns: 1fr; } }
    .stat-pill {
      border-radius: 14px; border: 1px solid var(--border);
      padding: 18px 20px; background: var(--surface);
    }
    .stat-pill--blue   { border-color: color-mix(in srgb, var(--accent-blue) 30%, transparent); background: var(--accent-blue-bg); }
    .stat-pill--green  { border-color: color-mix(in srgb, var(--success) 30%, transparent);     background: var(--success-bg); }
    .stat-pill--purple { border-color: rgba(192,132,252,.25); background: rgba(192,132,252,.08); }
    .stat-pill__val { font-size: 36px; font-weight: 900; color: var(--text); line-height: 1; }
    .stat-pill__val span { font-size: 16px; font-weight: 600; color: var(--text-muted); }
    .stat-pill__lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); margin-top: 4px; }

    /* ── Chart cards ──────────────────────────────────── */
    .chart-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px;
    }
    .chart-card__title { font-size: 14px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
    .chart-card__sub   { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; }
    .chart-wrap { position: relative; height: 220px; }
    .chart-wrap--radar { height: 240px; }
    .chart-wrap--donut { height: 180px; }

    /* Donut legend */
    .donut-legend { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
    .donut-legend__item { display: flex; align-items: center; gap: 8px; }
    .donut-legend__dot  { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .donut-legend__lbl  { font-size: 12px; color: var(--text-2); flex: 1; }
    .donut-legend__val  { font-size: 12px; font-weight: 700; color: var(--text); }

    /* Sessions table */
    .sessions-table { overflow-x: auto; }
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
    .domain-tag { color: var(--text-2); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .diff-tag { padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; width: fit-content; }
    .diff-tag[data-diff="easy"]   { background: #0a2318; color: #56d364; }
    .diff-tag[data-diff="medium"] { background: #1f1a08; color: #e3b341; }
    .diff-tag[data-diff="hard"]   { background: var(--accent-red-bg); color: var(--accent-red-fg); }
    .diff-tag[data-diff="expert"] { background: #1e0942; color: #c4b5fd; }
    .score-tag { color: var(--text); font-weight: 700; }
    .pts-tag   { color: #4ade80; font-weight: 800; }

    /* Table header + pagination */
    .table-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0; }
    .sessions-row--empty { opacity: 0; pointer-events: none; }

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
    .pag-num--active {
      background: var(--accent-blue); color: #fff;
      border-color: var(--accent-blue);
    }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 0; color: var(--text-muted); text-align: center; }
    .empty-state p { font-size: 14px; }
    .empty-state a { color: var(--accent-blue); font-weight: 600; font-size: 14px; }
    .loading-wrap { display: flex; justify-content: center; padding: 60px; }
  `],
})
export class AnalyticsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("lineChart")  lineChartRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild("radarChart") radarChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("donutChart") donutChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly api = inject(ApiService);

  loading    = signal(false);
  error      = signal("");
  tablePage  = signal(0);
  data:    Analytics | null = null;
  history: HistoryResponse | null = null;

  private _lineChart?:  Chart;
  private _radarChart?: Chart;
  private _donutChart?: Chart;
  private _chartsBuilt = false;

  donutLegend: { color: string; label: string; val: number }[] = [];

  /** Reversed list so newest sessions appear first. */
  private _reversed = computed(() => [...(this.history?.history ?? [])].reverse());

  totalPages  = computed(() => Math.max(1, Math.ceil(this._reversed().length / PAGE_SIZE)));

  pagedSessions = computed(() => {
    const p = this.tablePage();
    return this._reversed().slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  });

  /** Pad with empty rows so the card height doesn't jump between pages. */
  emptyRows = computed(() => {
    const len = this.pagedSessions().length;
    return len < PAGE_SIZE ? Array(PAGE_SIZE - len) : [];
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur   = this.tablePage();
    // Show up to 5 page buttons centred around the current page
    const half  = 2;
    let start = Math.max(0, cur - half);
    let end   = Math.min(total, start + 5);
    start = Math.max(0, end - 5);
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  ngOnInit()      { this.loadAll(); }
  ngOnDestroy()   { this._destroyCharts(); }
  ngAfterViewInit() { /* charts built after data arrives */ }

  prevPage()  { if (this.tablePage() > 0) this.tablePage.update(p => p - 1); }
  nextPage()  { if (this.tablePage() < this.totalPages() - 1) this.tablePage.update(p => p + 1); }
  goToPage(p: number) { this.tablePage.set(p); }

  tierCfg = computed(() => TIER_CONFIG[this.data?.rank_tier ?? "Newbie"]);

  tierStart = computed(() => {
    const tier = this.data?.rank_tier ?? "Newbie";
    const tiers = Object.keys(TIER_CONFIG);
    const idx = tiers.indexOf(tier);
    return TIER_THRESHOLDS[idx] ?? 0;
  });

  progressPct = computed(() => {
    const pts  = this.data?.total_points ?? 0;
    const cfg  = this.tierCfg();
    if (!cfg || this.data?.rank_tier === "Grandmaster") return 100;
    const start = this.tierStart();
    const range = cfg.nextPts - start;
    return Math.min(100, Math.round(((pts - start) / range) * 100));
  });

  domainLabel(d: string) { return DOMAIN_LABELS[d] ?? d; }

  loadAll() {
    this.loading.set(true);
    this.error.set("");
    this._chartsBuilt = false;
    this.tablePage.set(0);

    let done = 0;
    const finish = () => { done++; if (done === 2) { this.loading.set(false); this._buildCharts(); } };

    this.api.get<Analytics>("/analytics/me").subscribe({
      next: (d) => { this.data = d; finish(); },
      error: (e) => { this.error.set(e.detail || "Failed to load analytics"); finish(); },
    });

    this.api.get<HistoryResponse>("/analytics/history").subscribe({
      next: (h) => { this.history = h; finish(); },
      error: () => { this.history = null; finish(); },
    });
  }

  private _buildCharts() {
    if (!this.history || !this.data || this.data.total_interviews === 0) return;
    // Wait one tick for the DOM to render
    setTimeout(() => {
      this._destroyCharts();
      this._buildLine();
      this._buildRadar();
      this._buildDonut();
      this._chartsBuilt = true;
    });
  }

  private _chartDefaults() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      gridColor: isDark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.07)",
      textColor: isDark ? "#7a96a8" : "#6b7280",
    };
  }

  private _buildLine() {
    const hist = this.history!.history;
    const labels = hist.map((_, i) => `#${i + 1}`);
    const { gridColor, textColor } = this._chartDefaults();

    this._lineChart = new Chart(this.lineChartRef.nativeElement, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Score",
            data: hist.map(h => h.avg_score),
            borderColor: "#60a5fa",
            backgroundColor: "rgba(96,165,250,.15)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: "Clarity",
            data: hist.map(h => h.clarity_score),
            borderColor: "#c084fc",
            backgroundColor: "rgba(192,132,252,.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 10, grid: { color: gridColor }, ticks: { color: textColor, stepSize: 2 } },
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
        },
        plugins: { legend: { labels: { color: textColor, boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }

  private _buildRadar() {
    const breakdown = this.history!.domain_breakdown;
    const ALL_DOMAINS = ["dsa", "cs_fundamentals", "lld", "hld"];
    const labels = ALL_DOMAINS.map(d => DOMAIN_LABELS[d]);
    const scores = ALL_DOMAINS.map(d => breakdown.find(b => b.domain === d)?.avg_score ?? 0);
    const { gridColor, textColor } = this._chartDefaults();

    this._radarChart = new Chart(this.radarChartRef.nativeElement, {
      type: "radar",
      data: {
        labels,
        datasets: [{
          label: "Avg Score",
          data: scores,
          borderColor: "#4ade80",
          backgroundColor: "rgba(74,222,128,.15)",
          pointBackgroundColor: "#4ade80",
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            min: 0, max: 10, ticks: { stepSize: 2, color: textColor, backdropColor: "transparent" },
            grid: { color: gridColor },
            pointLabels: { color: textColor, font: { size: 11, weight: "bold" } },
            angleLines: { color: gridColor },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  private _buildDonut() {
    const hist = this.history!.history;
    const counts: Record<string, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
    hist.forEach(h => counts[h.difficulty] = (counts[h.difficulty] ?? 0) + 1);
    const colors = ["#56d364", "#e3b341", "#ff7b72", "#c4b5fd"];
    const labels = ["Easy", "Medium", "Hard", "Expert"];
    const data   = [counts.easy, counts.medium, counts.hard, counts.expert];
    const { textColor } = this._chartDefaults();

    this.donutLegend = labels.map((l, i) => ({ color: colors[i], label: l, val: data[i] }));

    this._donutChart = new Chart(this.donutChartRef.nativeElement, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + "cc"),
          borderColor: colors,
          borderWidth: 1.5,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}` } },
        },
      },
    });
  }

  private _destroyCharts() {
    this._lineChart?.destroy();
    this._radarChart?.destroy();
    this._donutChart?.destroy();
    this._lineChart = this._radarChart = this._donutChart = undefined;
  }
}
