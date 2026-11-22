import { ChakraProvider } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/lib/content/en";
import { es } from "@/lib/content/es";

import { system } from "../theme/system";
import { CvView } from "./cv-view";

function html(node: ReactNode): string {
  return renderToStaticMarkup(
    <ChakraProvider value={system}>{node}</ChakraProvider>
  );
}

const PDF =
  "https://storage.googleapis.com/bucket/cv/es/0123456789abcdef01234567.pdf";

describe("CvView (ADR-028)", () => {
  it("muestra el botón de descarga solo si hay un PDF vigente", () => {
    const withPdf = html(<CvView content={es} pdfUrl={PDF} />);
    expect(withPdf).toContain(`href="${PDF}"`);
    expect(withPdf).toContain(
      'aria-label="Descargar PDF (CV en español, archivo PDF)"'
    );
    expect(withPdf).toContain(">Descargar PDF</a>");

    const without = html(<CvView content={es} pdfUrl={null} />);
    expect(without).not.toContain("Descargar PDF");
    expect(without).not.toContain('.pdf"');
  });

  it("pinta el CV en inglés con sus encabezados y sin teléfono", () => {
    const out = html(
      <CvView content={en} pdfUrl={PDF.replace("/es/", "/en/")} />
    );

    expect(out).toContain("Download PDF");
    for (const heading of [
      "Summary",
      "Experience",
      "Featured project",
      "Stack",
      "AI-assisted engineering",
      "Education",
      "In progress",
      "Languages",
      "Contact",
    ]) {
      expect(out).toContain(`>${heading}</h2>`);
    }
    expect(out).toContain(
      "Interim Tech Lead &amp; Senior Developer — Angular / Node.js"
    );
    expect(out).toContain(
      'href="https://www.linkedin.com/in/huitzitzili-domingo-le%C3%B3n-nieves-0b32a953/"'
    );
    expect(out).toContain('href="mailto:huitzitzilidomingo@gmail.com"');
    expect(out).toContain('href="https://github.com/HuitziDomingo"');
    expect(out).not.toMatch(/tel:/);
  });

  it("tiene un solo h1, con el nombre", () => {
    const out = html(<CvView content={es} pdfUrl={null} />);

    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toMatch(/<h1[^>]*>Huitzitzili Domingo León Nieves<\/h1>/);
  });
});
