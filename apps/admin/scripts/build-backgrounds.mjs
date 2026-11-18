#!/usr/bin/env node
// Genera los fondos del admin (public/backgrounds/) a partir del tarball de
// gnome-backgrounds. Solo usa módulos de Node y herramientas del sistema, que
// no entran al repo: djxl (libjxl), ffmpeg, avifenc (libavif) y, para los SVG,
// Chrome headless. Cada fondo sale en AVIF en dos recortes centrados: apaisado
// para escritorio y vertical para móvil.
//
// Uso:
//   node scripts/build-backgrounds.mjs <carpeta backgrounds/ de gnome-backgrounds-51.0.1>
//   CHROME=/ruta/a/chrome node scripts/build-backgrounds.mjs …   (si hay SVG)
//
// Después, `node scripts/measure-backgrounds.mjs` mide los colores extremos.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BACKGROUND_INFO, BACKGROUND_ORIENTATIONS, BACKGROUND_SIZES, BACKGROUND_VARIANTS, BACKGROUNDS, backgroundPath } from '../src/app/core/theme/backgrounds.ts';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('Uso: node scripts/build-backgrounds.mjs <carpeta backgrounds/ de gnome-backgrounds>');
  process.exit(1);
}
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
/** Calidad de avifenc (0–100): con el desenfoque del glass encima, 50 no deja artefactos visibles. */
const QUALITY = '50';
const MAX_BYTES = 300 * 1024;

const work = mkdtempSync(join(tmpdir(), 'admin-fondos-'));
try {
  for (const id of BACKGROUNDS) {
    for (const variant of BACKGROUND_VARIANTS) {
      const file = join(source, BACKGROUND_INFO[id].files[variant]);
      if (!existsSync(file)) {
        throw new Error(`no existe ${file}`);
      }
      const png = join(work, `${id}-${variant}.png`);
      if (file.endsWith('.jxl')) {
        execFileSync('djxl', [file, png, '--quiet']);
      } else if (file.endsWith('.svg')) {
        const chrome = process.env.CHROME;
        if (!chrome) {
          throw new Error('los SVG necesitan CHROME con la ruta de Chrome');
        }
        // El SVG trae width y height de 4096: dentro de un <img> de 2048 se
        // dibuja entero. Chrome a veces sale con error al cerrar aunque ya
        // escribió la captura; vale si el archivo existe.
        const page = join(work, `${id}-${variant}.html`);
        writeFileSync(page, `<style>html,body{margin:0}img{display:block;width:2048px;height:2048px}</style><img src="file://${file}">`);
        try {
          execFileSync(chrome, ['--headless=new', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=2048,2048', `file://${page}`], { stdio: 'ignore' });
        } catch (error) {
          if (!existsSync(png)) {
            throw error;
          }
        }
      } else {
        execFileSync('cp', [file, png]);
      }
      for (const orientation of BACKGROUND_ORIENTATIONS) {
        const { width, height } = BACKGROUND_SIZES[orientation];
        const cropped = join(work, `${id}-${variant}-${orientation}.png`);
        // Recorte centrado con la proporción final y después el escalado.
        const crop = `crop='min(iw,ih*${width}/${height})':'min(ih,iw*${height}/${width})',scale=${width}:${height}:flags=lanczos`;
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', crop, cropped]);
        const out = join(PUBLIC, backgroundPath(id, variant, orientation));
        execFileSync('avifenc', ['-q', QUALITY, '-s', '4', '-y', '444', '--ignore-exif', '--ignore-xmp', cropped, out], { stdio: 'ignore' });
        const size = statSync(out).size;
        console.log(`${out}: ${(size / 1024).toFixed(1)} KB`);
        if (size > MAX_BYTES) {
          throw new Error(`${out} pasa de ${MAX_BYTES / 1024} KB`);
        }
      }
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
