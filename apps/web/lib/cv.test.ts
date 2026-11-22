import { describe, expect, it, vi } from "vitest";

import { ApiUnavailableError } from "./api";
import { cvPdfUrl, loadCvPdfs } from "./cv";

const file = (url: string) => ({
  url,
  size: 1000,
  uploadedAt: "2026-11-19T18:00:00Z",
});

describe("cvPdfUrl", () => {
  it("devuelve la URL del idioma, o null si no hay PDF vigente", () => {
    const pdfs = {
      es: file("https://storage.googleapis.com/bucket/cv/es/a.pdf"),
    };

    expect(cvPdfUrl(pdfs, "es")).toBe(
      "https://storage.googleapis.com/bucket/cv/es/a.pdf"
    );
    expect(cvPdfUrl(pdfs, "en")).toBeNull();
    expect(cvPdfUrl({}, "es")).toBeNull();
  });

  it("solo acepta http y https", () => {
    expect(cvPdfUrl({ es: file("javascript:alert(1)") }, "es")).toBeNull();
    expect(
      cvPdfUrl({ es: file("data:application/pdf;base64,AAAA") }, "es")
    ).toBeNull();
    expect(cvPdfUrl({ es: file("no es una url") }, "es")).toBeNull();
    expect(
      cvPdfUrl({ es: file("http://localhost:8080/media/cv/es/a.pdf") }, "es")
    ).toBe("http://localhost:8080/media/cv/es/a.pdf");
  });
});

describe("loadCvPdfs", () => {
  it("si la API no responde, no hay PDF y la página sigue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      loadCvPdfs(() =>
        Promise.reject(new ApiUnavailableError(503, "GET /api/v1/cv: 503"))
      )
    ).resolves.toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("devuelve lo que respondió la API", async () => {
    const pdfs = { en: file("https://files.example/cv/en/b.pdf") };

    await expect(loadCvPdfs(() => Promise.resolve(pdfs))).resolves.toBe(pdfs);
  });
});
