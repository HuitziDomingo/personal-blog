'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { type ReactNode, useState } from 'react';

/**
 * Chakra v3 usa Emotion. Sin este registro, en el SSR del App Router Emotion
 * pinta cada <style> en línea junto al componente, y la hidratación falla
 * porque el cliente los inserta en <head>. Con `compat`, Emotion no los pinta
 * en línea: el registro junta los estilos de cada render y Next los inserta en
 * <head> con useServerInsertedHTML. Sin nonce: la CSP de ADR-017 permite
 * estilos inline.
 */
export function EmotionRegistry({ children }: { children: ReactNode }) {
  const [registry] = useState(() => {
    const cache = createCache({ key: 'css' });
    cache.compat = true;

    let inserted: string[] = [];
    const insert = cache.insert.bind(cache);
    cache.insert = (selector, serialized, sheet, shouldCache) => {
      // Solo en el servidor: en el cliente useServerInsertedHTML no vacía la
      // lista y crecería sin fin.
      if (typeof window === 'undefined' && cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return insert(selector, serialized, sheet, shouldCache);
    };

    const flush = (): string[] => {
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
    const styles = names
      .map((name) => registry.cache.inserted[name])
      .filter((css): css is string => typeof css === 'string')
      .join('');

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
