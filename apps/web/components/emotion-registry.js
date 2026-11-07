// @ts-check
'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { useState } from 'react';

/**
 * Chakra v3 usa Emotion. Sin este registro, en el SSR del App Router Emotion
 * pinta cada <style> en línea junto al componente, y la hidratación falla
 * porque el cliente los inserta en <head>. Con `compat`, Emotion no los pinta
 * en línea: el registro junta los estilos de cada render y Next los inserta en
 * <head> con useServerInsertedHTML.
 *
 * Es el punto donde una CSP con nonces tendría que poner el nonce a cada
 * <style> (pendiente para el ADR).
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function EmotionRegistry({ children }) {
  const [registry] = useState(() => {
    const cache = createCache({ key: 'css' });
    cache.compat = true;

    /** @type {string[]} */
    let inserted = [];
    const insert = cache.insert;
    /** @type {typeof cache.insert} */
    cache.insert = (selector, serialized, sheet, shouldCache) => {
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return insert(selector, serialized, sheet, shouldCache);
    };

    const flush = () => {
      const names = inserted;
      inserted = [];
      return names;
    };

    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = registry.flush();
    if (names.length === 0) {
      return null;
    }
    const styles = names.map((name) => registry.cache.inserted[name]).filter((css) => typeof css === 'string').join('');

    return (
      <style
        key={registry.cache.key}
        data-emotion={`${registry.cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={registry.cache}>{children}</CacheProvider>;
}
