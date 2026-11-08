# ADR-019: Servidor MCP como Adaptador de la Arquitectura Hexagonal
* Estado: Aprobado
* Fecha: 2026-11-07
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-002 y ADR-006 (arquitectura hexagonal)

## Contexto
El blog trata sobre orquestación de agentes de IA y va a incorporar funciones con agentes. El primer paso es exponer el contenido del blog a agentes con MCP (Model Context Protocol), sin conectar todavía ningún LLM. Hay que decidir dónde vive el código de MCP en el monorepo y cómo se relaciona con la API existente.

## Alternativas Consideradas
* Opción A (Seleccionada): MCP como otro adaptador de entrada de la arquitectura hexagonal: paquete `internal/mcp` en `services/api`, al mismo nivel que `internal/handler`, y un segundo binario `cmd/mcp`. Reutiliza `domain`, `service` y `repository` sin duplicar reglas de negocio.
* Opción B: Carpeta `MCP/` en la raíz del monorepo como servicio aparte. Descartada: tendría que duplicar el acceso a datos y las reglas de negocio, o llamar a la API por HTTP, sumando autenticación y latencia sin necesidad.
* Opción C: Endpoints MCP dentro del servidor HTTP de la API. Descartada por ahora: expone el protocolo a internet antes de tener autenticación y límites pensados para agentes.

## Decisión
1. `services/api/internal/mcp` implementa el servidor MCP con el SDK oficial `github.com/modelcontextprotocol/go-sdk` (versión estable con más de 7 días, ADR-013). Depende de los puertos de `service`, nunca de `handler`.
2. `services/api/cmd/mcp` es un binario aparte con transporte stdio, para uso local. No escucha en la red.
3. Primera versión de solo lectura: herramientas y recursos para listar posts publicados, leer un post por slug y buscar por texto o tag. Ninguna operación que cree, edite, publique o archive.
4. Los resultados devuelven el Markdown y metadatos, nunca datos de usuarios, hashes ni tokens.
5. Todo contenido que el servidor devuelve se considera dato y no instrucción para quien lo consuma; esto se documenta para los agentes que lo usen (prompt injection, ADR-010).
6. No se conecta a ningún cliente ni LLM en este ADR. Las operaciones de escritura, el transporte por HTTP y la autenticación de agentes requieren un ADR nuevo.

## Consecuencias
* **Positivas**: Las reglas de negocio viven en un solo lugar y las usan la API HTTP y el servidor MCP. Sin exposición a la red. Base real para los labs de orquestación de agentes.
* **Negativas**: Una dependencia nueva (el SDK) y un segundo binario que compilar y probar. stdio solo sirve para clientes en la misma máquina; un acceso remoto necesitará otro ADR.
