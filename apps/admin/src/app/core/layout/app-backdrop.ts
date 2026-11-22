import { ChangeDetectionStrategy, Component, computed, DOCUMENT, effect, inject, input, signal } from '@angular/core';

import {
  BackgroundId,
  backgroundPath,
  BackgroundVariant,
  GLASS_BACKDROP_ATTRIBUTE,
  PORTRAIT_QUERY,
} from '../theme/backgrounds';

interface Layer {
  key: string;
  landscape: string;
  portrait: string;
}

/**
 * Fondo de pantalla fijo detrás de todo (BLOG-121). Al cambiar de fondo o de
 * tema, la imagen nueva se monta encima y aparece con un fundido cuando ya
 * cargó; la anterior sigue debajo hasta entonces. Solo se descargan las
 * imágenes que se llegan a mostrar. Con prefers-reduced-motion el cambio es
 * inmediato (app-backdrop.css).
 *
 * La capa visible queda en <html> (data-glass-backdrop) para que las cards de
 * vidrio usen el tinte medido para ese fondo (BLOG-143). Al destruirse no lo
 * quita: mientras el AppBackdrop siguiente carga su imagen, detrás de las
 * cards solo está --background, sobre el que cualquier tinte cumple.
 */
@Component({
  selector: 'app-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app-backdrop.css',
  host: { 'aria-hidden': 'true', class: 'app-backdrop' },
  template: `
    @for (layer of layers(); track layer.key) {
      <picture>
        <source type="image/avif" [attr.media]="portraitQuery" [attr.srcset]="layer.portrait" />
        <img
          alt=""
          decoding="async"
          fetchpriority="high"
          [src]="layer.landscape"
          [class.is-shown]="layer.key === shown()"
          (load)="loaded(layer.key)"
        />
      </picture>
    }
  `,
})
export class AppBackdrop {
  readonly background = input.required<BackgroundId>();
  readonly variant = input.required<BackgroundVariant>();

  protected readonly portraitQuery = PORTRAIT_QUERY;

  private readonly target = computed(() => `${this.background()}|${this.variant()}`);
  /** Las capas que ya se pidieron, en orden: la última va encima. */
  private readonly keys = signal<readonly string[]>([]);
  /** La capa visible: la del objetivo en cuanto cargó; mientras, la anterior. */
  protected readonly shown = signal<string | null>(null);
  private readonly done = new Set<string>();
  private readonly document = inject(DOCUMENT);

  protected readonly layers = computed<Layer[]>(() =>
    this.keys().map((key) => {
      const [id, variant] = key.split('|') as [BackgroundId, BackgroundVariant];

      return { key, landscape: backgroundPath(id, variant, 'landscape'), portrait: backgroundPath(id, variant, 'portrait') };
    }),
  );

  constructor() {
    effect(() => {
      const key = this.target();
      // La capa objetivo pasa al final (encima de las demás).
      this.keys.update((keys) => [...keys.filter((existing) => existing !== key), key]);
      if (this.done.has(key)) {
        this.shown.set(key);
      }
    });
    effect(() => {
      const key = this.shown();
      if (key) {
        this.document.documentElement.setAttribute(GLASS_BACKDROP_ATTRIBUTE, key.replace('|', '-'));
      }
    });
  }

  protected loaded(key: string): void {
    this.done.add(key);
    if (key === this.target()) {
      this.shown.set(key);
    }
  }
}
