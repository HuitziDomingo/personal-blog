// Fake del editor para los tests de las páginas que lo usan (ADR-015). Solo lo
// importan los .spec.ts, así que no llega al bundle.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Un textarea con la misma interfaz que MarkdownEditor. La página solo depende
 * de esa interfaz (ADR-012): con el fake, sus tests prueban el contrato con el
 * editor sin cargar Milkdown en jsdom. Milkdown se prueba en
 * markdown-editor.spec.ts, milkdown.spec.ts y en el E2E.
 */
@Component({
  selector: 'app-markdown-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [for]="inputId()">{{ label() }}</label>
    <textarea
      [id]="inputId()"
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null"
      [attr.aria-describedby]="describedBy() || null"
      (input)="valueChange.emit($any($event.target).value)"
      (blur)="touched.emit()"
    ></textarea>
  `,
})
export class FakeMarkdownEditor {
  readonly value = input('');
  readonly valueChange = output<string>();
  readonly touched = output<void>();
  readonly inputId = input('markdown-editor');
  readonly label = input('Contenido');
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly describedBy = input<string>();
}
