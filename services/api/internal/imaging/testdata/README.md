# Fixtures de imaging

WebP sintéticas para los tests, sin contenido de terceros:

- `cover-lossy.webp`: degradado ámbar a violeta de 1024 × 576, `cwebp -q 30`.
- `cover-lossless.webp`: color plano de 1024 × 576, `cwebp -lossless`.

Se generaron con `ffmpeg -f lavfi` (fuente `gradients` y `color`) a PNG y después con `cwebp`.
