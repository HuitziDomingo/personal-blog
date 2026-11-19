import { describe, expect, it } from "vitest";

import { works } from "../site";

import { en } from "./en";
import { es } from "./es";
import { alternateHref, localeOf, localizedPath } from "./routes";
import { WORK_IDS } from "./types";

/** Todas las hojas de texto de un objeto, con su ruta (`ui.nav.works`). */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") {
    return [[path, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      leaves(item, `${path}[${String(index)}]`)
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, path ? `${path}.${key}` : key)
    );
  }

  return [];
}

describe("diccionarios", () => {
  it("tienen las mismas claves en español y en inglés", () => {
    expect(leaves(en).map(([path]) => path)).toEqual(
      leaves(es).map(([path]) => path)
    );
  });

  it("no dejan ningún texto vacío, salvo el aviso de idioma del blog en español", () => {
    const empty = [...leaves(es), ...leaves(en)]
      .filter(([, text]) => text.trim() === "")
      .map(([path]) => path);
    expect(empty).toEqual(["ui.blogLanguageNote"]);
  });

  it("traen el texto de cada trabajo, con un alt por imagen", () => {
    expect(works.map((work) => work.id)).toEqual([...WORK_IDS]);
    for (const content of [es, en]) {
      for (const work of works) {
        const text = content.works[work.id];
        expect(text.imageAlts, `${content.locale}/${work.id}`).toHaveLength(
          work.images.length
        );
        expect(
          text.sections.length,
          `${content.locale}/${work.id}`
        ).toBeGreaterThanOrEqual(work.images.length);
      }
    }
  });

  it("ponen Santo Sazón primero, con sus tres secciones y su entrada de trayectoria en los dos idiomas", () => {
    const [first] = works;
    expect(first?.id).toBe("santo-sazon");
    expect(first?.year).toBe("2026");
    expect(first?.link.href).toBe("https://santosazon.mx");
    for (const content of [es, en]) {
      expect(
        content.works["santo-sazon"].sections,
        content.locale
      ).toHaveLength(3);
      expect(content.bio[0]?.period, content.locale).toBe("2026");
      expect(content.bio[0]?.title, content.locale).toContain("Santo Sazón");
    }
  });

  it("marcan con {debred} el link a Debred en los dos idiomas", () => {
    const marks = (content: typeof es) =>
      leaves(content)
        .filter(([, text]) => text.includes("{debred}"))
        .map(([path]) => path);
    expect(marks(en)).toEqual(marks(es));
    expect(marks(es)).toEqual(["about[1]", "bio[6].title"]);
  });

  it("describen la isla en los dos idiomas, sin crédito en la página (BLOG-120)", () => {
    for (const content of [es, en]) {
      const island: Record<string, string> = content.ui.home.island;
      expect(Object.keys(island).sort(), content.locale).toEqual([
        "alt",
        "instructions",
        "label",
        "loading",
      ]);
      for (const value of Object.values(island)) {
        expect(value, content.locale).not.toBe("");
      }
    }
  });

  it("describen la isla medieval en los dos idiomas (BLOG-129)", () => {
    expect(es.ui.home.island.alt).toMatch(/pueblo medieval/);
    expect(en.ui.home.island.alt).toMatch(/medieval village/);
    expect(es.ui.home.island.alt).not.toBe(en.ui.home.island.alt);
  });

  it("traducen el aviso de carga de la isla (BLOG-126)", () => {
    expect(es.ui.home.island.loading).toBe("Cargando isla 3D");
    expect(en.ui.home.island.loading).toBe("Loading 3D island");
  });

  it("declaran el idioma de la página y el del selector", () => {
    expect([es.htmlLang, es.ui.languageSwitch]).toEqual([
      "es",
      { label: "English", hrefLang: "en", lang: "en" },
    ]);
    expect([en.htmlLang, en.ui.languageSwitch]).toEqual([
      "en",
      { label: "Español", hrefLang: "es", lang: "es" },
    ]);
  });
});

/**
 * Textos del CV que son iguales en los dos idiomas: cargos que el CV deja en
 * inglés, empresas, años, nombres de tecnologías y certificaciones.
 */
const cvSamePaths = [
  "cv.experience[0].role",
  "cv.experience[0].company",
  "cv.experience[1].role",
  "cv.experience[1].company",
  "cv.experience[1].period",
  "cv.experience[2].role",
  "cv.experience[2].company",
  "cv.experience[2].period",
  "cv.stack[0].area",
  "cv.stack[0].items",
  "cv.stack[1].area",
  "cv.stack[1].items",
  "cv.stack[2].items",
  "cv.inProgress[0]",
  "cv.inProgress[1]",
  "cv.inProgress[2]",
  "ui.cv.headings.stack",
];

