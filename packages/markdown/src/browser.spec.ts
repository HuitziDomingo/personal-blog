// @vitest-environment jsdom
import { renderMarkdown } from './index.ts';
import { describeSanitization } from './test/sanitization-suite.ts';

// El DOM global de jsdom hace de navegador, como en los tests de apps/admin.
describeSanitization('navegador', renderMarkdown, (html) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
});
