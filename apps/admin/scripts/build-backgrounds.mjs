#!/usr/bin/env node
// Genera los fondos del admin (public/backgrounds/) a partir de los tarballs
// de sus fuentes (BACKGROUND_SOURCES en backgrounds.ts). Solo usa módulos de
// Node y herramientas del sistema, que no entran al repo: djxl (libjxl),
// ffmpeg y ffprobe, avifenc (libavif), cwebp (libwebp) y, para los SVG,
// Chrome headless.
//
// Cada fondo sale en dos recortes centrados, apaisado (16:10) para escritorio
// y vertical (9:16) para móvil, en cada ancho de backgroundWidths (1280, 1920,
// 2560 y 3840, sin ampliar el original), en AVIF y, hasta 2560, en WebP
// (BLOG-146, BLOG-148). La
// miniatura del selector (webp de 160 × 120, BLOG-124) solo se genera si no
// existe; con THUMBNAILS=1 se regenera.
//
// Uso:
//   node scripts/build-backgrounds.mjs <fuente>=<carpeta del tarball> … [ids]
//   p. ej. CHROME=/ruta/a/chrome node scripts/build-backgrounds.mjs \
//     gnome-51=/tmp/gnome-backgrounds-51.0.1 fedora-42=/tmp/f42-backgrounds-42.0.0 \
//     fedora-43=/tmp/f43-backgrounds-43.0.4 fedora-44=/tmp/f44-backgrounds-44.0.0
//   (CHROME solo hace falta si hay SVG; con ids al final, genera solo esos)
//
// Solo genera los fondos cuyas fuentes se pasan. Después,
// `node scripts/measure-backgrounds.mjs` mide los colores extremos.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BACKGROUND_INFO,
  BACKGROUND_ORIENTATIONS,
  BACKGROUND_SOURCES,
  BACKGROUND_VARIANTS,
  BACKGROUNDS,
  backgroundHeight,
  backgroundPath,
  backgroundWidths,
  THUMBNAIL_SIZE,
  thumbnailPath,
} from '../src/app/core/theme/backgrounds.ts';

/**
 * Parámetros de codificación (BLOG-146, BLOG-148). AVIF: calidad 65 a 10 bits
 * y 4:4:4 (los 10 bits evitan bandas en los degradados y, a igual calidad,
 * pesan un poco menos que 8), y 75 en las de 3840, las que se ven en pantallas
 * 2x. WebP, solo respaldo para navegadores sin AVIF: calidad 80 con
 * sharp_yuv, hasta 2560 (BACKGROUND_MAX_WIDTHS). Antes de BLOG-146: AVIF
 * calidad 50 a 8 bits, en dos tamaños fijos.
 */
const AVIF_ARGS = ['-d', '10', '-y', '444', '-s', '6', '-j', 'all', '--ignore-exif', '--ignore-xmp'];
const avifQuality = (width) => (width === 3840 ? '75' : '65');
const WEBP_ARGS = ['-q', '80', '-m', '6', '-sharp_yuv', '-metadata', 'none'];
/** Calidad de cwebp para las miniaturas: a 160 × 120 queda alrededor de 10 KB. */
const THUMBNAIL_ARGS = ['-q', '80', '-m', '6', '-metadata', 'none'];
const MAX_THUMBNAIL_BYTES = 16 * 1024;

const args = process.argv.slice(2);
const sources = Object.fromEntries(
  args.filter((arg) => arg.includes('=')).map((arg) => [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]),
);
const only = args.filter((arg) => !arg.includes('='));
for (const source of Object.keys(sources)) {
  if (!(source in BACKGROUND_SOURCES)) {
    throw new Error(`fuente desconocida: ${source} (válidas: ${Object.keys(BACKGROUND_SOURCES).join(', ')})`);
  }
}
if (!Object.keys(sources).length) {
  console.error('Uso: node scripts/build-backgrounds.mjs <fuente>=<carpeta del tarball> … [ids]');
  process.exit(1);
}
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const ids = BACKGROUNDS.filter((id) => BACKGROUND_INFO[id].source in sources && (!only.length || only.includes(id)));

/** Recorte centrado con la proporción final y después el escalado, en ffmpeg. */
function cropFilter(width, height) {
  return `crop='min(iw,ih*${width}/${height})':'min(ih,iw*${height}/${width})',scale=${width}:${height}:flags=lanczos`;
}

