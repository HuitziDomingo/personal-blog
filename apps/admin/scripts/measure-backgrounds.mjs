#!/usr/bin/env node
// Mide, en cada fondo de public/backgrounds/, el píxel más oscuro y el más
// claro después de desenfocarlo como lo hace el glass (BLOG-121), y los
// guarda en src/app/core/theme/background-extremes.json. Con esos colores,
// check-theme-contrast.mjs comprueba en `make admin-test` que el texto de las
// cards de vidrio cumpla AA sobre el peor caso de cada imagen, sin decodificar
// AVIF en el CI.
//
// Decodifica con Chrome (canvas), así que usa el Playwright de e2e/ y no
// agrega dependencias al admin. El desenfoque medido (GLASS_BLUR_MEASURED) es
// menor que el del CSS: menos desenfoque deja extremos más extremos, así que
// el resultado es conservador.
//
// Uso: CHROME=/ruta/a/chrome node scripts/measure-backgrounds.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { BACKGROUND_ORIENTATIONS, BACKGROUND_VARIANTS, BACKGROUNDS, backgroundPath } from '../src/app/core/theme/backgrounds.ts';

const GLASS_BLUR_MEASURED = 16;
const PUBLIC = new URL('../public/', import.meta.url);
const OUT = fileURLToPath(new URL('../src/app/core/theme/background-extremes.json', import.meta.url));

const require = createRequire(new URL('../../../e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
const result = {};
try {
  for (const id of BACKGROUNDS) {
    for (const variant of BACKGROUND_VARIANTS) {
      for (const orientation of BACKGROUND_ORIENTATIONS) {
        const path = backgroundPath(id, variant, orientation);
        const data = `data:image/avif;base64,${readFileSync(new URL(path, PUBLIC)).toString('base64')}`;
        const extremes = await page.evaluate(
          async ({ data, blur }) => {
            const image = new Image();
            image.src = data;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.filter = `blur(${blur}px)`;
            context.drawImage(image, 0, 0);
            // Sin los bordes: el desenfoque del canvas los mezcla con transparente.
            const margin = blur * 3;
            const { data: pixels, width } = context.getImageData(margin, margin, canvas.width - margin * 2, canvas.height - margin * 2);
            const linear = (channel) => {
              const c = channel / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            let darkest = { l: 2 };
            let lightest = { l: -1 };
            for (let index = 0; index < pixels.length; index += 4) {
              const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
              const l = 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
              if (l < darkest.l) darkest = { l, rgb };
              if (l > lightest.l) lightest = { l, rgb };
            }
            const hex = (rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
            return { darkest: hex(darkest.rgb), lightest: hex(lightest.rgb), width };
          },
          { data, blur: GLASS_BLUR_MEASURED },
        );
        result[`${id}-${variant}-${orientation}`] = { darkest: extremes.darkest, lightest: extremes.lightest };
        console.log(path, extremes.darkest, extremes.lightest);
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
