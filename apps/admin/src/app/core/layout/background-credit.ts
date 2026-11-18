import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { BACKGROUND_INFO, BackgroundId } from '../theme/backgrounds';

/** Origen de los fondos: gnome-backgrounds 51.0.1. */
export const BACKGROUNDS_SOURCE_URL = 'https://gitlab.gnome.org/GNOME/gnome-backgrounds';

/**
 * Atribución del fondo que se ve (BLOG-121). Los fondos de GNOME son CC BY-SA
 * 3.0, que pide citar título, autor, fuente y licencia donde se usa la obra.
 */
@Component({
  selector: 'app-background-credit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block text-xs' },
  template: `
    Fondo «{{ info().label }}» de {{ info().author }}, de
    <a class="underline underline-offset-2" [href]="sourceUrl" target="_blank" rel="noopener noreferrer">GNOME</a>
    (<a class="underline underline-offset-2" [href]="info().licenseUrl" target="_blank" rel="noopener noreferrer">{{
      info().license
    }}</a
    >).
  `,
})
export class BackgroundCredit {
  readonly background = input.required<BackgroundId>();

  protected readonly info = computed(() => BACKGROUND_INFO[this.background()]);
  protected readonly sourceUrl = BACKGROUNDS_SOURCE_URL;
}
