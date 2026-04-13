import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-spinner",
  standalone: true,
  imports: [CommonModule],
  template: `<span *ngIf="loading" class="spinner" aria-hidden="true"></span>`,
  styles: [`
    .spinner {
      display: inline-block; width: 14px; height: 14px;
      border: 2px solid color-mix(in srgb, var(--primary) 30%, transparent);
      border-top-color: var(--primary);
      border-radius: 50%; vertical-align: middle; margin-left: 4px;
      animation: spin 0.65s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class SpinnerComponent {
  @Input() loading = false;
}
