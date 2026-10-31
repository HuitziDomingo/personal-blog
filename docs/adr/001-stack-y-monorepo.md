# ADR-001: Estructura de Monorepo y Selección de Stack Tecnológico
* Estado: Aprobado
* Fecha: 2026-10-30
* Autor: Tech Lead / [Tu Nombre]

## Contexto y Problema
Se requiere desarrollar una plataforma de gestión de contenidos (CMS) e investigación agéntica para `huitzi.xyz`. Se busca una arquitectura desacoplada, escalable y mantenible dentro de un único repositorio (Monorepo) que facilite el contexto para herramientas de IA (Claude Code) y la alineación de contratos de datos.

## Decisión
Se aprueba la estructura de Monorepo (`personal-blog/`) dividida en:
* `apps/web`: Frontend público en **Next.js** (SSR/SSG, alojado en Vercel).
* `apps/admin`: Dashboard de administración en **Angular (última versión) + Spartan UI / Tailwind CSS**.
* `services/api`: Backend API en **Go (Gin)** para alto rendimiento y concurrencia.
* `docs/`: Documentación técnica, ADRs y contratos de API.
Base de datos: **MongoDB** (desarrollo local con Docker/Compass, producción en MongoDB Atlas M0).

## Consecuencias
* **Positivas**: Contexto unificado de código, sincronización sencilla de DTOs/interfaces y facilidades de orquestación de CI/CD.
* **Negativas**: Necesidad de mantener pipelines de despliegue y configuraciones de testing diferenciadas por proyecto.