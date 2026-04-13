import {
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  Renderer2,
} from "@angular/core";

@Directive({
  selector: "[appReveal]",
  standalone: true,
})
export class RevealDirective implements OnInit, OnDestroy {
  /** Stagger delay in ms — pass a multiple of 80 per card index */
  @Input("appRevealDelay") delay = 0;
  /** Direction: 'up' (default) | 'left' | 'right' */
  @Input("appRevealDir") dir: "up" | "left" | "right" = "up";

  private observer!: IntersectionObserver;

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngOnInit(): void {
    const host = this.el.nativeElement;

    // Initial hidden state
    this.renderer.setStyle(host, "opacity", "0");
    this.renderer.setStyle(host, "transform", this._initialTransform());
    this.renderer.setStyle(
      host,
      "transition",
      `opacity 0.55s cubic-bezier(.4,0,.2,1) ${this.delay}ms,
       transform 0.55s cubic-bezier(.4,0,.2,1) ${this.delay}ms`,
    );

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.renderer.setStyle(host, "opacity", "1");
            this.renderer.setStyle(host, "transform", "none");
            this.observer.unobserve(host);
          }
        });
      },
      { threshold: 0.12 },
    );

    this.observer.observe(host);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private _initialTransform(): string {
    if (this.dir === "left") return "translateX(-28px)";
    if (this.dir === "right") return "translateX(28px)";
    return "translateY(28px)";
  }
}
