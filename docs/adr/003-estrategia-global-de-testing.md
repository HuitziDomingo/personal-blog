# ADR-003: Estrategia de Testing (Unitario, Integración y E2E)
* Estado: Aprobado — parcialmente reemplazado por ADR-006
* Fecha: 2026-10-30
* Autor: León Nieves Huitzitzili Domingo

## Decisión
Se establece la cobertura de pruebas requerida:
1. **Backend (Go)**: Pruebas unitarias de handlers y services con `testify` y mocks (`mockery`). Pruebas de integración de repositorios con MongoDB local/contenedor.
2. **Frontend (Angular & Next.js)**: Pruebas unitarias de servicios, componentes y pipes utilizando `Vitest` / `Testing Library`.
3. **E2E (End-to-End)**: Suite unificada con **Playwright** que valide el flujo crítico (Auth -> Creación de Post -> Moderación -> Publicación).