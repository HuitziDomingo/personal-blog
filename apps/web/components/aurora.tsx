import type { CSSProperties } from 'react';

import { AURORA_BLOBS, type AuroraBlob } from '@/lib/aurora';

function rgb(hex: string): string {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

function blobStyle(blob: AuroraBlob): CSSProperties {
  const size = `min(${String(blob.size)}vw, ${String(blob.maxSizeVh)}vh)`;
  const toCenter = blob.side === 'left' ? 1 : -1;

  return {
    width: size,
    height: size,
    top: `calc(${String(blob.top)}vh - ${size} / 2)`,
    [blob.side]: `calc(${String(blob.inset)}vw - ${size} / 2)`,
    animationDuration: `${String(blob.duration)}s`,
    // Variables que leen el gradiente (por modo) y la animación.
    '--aurora-rgb': rgb(blob.color),
    '--aurora-alpha-light': String(blob.alpha.light),
    '--aurora-alpha-dark': String(blob.alpha.dark),
    '--aurora-dx': `${String(toCenter * blob.drift)}vw`,
    '--aurora-dy': `${String(blob.rise)}vh`,
    '--aurora-scale': String(blob.scale),
  } as CSSProperties;
}

/**
 * Fondo «aurora» (BLOG-142), detrás de todo el contenido. Solo HTML y CSS,
 * sin JavaScript: los estilos y la animación están en `.aurora` de
 * theme/system.ts y los datos en lib/aurora.ts. Decorativo: oculto para los
 * lectores de pantalla.
 */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      {AURORA_BLOBS.map((blob) => (
        <span key={blob.name} style={blobStyle(blob)} />
      ))}
    </div>
  );
}
