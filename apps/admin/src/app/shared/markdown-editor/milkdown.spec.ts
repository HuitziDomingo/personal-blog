import { renderMarkdown } from '@personal-blog/markdown';

import { createMilkdown, type MilkdownHandle } from './milkdown';
import { paste, installMissingBrowserApis } from './milkdown-test-support';

/**
 * Ida y vuelta del Markdown por Milkdown real (ADR-018, punto 2). Milkdown
 * reescribe la forma (`*` en las listas, `***` en los separadores, salto de
 * línea final, tablas alineadas), así que «sin pérdidas» se comprueba con dos
 * propiedades:
 * 1. Lo que se publica no cambia: `renderMarkdown`, el mismo de la web, da el
 *    mismo HTML para lo que entró y para lo que sale del editor (salvo los
 *    espacios al final del HTML, que no se ven: tras un bloque de HTML
 *    embebido, el salto de línea final de Milkdown llega a la salida).
 * 2. Guardar y volver a abrir no cambia nada más: lo que el editor escribió,
 *    abierto en un editor nuevo (como al recuperarlo de la API), sale idéntico.
 */
const CORPUS: Record<string, string> = {
  'títulos y párrafos': '# Título\n\n## Subtítulo\n\nPárrafo con acentos, eñes y emoji 🚀.\n\nTítulo setext\n=============',
  'énfasis y código en línea': 'Con **negritas**, *cursivas*, _cursivas_, __negritas__, ~~tachado~~ y `código`.',
  'código con backticks': 'usa `` a`b `` y\n\n````md\n```go\nfunc main() {}\n```\n````',
  'bloque de código con lenguaje': '```go\npackage main\n\nfunc main() {\n\tprintln("hola")\n}\n```',
  listas: '- uno\n- dos\n  - anidado\n\n1. a\n2. b\n\n3. empieza en tres\n4. cuatro\n\n* a\n\n* suelta',
  'lista con párrafo y código': '1. uno\n   - a\n   - b\n2. dos\n\n   párrafo dentro\n\n   ```js\n   x\n   ```',
  links: '[inline](https://huitzi.xyz "título") y [con paréntesis](https://es.wikipedia.org/wiki/Go_(lenguaje)) y [ref][1] y https://go.dev/doc y <https://go.dev>\n\n[1]: https://huitzi.xyz/blog',
  imágenes: '![alt](https://huitzi.xyz/a.png "título")\n\n![](https://huitzi.xyz/b.png)',
  tablas: '| izq | centro | der |\n| :-- | :-: | --: |\n| 1 | **2** | `3` |\n| x \\| y | `c\\|d` | |',
  'citas y separadores': '> cita\n> larga\n>\n> - con lista\n\n---\n\n***',
  'saltos de línea duros': 'línea con dos espacios  \notra con barra\\\nfin',
  'entidades y caracteres especiales': 'a &lt; b &amp; c &copy; 1 < 2 > 0, precio 5 * 3, snake_case_name, C:\\\\ruta',
  'HTML embebido': 'antes <b>x</b> después\n\n<div>bloque</div>\n\n<img src="x" onerror="alert(1)">',
  'links peligrosos': '[x](javascript:alert(1)) y ![y](data:image/png;base64,AAAA)',
  'sintaxis de fórmulas, que no se interpreta': 'precio $5 y $x$ en línea\n\n$$\nx^2\n$$',
  'texto literal escapado': '\\# no título\n\n\\- no lista\n\n1\\. no lista\n\n\\*no énfasis\\* \\[no link\\](https://x.y) \\`no código\\` \\<b>no html\\</b>\n\n\\> no cita',
  'post completo':
    '# Orquestación de agentes\n\nIntro con **negritas** y `código`.\n\n## Pasos\n\n1. Planear\n2. Ejecutar\n   - con subagentes\n\n```ts\nconst agent = await spawn({ model: "x" });\n```\n\n> Nota: revisar.\n\n| agente | rol |\n| --- | :-: |\n| a | plan |\n\n![diagrama](https://huitzi.xyz/d.png)\n\nFin.\n',
};

// Markdown que en jsdom se tecleó como texto y que tiene que salir escapado: si
// no, al volver a abrirlo se convertiría en formato o en HTML.
const LITERALS = ['<b>x</b>', '# no título', '- no lista', '*no énfasis*', '[no link](https://x.y)', '`no código`', '<script>alert(1)</script>'];

