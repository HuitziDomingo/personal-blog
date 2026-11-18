import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BackgroundId, BackgroundVariant } from '../theme/backgrounds';
import { AppBackdrop } from './app-backdrop';

@Component({
  imports: [AppBackdrop],
  template: '<app-backdrop [background]="background()" [variant]="variant()" />',
})
class Host {
  readonly background = signal<BackgroundId>('fold');
  readonly variant = signal<BackgroundVariant>('light');
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const images = () => [...element.querySelectorAll('img')];
  const load = (index: number) => {
    images()[index]?.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  };

  return { fixture, element, images, load };
}

describe('AppBackdrop', () => {
  it('pide solo la imagen del fondo y tema actuales, con el recorte vertical para móvil', () => {
    const { element, images } = setup();

    expect(images().map((image) => image.getAttribute('src'))).toEqual(['backgrounds/fold-light-landscape.avif']);
    const source = element.querySelector('source');
    expect(source?.getAttribute('srcset')).toBe('backgrounds/fold-light-portrait.avif');
    expect(source?.getAttribute('media')).toBe('(orientation: portrait)');
    expect(source?.getAttribute('type')).toBe('image/avif');
    expect(element.querySelector('app-backdrop')?.getAttribute('aria-hidden')).toBe('true');
    expect(images()[0]?.getAttribute('alt')).toBe('');
  });

  it('la imagen aparece cuando carga', () => {
    const { images, load } = setup();
    expect(images()[0]?.classList.contains('is-shown')).toBe(false);

    load(0);
    expect(images()[0]?.classList.contains('is-shown')).toBe(true);
  });

  it('al cambiar de tema, la anterior sigue visible hasta que carga la nueva, que va encima', () => {
    const { fixture, images, load } = setup();
    load(0);

    fixture.componentInstance.variant.set('dark');
    fixture.detectChanges();
    expect(images().map((image) => image.getAttribute('src'))).toEqual([
      'backgrounds/fold-light-landscape.avif',
      'backgrounds/fold-dark-landscape.avif',
    ]);
    expect(images()[0]?.classList.contains('is-shown')).toBe(true);
    expect(images()[1]?.classList.contains('is-shown')).toBe(false);

    load(1);
    expect(images()[0]?.classList.contains('is-shown')).toBe(false);
    expect(images()[1]?.classList.contains('is-shown')).toBe(true);
  });

  it('al volver a una imagen ya cargada, se muestra sin esperar y pasa encima', () => {
    const { fixture, images, load } = setup();
    load(0);
    fixture.componentInstance.background.set('map');
    fixture.detectChanges();
    load(1);

    fixture.componentInstance.background.set('fold');
    fixture.detectChanges();
    expect(images().map((image) => image.getAttribute('src'))).toEqual([
      'backgrounds/map-light-landscape.avif',
      'backgrounds/fold-light-landscape.avif',
    ]);
    expect(images()[1]?.classList.contains('is-shown')).toBe(true);
  });

  it('una carga que llega tarde no tapa la imagen elegida después', () => {
    const { fixture, images, load } = setup();
    fixture.componentInstance.background.set('map');
    fixture.detectChanges();

    // Carga la primera (fold), que ya no es la elegida.
    load(0);
    expect(images().some((image) => image.classList.contains('is-shown'))).toBe(false);
  });
});
