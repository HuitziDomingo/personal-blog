#!/usr/bin/env node
/**
 * Arma el modelo de la isla del hero (BLOG-107) a partir del GLB compuesto en
 * la investigación de BLOG-107 (Quaternius, CC0).
 *
 * Uso: node scripts/build-island-model.mjs <isla-3-bosque-fantasia-quaternius.glb>
 *
 * 1. Deja solo la animación Idle del Mushroom King (el GLB trae 14).
 * 2. Con glTF Transform (CLI, versión exacta, sin instalarlo en el repo):
 *    prune, dedup y resample, que no agregan extensiones ni decoders.
 * 3. Lo escribe como .gltf con el .bin y las texturas en archivos aparte, en
 *    apps/web/public/models/isla/. Un GLB con texturas embebidas haría que GLTFLoader
 *    las cargue desde URLs blob:, que la CSP de ADR-017 no permite.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1';
const KEEP_ANIMATION = 'CharacterArmature|Idle';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'models', 'isla');
const OUT_FILE = 'isla.gltf';

const input = process.argv[2];
if (!input) {
  console.error('Uso: node scripts/build-island-model.mjs <isla-3-bosque-fantasia-quaternius.glb>');
  process.exit(1);
}

/** Lee un GLB: cabecera de 12 bytes, chunk JSON y chunk BIN. */
function readGlb(file) {
  const data = readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file} no es un GLB`);
  }
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength;
  const binLength = data.readUInt32LE(binStart);
  return { json, bin: data.subarray(binStart + 8, binStart + 8 + binLength) };
}

/** Escribe un GLB; cada chunk se rellena hasta múltiplo de 4 (JSON con espacios, BIN con ceros). */
function writeGlb(file, json, bin) {
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length, type) => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(length, 0);
    buffer.writeUInt32LE(type, 4);
    return buffer;
  };
  writeFileSync(
    file,
    Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]),
  );
}

function gltfTransform(...args) {
  execFileSync('pnpm', ['dlx', GLTF_TRANSFORM, ...args], { stdio: 'inherit' });
}

const work = mkdtempSync(join(tmpdir(), 'isla-'));
try {
  const { json, bin } = readGlb(input);
  const kept = (json.animations ?? []).filter((animation) => animation.name === KEEP_ANIMATION);
  if (kept.length !== 1) {
    throw new Error(`No se encontró la animación ${KEEP_ANIMATION}`);
  }
  json.animations = kept;
  // Las dos texturas se llaman Atlas.png: con nombres distintos, no chocan al escribirlas aparte.
  json.images?.forEach((image, index) => {
    image.name = `atlas-${String(index)}`;
  });
  writeGlb(join(work, 'idle.glb'), json, bin);

  gltfTransform('prune', join(work, 'idle.glb'), join(work, 'pruned.glb'));
  gltfTransform('dedup', join(work, 'pruned.glb'), join(work, 'dedup.glb'));
  gltfTransform('resample', join(work, 'dedup.glb'), join(work, 'resampled.glb'));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  gltfTransform('copy', join(work, 'resampled.glb'), join(OUT_DIR, OUT_FILE));
  gltfTransform('validate', join(OUT_DIR, OUT_FILE));
} finally {
  rmSync(work, { recursive: true, force: true });
}
