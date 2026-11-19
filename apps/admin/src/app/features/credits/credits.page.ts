import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { AppBackdrop } from '../../core/layout/app-backdrop';
import { SessionService } from '../../core/session/session.service';
import { BackgroundService } from '../../core/theme/background.service';
import {
  BACKGROUND_INFO,
  BACKGROUND_SIZES,
  BACKGROUNDS,
  BACKGROUNDS_SOURCE,
  THUMBNAIL_SIZE,
  thumbnailPath,
} from '../../core/theme/backgrounds';

const LINK =
  'underline underline-offset-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Créditos de los fondos de pantalla (BLOG-130). CC BY-SA 3.0 pide citar
 * título, autor, fuente y licencia, e indicar los cambios: todo sale de
 * BACKGROUND_INFO, así que un fondo nuevo aparece aquí sin tocar esta página.
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
          Los fondos de pantalla del admin son obras de sus autores, con licencia
          <a [class]="link" [href]="licenseUrl">Creative Commons Atribución-CompartirIgual 3.0 (CC BY-SA 3.0)</a>.
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
                      <dt class="text-muted-foreground">Archivos de origen:</dt>
                      <dd>
                        <code>{{ item.info.files.light }}</code> y <code>{{ item.info.files.dark }}</code>
                      </dd>
                    </div>
                    <div class="flex flex-wrap gap-x-1">
                      <dt class="text-muted-foreground">Licencia:</dt>
                      <dd>
                        <a [class]="link" [href]="item.info.licenseUrl"
                          >{{ item.info.license }}<span class="sr-only"> del fondo {{ item.info.label }}</span></a
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
          <h2 id="creditos-fuente" class="mb-2 text-lg font-semibold">Fuente</h2>
          <p class="text-sm">
            Todos vienen de {{ source.name }}, la colección de fondos de GNOME:
            <a [class]="link" [href]="source.projectUrl">repositorio de gnome-backgrounds en el GitLab de GNOME</a>
            y <a [class]="link" [href]="source.releaseUrl">descargas de la versión 51</a>. El autor y la licencia de cada
            fondo están en los metadatos de sus archivos de origen.
          </p>
        </section>

        <section aria-labelledby="creditos-cambios">
          <h2 id="creditos-cambios" class="mb-2 text-lg font-semibold">Cambios</h2>
          <p class="text-sm">
            Cada fondo se recortó al centro ({{ changes }}), se escaló y se convirtió a AVIF, y la miniatura a webp. Estas
            imágenes derivadas se distribuyen con la misma licencia, CC BY-SA 3.0, que no se extiende al código del admin.
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
  protected readonly items = BACKGROUNDS.map((id) => ({ id, info: BACKGROUND_INFO[id] }));
  protected readonly source = BACKGROUNDS_SOURCE;
  protected readonly licenseUrl = BACKGROUND_INFO[BACKGROUNDS[0]].licenseUrl;
  protected readonly thumbnailSize = THUMBNAIL_SIZE;
  protected readonly changes = [
    `${BACKGROUND_SIZES.landscape.width} × ${BACKGROUND_SIZES.landscape.height} apaisado`,
    `${BACKGROUND_SIZES.portrait.width} × ${BACKGROUND_SIZES.portrait.height} vertical`,
    `${THUMBNAIL_SIZE.width} × ${THUMBNAIL_SIZE.height} para la miniatura del selector`,
  ].join(', ');

  /** Con sesión vuelve al admin; sin ella, al login. */
  protected readonly back = computed(() =>
    this.session.user() ? { path: '/posts', label: 'Volver al admin' } : { path: '/login', label: 'Volver a iniciar sesión' },
  );

  protected thumbnail(id: (typeof BACKGROUNDS)[number]): string {
    return thumbnailPath(id, this.backgrounds.variant());
  }
}
