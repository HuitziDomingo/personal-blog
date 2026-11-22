import type { CSSProperties } from 'react';

import { AURORA_BLOBS, type AuroraBlob } from '@/lib/aurora';

function rgb(hex: string): string {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

function blobStyle(blob: AuroraBlob): CSSProperties {
  const size = `min(${String(blob.size)}vw, ${String(blob.maxSizeVh)}vh)`;
  const [below, above] = blob.tones;

  return {
    width: size,
    height: size,
    left: `calc(${String(blob.x)}vw - ${size} / 2)`,
    top: `calc(${String(blob.y)}vh - ${size} / 2)`,
    animationDuration: `${String(blob.duration)}s`,
    // Variables que leen los gradientes (por modo y ancho) y las animaciones.
    '--aurora-alpha-light': String(blob.alpha.light),
    '--aurora-alpha-dark': String(blob.alpha.dark),
    '--aurora-alpha-mobile-light': String(blob.alpha.mobileLight),
    '--aurora-alpha-mobile-dark': String(blob.alpha.mobileDark),
    '--aurora-below-light': rgb(below.light),
    '--aurora-below-dark': rgb(below.dark),
    '--aurora-above-light': rgb(above.light),
    '--aurora-above-dark': rgb(above.dark),
    '--aurora-tone-duration': `${String(blob.toneDuration)}s`,
    '--aurora-dx': `${String(blob.drift)}vw`,
    '--aurora-dy': `${String(blob.rise)}vh`,
    '--aurora-scale': String(blob.scale),
  } as CSSProperties;
}

/**
 * Fondo «aurora» (BLOG-142, BLOG-150), detrás de todo el contenido. Solo HTML
 * y CSS, sin JavaScript: los estilos y las animaciones están en `.aurora` de
 * theme/system.ts y los datos en lib/aurora.ts. Cada mancha lleva dos capas
 * de tono en fundido cruzado. Decorativo: oculto para los lectores de
 * pantalla.
 */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      {AURORA_BLOBS.map((blob) => (
        <span key={blob.name} style={blobStyle(blob)}>
          <i />
          <i />
        </span>
      ))}
    </div>
  );
}
