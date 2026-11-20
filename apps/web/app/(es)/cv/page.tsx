import { cvMetadata, CvView } from "@/components/portfolio/cv-view";
import { es } from "@/lib/content/es";
import { cvPdfUrl, loadCvPdfs } from "@/lib/cv";

// ISR (ADR-017 y ADR-028, punto 8): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

export const metadata = cvMetadata(es);

export default async function CvPage() {
  return <CvView content={es} pdfUrl={cvPdfUrl(await loadCvPdfs(), "es")} />;
}
