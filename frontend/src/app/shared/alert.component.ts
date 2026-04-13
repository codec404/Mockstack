import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-alert",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="message" [class]="'alert alert--' + type" role="alert">
      {{ message }}
    </div>
  `,
  styles: [`
    .alert {
      padding: 9px 13px; border-radius: var(--radius-sm);
      font-size: 13px; margin-top: 10px; line-height: 1.5;
      transition: background var(--transition), color var(--transition);
    }
    .alert--error {
      background: var(--accent-red-bg); color: var(--accent-red-fg);
      border: 1px solid color-mix(in srgb, var(--accent-red) 30%, transparent);
    }
    .alert--success {
      background: var(--success-bg); color: var(--success-fg);
      border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    }
    .alert--info {
      background: var(--accent-blue-bg); color: var(--accent-blue-fg);
      border: 1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent);
    }
  `],
})
export class AlertComponent {
  @Input() message = "";
  @Input() type: "error" | "success" | "info" = "info";
}
