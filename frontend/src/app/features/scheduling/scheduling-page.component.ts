import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../core/api.service";
import { AlertComponent } from "../../shared/alert.component";
import { SpinnerComponent } from "../../shared/spinner.component";

interface Schedule { id: string; domain: string; difficulty: string; status: string; scheduled_at: string; }

@Component({
  selector: "app-scheduling-page",
  standalone: true,
  imports: [CommonModule, FormsModule, AlertComponent, SpinnerComponent],
  template: `
    <div class="page-header">
      <h2>Scheduling</h2>
      <p>Manage and reschedule your upcoming interview sessions.</p>
    </div>

    <div class="card">
      <h3>Reschedule / Cancel</h3>
      <div class="form-row">
        <div class="field">
          <label>Interview ID</label>
          <input [(ngModel)]="interviewId" placeholder="Paste UUID" />
        </div>
        <div class="field">
          <label>New datetime (ISO 8601)</label>
          <input [(ngModel)]="scheduledAt" placeholder="2026-05-01T10:00:00" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn--primary" (click)="reschedule()" [disabled]="busy()">
          Reschedule <app-spinner [loading]="busy()" />
        </button>
        <button class="btn btn--danger" (click)="cancel()" [disabled]="busy()">Cancel</button>
      </div>
      <app-alert [message]="error()" type="error" />
      <app-alert [message]="success()" type="success" />
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Upcoming Sessions</h3>
        <button class="btn-refresh" (click)="loadUpcoming()" [disabled]="loading()">
          Refresh <app-spinner [loading]="loading()" />
        </button>
      </div>
      <div class="empty" *ngIf="!loading() && upcoming.length === 0">No upcoming sessions scheduled.</div>
      <div class="sched-list">
        <div class="sched-row" *ngFor="let item of upcoming">
          <div class="sched-badges">
            <span class="badge badge--blue">{{ item.domain }}</span>
            <span class="badge badge--purple">{{ item.difficulty }}</span>
          </div>
          <span class="sched-id">{{ item.id }}</span>
          <span class="sched-dt">{{ item.scheduled_at | date:'medium' }}</span>
          <span class="status-chip">{{ item.status }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-header h2 { margin: 0; font-size: 22px; font-weight: 800; color: var(--text); }
    .page-header p { color: var(--text-muted); font-size: 14px; margin: 4px 0 18px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 22px; margin-bottom: 16px;
      box-shadow: var(--shadow); transition: background var(--transition), border-color var(--transition);
    }
    .card h3 { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 16px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .card-header h3 { margin: 0; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field label { font-size: 13px; font-weight: 600; color: var(--text-2); }
    .btn-row { display: flex; gap: 10px; }
    .btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 9px 16px; border-radius: var(--radius-sm);
      font-size: 14px; font-weight: 600; cursor: pointer; border: none;
      transition: background var(--transition), transform 0.1s;
    }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn--primary { background: var(--primary); color: var(--primary-fg); }
    .btn--primary:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
    .btn--danger { background: var(--accent-red); color: #fff; }
    .btn-refresh {
      display: flex; align-items: center; gap: 4px;
      border: 1px solid var(--border-2); background: var(--surface-2); color: var(--text-2);
      padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px;
      transition: background var(--transition), color var(--transition);
    }
    .btn-refresh:hover { background: var(--bg-alt); color: var(--accent-blue); border-color: var(--accent-blue); }
    .empty { color: var(--text-muted); font-size: 14px; padding: 20px 0; text-align: center; }
    .sched-list { display: flex; flex-direction: column; gap: 8px; }
    .sched-row {
      display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center;
      padding: 10px 14px; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius-sm); transition: background var(--transition);
    }
    .sched-badges { display: flex; gap: 4px; }
    .badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
    .badge--blue { background: var(--accent-blue-bg); color: var(--accent-blue-fg); }
    .badge--purple { background: color-mix(in srgb, #8b5cf6 15%, transparent); color: #a78bfa; }
    .sched-id { font-size: 11px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sched-dt { font-size: 13px; color: var(--text-2); white-space: nowrap; }
    .status-chip { font-size: 11px; background: var(--success-bg); color: var(--success-fg); padding: 3px 8px; border-radius: 999px; font-weight: 700; }
  `],
})
export class SchedulingPageComponent {
  interviewId = ""; scheduledAt = "";
  busy = signal(false); loading = signal(false);
  error = signal(""); success = signal("");
  upcoming: Schedule[] = [];

  constructor(private readonly api: ApiService) { this.loadUpcoming(); }

  reschedule() {
    this.error.set(""); this.success.set("");
    if (!this.interviewId || !this.scheduledAt) { this.error.set("Both fields are required"); return; }
    this.busy.set(true);
    this.api.put(`/schedules/${this.interviewId}/reschedule`, { scheduled_at: this.scheduledAt }).subscribe({
      next: () => { this.busy.set(false); this.success.set("Interview rescheduled"); this.loadUpcoming(); },
      error: (e) => { this.busy.set(false); this.error.set(e.detail || "Failed"); },
    });
  }

  cancel() {
    this.error.set(""); this.success.set("");
    if (!this.interviewId) { this.error.set("Interview ID is required"); return; }
    this.busy.set(true);
    this.api.post(`/schedules/${this.interviewId}/cancel`, {}).subscribe({
      next: () => { this.busy.set(false); this.success.set("Interview cancelled"); this.loadUpcoming(); },
      error: (e) => { this.busy.set(false); this.error.set(e.detail || "Failed"); },
    });
  }

  loadUpcoming() {
    this.loading.set(true);
    this.api.get<Schedule[]>("/schedules/upcoming").subscribe({
      next: (r) => { this.upcoming = r; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
