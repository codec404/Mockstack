import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../core/api.service";
import { SpinnerComponent } from "../../shared/spinner.component";
import { AlertComponent } from "../../shared/alert.component";

interface Analytics { total_interviews: number; avg_score: number; avg_clarity: number; }

@Component({
  selector: "app-analytics-page",
  standalone: true,
  imports: [CommonModule, RouterLink, SpinnerComponent, AlertComponent],
  template: `
    <div class="page-header">
      <h2>My Analytics</h2>
      <p>Performance summary across all your completed interview sessions.</p>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>Overview</h3>
        <button class="btn-refresh" (click)="load()">
          Refresh <app-spinner [loading]="loading()" />
        </button>
      </div>
      <app-alert [message]="error()" type="error" />
      <div class="stats-grid" *ngIf="!loading() && data">
        <div class="stat">
          <div class="stat-icon">📝</div>
          <div class="stat-val">{{ data.total_interviews }}</div>
          <div class="stat-lbl">Sessions Completed</div>
        </div>
        <div class="stat">
          <div class="stat-icon">🎯</div>
          <div class="stat-val">{{ data.avg_score }}</div>
          <div class="stat-lbl">Average Score</div>
        </div>
        <div class="stat">
          <div class="stat-icon">💬</div>
          <div class="stat-val">{{ data.avg_clarity }}</div>
          <div class="stat-lbl">Average Clarity</div>
        </div>
      </div>
      <div class="empty" *ngIf="!loading() && data?.total_interviews === 0">
        No completed sessions yet.
        <a routerLink="/dashboard">Start a session →</a>
      </div>
    </div>
  `,
  styles: [`
    .page-header h2 { margin: 0; font-size: 22px; font-weight: 800; color: var(--text); }
    .page-header p { color: var(--text-muted); font-size: 14px; margin: 4px 0 18px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 22px;
      box-shadow: var(--shadow);
      transition: background var(--transition), border-color var(--transition);
    }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .card-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text); }
    .btn-refresh {
      display: flex; align-items: center; gap: 4px;
      border: 1px solid var(--border-2); background: var(--surface-2); color: var(--text-2);
      padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px;
      transition: background var(--transition), border-color var(--transition);
    }
    .btn-refresh:hover { background: var(--bg-alt); border-color: var(--accent-blue); color: var(--accent-blue); }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .stat {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px; text-align: center;
      transition: background var(--transition);
    }
    .stat-icon { font-size: 26px; margin-bottom: 8px; }
    .stat-val { font-size: 42px; font-weight: 900; color: var(--text); line-height: 1; }
    .stat-lbl { font-size: 12px; color: var(--text-muted); margin-top: 6px; font-weight: 600; }
    .empty { color: var(--text-muted); font-size: 14px; padding: 28px 0; text-align: center; }
    .empty a { color: var(--accent-blue); font-weight: 600; }
  `],
})
export class AnalyticsPageComponent implements OnInit {
  loading = signal(false); error = signal(""); data: Analytics | null = null;
  constructor(private readonly api: ApiService) {}
  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true); this.error.set("");
    this.api.get<Analytics>("/analytics/me").subscribe({
      next: (d) => { this.data = d; this.loading.set(false); },
      error: (e) => { this.error.set(e.detail || "Failed to load analytics"); this.loading.set(false); },
    });
  }
}
