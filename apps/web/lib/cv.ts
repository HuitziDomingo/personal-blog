import { type CurrentCVs, postsApi } from "./api";
import type { Locale } from "./content/types";

/**
 * URL del PDF vigente de un idioma, o null si no hay uno (ADR-028, punto 3).
 * Solo acepta http y https: la URL viene de la API y termina en un `href`.
 */
export function cvPdfUrl(pdfs: CurrentCVs, locale: Locale): string | null {
  const url = pdfs[locale]?.url;
  if (!url) {
    return null;
  }

  try {
    const { protocol } = new URL(url);

    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Los PDF vigentes, o ninguno si la API no responde: la página del CV es HTML
 * y se muestra igual, solo sin el botón de descarga (ADR-028, punto 3).
 */
export async function loadCvPdfs(
  load: () => Promise<CurrentCVs> = () => postsApi.currentCvPdfs()
): Promise<CurrentCVs> {
  try {
    return await load();
  } catch (error) {
    console.warn("cv: could not load the current PDFs", error);

    return {};
  }
}
