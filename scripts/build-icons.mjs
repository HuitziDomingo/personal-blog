#!/usr/bin/env node
/**
 * Genera los íconos de la marca a partir de apps/web/assets/img/leon.svg
 * (BLOG-158), rasterizados con el Chromium de Playwright, que ya instala el
 * paquete e2e: sin dependencias nuevas.
 *
 * Uso: node scripts/build-icons.mjs
 *
 * - apps/web/app/icon.svg: copia exacta del SVG (Next la enlaza como
 *   <link rel="icon" type="image/svg+xml">).
 * - apps/web/app/favicon.ico y apps/admin/public/favicon.ico: el mismo ICO,
 *   con PNG de 16 y 32 px dentro, fondo transparente.
 * - apps/web/app/apple-icon.png: 180 × 180 sobre #f0e7db, porque iOS rellena
 *   la transparencia de negro; el león ocupa el 80 % y deja margen para las
 *   esquinas redondeadas.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'apps/web/assets/img/leon.svg');
const APPLE_BG = '#f0e7db';
const APPLE_SIZE = 180;
const APPLE_SCALE = 0.8;
const ICO_SIZES = [16, 32];

// Playwright vive en el paquete e2e; se resuelve desde ahí.
const { chromium } = createRequire(join(ROOT, 'e2e/package.json'))('@playwright/test');

/** Un ICO con las imágenes PNG tal cual (válido desde Windows Vista y en todos los navegadores). */
function icoFromPngs(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = ícono
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por píxel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)]);
}

async function render(page, svg, { size, inner = size, background = 'transparent' }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:${background};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body></html>',
  );
  return page.screenshot({ omitBackground: background === 'transparent', clip: { x: 0, y: 0, width: size, height: size } });
}

const svg = readFileSync(SVG, 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const pngs = [];
  for (const size of ICO_SIZES) {
    pngs.push({ size, png: await render(page, svg, { size }) });
  }
  const ico = icoFromPngs(pngs);
  const apple = await render(page, svg, { size: APPLE_SIZE, inner: Math.round(APPLE_SIZE * APPLE_SCALE), background: APPLE_BG });

  copyFileSync(SVG, join(ROOT, 'apps/web/app/icon.svg'));
  writeFileSync(join(ROOT, 'apps/web/app/favicon.ico'), ico);
  writeFileSync(join(ROOT, 'apps/admin/public/favicon.ico'), ico);
  writeFileSync(join(ROOT, 'apps/web/app/apple-icon.png'), apple);
  console.log(`icon.svg: ${String(svg.length)} bytes; favicon.ico: ${String(ico.length)} bytes; apple-icon.png: ${String(apple.length)} bytes`);
} finally {
  await browser.close();
}
