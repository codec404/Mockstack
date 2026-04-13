import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { RevealDirective } from "../../shared/reveal.directive";

const DOMAINS = [
  {
    icon: "⚙️",
    title: "Data Structures & Algorithms",
    tag: "DSA",
    desc: "Arrays, trees, graphs, dynamic programming — timed sessions with step-by-step scoring on correctness and complexity analysis.",
    color: "blue",
  },
  {
    icon: "🖧",
    title: "CS Fundamentals",
    tag: "CS",
    desc: "Operating systems, networking, databases, and concurrency. Deep concept questions with structured evaluation.",
    color: "red",
  },
  {
    icon: "🏗️",
    title: "Low-Level Design",
    tag: "LLD",
    desc: "Object-oriented design, SOLID principles, design patterns. Build class hierarchies under interview pressure with AI critique.",
    color: "teal",
  },
  {
    icon: "☁️",
    title: "High-Level Design",
    tag: "HLD",
    desc: "Distributed systems, scalability trade-offs, CAP theorem, real-world architectures. Scored on depth, bottlenecks, and clarity.",
    color: "purple",
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Pick a domain and difficulty", desc: "Select from DSA, CS Fundamentals, LLD, or HLD. Set difficulty from Easy to Expert." },
  { step: "02", title: "Answer in a live chat session", desc: "The AI interviewer asks focused questions, evaluates each answer in real time, and follows up based on your response." },
  { step: "03", title: "Review your scorecard", desc: "Get a final report with per-answer scores, clarity ratings, weak topics, and specific improvement points." },
];

@Component({
  selector: "app-landing-page",
  standalone: true,
  imports: [CommonModule, RouterLink, RevealDirective],
  template: `
    <div class="landing">

      <!-- ── Hero ──────────────────────────────────────────────────────────── -->
      <section class="hero" appReveal>
        <div class="hero__inner">
          <div class="hero__kicker">AI Mock Interview Platform</div>
          <h1 class="hero__headline">
            Interview-ready<br>
            <span class="hero__headline--accent">in weeks, not months.</span>
          </h1>
          <p class="hero__body">
            Structured AI-powered mock interviews across DSA, System Design, and CS
            Fundamentals — with per-answer scoring, clarity ratings, and a detailed
            improvement report after every session.
          </p>
          <div class="hero__actions">
            <a routerLink="/auth" class="btn btn--primary">Start Practicing Free</a>
            <a routerLink="/auth" class="btn btn--ghost">Sign In</a>
          </div>
          <div class="hero__stats">
            <div class="stat"><span class="stat__n">4</span><span class="stat__l">Interview domains</span></div>
            <div class="stat"><span class="stat__n">4</span><span class="stat__l">Difficulty levels</span></div>
            <div class="stat"><span class="stat__n">Live</span><span class="stat__l">AI evaluation per answer</span></div>
            <div class="stat"><span class="stat__n">Free</span><span class="stat__l">To get started</span></div>
          </div>
        </div>
        <div class="hero__visual" aria-hidden="true">
          <div class="mockup">
            <div class="mockup__bar">
              <span class="dot dot--red"></span>
              <span class="dot dot--yellow"></span>
              <span class="dot dot--green"></span>
              <span class="mockup__title">Live Interview</span>
            </div>
            <div class="mockup__body">
              <div class="msg msg--ai">
                <span class="msg__role">AI Interviewer</span>
                <p>Explain how you would design a rate limiter for a distributed API gateway. What data structure would you use and why?</p>
              </div>
              <div class="msg msg--user">
                <span class="msg__role">You</span>
                <p>I'd use a sliding window counter backed by Redis. Each key stores a sorted set of timestamps…</p>
              </div>
              <div class="score-bar">
                <div class="score-bar__item"><span class="score-bar__label">Score</span><span class="score-bar__val score-bar__val--blue">82</span></div>
                <div class="score-bar__item"><span class="score-bar__label">Clarity</span><span class="score-bar__val score-bar__val--teal">78</span></div>
              </div>
              <div class="msg msg--ai">
                <span class="msg__role">AI Interviewer</span>
                <p>Good. How does this handle clock skew across nodes in a multi-region setup?</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Domains ───────────────────────────────────────────────────────── -->
      <section class="section">
        <div class="section__header" appReveal>
          <h2>Four interview domains, one platform.</h2>
          <p>Every domain is independently configurable — difficulty, session length, and focus areas are yours to set.</p>
        </div>
        <div class="domain-grid">
          <div *ngFor="let d of domains; let i = index"
               [class]="'domain-card domain-card--' + d.color"
               appReveal [appRevealDelay]="i * 90" appRevealDir="up">
            <span class="domain-card__icon">{{ d.icon }}</span>
            <span class="domain-card__tag">{{ d.tag }}</span>
            <h3 class="domain-card__title">{{ d.title }}</h3>
            <p class="domain-card__desc">{{ d.desc }}</p>
          </div>
        </div>
      </section>

      <!-- ── How it works ──────────────────────────────────────────────────── -->
      <section class="section section--alt">
        <div class="section__header" appReveal>
          <h2>How it works.</h2>
          <p>Three steps from zero to a scored interview session.</p>
        </div>
        <div class="steps">
          <div class="step" appReveal appRevealDir="left" [appRevealDelay]="0">
            <div class="step__num">01</div>
            <h3>{{ steps[0].title }}</h3>
            <p>{{ steps[0].desc }}</p>
          </div>
          <div class="step-connector" aria-hidden="true">→</div>
          <div class="step" appReveal [appRevealDelay]="120">
            <div class="step__num">02</div>
            <h3>{{ steps[1].title }}</h3>
            <p>{{ steps[1].desc }}</p>
          </div>
          <div class="step-connector" aria-hidden="true">→</div>
          <div class="step" appReveal appRevealDir="right" [appRevealDelay]="240">
            <div class="step__num">03</div>
            <h3>{{ steps[2].title }}</h3>
            <p>{{ steps[2].desc }}</p>
          </div>
        </div>
      </section>

      <!-- ── Feedback anatomy ──────────────────────────────────────────────── -->
      <section class="section">
        <div class="section__header" appReveal>
          <h2>Every session ends with a full scorecard.</h2>
          <p>Not just a score — a structured breakdown of what to improve and why.</p>
        </div>
        <div class="scorecard-preview" appReveal [appRevealDelay]="80">
          <div class="scorecard-preview__scores">
            <div class="big-score big-score--blue"><div class="big-score__val">76</div><div class="big-score__lbl">Average Score</div></div>
            <div class="big-score big-score--red"><div class="big-score__val">71</div><div class="big-score__lbl">Clarity</div></div>
          </div>
          <div class="scorecard-preview__lists">
            <div class="score-list">
              <h4>Strengths</h4>
              <ul>
                <li>Correctly identified the data structure trade-off</li>
                <li>Explained time complexity for all operations</li>
              </ul>
            </div>
            <div class="score-list">
              <h4>Improvement Points</h4>
              <ul>
                <li>Justify design decisions with concrete numbers</li>
                <li>Address failure modes and edge cases explicitly</li>
                <li>Include a brief complexity analysis per answer</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ── CTA ───────────────────────────────────────────────────────────── -->
      <section class="cta-section" appReveal>
        <h2>Start your first session today.</h2>
        <p>Free to use. No setup required. Pick a domain and the AI interviewer is ready.</p>
        <a routerLink="/auth" class="btn btn--primary btn--lg">Get Started — It's Free</a>
      </section>

    </div>
  `,
  styles: [`
    .landing {
      min-height: 100vh;
    }

    /* ── Hero ───────────────────────────────────────────────────────────────── */
    .hero {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      align-items: center;
      padding: 80px 0 72px;
      max-width: 1100px;
      margin: 0 auto;
    }
    .hero__kicker {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--accent-blue);
      background: var(--accent-blue-bg);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      margin-bottom: 18px;
    }
    .hero__headline {
      font-size: 48px;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: -1.5px;
      color: var(--text);
      margin-bottom: 20px;
    }
    .hero__headline--accent {
      color: var(--accent-red);
    }
    .hero__body {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.7;
      margin-bottom: 32px;
      max-width: 480px;
    }
    .hero__actions {
      display: flex;
      gap: 12px;
      margin-bottom: 40px;
    }
    .hero__stats {
      display: flex;
      gap: 28px;
      flex-wrap: wrap;
    }
    .stat { display: flex; flex-direction: column; }
    .stat__n { font-size: 22px; font-weight: 800; color: var(--text); }
    .stat__l { font-size: 12px; color: var(--text-muted); }

    /* ── Mockup ─────────────────────────────────────────────────────────────── */
    .hero__visual { display: flex; justify-content: center; }
    .mockup {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      width: 100%;
      max-width: 420px;
      overflow: hidden;
    }
    .mockup__bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 14px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
    }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot--red { background: var(--accent-red); }
    .dot--yellow { background: #f59e0b; }
    .dot--green { background: var(--success); }
    .mockup__title { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-left: 8px; }
    .mockup__body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .msg { padding: 10px 12px; border-radius: var(--radius-sm); }
    .msg--ai { background: var(--accent-blue-bg); border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent); }
    .msg--user { background: var(--surface-2); border: 1px solid var(--border); }
    .msg__role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); display: block; margin-bottom: 4px; }
    .msg p { font-size: 13px; color: var(--text-2); line-height: 1.5; }
    .score-bar { display: flex; gap: 8px; padding: 8px 0; }
    .score-bar__item { display: flex; align-items: center; gap: 6px; }
    .score-bar__label { font-size: 11px; color: var(--text-muted); font-weight: 600; }
    .score-bar__val { font-size: 14px; font-weight: 800; padding: 2px 8px; border-radius: 6px; }
    .score-bar__val--blue { background: var(--accent-blue-bg); color: var(--accent-blue-fg); }
    .score-bar__val--teal { background: var(--success-bg); color: var(--success-fg); }

    /* ── Sections ───────────────────────────────────────────────────────────── */
    .section {
      padding: 72px 0;
      max-width: 1100px;
      margin: 0 auto;
    }
    .section--alt {
      padding: 72px 28px;
      max-width: 100%;
      background: var(--surface-2);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .section--alt > * { max-width: 1100px; margin-left: auto; margin-right: auto; }
    .section__header { margin-bottom: 40px; }
    .section__header h2 { font-size: 30px; font-weight: 800; margin-bottom: 10px; }
    .section__header p { font-size: 15px; color: var(--text-muted); max-width: 520px; }

    /* ── Domain grid ────────────────────────────────────────────────────────── */
    .domain-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .domain-card {
      padding: 24px 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
      transition: transform var(--transition), box-shadow var(--transition);
    }
    .domain-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }
    .domain-card__icon { font-size: 26px; display: block; margin-bottom: 10px; }
    .domain-card__tag {
      font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      padding: 2px 7px; border-radius: 5px; display: inline-block; margin-bottom: 10px;
    }
    .domain-card--blue .domain-card__tag { background: var(--accent-blue-bg); color: var(--accent-blue-fg); }
    .domain-card--red .domain-card__tag { background: var(--accent-red-bg); color: var(--accent-red-fg); }
    .domain-card--teal .domain-card__tag { background: var(--success-bg); color: var(--success); }
    .domain-card--purple .domain-card__tag { background: color-mix(in srgb, #8b5cf6 15%, transparent); color: #a78bfa; }
    .domain-card__title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .domain-card__desc { font-size: 13px; color: var(--text-muted); line-height: 1.6; }

    /* ── Steps ──────────────────────────────────────────────────────────────── */
    .steps {
      display: grid;
      grid-template-columns: 1fr 40px 1fr 40px 1fr;
      align-items: start;
      gap: 0;
    }
    .step {
      display: flex; flex-direction: column; gap: 12px;
    }
    .steps .step:not(:last-child)::after {
      display: none;
    }
    /* Connector lines rendered as grid items between steps */
    .steps { position: relative; }
    .step__num {
      font-size: 13px; font-weight: 800; letter-spacing: 1px;
      color: var(--accent-blue); background: var(--accent-blue-bg);
      padding: 4px 10px; border-radius: var(--radius-sm);
      display: inline-block; align-self: flex-start;
    }
    .step h3 { font-size: 16px; font-weight: 700; color: var(--text); }
    .step p { font-size: 13px; color: var(--text-muted); line-height: 1.6; }
    .step-connector {
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 10px; color: var(--border-2); font-size: 20px; font-weight: 300;
      user-select: none;
    }

    /* ── Scorecard preview ──────────────────────────────────────────────────── */
    .scorecard-preview {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 32px;
      display: flex;
      gap: 40px;
      align-items: flex-start;
    }
    .scorecard-preview__scores { display: flex; gap: 16px; flex-shrink: 0; }
    .big-score { padding: 20px 28px; border-radius: var(--radius-lg); text-align: center; }
    .big-score--blue { background: var(--accent-blue-bg); }
    .big-score--red { background: var(--accent-red-bg); }
    .big-score__val { font-size: 48px; font-weight: 900; line-height: 1; }
    .big-score--blue .big-score__val { color: var(--accent-blue-fg); }
    .big-score--red .big-score__val { color: var(--accent-red-fg); }
    .big-score__lbl { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .scorecard-preview__lists { display: flex; gap: 32px; flex: 1; }
    .score-list { flex: 1; }
    .score-list h4 { font-size: 13px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .score-list ul { padding-left: 16px; }
    .score-list li { font-size: 13px; color: var(--text-muted); margin-bottom: 7px; line-height: 1.5; }

    /* ── CTA ────────────────────────────────────────────────────────────────── */
    .cta-section {
      text-align: center;
      padding: 80px 24px;
      max-width: 600px;
      margin: 0 auto;
    }
    .cta-section h2 { font-size: 32px; font-weight: 900; margin-bottom: 12px; }
    .cta-section p { font-size: 15px; color: var(--text-muted); margin-bottom: 28px; line-height: 1.7; }

    /* ── Buttons ────────────────────────────────────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 20px; border-radius: var(--radius-sm);
      font-size: 14px; font-weight: 600; cursor: pointer;
      border: none; text-decoration: none;
      transition: background var(--transition), color var(--transition), box-shadow var(--transition), transform var(--transition);
    }
    .btn:hover { text-decoration: none; transform: translateY(-1px); }
    .btn--primary {
      background: var(--primary); color: var(--primary-fg);
      box-shadow: 0 2px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
    .btn--primary:hover { background: var(--primary-hover); }
    .btn--ghost {
      background: var(--surface-2); color: var(--text-2);
      border: 1px solid var(--border-2);
    }
    .btn--ghost:hover { background: var(--surface); }
    .btn--lg { padding: 13px 28px; font-size: 15px; border-radius: var(--radius); }

    /* ── Responsive ─────────────────────────────────────────────────────────── */
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; padding: 48px 0 40px; }
      .hero__visual { display: none; }
      .hero__headline { font-size: 36px; }
      .domain-grid { grid-template-columns: 1fr 1fr; }
      .steps { grid-template-columns: 1fr; }
      .step-connector { display: none; }
      .scorecard-preview { flex-direction: column; }
      .scorecard-preview__lists { flex-direction: column; }
    }
    @media (max-width: 600px) {
      .domain-grid { grid-template-columns: 1fr; }
      .hero__headline { font-size: 30px; }
      .hero__actions { flex-direction: column; }
    }
  `],
})
export class LandingPageComponent {
  readonly domains = DOMAINS;
  readonly steps = HOW_IT_WORKS;
}
