import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ApiService } from "../../core/api.service";
import { SpinnerComponent } from "../../shared/spinner.component";
import { AlertComponent } from "../../shared/alert.component";

interface AdminMetrics { total_users: number; active_users: number; currently_interviewing: number; total_interviews: number; total_completed: number; }

@Component({
  selector: "app-admin-page",
  standalone: true,
  imports: [CommonModule, SpinnerComponent, AlertComponent],
  template: `
    <div class="page-header">
      <h2>Admin Dashboard</h2>
      <p>Platform-wide activity snapshot. Admin access only.</p>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>Platform Overview</h3>
        <button class="btn-refresh" (click)="load()">
          Refresh <app-spinner [loading]="loading()" />
        </button>
      </div>
      <app-alert [message]="error()" type="error" />
      <div class="stats-grid" *ngIf="!loading() && data">
        <div class="stat stat--blue">
          <div class="stat-val">{{ data.total_users }}</div>
          <div class="stat-lbl">Total Users</div>
        </div>
        <div class="stat stat--green">
          <div class="stat-val">{{ data.active_users }}</div>
          <div class="stat-lbl">Active Users</div>
        </div>
        <div class="stat stat--orange">
          <div class="stat-val">{{ data.currently_interviewing }}</div>
          <div class="stat-lbl">In Session Now</div>
        </div>
        <div class="stat stat--purple">
          <div class="stat-val">{{ data.total_interviews }}</div>
          <div class="stat-lbl">Total Sessions</div>
        </div>
        <div class="stat stat--teal">
          <div class="stat-val">{{ data.total_completed }}</div>
          <div class="stat-lbl">Completed</div>
        </div>
        <div class="stat stat--red">
          <div class="stat-val">{{ completionRate() }}%</div>
          <div class="stat-lbl">Completion Rate</div>
        </div>
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
    .stat { border-radius: var(--radius); padding: 20px 18px; text-align: center; transition: filter 0.2s; }
    .stat:hover { filter: brightness(1.05); }
    .stat-val { font-size: 40px; font-weight: 900; line-height: 1.1; }
    .stat-lbl { font-size: 11px; margin-top: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat--blue  { background: var(--accent-blue-bg); } .stat--blue .stat-val, .stat--blue .stat-lbl { color: var(--accent-blue-fg); }
    .stat--green { background: var(--success-bg); } .stat--green .stat-val, .stat--green .stat-lbl { color: var(--success-fg); }
    .stat--orange { background: var(--warning-bg); } .stat--orange .stat-val { color: var(--warning); } .stat--orange .stat-lbl { color: var(--warning); }
    .stat--purple { background: color-mix(in srgb, #8b5cf6 12%, transparent); } .stat--purple .stat-val, .stat--purple .stat-lbl { color: #a78bfa; }
    .stat--teal { background: color-mix(in srgb, #00e676 12%, transparent); } .stat--teal .stat-val, .stat--teal .stat-lbl { color: #00e676; }
    .stat--red { background: var(--accent-red-bg); } .stat--red .stat-val, .stat--red .stat-lbl { color: var(--accent-red-fg); }
  `],
})
export class AdminPageComponent implements OnInit {
  loading = signal(false); error = signal(""); data: AdminMetrics | null = null;
  constructor(private readonly api: ApiService) {}
  ngOnInit() { this.load(); }
  completionRate() { return !this.data?.total_interviews ? 0 : Math.round((this.data.total_completed / this.data.total_interviews) * 100); }
  load() {
    this.loading.set(true); this.error.set("");
    this.api.get<AdminMetrics>("/admin/analytics").subscribe({
      next: (d) => { this.data = d; this.loading.set(false); },
      error: (e) => { this.error.set(e.detail || "Failed to load metrics"); this.loading.set(false); },
    });
  }
}
