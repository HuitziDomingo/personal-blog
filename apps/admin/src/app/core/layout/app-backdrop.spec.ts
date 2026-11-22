import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  BACKGROUND_SIZES_ATTRIBUTE,
  BackgroundId,
  backgroundSrcset,
  BackgroundVariant,
  GLASS_BACKDROP_ATTRIBUTE,
} from '../theme/backgrounds';
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
  afterEach(() => document.documentElement.removeAttribute(GLASS_BACKDROP_ATTRIBUTE));

  it('pide solo la imagen del fondo y tema actuales, con el recorte vertical para móvil', () => {
    const { element, images } = setup();

    expect(images().map((image) => image.getAttribute('src'))).toEqual(['backgrounds/fold-light-landscape-1920.webp']);
    const sources = [...element.querySelectorAll('source')].map((source) => ({
      type: source.getAttribute('type'),
      media: source.getAttribute('media'),
      sizes: source.getAttribute('sizes'),
      srcset: source.getAttribute('srcset'),
    }));
    expect(sources).toEqual([
      {
        type: 'image/avif',
        media: '(orientation: portrait)',
        sizes: BACKGROUND_SIZES_ATTRIBUTE.portrait,
        srcset: backgroundSrcset('fold', 'light', 'portrait', 'avif'),
      },
      {
        type: 'image/webp',
        media: '(orientation: portrait)',
        sizes: BACKGROUND_SIZES_ATTRIBUTE.portrait,
        srcset: backgroundSrcset('fold', 'light', 'portrait', 'webp'),
      },
      { type: 'image/avif', media: null, sizes: BACKGROUND_SIZES_ATTRIBUTE.landscape, srcset: backgroundSrcset('fold', 'light', 'landscape', 'avif') },
    ]);
    expect(images()[0]?.getAttribute('srcset')).toBe(backgroundSrcset('fold', 'light', 'landscape', 'webp'));
    expect(images()[0]?.getAttribute('sizes')).toBe(BACKGROUND_SIZES_ATTRIBUTE.landscape);
    expect(element.querySelector('app-backdrop')?.getAttribute('aria-hidden')).toBe('true');
    expect(images()[0]?.getAttribute('alt')).toBe('');
  });

  it('cada srcset lista los anchos con su descriptor w, de 1280 a 3840 sin ampliar (BLOG-146)', () => {
    expect(backgroundSrcset('fold', 'light', 'landscape', 'avif')).toBe(
      [1280, 1920, 2560, 3840].map((width) => `backgrounds/fold-light-landscape-${width}.avif ${width}w`).join(', '),
    );
    expect(backgroundSrcset('fold', 'dark', 'portrait', 'webp')).toBe(
      [1280, 1920, 2304].map((width) => `backgrounds/fold-dark-portrait-${width}.webp ${width}w`).join(', '),
    );
    expect(backgroundSrcset('fedora-42', 'light', 'portrait', 'avif')).toBe(
      'backgrounds/fedora-42-light-portrait-1280.avif 1280w, backgrounds/fedora-42-light-portrait-1701.avif 1701w',
    );
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
      'backgrounds/fold-light-landscape-1920.webp',
      'backgrounds/fold-dark-landscape-1920.webp',
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
      'backgrounds/map-light-landscape-1920.webp',
      'backgrounds/fold-light-landscape-1920.webp',
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

  it('deja en <html> el fondo visible para el tinte de las cards, solo cuando ya cargó (BLOG-143)', () => {
    const { fixture, load } = setup();
    expect(document.documentElement.hasAttribute(GLASS_BACKDROP_ATTRIBUTE)).toBe(false);

    load(0);
    expect(document.documentElement.getAttribute(GLASS_BACKDROP_ATTRIBUTE)).toBe('fold-light');

    fixture.componentInstance.variant.set('dark');
    fixture.detectChanges();
    expect(document.documentElement.getAttribute(GLASS_BACKDROP_ATTRIBUTE)).toBe('fold-light');

    load(1);
    expect(document.documentElement.getAttribute(GLASS_BACKDROP_ATTRIBUTE)).toBe('fold-dark');
  });
});
