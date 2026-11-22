import { ChangeDetectionStrategy, Component, computed, DOCUMENT, effect, inject, input, signal } from '@angular/core';

import {
  BACKGROUND_SIZES_ATTRIBUTE,
  BackgroundFormat,
  BackgroundId,
  BackgroundOrientation,
  backgroundPath,
  backgroundSrcset,
  BackgroundVariant,
  GLASS_BACKDROP_ATTRIBUTE,
  PORTRAIT_QUERY,
} from '../theme/backgrounds';

interface Layer {
  key: string;
  srcset: Readonly<Record<BackgroundOrientation, Readonly<Record<BackgroundFormat, string>>>>;
  /** Para navegadores sin srcset: el apaisado de 1920 en WebP. */
  fallback: string;
}

/**
 * Fondo de pantalla fijo detrás de todo (BLOG-121). Al cambiar de fondo o de
 * tema, la imagen nueva se monta encima y aparece con un fundido cuando ya
 * cargó; la anterior sigue debajo hasta entonces. Solo se descargan las
 * imágenes que se llegan a mostrar. Con prefers-reduced-motion el cambio es
 * inmediato (app-backdrop.css).
 *
 * Cada recorte va en AVIF y WebP con varios anchos (BLOG-146): con srcset y
 * sizes el navegador elige el ancho por el tamaño del viewport y la densidad
 * de píxeles, así que un celular no descarga la de 3840. Se pide con
 * prioridad baja y sin precarga: no es el LCP del login (lo es el texto) y,
 * con más prioridad, competía con el JS por la red en móvil.
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
        <source
          type="image/avif"
          [attr.media]="portraitQuery"
          [attr.sizes]="sizes.portrait"
          [attr.srcset]="layer.srcset.portrait.avif"
        />
        <source
          type="image/webp"
          [attr.media]="portraitQuery"
          [attr.sizes]="sizes.portrait"
          [attr.srcset]="layer.srcset.portrait.webp"
        />
        <source type="image/avif" [attr.sizes]="sizes.landscape" [attr.srcset]="layer.srcset.landscape.avif" />
        <img
          alt=""
          decoding="async"
          fetchpriority="low"
          [attr.sizes]="sizes.landscape"
          [attr.srcset]="layer.srcset.landscape.webp"
          [src]="layer.fallback"
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
  protected readonly sizes = BACKGROUND_SIZES_ATTRIBUTE;

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

      const srcset = (orientation: BackgroundOrientation) => ({
        avif: backgroundSrcset(id, variant, orientation, 'avif'),
        webp: backgroundSrcset(id, variant, orientation, 'webp'),
      });

      return {
        key,
        srcset: { landscape: srcset('landscape'), portrait: srcset('portrait') },
        fallback: backgroundPath(id, variant, 'landscape', 1920, 'webp'),
      };
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
        this.document.documentElement.setAttribute(GLASS_BACKDROP_ATTRIBUTE, key.replaceAll('|', '-'));
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
