import { cvFileProblem, formatSize } from './cv-file';

describe('cvFileProblem', () => {
  const file = (size: number, name = 'cv.pdf', type = 'application/pdf') => new File([new Uint8Array(size)], name, { type });

  it('acepta un PDF de hasta 2 MB exactos', () => {
    expect(cvFileProblem(file(2 * 1024 * 1024))).toBeNull();
  });

  it('rechaza otro tipo aunque el nombre diga .pdf', () => {
    expect(cvFileProblem(file(10, 'cv.pdf', 'text/html'))).toBe('El archivo debe ser un PDF.');
  });
});

describe('formatSize', () => {
  it.each([
    [10, '1 KB'],
    [150 * 1024, '150 KB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
  ])('%d bytes son %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});
