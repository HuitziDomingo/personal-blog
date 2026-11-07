// @vitest-environment jsdom
import { renderMarkdown } from './index';
import { describeSanitization } from './test/sanitization-suite';

// El DOM global de jsdom hace de navegador, como en los tests de apps/admin.
describeSanitization('navegador', renderMarkdown, (html) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
});
