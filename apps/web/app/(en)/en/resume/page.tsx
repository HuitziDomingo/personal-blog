import { cvMetadata, CvView } from "@/components/portfolio/cv-view";
import { en } from "@/lib/content/en";
import { cvPdfUrl, loadCvPdfs } from "@/lib/cv";

// ISR (ADR-017 y ADR-028, punto 8): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

export const metadata = cvMetadata(en);

export default async function EnglishResumePage() {
  return <CvView content={en} pdfUrl={cvPdfUrl(await loadCvPdfs(), "en")} />;
}
