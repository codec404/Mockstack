import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { InterviewStateService } from "../../core/interview-state.service";
import { ApiService } from "../../core/api.service";
import { SpinnerComponent } from "../../shared/spinner.component";
import { signal } from "@angular/core";

interface Interview { id: string; status: string; }

const RULES = [
  {
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    title: "60-minute time limit",
    body: "The interview session lasts exactly 60 minutes. The timer starts the moment you enter the session. It cannot be paused.",
  },
  {
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    title: "Answer each question completely",
    body: "The AI evaluates both the correctness of your answer and how clearly you communicate it. Partial answers are scored lower.",
  },
  {
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    title: "Per-answer scoring",
    body: "Every answer receives a score (0–10) and a clarity rating in real time. These feed into your final performance report.",
  },
  {
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    title: "No external assistance",
    body: "This session is meant to assess your current knowledge. Using documentation, AI tools, or other resources defeats the purpose.",
  },
  {
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    title: "Detailed end-of-session report",
    body: "After the session ends (or when the timer expires), you receive a full report with strengths, weaknesses, and improvement points.",
  },
  {
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    title: "Session cannot be resumed",
    body: "Once you end a session or leave the page, the interview is marked complete. There is no way to continue a previous session.",
  },
];

@Component({
  selector: "app-rules-page",
  standalone: true,
  imports: [CommonModule, SpinnerComponent],
  template: `
    <div class="rules-wrap">

      <!-- Left column: meta + CTA -->
      <aside class="rules-aside">
        <div class="aside-card">
          <div class="aside-badge">Ready to begin</div>
          <h2>Your session</h2>

          <div class="meta-list">
            <div class="meta-item">
              <span class="meta-label">Domain</span>
              <span class="meta-value">{{ domainLabel }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Difficulty</span>
              <span class="meta-value meta-value--diff" [attr.data-diff]="state.difficulty()">
                {{ state.difficulty() | titlecase }}
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Duration</span>
              <span class="meta-value">60 minutes</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Format</span>
              <span class="meta-value">Live AI conversation</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Scoring</span>
              <span class="meta-value">Per-answer (0–10)</span>
            </div>
          </div>

          <div class="aside-divider"></div>

          <p class="aside-note">
            By continuing, you confirm you have read and understood all rules listed.
          </p>

          <button class="btn-begin" (click)="begin()" [disabled]="loading()">
            <app-spinner [loading]="loading()" />
            <span *ngIf="!loading()">
              Begin Interview
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </span>
            <span *ngIf="loading()">Setting up your session…</span>
          </button>
          <button class="btn-back" (click)="back()" [disabled]="loading()">
            ← Back to Setup
          </button>

          <p class="error-msg" *ngIf="error()">{{ error() }}</p>
        </div>
      </aside>

      <!-- Right column: rules -->
      <section class="rules-main">
        <div class="rules-head">
          <h1>Rules &amp; Guidelines</h1>
          <p>Please read carefully before starting your session.</p>
        </div>

        <ol class="rules-list">
          <li *ngFor="let rule of rules; let i = index" class="rule-item">
            <div class="rule-num">{{ i + 1 }}</div>
            <div class="rule-body">
              <div class="rule-title">
                <span class="rule-icon" [innerHTML]="rule.icon"></span>
                {{ rule.title }}
              </div>
              <p class="rule-desc">{{ rule.body }}</p>
            </div>
          </li>
        </ol>
      </section>

    </div>
  `,
  styles: [`
    .rules-wrap {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 28px;
      align-items: start;
      max-width: 960px;
      margin: 0 auto;
    }
    @media (max-width: 720px) {
      .rules-wrap { grid-template-columns: 1fr; }
      .rules-aside { order: 2; }
      .rules-main  { order: 1; }
    }

    /* ── Aside ──────────────────────────────────────────── */
    .aside-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 24px;
      box-shadow: var(--shadow);
      position: sticky; top: 76px;
    }
    .aside-badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px;
      color: var(--success-fg); background: var(--success-bg);
      border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
      padding: 3px 10px; border-radius: 999px; margin-bottom: 14px;
    }
    .aside-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--success); display: block; }
    .aside-card h2 { font-size: 18px; font-weight: 900; color: var(--text); margin-bottom: 18px; letter-spacing: -.3px; }

    .meta-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
    .meta-item { display: flex; justify-content: space-between; align-items: center; }
    .meta-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
    .meta-value { font-size: 13px; font-weight: 700; color: var(--text-2); }
    .meta-value--diff[data-diff="easy"]   { color: #56d364; }
    .meta-value--diff[data-diff="medium"] { color: #e3b341; }
    .meta-value--diff[data-diff="hard"]   { color: var(--accent-red); }
    .meta-value--diff[data-diff="expert"] { color: #c4b5fd; }

    .aside-divider { height: 1px; background: var(--border); margin: 18px 0; }
    .aside-note { font-size: 12px; color: var(--text-muted); line-height: 1.55; margin-bottom: 16px; }

    .btn-begin {
      width: 100%; height: 44px; border-radius: 10px;
      background: var(--primary); color: var(--primary-fg); border: none;
      font-size: 14px; font-weight: 800; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      box-shadow: 0 2px 12px color-mix(in srgb, var(--primary) 35%, transparent);
      transition: background var(--transition), transform .12s, box-shadow var(--transition);
      margin-bottom: 8px;
    }
    .btn-begin:disabled { opacity: .6; cursor: not-allowed; transform: none; }
    .btn-begin:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 5px 20px color-mix(in srgb, var(--primary) 42%, transparent); }
    .btn-begin span { display: flex; align-items: center; gap: 8px; }

    .btn-back {
      width: 100%; height: 36px; border-radius: 8px;
      background: transparent; border: 1px solid var(--border-2);
      color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer;
      transition: background var(--transition), color var(--transition);
    }
    .btn-back:disabled { opacity: .5; cursor: not-allowed; }
    .btn-back:hover:not(:disabled) { background: var(--surface-2); color: var(--text-2); }

    .error-msg { font-size: 13px; color: var(--accent-red); margin-top: 10px; text-align: center; }

    /* ── Rules main ─────────────────────────────────────── */
    .rules-head { margin-bottom: 22px; }
    .rules-head h1 { font-size: 26px; font-weight: 900; letter-spacing: -.5px; color: var(--text); margin-bottom: 6px; }
    .rules-head p { font-size: 14px; color: var(--text-muted); }

    .rules-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
    .rule-item {
      display: flex; gap: 16px; align-items: flex-start;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px;
      transition: border-color .2s, background .2s;
    }
    .rule-item:hover { border-color: var(--border-2); background: var(--surface-2); }

    .rule-num {
      width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
      background: var(--accent-blue-bg); color: var(--accent-blue);
      font-size: 13px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
    }
    .rule-body { flex: 1; }
    .rule-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; font-weight: 700; color: var(--text);
      margin-bottom: 5px;
    }
    .rule-icon { display: flex; color: var(--text-muted); flex-shrink: 0; }
    .rule-desc { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0; }
  `],
})
export class RulesPageComponent {
  readonly rules = RULES;
  loading = signal(false);
  error = signal("");

  constructor(
    readonly state: InterviewStateService,
    private readonly api: ApiService,
    private readonly router: Router,
  ) {}

  get domainLabel() {
    const map: Record<string, string> = {
      dsa: "Data Structures & Algo",
      cs_fundamentals: "CS Fundamentals",
      lld: "Low-Level Design",
      hld: "High-Level Design",
    };
    return map[this.state.domain()] ?? this.state.domain();
  }

  begin() {
    this.error.set(""); this.loading.set(true);
    this.api.post<Interview>("/interviews", {
      domain: this.state.domain(),
      difficulty: this.state.difficulty(),
    }).subscribe({
      next: (i) => {
        this.api.post<Interview>(`/interviews/${i.id}/start`, {}).subscribe({
          next: (s) => {
            this.state.interviewId.set(s.id ?? i.id);
            this.loading.set(false);
            this.router.navigate(["/interview/session"]);
          },
          error: (e) => { this.loading.set(false); this.error.set(e?.detail ?? "Failed to start interview"); },
        });
      },
      error: (e) => { this.loading.set(false); this.error.set(e?.detail ?? "Failed to create interview"); },
    });
  }

  back() { this.router.navigate(["/dashboard"]); }
}
