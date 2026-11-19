import { ChangeDetectionStrategy, Component, ElementRef, inject, input, linkedSignal, viewChildren } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';

import { BackgroundService } from '../theme/background.service';
import { BACKGROUND_INFO, BackgroundId, BACKGROUNDS, THUMBNAIL_SIZE, thumbnailPath } from '../theme/backgrounds';

/**
 * Selector de fondo con miniaturas (BLOG-124). Es un radiogroup hecho a mano
 * porque cada opción es una imagen: un solo tab stop (roving tabindex), las
 * flechas mueven el foco y Espacio o Enter eligen. Elegir no sigue al foco:
 * cada fondo pesa decenas de KB y recorrer la cuadrícula con las flechas no
 * debe descargarlos todos.
 */
@Component({
  selector: 'app-background-picker',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="radiogroup"
      [attr.aria-labelledby]="labelledby()"
      [attr.aria-describedby]="describedby()"
      class="grid grid-cols-3 gap-2"
    >
      @for (id of ids; track id; let index = $index) {
        <button
          #option
          type="button"
          role="radio"
          class="focus-visible:ring-ring/50 relative aspect-[4/3] min-h-11 min-w-11 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-3"
          [class.border-primary]="id === service.selected()"
          [class.border-transparent]="id !== service.selected()"
          [attr.aria-checked]="id === service.selected()"
          [attr.aria-label]="info[id].label"
          [attr.tabindex]="index === active() ? 0 : -1"
          (click)="select(index)"
          (focus)="active.set(index)"
          (keydown)="onKeydown($event)"
          (focusout)="onFocusout($event)"
        >
          <img
            alt=""
            loading="lazy"
            decoding="async"
            class="size-full object-cover"
            [width]="size.width"
            [height]="size.height"
            [src]="thumbnail(id)"
          />
          @if (id === service.selected()) {
            <!-- La palomita marca la elegida sin depender solo del color del borde. -->
            <span
              aria-hidden="true"
              class="bg-primary text-primary-foreground absolute end-1 top-1 flex size-5 items-center justify-center rounded-full shadow"
            >
              <ng-icon name="lucideCheck" size="0.875rem" strokeWidth="3" />
            </span>
          }
        </button>
      }
    </div>
  `,
})
export class BackgroundPicker {
  readonly labelledby = input.required<string>();
  readonly describedby = input<string | null>(null);

  protected readonly service = inject(BackgroundService);
  protected readonly ids = BACKGROUNDS;
  protected readonly info = BACKGROUND_INFO;
  protected readonly size = THUMBNAIL_SIZE;

  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('option');
  /**
   * La opción con tabindex 0: la elegida, o a la que se movió el foco con las
   * flechas. Vuelve a la elegida si esta cambia (por ejemplo, desde otra pestaña).
   */
  protected readonly active = linkedSignal(() => BACKGROUNDS.indexOf(this.service.selected()));

  /** La miniatura de la versión del tema actual, como el fondo que se vería. */
  protected thumbnail(id: BackgroundId): string {
    return thumbnailPath(id, this.service.variant());
  }

  protected select(index: number): void {
    this.active.set(index);
    this.service.setBackground(BACKGROUNDS[index]);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const last = BACKGROUNDS.length - 1;
    const current = this.active();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current === last ? 0 : current + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current === 0 ? last : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        // Espacio y Enter llegan al botón como clic.
        return;
    }
    event.preventDefault();
    this.active.set(next);
    this.options()[next]?.nativeElement.focus();
  }

  /** Al salir del grupo, el tab stop vuelve a la elegida. */
  protected onFocusout(event: FocusEvent): void {
    if (!this.options().some((option) => option.nativeElement === event.relatedTarget)) {
      this.active.set(BACKGROUNDS.indexOf(this.service.selected()));
    }
  }
}
