# ADR-002: Arquitectura Hexagonal y Autenticación JWT en Go (Gin)
* Estado: Aprobado
* Fecha: 2026-10-30
* Autor: Tech Lead / [Tu Nombre]

## Contexto
El backend debe garantizar una separación limpia de responsabilidades (Clean / Hexagonal Architecture) que permita desacoplar la lógica de negocio y la orquestación de agentes de IA de los frameworks HTTP y drivers de persistencia.

## Decisión
1. **Estructura Hexagonal**
   * `domain`: Entidades puras, DTOs e interfaces de repositorios.
   * `service`: Lógica de negocio (Use Cases) e integración de LLMs.
   * `repository`: Implementación concreta del driver de MongoDB (`go.mongodb.org/mongo-driver`).
   * `handler`: Controladores Gin HTTP para serialización/deserialización JSON.

2. **Autenticación**
   * Hashing de contraseñas con `bcrypt` (`golang.org/x/crypto/bcrypt`) y emisión/validación de tokens **JWT** (`golang-jwt/jwt/v5`) mediante Middleware en Gin.

## Consecuencias
* **Positivas**
  * Facilidad para generar mocks en pruebas unitarias y flexibilidad para cambiar de base de datos sin afectar la lógica de negocio.