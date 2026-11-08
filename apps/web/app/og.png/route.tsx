import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { glassTeal, palette } from '@/lib/brand';
import { profile, siteDescription } from '@/lib/site';

// Se genera una vez en el build: no depende de la petición ni de la API.
export const dynamic = 'force-static';

/** Imagen Open Graph por defecto (1200 × 630), con el logo y el nombre. */
export async function GET(): Promise<ImageResponse> {
  const logo = await readFile(join(process.cwd(), 'assets/img/logo.png'));
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: palette.dark.bg,
          color: palette.dark.fg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <img src={logoSrc} width={120} height={120} alt="" />
          <div style={{ fontSize: 64, fontWeight: 800 }}>{profile.name}</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 36, color: glassTeal }}>{siteDescription}</div>
        <div style={{ marginTop: 24, fontSize: 28, color: palette.dark.muted }}>huitzi.xyz</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
