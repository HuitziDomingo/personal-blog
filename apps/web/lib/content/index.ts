import { en } from './en';
import { es } from './es';
import type { Locale, SiteContent } from './types';

export { LOCALES, WORK_IDS } from './types';
export type { BioEntry, Locale, SiteContent, WorkId, WorkText } from './types';
export { alternateHref, localeOf, localePrefix, localizedPath } from './routes';

const CONTENT: Readonly<Record<Locale, SiteContent>> = { es, en };

export function content(locale: Locale): SiteContent {
  return CONTENT[locale];
}
