// Genera public/img/aurora-grano.png (BLOG-156): un mosaico de 128 × 128 px de
// ruido binario (cada píxel blanco o negro, al azar), en PNG de 1 bit por
// píxel. La web lo pinta encima de la aurora con una opacidad de ~1 % para
// romper las bandas de los degradados. Va en un archivo y no inline: el CSS
// global de Chakra viaja en cada HTML. La semilla es fija: el archivo no
// cambia si se vuelve a generar.
//
// Uso: node scripts/build-grain.ts (Node 24 quita los tipos al vuelo)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 128;
const OUT = fileURLToPath(new URL('../public/img/aurora-grano.png', import.meta.url));

// mulberry32: PRNG de 32 bits, determinista.
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function grainPng(size = SIZE, seed = 156): Buffer {
  const next = random(seed);
  const rowBytes = Math.ceil(size / 8);
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      const i = row + 1 + (x >> 3);
      if (next() < 0.5) raw[i] = (raw[i] ?? 0) | (0x80 >> (x & 7));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 1; // 1 bit por píxel
  ihdr[9] = 0; // escala de grises
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const png = grainPng();
  writeFileSync(OUT, png);
  console.log(`aurora-grano.png: ${String(png.length)} bytes`);
}
