# ADR-015: Dobles de Prueba en Go: Fakes por Defecto
* Estado: Aprobado
* Fecha: 2026-11-05
* Autor: León Nieves Huitzitzili Domingo
* Reemplaza: ADR-003 (uso de `mockery` para los mocks de Go)

## Contexto
ADR-003 pide pruebas unitarias de handlers y services con `testify` y mocks generados con `mockery`. En la práctica, todos los tests de Go escritos hasta ahora usan fakes escritos a mano: el `Pinger` de `/ready`, el `UserRepository` del bootstrap del administrador y los repositorios de los services de autenticación. `mockery` nunca se configuró. Antes de los tests de los endpoints de posts (BLOG-056) hay que decidir un solo estilo, para no mezclar dos en el mismo repo.

## Alternativas Consideradas
* Opción A (Seleccionada): Fakes escritos a mano por defecto. Es lo idiomático en Go con interfaces pequeñas definidas en el consumidor, y no agrega herramientas ni código generado.
* Opción B: Mocks generados con `mockery`, como dice ADR-003. Descartada: suma una herramienta que fijar (ADR-013), un archivo de configuración, código generado versionado y su check de drift en CI. Además, sus expectativas por llamada (`EXPECT().Once()`) acoplan los tests a la implementación y no al comportamiento.
* Opción C: Mezclar ambos según el caso. Descartada: dos estilos para lo mismo hacen los tests más difíciles de leer y de revisar.

## Decisión
1. Los dobles de prueba de Go son fakes escritos a mano: implementaciones simples en memoria de cada puerto, con campos para simular errores.
2. Un fake vive en el paquete de test que lo usa. Si dos o más paquetes necesitan el mismo, se mueve a un paquete `internal/<capa>/fake` compartido.
3. Los tests verifican comportamiento (qué devuelve y qué estado deja), no la secuencia exacta de llamadas a las dependencias.
4. Se mantiene `testify` para las aserciones (ADR-003).
5. `mockery` solo se reconsidera con un ADR nuevo si aparece una interfaz grande (más de 8 métodos) que vuelva impráctico mantener su fake.

## Consecuencias
* **Positivas**: Un solo estilo de test en todo el repo, igual al que ya existe. Ninguna herramienta ni código generado extra. Los tests sobreviven a refactors internos que no cambian el comportamiento.
* **Negativas**: Cada fake se escribe y se mantiene a mano, y un método nuevo en un puerto obliga a actualizar sus fakes. Verificar que una dependencia se llamó (por ejemplo, que se revocó una familia de tokens) requiere que el fake registre las llamadas de forma explícita.
