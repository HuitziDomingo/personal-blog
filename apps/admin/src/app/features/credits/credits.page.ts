import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { AppBackdrop } from '../../core/layout/app-backdrop';
import { SessionService } from '../../core/session/session.service';
import { BackgroundService } from '../../core/theme/background.service';
import {
  BACKGROUND_INFO,
  BACKGROUND_MAX_WIDTHS,
  BACKGROUND_SOURCES,
  BACKGROUND_WIDTHS,
  BACKGROUNDS,
  BackgroundSourceId,
  maxCropWidth,
  THUMBNAIL_SIZE,
  thumbnailPath,
} from '../../core/theme/backgrounds';

const LINK =
  'underline underline-offset-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Créditos de los fondos de pantalla (BLOG-130). CC BY-SA 3.0 y 4.0 piden
 * citar título, autor, fuente y licencia, e indicar los cambios: todo sale de
 * BACKGROUND_INFO y BACKGROUND_SOURCES, así que un fondo nuevo aparece aquí
 * sin tocar esta página.
 * La ruta es pública: el login enlaza aquí.
 */
@Component({
  selector: 'app-credits-page',
  imports: [RouterLink, HlmCardImports, AppBackdrop],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-start justify-center p-3 sm:p-6' },
  template: `
    <app-backdrop [background]="backgrounds.selected()" [variant]="backgrounds.variant()" />

    <main hlmCard class="glass-card w-full max-w-3xl">
      <div hlmCardHeader>
        <h1 hlmCardTitle class="text-2xl">Créditos</h1>
        <p hlmCardDescription class="text-muted-foreground">
          Los fondos de pantalla del admin son obras de sus autores, con licencia Creative Commons
          Atribución-CompartirIgual (CC BY-SA): la 3.0 los de GNOME y la 4.0 los de Fedora. Cada uno enlaza a la suya.
        </p>
      </div>

      <div hlmCardContent class="flex flex-col gap-6">
        <section aria-labelledby="creditos-fondos">
          <h2 id="creditos-fondos" class="mb-3 text-lg font-semibold">Fondos de pantalla</h2>
          <ul class="grid gap-4 sm:grid-cols-2">
            @for (item of items; track item.id) {
              <li class="flex gap-3">
                <img
                  alt=""
                  loading="lazy"
                  decoding="async"
                  class="h-18 w-24 shrink-0 rounded-md object-cover"
                  [width]="thumbnailSize.width"
                  [height]="thumbnailSize.height"
                  [src]="thumbnail(item.id)"
                />
                <div class="min-w-0">
                  <h3 class="font-semibold">{{ item.info.label }}</h3>
                  <dl class="text-sm">
                    <div class="flex flex-wrap gap-x-1">
                      <dt class="text-muted-foreground">Autor:</dt>
                      <dd>{{ item.info.author }}</dd>
                    </div>
                    <div class="flex flex-wrap gap-x-1">
                      <dt class="text-muted-foreground">Fuente:</dt>
                      <dd>
                        <a [class]="link" [href]="item.source.releaseUrl"
                          >{{ item.source.name }}<span class="sr-only"> (fuente del fondo {{ item.info.label }})</span></a
                        >
                      </dd>
                    </div>
                    <div class="flex flex-wrap gap-x-1">
                      <dt class="text-muted-foreground">Archivos de origen:</dt>
                      <dd>
                        <code>{{ item.info.files.light }}</code> y <code>{{ item.info.files.dark }}</code>
                      </dd>
                    </div>
                    <div class="flex flex-wrap gap-x-1">
                      <dt class="text-muted-foreground">Licencia:</dt>
                      <dd>
                        <a [class]="link" [href]="item.source.licenseUrl"
                          >{{ item.source.license }}<span class="sr-only"> del fondo {{ item.info.label }}</span></a
                        >
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            }
          </ul>
        </section>

        <section aria-labelledby="creditos-fuente">
          <h2 id="creditos-fuente" class="mb-2 text-lg font-semibold">Fuentes</h2>
          <ul class="flex list-disc flex-col gap-1 ps-5 text-sm">
            @for (source of sources; track source.id) {
              <li>
                {{ source.info.name }}:
                <a [class]="link" [href]="source.info.projectUrl">{{ source.projectLabel }}</a>
                y <a [class]="link" [href]="source.info.releaseUrl">tarball de {{ source.info.name }}</a>.
              </li>
            }
          </ul>
          <p class="mt-2 text-sm">
            En los de GNOME, el autor y la licencia están en los metadatos de cada archivo de origen. En los de Fedora,
            en el paquete: la licencia del spec, los archivos COPYING y Attribution, y el texto de la licencia que trae el
            tarball.
          </p>
        </section>

        <section aria-labelledby="creditos-cambios">
          <h2 id="creditos-cambios" class="mb-2 text-lg font-semibold">Cambios</h2>
          <p class="text-sm">
            Cada fondo se recortó al centro en dos proporciones, 16:10 apaisado y 9:16 vertical, y se escaló a
            {{ widths }} px de ancho, sin ampliar: si el original no alcanza un ancho, la variante mayor queda del ancho
            del original ({{ narrow }}). Cada variante se convirtió a AVIF y, hasta {{ webpMax }} px, a WebP, y la miniatura del selector, de
            {{ thumbnailSize.width }} × {{ thumbnailSize.height }}, a WebP. Las versiones claras y oscuras son las de cada
            fuente: no hay variantes oscuras derivadas. Estas imágenes derivadas se distribuyen con la misma licencia
            que su original, que no se extiende al código del admin.
          </p>
        </section>
      </div>

      <div hlmCardFooter>
        <a [class]="link + ' text-sm'" [routerLink]="back().path">{{ back().label }}</a>
      </div>
    </main>
  `,
})
export class CreditsPage {
  protected readonly backgrounds = inject(BackgroundService);
  private readonly session = inject(SessionService);

  protected readonly link = LINK;
  protected readonly items = BACKGROUNDS.map((id) => ({
    id,
    info: BACKGROUND_INFO[id],
    source: BACKGROUND_SOURCES[BACKGROUND_INFO[id].source],
  }));
  protected readonly sources = (Object.keys(BACKGROUND_SOURCES) as BackgroundSourceId[]).map((id) => ({
    id,
    info: BACKGROUND_SOURCES[id],
    projectLabel: id.startsWith('gnome') ? 'repositorio en el GitLab de GNOME' : 'paquete en Fedora',
  }));
  protected readonly thumbnailSize = THUMBNAIL_SIZE;
  protected readonly widths = listFormat(BACKGROUND_WIDTHS.map(String));
  protected readonly webpMax = BACKGROUND_MAX_WIDTHS.webp;
  /** Los recortes verticales que no llegan a 3840: el ancho de su original. */
  protected readonly narrow = listFormat([
    ...new Set(
      BACKGROUNDS.map((id) => {
        const { width, height } = BACKGROUND_INFO[id].size;
        return `${maxCropWidth(id, 'portrait')} px en el vertical de los originales de ${width} × ${height}`;
      }),
    ),
  ]);

  /** Con sesión vuelve al admin; sin ella, al login. */
  protected readonly back = computed(() =>
    this.session.user() ? { path: '/posts', label: 'Volver al admin' } : { path: '/login', label: 'Volver a iniciar sesión' },
  );

  protected thumbnail(id: (typeof BACKGROUNDS)[number]): string {
    return thumbnailPath(id, this.backgrounds.variant());
  }
}

function listFormat(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
