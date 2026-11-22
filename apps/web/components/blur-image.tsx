'use client';

import Image, { getImageProps, type ImageProps } from 'next/image';
import { useCallback, type CSSProperties } from 'react';

/** Propiedades de estilo del placeholder borroso que next/image pone en el <img>. */
const PLACEHOLDER_KEYS = ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat'] as const;

/**
 * El placeholder borroso de next/image (el SVG con el filtro de desenfoque
 * sobre la miniatura), separado del resto del estilo del <img>. Sin
 * miniatura (`blurDataURL` ausente en una imagen remota), un objeto vacío.
 */
export function blurPlaceholderStyle(props: ImageProps): CSSProperties {
  const isStatic = typeof props.src === 'object';
  if (!isStatic && !props.blurDataURL) {
    return {};
  }

  const { style } = getImageProps({ ...props, placeholder: 'blur' }).props;
  const out: CSSProperties = {};
  for (const key of PLACEHOLDER_KEYS) {
    const value = style[key];
    if (value !== undefined) {
      Object.assign(out, { [key]: value });
    }
  }

  return out;
}

/**
 * next/image con blur-up: la miniatura borrosa queda en el contenedor y la
 * imagen nítida aparece encima con un fundido corto (`.blur-up` en
 * theme/system.ts).
 *
 * - Sin JavaScript, o si la imagen ya cargó al hidratar (el caso del LCP, que
 *   va con `priority`), no se oculta nada: se ve el placeholder y luego la
 *   imagen, como con `placeholder="blur"` a secas.
 * - Solo si al hidratar la imagen sigue cargando se marca `data-blur-loading`
 *   (opacidad 0) y se quita al cargar, para que el CSS haga el fundido.
 * - Con prefers-reduced-motion: reduce, el CSS no oculta ni anima.
 */
export function BlurImage({ wrapperStyle, ...props }: ImageProps & { wrapperStyle?: CSSProperties }) {
  const placeholder = blurPlaceholderStyle(props);

  const ref = useCallback((img: HTMLImageElement | null) => {
    if (!img || img.complete) {
      return;
    }
    img.setAttribute('data-blur-loading', '');
    const done = () => {
      img.removeAttribute('data-blur-loading');
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  }, []);

  return (
    <span className="blur-up" style={{ ...placeholder, ...wrapperStyle }}>
      <Image {...props} ref={ref} placeholder="empty" />
    </span>
  );
}
