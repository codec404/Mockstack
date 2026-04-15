import {
  Component, OnInit, OnDestroy, signal,
  ViewChild, ElementRef, AfterViewChecked, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ApiService } from "../../core/api.service";
import { InterviewStateService } from "../../core/interview-state.service";
import { SpinnerComponent } from "../../shared/spinner.component";

interface ChatEntry { role: "user" | "assistant" | "system"; content: string; isNew?: boolean; }
interface ResultResponse {
  status: "ready" | "processing";
  interview_id?: string;
  average_score?: number;
  clarity_score?: number;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  weak_topics?: string[];
  improvement_points?: string[];
}
interface FinalReport { average_score: number; clarity_score: number; summary: string; strengths: string[]; weaknesses: string[]; weak_topics: string[]; improvement_points: string[]; }

const TOTAL_SECONDS = 3600; // 60 minutes

@Component({
  selector: "app-session-page",
  standalone: true,
  imports: [CommonModule, FormsModule, SpinnerComponent],
  template: `
    <!-- ── Report screen ───────────────────────────────────── -->
    <div class="report-wrap" *ngIf="report">
      <div class="report-header">
        <div>
          <h2>Session Complete</h2>
          <p>Here's a detailed breakdown of your performance.</p>
        </div>
        <button class="btn btn--ghost" (click)="restart()">Start Another Session</button>
      </div>

      <div class="score-row">
        <div class="score-card score-card--blue">
          <div class="score-val">{{ report.average_score }}</div>
          <div class="score-lbl">Overall Score</div>
          <div class="score-sub">out of 10</div>
        </div>
        <div class="score-card score-card--purple">
          <div class="score-val">{{ report.clarity_score }}</div>
          <div class="score-lbl">Clarity</div>
          <div class="score-sub">out of 10</div>
        </div>
        <div class="score-card score-card--muted">
          <div class="score-val">{{ chat.length }}</div>
          <div class="score-lbl">Exchanges</div>
          <div class="score-sub">total messages</div>
        </div>
      </div>

      <div class="report-summary">{{ report.summary }}</div>

      <div class="report-grid">
        <div class="report-section report-section--green">
          <h4>Strengths</h4>
          <ul><li *ngFor="let s of report.strengths">{{ s }}</li></ul>
        </div>
        <div class="report-section report-section--red">
          <h4>Areas for Improvement</h4>
          <ul><li *ngFor="let w of report.weaknesses">{{ w }}</li></ul>
        </div>
        <div class="report-section report-section--yellow">
          <h4>Weak Topics</h4>
          <ul><li *ngFor="let t of report.weak_topics">{{ t }}</li></ul>
        </div>
        <div class="report-section report-section--blue">
          <h4>Next Steps</h4>
          <ul><li *ngFor="let p of report.improvement_points">{{ p }}</li></ul>
        </div>
      </div>
    </div>

    <!-- ── Generating report screen ─────────────────────────── -->
    <div class="generating-wrap" *ngIf="generating() && !report">
      <div class="generating-card">
        <div class="gen-spinner">
          <div class="gen-ring"></div>
          <div class="gen-ring gen-ring--2"></div>
          <div class="gen-ring gen-ring--3"></div>
        </div>
        <h3>Generating your report…</h3>
        <p>Our AI is analysing your answers, scoring your performance and crafting personalised feedback. This usually takes 10–20 seconds.</p>
        <div class="gen-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>

    <!-- ── Live session ─────────────────────────────────────── -->
    <div class="session-wrap" *ngIf="!report && !generating()">

      <!-- Session topbar -->
      <div class="session-bar">
        <div class="session-meta">
          <span class="session-badge session-badge--domain">{{ domainLabel }}</span>
          <span class="session-badge session-badge--diff" [attr.data-diff]="state.difficulty()">
            {{ state.difficulty() | titlecase }}
          </span>
          <span class="session-live">
            <span class="live-dot"></span>
            Live
          </span>
        </div>

        <div class="timer-block" [class.timer-block--warn]="timeLeft <= 300" [class.timer-block--crit]="timeLeft <= 60">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="timer-text">{{ formattedTime }}</span>
        </div>

        <button class="btn-end" (click)="endSession()" [disabled]="ending()">
          <app-spinner [loading]="ending()" />
          <span *ngIf="!ending()">End Session</span>
        </button>
      </div>

      <!-- Chat + Composer -->
      <div class="session-body">

        <!-- Messages -->
        <div class="chat-pane" #chatbox>

          <div *ngFor="let m of chat; let i = index"
            [class]="'bubble bubble--' + m.role"
            [style.animation-delay]="(i * 0.04) + 's'">
            <div class="bubble__header">
              <span class="bubble__role">{{ m.role === 'assistant' ? 'AI Interviewer' : m.role === 'user' ? 'You' : 'System' }}</span>
            </div>
            <p class="bubble__text">{{ typingIdx === i ? typingContent() : m.content }}<span
              *ngIf="typingIdx === i" class="typing-cursor">▌</span></p>
          </div>

          <!-- Show typing dots whenever the AI is composing (first question OR reply) -->
          <div class="bubble bubble--typing" *ngIf="chat.length === 0 || sending()">
            <span></span><span></span><span></span>
          </div>
        </div>

        <!-- Composer -->
        <div class="composer">
          <textarea
            #answerInput
            [(ngModel)]="message"
            rows="4"
            placeholder="Type your answer here… Press Enter to send, Shift+Enter for a new line."
            (keydown.enter)="onEnter($event)"
            [disabled]="sending()"
          ></textarea>
          <div class="composer-foot">
            <span class="char-hint">Shift+Enter for new line</span>
            <button class="btn-send" (click)="sendMessage()" [disabled]="sending() || !message.trim()">
              <app-spinner [loading]="sending()" />
              <span *ngIf="!sending()">
                Send
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* ─── Shared ────────────────────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 8px; border: none;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background var(--transition), transform .1s;
    }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn--ghost { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border-2); }
    .btn--ghost:hover:not(:disabled) { background: var(--bg-alt); }

    /* ─── Session topbar ─────────────────────────────────────── */
    .session-wrap { display: flex; flex-direction: column; height: calc(100vh - 56px - 56px); min-height: 500px; }
    .session-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0 14px; gap: 12px; flex-shrink: 0;
      border-bottom: 1px solid var(--border); margin-bottom: 16px;
    }
    .session-meta { display: flex; align-items: center; gap: 8px; }
    .session-badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 999px;
      font-size: 11px; font-weight: 800; letter-spacing: .2px;
    }
    .session-badge--domain { background: var(--accent-blue-bg); color: var(--accent-blue-fg); }
    .session-badge--diff[data-diff="easy"]   { background: #0a2318; color: #56d364; }
    .session-badge--diff[data-diff="medium"] { background: #1f1a08; color: #e3b341; }
    .session-badge--diff[data-diff="hard"]   { background: var(--accent-red-bg); color: var(--accent-red-fg); }
    .session-badge--diff[data-diff="expert"] { background: #1e0942; color: #c4b5fd; }
    .session-live { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; color: var(--success-fg); text-transform: uppercase; letter-spacing: .5px; }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); animation: pulse 1.6s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }

    /* Timer */
    .timer-block {
      display: flex; align-items: center; gap: 7px;
      background: var(--surface); border: 1px solid var(--border-2);
      border-radius: 10px; padding: 7px 14px;
      transition: border-color .3s, background .3s;
    }
    .timer-block--warn { border-color: #e3b341; background: #1f1a08; color: #e3b341; }
    .timer-block--crit { border-color: var(--accent-red); background: var(--accent-red-bg); color: var(--accent-red-fg); animation: timerPulse 1s infinite; }
    @keyframes timerPulse { 0%,100%{opacity:1} 50%{opacity:.6} }
    .timer-text { font-size: 17px; font-weight: 900; letter-spacing: 1px; font-variant-numeric: tabular-nums; font-family: 'SF Mono', 'Fira Code', monospace; }

    .btn-end {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 8px; border: 1px solid var(--accent-red);
      background: var(--accent-red-bg); color: var(--accent-red-fg);
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background var(--transition), transform .1s;
    }
    .btn-end:disabled { opacity: .5; cursor: not-allowed; }
    .btn-end:hover:not(:disabled) { background: var(--accent-red); color: #fff; transform: translateY(-1px); }

    /* ─── Chat pane ──────────────────────────────────────────── */
    .session-body { display: flex; flex-direction: column; flex: 1; overflow: hidden; gap: 0; }
    .chat-pane {
      flex: 1; overflow-y: auto; padding: 4px 2px 12px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 10px; color: var(--text-muted); }
    .chat-empty p { font-size: 13px; }

    .bubble {
      max-width: 82%; border-radius: 14px; padding: 12px 16px;
      animation: fadeUp .28s ease both;
    }
    @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
    .bubble--assistant {
      align-self: flex-start;
      background: var(--surface); border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }
    .bubble--user {
      align-self: flex-end;
      background: var(--accent-blue-bg); border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent);
      border-bottom-right-radius: 4px;
    }
    .bubble--system {
      align-self: center; max-width: 96%;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
      opacity: .75; font-style: italic;
    }
    .bubble__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .bubble__role { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: var(--text-muted); }
    .bubble__text { margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-2); white-space: pre-wrap; }
    .typing-cursor {
      display: inline-block; margin-left: 1px;
      color: var(--accent-blue); font-size: 14px; line-height: 1;
      animation: cursorBlink 0.7s step-end infinite;
    }
    @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }

    /* Typing indicator */
    .bubble--typing {
      align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
      border-bottom-left-radius: 4px; padding: 14px 18px;
      display: flex; gap: 4px; align-items: center; max-width: fit-content;
    }
    .bubble--typing span {
      width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted);
      animation: bounce .9s infinite;
    }
    .bubble--typing span:nth-child(2) { animation-delay: .15s; }
    .bubble--typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }

    /* ─── Composer ───────────────────────────────────────────── */
    .composer {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; overflow: hidden; flex-shrink: 0; margin-top: 12px;
      box-shadow: var(--shadow-sm);
      transition: border-color .2s;
    }
    .composer:focus-within { border-color: var(--accent-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-blue) 15%, transparent); }
    .composer textarea {
      width: 100%; resize: none; background: transparent; border: none;
      border-radius: 0; padding: 14px 16px; font-size: 14px; height: auto;
      box-shadow: none !important;
    }
    .composer textarea:focus { outline: none; box-shadow: none !important; border-color: transparent !important; }
    .composer-foot {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 10px; border-top: 1px solid var(--border);
    }
    .char-hint { font-size: 11px; color: var(--text-muted); }
    .btn-send {
      display: flex; align-items: center; gap: 7px;
      padding: 7px 16px; border-radius: 8px;
      background: var(--primary); color: var(--primary-fg);
      border: none; font-size: 13px; font-weight: 700; cursor: pointer;
      box-shadow: 0 1px 8px color-mix(in srgb, var(--primary) 30%, transparent);
      transition: background var(--transition), transform .1s;
    }
    .btn-send:disabled { opacity: .45; cursor: not-allowed; }
    .btn-send:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }

    /* ─── Report ─────────────────────────────────────────────── */
    .report-wrap { max-width: 820px; margin: 0 auto; }
    .report-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .report-header h2 { font-size: 24px; font-weight: 900; color: var(--text); letter-spacing: -.4px; margin-bottom: 4px; }
    .report-header p { font-size: 14px; color: var(--text-muted); margin: 0; }

    .score-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .score-card { border-radius: 14px; padding: 20px; text-align: center; border: 1px solid var(--border); }
    .score-card--blue   { background: var(--accent-blue-bg); border-color: color-mix(in srgb, var(--accent-blue) 25%, transparent); }
    .score-card--purple { background: rgba(168,85,247,.1);   border-color: rgba(168,85,247,.25); }
    .score-card--muted  { background: var(--surface); }
    .score-val { font-size: 44px; font-weight: 900; line-height: 1; letter-spacing: -1px; }
    .score-card--blue   .score-val { color: var(--accent-blue-fg); }
    .score-card--purple .score-val { color: #c084fc; }
    .score-card--muted  .score-val { color: var(--text); }
    .score-lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); margin-top: 6px; }
    .score-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    .report-summary {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 18px; font-size: 14px; color: var(--text-2); line-height: 1.7;
      margin-bottom: 18px;
    }
    .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .report-section { border-radius: 12px; padding: 16px; border: 1px solid var(--border); }
    .report-section--green  { background: var(--success-bg);    border-color: color-mix(in srgb, var(--success) 25%, transparent); }
    .report-section--red    { background: var(--accent-red-bg); border-color: color-mix(in srgb, var(--accent-red) 25%, transparent); }
    .report-section--yellow { background: #1f1a08;              border-color: rgba(227,179,65,.25); }
    .report-section--blue   { background: var(--accent-blue-bg);border-color: color-mix(in srgb, var(--accent-blue) 25%, transparent); }
    .report-section h4 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); margin-bottom: 10px; }
    .report-section ul { padding-left: 14px; margin: 0; }
    .report-section li { font-size: 13px; color: var(--text-2); line-height: 1.55; margin-bottom: 4px; }
    @media (max-width: 600px) {
      .score-row { grid-template-columns: 1fr; }
      .report-grid { grid-template-columns: 1fr; }
    }

    /* ─── Generating report screen ───────────────────────── */
    .generating-wrap {
      display: flex; align-items: center; justify-content: center;
      min-height: calc(100vh - 120px);
    }
    .generating-card {
      display: flex; flex-direction: column; align-items: center;
      gap: 20px; max-width: 420px; width: 100%;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 20px; padding: 48px 36px;
      text-align: center; box-shadow: var(--shadow-md, 0 8px 32px rgba(0,0,0,.2));
      animation: fadeUp .4s ease both;
    }
    .generating-card h3 {
      font-size: 20px; font-weight: 900; color: var(--text); letter-spacing: -.3px; margin: 0;
    }
    .generating-card p {
      font-size: 13px; color: var(--text-muted); line-height: 1.65; margin: 0;
    }

    /* Concentric spinning rings */
    .gen-spinner { position: relative; width: 64px; height: 64px; }
    .gen-ring {
      position: absolute; inset: 0; border-radius: 50%;
      border: 3px solid transparent;
      animation: spin 1.4s linear infinite;
    }
    .gen-ring       { border-top-color: var(--primary);       }
    .gen-ring--2    { inset: 10px; border-top-color: var(--accent-blue); animation-duration: 1s; animation-direction: reverse; }
    .gen-ring--3    { inset: 20px; border-top-color: var(--success);     animation-duration: 1.8s; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Dot pulse row */
    .gen-dots { display: flex; gap: 6px; }
    .gen-dots span {
      width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted);
      animation: bounce .9s infinite;
    }
    .gen-dots span:nth-child(2) { animation-delay: .15s; }
    .gen-dots span:nth-child(3) { animation-delay: .3s; }
  `],
})
export class SessionPageComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild("chatbox") chatboxRef!: ElementRef<HTMLDivElement>;

  readonly state = inject(InterviewStateService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  chat: ChatEntry[] = [];
  message = "";
  sending    = signal(false);
  ending     = signal(false);
  generating = signal(false);
  report: FinalReport | null = null;

  // ── Typing animation state ────────────────────────────────────────────────
  typingIdx     = -1;            // index in chat[] that is currently being typed
  typingContent = signal("");    // progressively revealed content for that bubble
  private _typingTimer?: ReturnType<typeof setInterval>;

  timeLeft = TOTAL_SECONDS;
  private _timer?: ReturnType<typeof setInterval>;
  private _pollTimer?: ReturnType<typeof setTimeout>;
  private _shouldScroll = false;

  get formattedTime() {
    const h = Math.floor(this.timeLeft / 3600);
    const m = Math.floor((this.timeLeft % 3600) / 60);
    const s = this.timeLeft % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  get domainLabel() {
    const map: Record<string, string> = {
      dsa: "DSA", cs_fundamentals: "CS Fundamentals",
      lld: "Low-Level Design", hld: "High-Level Design",
    };
    return map[this.state.domain()] ?? this.state.domain();
  }

  ngOnInit() {
    if (!this.state.interviewId()) {
      this.router.navigate(["/dashboard"]);
      return;
    }
    this._loadMessages();
    this._startTimer();
  }

  ngOnDestroy() {
    this._clearTimer();
    this._clearTyping();
    if (this._pollTimer) clearTimeout(this._pollTimer);
  }

  ngAfterViewChecked() {
    if (this._shouldScroll && this.chatboxRef) {
      const el = this.chatboxRef.nativeElement;
      el.scrollTop = el.scrollHeight;
      this._shouldScroll = false;
    }
  }

  private _startTimer() {
    this._timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this._clearTimer();
        this.endSession();
      }
    }, 1000);
  }

  private _clearTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = undefined; }
  }

  // ── Typing animation helpers ───────────────────────────────────────────────

  private _startTyping(idx: number, fullContent: string) {
    this._clearTyping();
    this.typingIdx = idx;
    this.typingContent.set("");
    let pos = 0;
    // Speed: 4 chars per 12ms ≈ ~300 chars/sec — feels natural, not too slow
    this._typingTimer = setInterval(() => {
      pos = Math.min(pos + 4, fullContent.length);
      this.typingContent.set(fullContent.slice(0, pos));
      this._shouldScroll = true;
      if (pos >= fullContent.length) {
        this._clearTyping();
      }
    }, 12);
  }

  private _clearTyping() {
    if (this._typingTimer) { clearInterval(this._typingTimer); this._typingTimer = undefined; }
    this.typingIdx = -1;
  }

  // ── Message loading ────────────────────────────────────────────────────────

  private _loadMessages() {
    const MAX_ATTEMPTS = 20;
    const tryLoad = (attempt = 0) => {
      this.api.get<{ role: string; content: string }[]>(
        `/interviews/${this.state.interviewId()}/messages`
      ).subscribe({
        next: (msgs) => {
          if ((msgs?.length ?? 0) === 0 && attempt < MAX_ATTEMPTS) {
            this._pollTimer = setTimeout(() => tryLoad(attempt + 1), 1500);
          } else if ((msgs?.length ?? 0) === 0) {
            // Worker / AI never responded — show a fallback system message
            this.chat = [{
              role: "system",
              content: "The AI interviewer is taking longer than expected. This may be due to API quota or configuration. Please try ending the session and starting a new one.",
            }];
            this._shouldScroll = true;
          } else {
            this.chat = (msgs || []).map((m) => ({
              role: m.role as ChatEntry["role"], content: m.content,
            }));
            this._shouldScroll = true;
          }
        },
        error: () => {
          if (attempt < MAX_ATTEMPTS) {
            this._pollTimer = setTimeout(() => tryLoad(attempt + 1), 2000);
          }
        },
      });
    };
    tryLoad();
  }

  onEnter(e: KeyboardEvent) {
    if (!e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  sendMessage() {
    const text = this.message.trim();
    if (!text || this.sending()) return;
    this.message = "";
    // Optimistic: show user message immediately; worker will add AI reply asynchronously
    const expectedMin = this.chat.length + 1; // after user msg, expect at least +1 AI msg
    this.chat.push({ role: "user", content: text });
    this._shouldScroll = true;
    this.sending.set(true);

    this.api.post<{ status: string }>(`/interviews/${this.state.interviewId()}/messages`, { content: text })
      .subscribe({
        next: () => this._pollForAiReply(expectedMin),
        error: (e) => {
          this.sending.set(false);
          this.chat.push({ role: "system", content: `Error: ${e?.detail ?? "Something went wrong"}` });
        },
      });
  }

  private _pollForAiReply(expectedMin: number) {
    const MAX_ATTEMPTS = 30; // ~45 seconds
    const check = (attempt = 0) => {
      if (!this.sending()) return;
      this.api.get<{ role: string; content: string }[]>(
        `/interviews/${this.state.interviewId()}/messages`
      ).subscribe({
        next: (msgs) => {
          if ((msgs?.length ?? 0) > expectedMin) {
            const newChat = msgs.map((m) => ({ role: m.role as ChatEntry["role"], content: m.content }));
            this.sending.set(false);
            // Find the new assistant message and type it out
            const newAssistantIdx = newChat.length - 1;
            const lastMsg = newChat[newAssistantIdx];
            if (lastMsg?.role === "assistant") {
              this.chat = newChat;
              this._startTyping(newAssistantIdx, lastMsg.content);
            } else {
              this.chat = newChat;
              this._shouldScroll = true;
            }
          } else if (attempt >= MAX_ATTEMPTS) {
            // AI never responded — surface the fallback
            this.sending.set(false);
            this.chat.push({
              role: "system",
              content: "The AI interviewer is not responding. This may be a temporary issue. Try sending your message again, or end the session.",
            });
            this._shouldScroll = true;
          } else {
            this._pollTimer = setTimeout(() => check(attempt + 1), 1500);
          }
        },
        error: () => {
          if (attempt >= MAX_ATTEMPTS) {
            this.sending.set(false);
            this.chat.push({ role: "system", content: "Network error while waiting for AI reply. Please try again." });
          } else {
            this._pollTimer = setTimeout(() => check(attempt + 1), 2000);
          }
        },
      });
    };
    this._pollTimer = setTimeout(() => check(0), 1500);
  }

  endSession() {
    if (this.ending()) return;
    this._clearTimer();
    this.ending.set(true);

    this.api.post<{ status: string }>(`/interviews/${this.state.interviewId()}/end`, {}).subscribe({
      next: () => {
        this.ending.set(false);
        this.generating.set(true);
        this._pollForReport();
      },
      error: (e) => {
        this.ending.set(false);
        this.chat.push({ role: "system", content: `Failed to end session: ${e?.detail ?? "Unknown error"}` });
      },
    });
  }

  private _pollForReport() {
    const check = () => {
      if (!this.generating()) return;
      this.api.get<ResultResponse>(`/interviews/${this.state.interviewId()}/result`).subscribe({
        next: (r) => {
          if (r.status === "ready" && r.average_score != null) {
            this.report = r as FinalReport;
            this.generating.set(false);
          } else {
            this._pollTimer = setTimeout(check, 3000);
          }
        },
        error: () => { this._pollTimer = setTimeout(check, 3000); },
      });
    };
    this._pollTimer = setTimeout(check, 3000);
  }

  restart() {
    this.state.interviewId.set("");
    this.router.navigate(["/dashboard"]);
  }
}
