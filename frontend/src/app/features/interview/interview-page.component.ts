import { Component, signal, ElementRef, ViewChild, AfterViewChecked } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../core/api.service";
import { AlertComponent } from "../../shared/alert.component";
import { SpinnerComponent } from "../../shared/spinner.component";

interface ChatEntry { role: "user" | "assistant" | "system"; content: string; score?: number; }
interface Interview { id: string; domain: string; difficulty: string; status: string; }
interface MessageEval { score: number; clarity: number; next_question: string; positives: string[]; negatives: string[]; weak_topics: string[]; improvement_points: string[]; }
interface FinalReport { average_score: number; clarity_score: number; summary: string; strengths: string[]; weaknesses: string[]; weak_topics: string[]; improvement_points: string[]; }

@Component({
  selector: "app-interview-page",
  standalone: true,
  imports: [CommonModule, FormsModule, AlertComponent, SpinnerComponent],
  template: `
    <div class="page-header">
      <h2>Interview</h2>
      <p>Start a live AI-driven mock session and receive real-time per-answer feedback.</p>
    </div>

    <!-- Setup -->
    <div class="card" *ngIf="!interviewId || status !== 'in_progress'">
      <h3>Session Setup</h3>
      <div class="form-row">
        <div class="field">
          <label>Domain</label>
          <select [(ngModel)]="domain" [disabled]="!!interviewId">
            <option value="dsa">Data Structures & Algorithms</option>
            <option value="cs_fundamentals">CS Fundamentals</option>
            <option value="lld">Low-Level Design</option>
            <option value="hld">High-Level Design</option>
          </select>
        </div>
        <div class="field">
          <label>Difficulty</label>
          <select [(ngModel)]="difficulty" [disabled]="!!interviewId">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="expert">Expert</option>
          </select>
        </div>
      </div>
      <button class="btn btn--primary" (click)="createAndStart()" [disabled]="creating()">
        Start Interview <app-spinner [loading]="creating()" />
      </button>
      <app-alert [message]="setupError()" type="error" />
    </div>

    <!-- Live chat -->
    <div class="card" *ngIf="interviewId && status === 'in_progress'">
      <div class="chat-header">
        <div>
          <span class="badge badge--blue">{{ domain }}</span>
          <span class="badge badge--purple">{{ difficulty }}</span>
        </div>
        <button class="btn btn--danger" (click)="endInterview()" [disabled]="ending()">
          End Session <app-spinner [loading]="ending()" />
        </button>
      </div>

      <div class="chat-box" #chatbox>
        <div *ngFor="let m of chat" [class]="'bubble bubble--' + m.role">
          <span class="bubble__role">{{ m.role === 'assistant' ? 'AI Interviewer' : m.role === 'user' ? 'You' : 'System' }}</span>
          <p>{{ m.content }}</p>
          <span class="bubble__score" *ngIf="m.score != null">Score: {{ m.score }}</span>
        </div>
        <div class="typing" *ngIf="sending()">AI is evaluating your answer…</div>
      </div>

      <div class="composer">
        <textarea [(ngModel)]="message" rows="3"
          placeholder="Type your answer. Press Enter to send, Shift+Enter for new line."
          (keydown.enter)="onEnter($event)"></textarea>
        <button class="btn btn--send" (click)="sendMessage()" [disabled]="sending() || !message.trim()">
          Send <app-spinner [loading]="sending()" />
        </button>
      </div>
    </div>

    <!-- Result -->
    <div class="card result-card" *ngIf="report">
      <h3>Session Report</h3>
      <div class="score-row">
        <div class="score-box score-box--blue">
          <div class="score-val">{{ report.average_score }}</div>
          <div class="score-lbl">Score</div>
        </div>
        <div class="score-box score-box--red">
          <div class="score-val">{{ report.clarity_score }}</div>
          <div class="score-lbl">Clarity</div>
        </div>
      </div>
      <p class="summary">{{ report.summary }}</p>
      <div class="result-grid">
        <div><h4>Strengths</h4><ul><li *ngFor="let s of report.strengths">{{ s }}</li></ul></div>
        <div><h4>Weaknesses</h4><ul><li *ngFor="let w of report.weaknesses">{{ w }}</li></ul></div>
        <div><h4>Weak Topics</h4><ul><li *ngFor="let t of report.weak_topics">{{ t }}</li></ul></div>
        <div><h4>Improvement Points</h4><ul><li *ngFor="let p of report.improvement_points">{{ p }}</li></ul></div>
      </div>
      <button class="btn btn--ghost" (click)="reset()">Start Another Session</button>
    </div>
  `,
  styles: [`
    .page-header h2 { margin: 0; font-size: 22px; font-weight: 800; color: var(--text); }
    .page-header p { color: var(--text-muted); font-size: 14px; margin: 4px 0 18px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 22px; margin-bottom: 16px;
      box-shadow: var(--shadow);
      transition: background var(--transition), border-color var(--transition);
    }
    .card h3 { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 16px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field label { font-size: 13px; font-weight: 600; color: var(--text-2); }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 18px; border-radius: var(--radius-sm);
      font-size: 14px; font-weight: 600; cursor: pointer; border: none;
      transition: background var(--transition), transform 0.1s;
    }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn--primary { background: var(--primary); color: var(--primary-fg); }
    .btn--primary:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
    .btn--danger { background: var(--accent-red); color: #fff; }
    .btn--ghost { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border-2); margin-top: 12px; }
    .btn--send { background: var(--primary); color: var(--primary-fg); align-self: flex-end; }
    .badge {
      font-size: 11px; font-weight: 700; padding: 2px 8px;
      border-radius: 5px; margin-right: 4px;
    }
    .badge--blue { background: var(--accent-blue-bg); color: var(--accent-blue-fg); }
    .badge--purple { background: color-mix(in srgb, #8b5cf6 18%, transparent); color: #a78bfa; }
    .chat-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .chat-box {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 14px;
      max-height: 340px; overflow-y: auto; margin-bottom: 14px;
    }
    .bubble { padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 10px; max-width: 92%; }
    .bubble--assistant { background: var(--accent-blue-bg); border: 1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent); }
    .bubble--user { background: var(--surface); border: 1px solid var(--border-2); margin-left: auto; }
    .bubble--system { background: var(--surface-2); border: 1px solid var(--border); font-style: italic; opacity: 0.8; }
    .bubble__role { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted); display: block; margin-bottom: 5px; }
    .bubble p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-2); }
    .bubble__score { font-size: 11px; color: var(--accent-blue); font-weight: 700; display: block; margin-top: 5px; }
    .typing { font-size: 13px; color: var(--text-muted); font-style: italic; padding: 6px 0; }
    .composer { display: flex; gap: 10px; align-items: flex-end; }
    .composer textarea { flex: 1; resize: vertical; min-height: 72px; }
    .score-row { display: flex; gap: 14px; margin-bottom: 18px; }
    .score-box { border-radius: var(--radius); padding: 18px 26px; text-align: center; }
    .score-box--blue { background: var(--accent-blue-bg); }
    .score-box--red { background: var(--accent-red-bg); }
    .score-val { font-size: 42px; font-weight: 900; line-height: 1; }
    .score-box--blue .score-val { color: var(--accent-blue-fg); }
    .score-box--red .score-val { color: var(--accent-red-fg); }
    .score-lbl { font-size: 11px; color: var(--text-muted); font-weight: 700; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary { font-size: 14px; color: var(--text-2); line-height: 1.65; margin-bottom: 18px; }
    .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .result-grid h4 { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .result-grid ul { padding-left: 16px; margin: 0; }
    .result-grid li { font-size: 13px; color: var(--text-2); margin-bottom: 5px; line-height: 1.5; }
  `],
})
export class InterviewPageComponent implements AfterViewChecked {
  @ViewChild("chatbox") chatboxRef!: ElementRef<HTMLDivElement>;

