import { Component, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { InterviewStateService } from "../../core/interview-state.service";

const DOMAIN_META: Record<string, { desc: string; tags: string[] }> = {
  dsa: {
    desc: "Data structures, algorithms, problem solving",
    tags: ["Arrays", "Trees", "Graphs", "DP", "Sorting"],
  },
  cs_fundamentals: {
    desc: "OS, networking, databases and concurrency",
    tags: ["SQL", "Concurrency", "OS", "Networking"],
  },
  lld: {
    desc: "Object-oriented design, patterns, SOLID",
    tags: ["OOP", "Design Patterns", "SOLID", "UML"],
  },
  hld: {
    desc: "Scalable systems, architecture, trade-offs",
    tags: ["Microservices", "Scalability", "CAP", "DBs"],
  },
};

const DIFF_META: Record<string, { label: string; exp: string; color: string; bg: string; border: string }> = {
  easy:   { label: "Easy",   exp: "0 – 2 yrs",  color: "#56d364", bg: "#0a2318", border: "rgba(63,185,80,.4)" },
  medium: { label: "Medium", exp: "2 – 4 yrs",  color: "#e3b341", bg: "#1f1a08", border: "rgba(227,179,65,.4)" },
  hard:   { label: "Hard",   exp: "4 – 7 yrs",  color: "#ff7b72", bg: "#2a0f0f", border: "rgba(255,123,114,.4)" },
  expert: { label: "Expert", exp: "7 + yrs",    color: "#c4b5fd", bg: "#1e0942", border: "rgba(124,58,237,.4)" },
};

@Component({
  selector: "app-interview-page",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">

      <!-- ── Page header ───────────────────────────────────────── -->
      <div class="page-header">
        <div class="page-header__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <div>
          <h1>New Interview Session</h1>
          <p>Configure your session — AI will guide you through a realistic technical interview.</p>
        </div>
      </div>

      <!-- ── Two-column body ───────────────────────────────────── -->
      <div class="body">

        <!-- LEFT: configuration ───────────────────────────────── -->
        <div class="config">

          <!-- Domain -->
          <section class="section">
            <div class="section-label">
              <span class="section-label__num">01</span>
              Select Domain
            </div>
            <div class="domain-grid">
              <button *ngFor="let d of domains" type="button"
                class="domain-card"
                [class.domain-card--active]="state.domain() === d.value"
                [style.--dc]="d.color"
                (click)="state.domain.set(d.value)">

                <div class="domain-card__top">
                  <span class="domain-card__icon">
                    <!-- DSA -->
                    <svg *ngIf="d.value==='dsa'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                      <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
                    </svg>
                    <!-- CS Fundamentals -->
                    <svg *ngIf="d.value==='cs_fundamentals'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="7" y="7" width="10" height="10" rx="1"/>
                      <path d="M7 9H5M7 12H5M7 15H5M17 9h2M17 12h2M17 15h2M9 7V5M12 7V5M15 7V5M9 17v2M12 17v2M15 17v2"/>
                    </svg>
                    <!-- LLD -->
                    <svg *ngIf="d.value==='lld'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="12 2 22 8.5 12 15 2 8.5"/>
                      <polyline points="2 15.5 12 22 22 15.5"/>
                      <polyline points="2 12 12 18.5 22 12"/>
                    </svg>
                    <!-- HLD -->
                    <svg *ngIf="d.value==='hld'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="3" width="20" height="4" rx="1"/>
                      <rect x="2" y="10" width="20" height="4" rx="1"/>
                      <rect x="2" y="17" width="20" height="4" rx="1"/>
                      <circle cx="18" cy="5" r="1" fill="currentColor"/>
                      <circle cx="18" cy="12" r="1" fill="currentColor"/>
                      <circle cx="18" cy="19" r="1" fill="currentColor"/>
                    </svg>
                  </span>
                  <span class="domain-card__check" *ngIf="state.domain() === d.value">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                </div>

                <div class="domain-card__name">{{ d.label }}</div>
                <div class="domain-card__desc">{{ d.desc }}</div>

                <div class="domain-card__tags">
                  <span class="tag" *ngFor="let t of d.tags.slice(0,3)">{{ t }}</span>
                </div>
              </button>
            </div>
          </section>

          <!-- Difficulty -->
          <section class="section">
            <div class="section-label">
              <span class="section-label__num">02</span>
              Select Difficulty
            </div>
            <div class="diff-list">
              <button *ngFor="let d of difficulties" type="button"
                class="diff-card"
                [class.diff-card--active]="state.difficulty() === d.value"
                [style.--dfc]="d.color"
                [style.--dfbg]="d.bg"
                [style.--dfb]="d.border"
                (click)="state.difficulty.set(d.value)">

                <span class="diff-card__bar"></span>

                <div class="diff-card__body">
                  <div class="diff-card__name">{{ d.label }}</div>
                  <div class="diff-card__exp">{{ d.exp }}</div>
                </div>

                <span class="diff-card__check" *ngIf="state.difficulty() === d.value">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
              </button>
            </div>
          </section>

        </div>

        <!-- RIGHT: session brief ──────────────────────────────── -->
        <aside class="brief">
          <div class="brief__inner">

            <div class="brief__head">
              <div class="brief__domain-icon" [style.--dc]="activeDomain.color">
                <!-- DSA -->
                <svg *ngIf="state.domain()==='dsa'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                  <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
                </svg>
                <!-- CS Fundamentals -->
                <svg *ngIf="state.domain()==='cs_fundamentals'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="7" y="7" width="10" height="10" rx="1"/>
                  <path d="M7 9H5M7 12H5M7 15H5M17 9h2M17 12h2M17 15h2M9 7V5M12 7V5M15 7V5M9 17v2M12 17v2M15 17v2"/>
                </svg>
                <!-- LLD -->
                <svg *ngIf="state.domain()==='lld'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 22 8.5 12 15 2 8.5"/>
                  <polyline points="2 15.5 12 22 22 15.5"/>
                  <polyline points="2 12 12 18.5 22 12"/>
                </svg>
                <!-- HLD -->
                <svg *ngIf="state.domain()==='hld'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="4" rx="1"/>
                  <rect x="2" y="10" width="20" height="4" rx="1"/>
                  <rect x="2" y="17" width="20" height="4" rx="1"/>
                  <circle cx="18" cy="5" r="1" fill="currentColor"/>
                  <circle cx="18" cy="12" r="1" fill="currentColor"/>
                  <circle cx="18" cy="19" r="1" fill="currentColor"/>
                </svg>
              </div>
              <div>
                <div class="brief__title">Session Brief</div>
                <div class="brief__domain">{{ activeDomain.label }}</div>
              </div>
            </div>

            <div class="brief__divider"></div>

            <!-- Meta rows -->
            <div class="brief__meta">
              <div class="brief__row">
                <span class="brief__row-icon brief__row-icon--blue">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </span>
                <span class="brief__row-label">Duration</span>
                <span class="brief__row-val">60 min</span>
              </div>
              <div class="brief__row">
                <span class="brief__row-icon" [style.background]="activeDomain.color + '22'" [style.color]="activeDomain.color">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </span>
                <span class="brief__row-label">Questions</span>
                <span class="brief__row-val">{{ questionCount }}</span>
              </div>
              <div class="brief__row">
                <span class="brief__row-icon" [style.background]="activeDiff.color + '22'" [style.color]="activeDiff.color">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </span>
                <span class="brief__row-label">Difficulty</span>
                <span class="brief__row-val" [style.color]="activeDiff.color">{{ activeDiff.label }}</span>
              </div>
              <div class="brief__row">
                <span class="brief__row-icon brief__row-icon--purple">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </span>
                <span class="brief__row-label">Evaluation</span>
                <span class="brief__row-val">AI · post-session</span>
              </div>
              <div class="brief__row">
                <span class="brief__row-icon brief__row-icon--green">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </span>
                <span class="brief__row-label">Hints</span>
                <span class="brief__row-val">Available on request</span>
              </div>
            </div>

            <div class="brief__divider"></div>

            <!-- What to expect -->
            <div class="brief__expect-label">What to expect</div>
            <ul class="brief__expect">
              <li *ngFor="let e of expectations">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {{ e }}
              </li>
            </ul>

            <!-- CTA -->
            <button class="btn-start" (click)="goToRules()" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Begin Interview
            </button>

          </div>
        </aside>

      </div>
    </div>
  `,
  styles: [`
    /* ── Layout ──────────────────────────────────────────────── */
    .page { max-width: 920px; margin: 0 auto; padding-bottom: 40px; }

    .page-header {
      display: flex; align-items: flex-start; gap: 14px; margin-bottom: 32px;
    }
    .page-header__icon {
      width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
      background: var(--accent-blue-bg); border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent);
      color: var(--accent-blue); display: flex; align-items: center; justify-content: center;
    }
    .page-header h1 {
      font-size: 22px; font-weight: 900; color: var(--text);
      letter-spacing: -.4px; margin: 0 0 4px;
    }
    .page-header p { font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.5; }

    .body {
      display: grid;
      grid-template-columns: 1fr 310px;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 760px) {
      .body { grid-template-columns: 1fr; }
      .brief { order: -1; }
    }

    /* ── Sections ─────────────────────────────────────────────── */
    .config { display: flex; flex-direction: column; gap: 28px; }
    .section { display: flex; flex-direction: column; gap: 14px; }

    .section-label {
      display: flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .7px; color: var(--text-muted);
    }
    .section-label__num {
      width: 20px; height: 20px; border-radius: 6px;
      background: var(--surface-2); border: 1px solid var(--border-2);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 900; color: var(--text-2);
    }

    /* ── Domain cards ─────────────────────────────────────────── */
    .domain-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

    .domain-card {
      position: relative;
      display: flex; flex-direction: column; gap: 6px;
      padding: 14px 14px 12px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; cursor: pointer; text-align: left;
      transition: border-color .18s, background .18s, transform .12s, box-shadow .18s;
    }
    .domain-card:hover {
      border-color: var(--border-2);
      background: var(--surface-2);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,.15);
    }
    .domain-card--active {
      border-color: var(--dc) !important;
      background: color-mix(in srgb, var(--dc) 7%, var(--surface)) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--dc) 18%, transparent), 0 4px 16px rgba(0,0,0,.15) !important;
    }

    .domain-card__top {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 4px;
    }
    .domain-card__icon {
      width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: color-mix(in srgb, var(--dc) 14%, transparent);
      color: var(--dc);
      transition: background .18s;
    }
    .domain-card--active .domain-card__icon {
      background: color-mix(in srgb, var(--dc) 22%, transparent);
    }
    .domain-card__check {
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--dc); color: #fff;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .domain-card__name {
      font-size: 13px; font-weight: 800; color: var(--text); line-height: 1.2;
    }
    .domain-card--active .domain-card__name { color: var(--dc); }
    .domain-card__desc {
      font-size: 11px; color: var(--text-muted); line-height: 1.4;
    }
    .domain-card__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tag {
      font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
      background: var(--surface-2); border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .domain-card--active .tag {
      background: color-mix(in srgb, var(--dc) 10%, transparent);
      border-color: color-mix(in srgb, var(--dc) 25%, transparent);
      color: var(--dc);
    }

    /* ── Difficulty list ──────────────────────────────────────── */
    .diff-list { display: flex; flex-direction: column; gap: 8px; }

    .diff-card {
      position: relative; display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: 10px; cursor: pointer;
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color .18s, background .18s, transform .1s;
      overflow: hidden;
    }
    .diff-card:hover { border-color: var(--border-2); background: var(--surface-2); transform: translateX(2px); }
    .diff-card--active {
      border-color: var(--dfb) !important;
      background: var(--dfbg) !important;
    }

    .diff-card__bar {
      position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
      background: var(--dfc); border-radius: 0;
      opacity: 0; transition: opacity .18s;
    }
    .diff-card--active .diff-card__bar { opacity: 1; }

    .diff-card__body { flex: 1; display: flex; align-items: center; gap: 10px; }
    .diff-card__name {
      font-size: 13px; font-weight: 800; color: var(--text-2); min-width: 58px;
    }
    .diff-card--active .diff-card__name { color: var(--dfc); }
    .diff-card__exp {
      font-size: 11px; color: var(--text-muted); font-weight: 600;
    }
    .diff-card__check {
      width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
      background: var(--dfc); color: #000;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Brief panel ──────────────────────────────────────────── */
    .brief {
      position: sticky; top: 72px;
    }
    .brief__inner {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px;
      display: flex; flex-direction: column; gap: 0;
    }

    .brief__head {
      display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    }
    .brief__domain-icon {
      width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: color-mix(in srgb, var(--dc) 14%, transparent);
      color: var(--dc);
    }
    .brief__title {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .6px; color: var(--text-muted); margin-bottom: 3px;
    }
    .brief__domain { font-size: 14px; font-weight: 900; color: var(--text); }

    .brief__divider {
      height: 1px; background: var(--border); margin: 14px 0;
    }

    .brief__meta { display: flex; flex-direction: column; gap: 10px; }
    .brief__row {
      display: flex; align-items: center; gap: 10px;
      font-size: 12px;
    }
    .brief__row-icon {
      width: 24px; height: 24px; border-radius: 6px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .brief__row-icon--blue   { background: var(--accent-blue-bg); color: var(--accent-blue-fg); }
    .brief__row-icon--purple { background: rgba(168,85,247,.14); color: #c084fc; }
    .brief__row-icon--green  { background: rgba(74,222,128,.12); color: #4ade80; }
    .brief__row-label { flex: 1; color: var(--text-muted); font-weight: 600; }
    .brief__row-val   { font-weight: 800; color: var(--text); white-space: nowrap; }

    .brief__expect-label {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .6px; color: var(--text-muted); margin-bottom: 10px;
    }
    .brief__expect {
      list-style: none; padding: 0; margin: 0 0 20px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .brief__expect li {
      display: flex; align-items: flex-start; gap: 8px;
      font-size: 12px; color: var(--text-2); line-height: 1.4;
    }
    .brief__expect li svg {
      flex-shrink: 0; color: #4ade80; margin-top: 1px;
    }

    .btn-start {
      width: 100%; padding: 13px; border-radius: 10px;
      background: var(--primary); color: var(--primary-fg);
      border: none; font-size: 14px; font-weight: 800;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
      letter-spacing: .1px;
      box-shadow: 0 2px 18px color-mix(in srgb, var(--primary) 38%, transparent);
      transition: background var(--transition), transform .12s, box-shadow var(--transition);
    }
    .btn-start:hover {
      background: var(--primary-hover); transform: translateY(-2px);
      box-shadow: 0 6px 28px color-mix(in srgb, var(--primary) 45%, transparent);
    }
    .btn-start:active { transform: translateY(0); }
  `],
})
export class InterviewPageComponent {
  constructor(
    readonly state: InterviewStateService,
    private readonly router: Router,
  ) {}

  readonly domains = [
    { value: "dsa",             label: "Data Structures & Algo", color: "#58a6ff", ...DOMAIN_META["dsa"] },
    { value: "cs_fundamentals", label: "CS Fundamentals",         color: "#a78bfa", ...DOMAIN_META["cs_fundamentals"] },
    { value: "lld",             label: "Low-Level Design",         color: "#fb923c", ...DOMAIN_META["lld"] },
    { value: "hld",             label: "High-Level Design",        color: "#34d399", ...DOMAIN_META["hld"] },
  ];

  readonly difficulties = Object.entries(DIFF_META).map(([value, m]) => ({ value, ...m }));

  get activeDomain() {
    return this.domains.find(d => d.value === this.state.domain()) ?? this.domains[0];
  }
  get activeDiff() {
    return DIFF_META[this.state.difficulty()] ?? DIFF_META["medium"];
  }

  get questionCount(): string {
    return this.state.domain() === "dsa" ? "2 problems + follow-ups" : "6 – 8 questions";
  }

  get expectations(): string[] {
    const domain = this.state.domain();
    if (domain === "dsa") return [
      "Full problem statement with examples and constraints",
      "Follow-up probes on the same problem (complexity, optimization, edge cases)",
      "Type 'hint' at any time for a progressive nudge",
      "AI evaluates all answers in batch at the end",
    ];
    if (domain === "cs_fundamentals") return [
      "Questions rotating across OS, SQL, concurrency and networking",
      "Practical scenarios, not definitions — give real examples",
      "SQL schema-based queries may be included",
      "AI evaluates depth and clarity at the end",
    ];
    if (domain === "lld") return [
      "Full design problem with functional requirements",
      "Follow-ups on class design, patterns and SOLID principles",
      "Expected to draw or describe UML-level class structure",
      "AI evaluates design quality and trade-off reasoning",
    ];
    return [
      "System design problem with scale and latency constraints",
      "Follow-ups on bottlenecks, failure modes and data models",
      "Expected to discuss trade-offs at each layer",
      "AI evaluates architecture decisions and communication",
    ];
  }

  goToRules() {
    this.router.navigate(["/interview/rules"]);
  }
}