describe("CV (ADR-028)", () => {
  it("no publica teléfonos ni emails", () => {
    for (const content of [es, en]) {
      const text = leaves(content.cv)
        .map(([, value]) => value)
        .join("\n");
      expect(text, content.locale).not.toMatch(/\+?\d[\d\s().-]{8,}\d/);
      expect(text, content.locale).not.toMatch(/@/);
    }
  });

  it("tiene la misma forma en los dos idiomas", () => {
    expect(es.cv.experience.map((job) => job.points.length)).toEqual(
      en.cv.experience.map((job) => job.points.length)
    );
    expect(es.cv.project.points).toHaveLength(en.cv.project.points.length);
    expect(es.cv.stack).toHaveLength(en.cv.stack.length);
  });

  it("coincide con la trayectoria del portafolio: el cargo y las fechas de TCS", () => {
    for (const content of [es, en]) {
      const [tcs] = content.cv.experience;
      const bio = content.bio.find((entry) =>
        entry.title.includes("Tata Consultancy Services")
      );
      expect(bio?.title, content.locale).toContain(
        "Interim Tech Lead & Senior Developer"
      );
      expect(tcs?.role, content.locale).toMatch(
        /^Interim Tech Lead & Senior Developer/
      );
      expect(tcs?.period, content.locale).toBe(bio?.period);
    }
  });

  it("usa el texto en inglés que aprobó León, tal cual", () => {
    expect(en.cv.headline).toBe(
      "Tech Lead · Senior Full-Stack Developer — Angular · React · Node.js · NestJS · Google Cloud"
    );
    expect(
      en.cv.summary.startsWith(
        "Full-Stack Developer with 5+ years of commercial experience"
      )
    ).toBe(true);
    expect(en.cv.languages).toEqual(["Spanish — Native", "English — B2"]);
  });
});

describe("traducciones", () => {
  // Los textos que coinciden a propósito en los dos idiomas: nombres propios,
  // años y palabras que el inglés usa igual. Cualquier otro texto en inglés
  // idéntico al español es una traducción que falta.
  it("el inglés solo repite el español donde es el mismo texto", () => {
    const spanish = new Map(leaves(es));
    const same = leaves(en)
      .filter(([path, text]) => text !== "" && spanish.get(path) === text)
      .map(([path]) => path);
    expect([...same].sort()).toEqual(
      [
        "profile.authorBadge",
        "profile.authorRole",
        "bio[0].period",
        "bio[3].period",
        "bio[4].period",
        "bio[5].period",
        "ui.nav.blog",
        "ui.works.website",
      ]
        .concat(cvSamePaths)
        .sort()
    );
  });
});

describe("rutas por idioma", () => {
  it("pone el inglés bajo /en y deja el español en la raíz", () => {
    expect(localizedPath("es", "/works")).toBe("/works");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(localizedPath("en", "/works/debred")).toBe("/en/works/debred");
  });

  it("reconoce el idioma de una ruta", () => {
    expect(["/", "/blog", "/works", "/english"].map(localeOf)).toEqual([
      "es",
      "es",
      "es",
      "es",
    ]);
    expect(["/en", "/en/works", "/en/works/aum"].map(localeOf)).toEqual([
      "en",
      "en",
      "en",
    ]);
  });

  it("lleva el selector a la página equivalente del otro idioma", () => {
    expect(alternateHref("/", "es")).toBe("/en");
    expect(alternateHref("/works", "es")).toBe("/en/works");
    expect(alternateHref("/works/debred", "es")).toBe("/en/works/debred");
    expect(alternateHref("/en", "en")).toBe("/");
    expect(alternateHref("/en/works", "en")).toBe("/works");
    expect(alternateHref("/en/works/debred", "en")).toBe("/works/debred");
  });

  it("el CV es /cv en español y /en/resume en inglés (ADR-028)", () => {
    expect(localizedPath("es", "/cv")).toBe("/cv");
    expect(localizedPath("en", "/cv")).toBe("/en/resume");
    expect(alternateHref("/cv", "es")).toBe("/en/resume");
    expect(alternateHref("/en/resume", "en")).toBe("/cv");
    expect(localeOf("/en/resume")).toBe("en");
  });

  it("desde el blog, que solo existe en español, lleva al inicio en inglés", () => {
    expect(alternateHref("/blog", "es")).toBe("/en");
    expect(alternateHref("/blog/un-post", "es")).toBe("/en");
    expect(alternateHref("/blog/page/2", "es")).toBe("/en");
  });
});