  domain = "dsa"; difficulty = "medium";
  interviewId = ""; status = ""; message = "";
  creating = signal(false); sending = signal(false);
  ending = signal(false); setupError = signal("");
  chat: ChatEntry[] = [];
  report: FinalReport | null = null;

  constructor(private readonly api: ApiService) {}

  ngAfterViewChecked() {
    if (this.chatboxRef) {
      const el = this.chatboxRef.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  createAndStart() {
    this.setupError.set(""); this.creating.set(true);
    this.api.post<Interview>("/interviews", { domain: this.domain, difficulty: this.difficulty }).subscribe({
      next: (i) => {
        this.interviewId = i.id;
        this.api.post<Interview>(`/interviews/${i.id}/start`, {}).subscribe({
          next: (s) => {
            this.status = s.status; this.creating.set(false);
            setTimeout(() => this._loadMessages(), 700);
          },
          error: (e) => { this.creating.set(false); this.setupError.set(e.detail); },
        });
      },
      error: (e) => { this.creating.set(false); this.setupError.set(e.detail); },
    });
  }

  private _loadMessages() {
    this.api.get<{ role: string; content: string }[]>(`/interviews/${this.interviewId}/messages`).subscribe({
      next: (msgs) => {
        this.chat = (msgs || []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      },
      error: () => {},
    });
  }

  onEnter(e: KeyboardEvent) {
    if (!e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  sendMessage() {
    const text = this.message.trim();
    if (!text || this.sending()) return;
    this.message = "";
    this.chat.push({ role: "user", content: text });
    this.sending.set(true);
    this.api.post<MessageEval>(`/interviews/${this.interviewId}/messages`, { content: text }).subscribe({
      next: (r) => {
        const userMsg = this.chat.find((m, i) => m.role === "user" && i === this.chat.length - 1);
        if (userMsg) userMsg.score = r.score;
        this.chat.push({ role: "assistant", content: r.next_question });
        this.sending.set(false);
      },
      error: (e) => { this.sending.set(false); this.chat.push({ role: "system", content: `Error: ${e.detail}` }); },
    });
  }

  endInterview() {
    this.ending.set(true);
    this.api.post<FinalReport>(`/interviews/${this.interviewId}/end`, {}).subscribe({
      next: (r) => { this.report = r; this.status = "completed"; this.ending.set(false); },
      error: (e) => { this.ending.set(false); this.chat.push({ role: "system", content: `Error: ${e.detail}` }); },
    });
  }

  reset() { this.interviewId = ""; this.status = ""; this.chat = []; this.report = null; this.message = ""; }
}