describe('createMilkdown', () => {
  beforeAll(installMissingBrowserApis);

  const opened: MilkdownHandle[] = [];
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((editor) => editor.destroy()));
    document.body.replaceChildren();
  });

  async function open(markdown: string, onChange: (markdown: string) => void = () => undefined, readonly = false) {
    const root = document.createElement('div');
    document.body.append(root);
    const editor = await createMilkdown({ root, markdown, readonly, onChange });
    opened.push(editor);
    return editor;
  }

  const publish = (markdown: string) => renderMarkdown(markdown).trimEnd();

  /** Abre el Markdown y devuelve lo que el editor guardaría. */
  async function roundTrip(markdown: string): Promise<string> {
    return (await open(markdown)).getMarkdown();
  }

  describe('ida y vuelta sin pérdidas', () => {
    it.each(Object.entries(CORPUS))('%s: se publica igual', async (_, markdown) => {
      expect(publish(await roundTrip(markdown))).toBe(publish(markdown));
    });

    it.each(Object.entries(CORPUS))('%s: guardar y volver a abrir no cambia nada', async (_, markdown) => {
      const saved = await roundTrip(markdown);

      expect(await roundTrip(saved)).toBe(saved);
    });

    it('conserva el lenguaje de los bloques de código y la alineación de las tablas', async () => {
      const saved = await roundTrip(CORPUS['bloque de código con lenguaje'] + '\n\n' + CORPUS['tablas']);

      expect(saved).toContain('```go\n');
      expect(saved).toMatch(/\| :-+ \| :-+: \| -+: \|/);
    });

    it('el contenido vacío sigue vacío', async () => {
      expect(await roundTrip('')).toBe('');
    });

    it.each(LITERALS)('el texto literal %j se guarda escapado', async (literal) => {
      const editor = await open('');
      // Pegado como texto (no como Markdown): es lo que queda al teclearlo.
      editor.setMarkdown(literal.replace(/[\\`*_[\]#<>-]/g, '\\$&'));
      const saved = editor.getMarkdown();

      const published = document.createElement('div');
      published.innerHTML = renderMarkdown(saved);
      expect(published.textContent.trim()).toBe(literal);
      expect(await roundTrip(saved)).toBe(saved);
    });

    // Diferencia conocida con GFM, documentada en el PR: con Markdown mal
    // formado escrito a mano, Milkdown conserva las celdas que sobran en una
    // fila y agrega una columna al encabezado; marked las descarta. Desde el
    // editor no se puede crear una tabla así.
    it('una fila con más celdas que el encabezado gana columnas', async () => {
      const saved = await roundTrip('| a | b |\n| - | - |\n| 1 | 2 | 3 |');

      expect(saved).toBe('| a | b |   |\n| - | - | - |\n| 1 | 2 | 3 |\n');
    });
  });

  describe('avisos de cambio', () => {
    // Más que el debounce de Milkdown (200 ms).
    const afterDebounce = () => new Promise((resolve) => setTimeout(resolve, 300));

    it('no avisa al abrirse ni al recibir un valor de fuera', async () => {
      const onChange = vi.fn();
      const editor = await open('# Hola', onChange);

      editor.setMarkdown('# Otro\n\ncontenido');
      editor.flush();
      await afterDebounce();

      expect(onChange).not.toHaveBeenCalled();
      expect(editor.getMarkdown()).toBe('# Otro\n\ncontenido\n');
    });

    it('avisa con el debounce de Milkdown, una vez por ráfaga de cambios', async () => {
      const onChange = vi.fn();
      const editor = await open('', onChange);

      paste(editor.dom, { text: '# Hola' });
      paste(editor.dom, { text: ', mundo' });
      expect(onChange).not.toHaveBeenCalled();

      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('# Hola, mundo\n'));
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('flush avisa ya el cambio pendiente, y el debounce no lo repite', async () => {
      const onChange = vi.fn();
      const editor = await open('', onChange);

      paste(editor.dom, { text: '# Hola' });
      editor.flush();
      expect(onChange).toHaveBeenCalledExactlyOnceWith('# Hola\n');

      await afterDebounce();
      editor.flush();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('en solo lectura no acepta cambios', async () => {
      const onChange = vi.fn();
      const editor = await open('# Hola', onChange, true);

      paste(editor.dom, { text: 'más' });

      expect(editor.dom.getAttribute('contenteditable')).toBe('false');
      expect(onChange).not.toHaveBeenCalled();
      expect(editor.getMarkdown()).toBe('# Hola\n');
    });

    it('ignora las imágenes pegadas como archivo: no hay subida y una URL blob: no se publica', async () => {
      // jsdom no tiene createObjectURL. Con él, el uploader de CrepeBuilder
      // insertaría la imagen: el test falla si el nuestro no lo reemplaza.
      const createObjectURL = vi.fn(() => 'blob:http://localhost/foto');
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
      onTestFinished(() => {
        Reflect.deleteProperty(URL, 'createObjectURL');
      });
      const onChange = vi.fn();
      const editor = await open('texto', onChange);

      paste(editor.dom, { files: [new File(['x'], 'foto.png', { type: 'image/png' })] });
      // La subida es asíncrona: se espera a que termine.
      await new Promise((resolve) => setTimeout(resolve));

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(editor.getMarkdown()).toBe('texto\n');
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
