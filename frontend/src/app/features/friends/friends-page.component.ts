import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../core/api.service";
import { AlertComponent } from "../../shared/alert.component";
import { SpinnerComponent } from "../../shared/spinner.component";

interface FriendEntry {
  handle: string;
  rank_tier: string;
  total_points: number;
  total_interviews: number;
}

const PAGE_SIZE = 8;

const TIER_COLOR: Record<string, string> = {
  Newbie: "#9ca3af", Apprentice: "#4ade80", Specialist: "#22d3ee",
  Expert: "#60a5fa", "Candidate Master": "#c084fc", Master: "#fb923c", Grandmaster: "#f87171",
};

@Component({
  selector: "app-friends-page",
  standalone: true,
  imports: [CommonModule, RouterLink, AlertComponent, SpinnerComponent],
  template: `
    <div class="friends-wrap">

      <div class="page-header">
        <div>
          <h2>Friends</h2>
          <p>People you're following. Click any handle to view their profile.</p>
        </div>
      </div>

      <app-alert [message]="error()" type="error" />
      <app-spinner [loading]="loading()" />

      <!-- Empty state -->
      <div *ngIf="!loading() && friends().length === 0 && !error()" class="empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".3">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>No friends yet.</p>
        <p class="empty__hint">Find people on the <a routerLink="/leaderboard">Leaderboard</a> and add them.</p>
      </div>

      <!-- Friends list -->
      <ng-container *ngIf="!loading() && friends().length > 0">
        <div class="list-meta">
          {{ friends().length }} friend{{ friends().length === 1 ? '' : 's' }}
          <span *ngIf="totalPages() > 1"> &bull; page {{ page() + 1 }} of {{ totalPages() }}</span>
        </div>

        <div class="friends-grid">
          <div *ngFor="let f of pagedFriends(); let i = index" class="friend-card">

            <div class="friend-card__rank">{{ page() * PAGE_SIZE + i + 1 }}</div>

            <div class="friend-card__avatar"
                 [style.background]="tierColor(f.rank_tier) + '20'"
                 [style.border-color]="tierColor(f.rank_tier)">
              {{ f.handle.slice(0, 2).toUpperCase() }}
            </div>

            <div class="friend-card__body">
              <a class="friend-card__handle" [routerLink]="['/profile', f.handle]">{{ "@" + f.handle }}</a>
              <span class="friend-card__tier" [style.color]="tierColor(f.rank_tier)">{{ f.rank_tier }}</span>
            </div>

            <div class="friend-card__stats">
              <div class="fstat">
                <span class="fstat__val" [style.color]="tierColor(f.rank_tier)">{{ f.total_points | number }}</span>
                <span class="fstat__lbl">pts</span>
              </div>
              <div class="fstat">
                <span class="fstat__val">{{ f.total_interviews }}</span>
                <span class="fstat__lbl">sessions</span>
              </div>
            </div>

            <button class="remove-btn" (click)="removeFriend(f.handle, page() * PAGE_SIZE + i)" title="Remove friend">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Pagination -->
        <div class="pagination" *ngIf="totalPages() > 1">
          <button class="pag-btn" (click)="prevPage()" [disabled]="page() === 0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="pag-pages">
            <button *ngFor="let p of pageNumbers()"
              class="pag-num" [class.pag-num--active]="p === page()"
              (click)="goToPage(p)">{{ p + 1 }}</button>
          </div>
          <button class="pag-btn" (click)="nextPage()" [disabled]="page() === totalPages() - 1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </ng-container>

    </div>
  `,
  styles: [`
    .friends-wrap { max-width: 680px; margin: 0 auto; padding-bottom: 40px; }

    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .page-header h2 { font-size: 22px; font-weight: 900; color: var(--text); margin: 0 0 4px; }
    .page-header p  { font-size: 13px; color: var(--text-muted); margin: 0; }

    /* ── List meta ───────────────────────────── */
    .list-meta {
      font-size: 12px; color: var(--text-muted); font-weight: 600;
      margin-bottom: 10px;
    }

    /* ── Pagination ──────────────────────────── */
    .pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; margin-top: 16px; padding-top: 12px;
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

    /* ── Empty state ─────────────────────────── */
    .empty {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 60px 20px; color: var(--text-muted); text-align: center;
    }
    .empty p { margin: 0; font-size: 14px; }
    .empty__hint { font-size: 13px; }
    .empty__hint a { color: var(--accent-blue); font-weight: 600; text-decoration: none; }

    /* ── Friends grid ────────────────────────── */
    .friends-grid { display: flex; flex-direction: column; gap: 8px; }

    .friend-card {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
      transition: border-color .15s;
    }
    .friend-card:hover { border-color: var(--border-2); }

    .friend-card__rank {
      width: 24px; text-align: center; font-size: 12px;
      font-weight: 900; color: var(--text-muted); flex-shrink: 0;
    }

    .friend-card__avatar {
      width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900; flex-shrink: 0;
    }

    .friend-card__body { flex: 1; min-width: 0; }
    .friend-card__handle {
      display: block; font-size: 14px; font-weight: 800; color: var(--text);
      text-decoration: none;
    }
    .friend-card__handle:hover { color: var(--accent-blue); }
    .friend-card__tier { font-size: 11px; font-weight: 700; }

    .friend-card__stats { display: flex; gap: 18px; flex-shrink: 0; }
    .fstat { display: flex; flex-direction: column; align-items: flex-end; }
    .fstat__val { font-size: 15px; font-weight: 900; color: var(--text); }
    .fstat__lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted); }

    .remove-btn {
      width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border-2);
      background: transparent; color: var(--text-muted); cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background var(--transition), color var(--transition), border-color var(--transition);
    }
    .remove-btn:hover { background: var(--accent-red-bg); color: var(--accent-red-fg); border-color: color-mix(in srgb, var(--accent-red) 40%, transparent); }
  `],
})
export class FriendsPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly PAGE_SIZE = PAGE_SIZE;

  loading = signal(true);
  error   = signal("");
  friends = signal<FriendEntry[]>([]);
  page    = signal(0);

  totalPages = computed(() => Math.max(1, Math.ceil(this.friends().length / PAGE_SIZE)));

  pagedFriends = computed(() => {
    const p = this.page();
    return this.friends().slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  });

  pageNumbers = computed(() => {
    const total = this.totalPages(), cur = this.page();
    let start = Math.max(0, cur - 2);
    let end   = Math.min(total, start + 5);
    start = Math.max(0, end - 5);
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  prevPage()  { if (this.page() > 0) this.page.update(p => p - 1); }
  nextPage()  { if (this.page() < this.totalPages() - 1) this.page.update(p => p + 1); }
  goToPage(p: number) { this.page.set(p); }

  tierColor(tier: string) { return TIER_COLOR[tier] ?? "#9ca3af"; }

  ngOnInit() { this.loadFriends(); }

  loadFriends() {
    this.loading.set(true);
    this.api.get<{ friends: FriendEntry[] }>("/friends").subscribe({
      next: (r) => { this.friends.set(r.friends); this.loading.set(false); },
      error: (e) => { this.error.set(e.detail ?? "Failed to load friends"); this.loading.set(false); },
    });
  }

  removeFriend(handle: string, idx: number) {
    this.api.delete(`/friends/${handle}`).subscribe({
      next: () => {
        this.friends.update(list => list.filter((_, i) => i !== idx));
        // If removing pushes current page out of range, go back one
        if (this.page() >= this.totalPages()) this.page.update(p => Math.max(0, p - 1));
      },
      error: (e) => this.error.set(e.detail ?? "Failed to remove friend"),
    });
  }
}