/** Decodifica el original a PNG y comprueba que mide lo que dice backgrounds.ts. */
function decode(file, png, size, work) {
  if (file.endsWith('.jxl')) {
    execFileSync('djxl', [file, png, '--quiet']);
  } else if (file.endsWith('.svg')) {
    const chrome = process.env.CHROME;
    if (!chrome) {
      throw new Error('los SVG necesitan CHROME con la ruta de Chrome');
    }
    // El SVG se dibuja dentro de un <img> del tamaño del original. Chrome a
    // veces sale con error al cerrar aunque ya escribió la captura; vale si
    // el archivo existe.
    const page = join(work, 'svg.html');
    writeFileSync(
      page,
      `<style>html,body{margin:0}img{display:block;width:${size.width}px;height:${size.height}px}</style><img src="file://${file}">`,
    );
    const window = `--window-size=${size.width},${size.height}`;
    try {
      execFileSync(chrome, ['--headless=new', '--hide-scrollbars', `--screenshot=${png}`, window, `file://${page}`], { stdio: 'ignore' });
    } catch (error) {
      if (!existsSync(png)) {
        throw error;
      }
    }
  } else {
    execFileSync('cp', [file, png]);
  }
  const probe = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', png];
  const [width, height] = execFileSync('ffprobe', probe, { encoding: 'utf8' }).trim().split(',').map(Number);
  if (width !== size.width || height !== size.height) {
    throw new Error(`${file} mide ${width} × ${height}, no ${size.width} × ${size.height} (backgrounds.ts)`);
  }
}

const kb = (path) => `${(statSync(path).size / 1024).toFixed(1)} KB`;

const work = mkdtempSync(join(tmpdir(), 'admin-fondos-'));
try {
  for (const id of ids) {
    const info = BACKGROUND_INFO[id];
    for (const variant of BACKGROUND_VARIANTS) {
      const file = join(sources[info.source], info.files[variant]);
      if (!existsSync(file)) {
        throw new Error(`no existe ${file}`);
      }
      const png = join(work, `${id}-${variant}.png`);
      decode(file, png, info.size, work);
      for (const orientation of BACKGROUND_ORIENTATIONS) {
        const avifWidths = backgroundWidths(id, orientation, 'avif');
        const webpWidths = backgroundWidths(id, orientation, 'webp');
        for (const width of [...new Set([...avifWidths, ...webpWidths])]) {
          const height = backgroundHeight(orientation, width);
          const cropped = join(work, `${id}-${variant}-${orientation}-${width}.png`);
          execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', cropFilter(width, height), '-pix_fmt', 'rgb24', cropped]);
          const sizes = [];
          if (avifWidths.includes(width)) {
            const avif = join(PUBLIC, backgroundPath(id, variant, orientation, width, 'avif'));
            execFileSync('avifenc', ['-q', avifQuality(width), ...AVIF_ARGS, cropped, avif], { stdio: 'ignore' });
            sizes.push(`avif ${kb(avif)}`);
          }
          if (webpWidths.includes(width)) {
            const webp = join(PUBLIC, backgroundPath(id, variant, orientation, width, 'webp'));
            execFileSync('cwebp', ['-quiet', ...WEBP_ARGS, cropped, '-o', webp]);
            sizes.push(`webp ${kb(webp)}`);
          }
          console.log(`${id}-${variant}-${orientation}-${width} (${width} × ${height}): ${sizes.join(', ')}`);
          rmSync(cropped);
        }
      }
      const thumb = join(PUBLIC, thumbnailPath(id, variant));
      if (process.env.THUMBNAILS === '1' || !existsSync(thumb)) {
        // Miniatura: el mismo recorte centrado, con la proporción del selector.
        const { width, height } = THUMBNAIL_SIZE;
        const small = join(work, `${id}-${variant}-thumb.png`);
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', cropFilter(width, height), small]);
        execFileSync('cwebp', ['-quiet', ...THUMBNAIL_ARGS, small, '-o', thumb]);
        console.log(`${thumb}: ${kb(thumb)}`);
        if (statSync(thumb).size > MAX_THUMBNAIL_BYTES) {
          throw new Error(`${thumb} pasa de ${MAX_THUMBNAIL_BYTES / 1024} KB`);
        }
      }
      rmSync(png);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
