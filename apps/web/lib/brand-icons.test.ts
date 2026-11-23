import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

// Íconos de la marca (BLOG-158): los genera `node scripts/build-icons.mjs`
// desde assets/img/leon.svg.
const web = (path: string) => join(__dirname, '..', path);
const admin = (path: string) => join(__dirname, '..', '..', 'admin', path);

/** Tamaños y formato de las imágenes de un ICO. */
function icoEntries(ico: Buffer) {
  expect(ico.readUInt16LE(2)).toBe(1);
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const at = 6 + 16 * i;
    const offset = ico.readUInt32LE(at + 12);
    const png = ico.subarray(offset, offset + ico.readUInt32LE(at + 8));
    return { size: ico[at] ?? -1, png: png.subarray(1, 4).toString('ascii') === 'PNG', width: png.readUInt32BE(16) };
  });
}

describe('íconos de la marca (BLOG-158)', () => {
  it('icon.svg es el león tal cual', () => {
    expect(readFileSync(web('app/icon.svg'), 'utf8')).toBe(readFileSync(web('assets/img/leon.svg'), 'utf8'));
  });

  it('favicon.ico trae el león en 16 y 32 px, y el admin usa el mismo', () => {
    const ico = readFileSync(web('app/favicon.ico'));
    expect(icoEntries(ico)).toEqual([
      { size: 16, png: true, width: 16 },
      { size: 32, png: true, width: 32 },
    ]);
    expect(readFileSync(admin('public/favicon.ico')).equals(ico)).toBe(true);
  });

  it('apple-icon.png es de 180 × 180, opaco, sobre #f0e7db', () => {
    const png = readFileSync(web('app/apple-icon.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
    // Tipo de color 2: RGB sin canal alfa (iOS pinta de negro la transparencia).
    expect(png[25]).toBe(2);
    const idat: Buffer[] = [];
    for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
      if (png.toString('ascii', at + 4, at + 8) === 'IDAT') {
        idat.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)));
      }
    }
    const raw = inflateSync(Buffer.concat(idat));
    // El primer píxel de la primera fila no depende del filtro.
    expect([...raw.subarray(1, 4)]).toEqual([0xf0, 0xe7, 0xdb]);
  });

  it('no quedan los íconos viejos', () => {
    expect(existsSync(web('app/icon.png'))).toBe(false);
    expect(existsSync(web('assets/img/logo.png'))).toBe(false);
  });
});
