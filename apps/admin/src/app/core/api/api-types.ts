import type { components } from '@personal-blog/api-types';

// Alias de los tipos generados del contrato (ADR-012): ningún tipo de la API
// se escribe a mano.
export type User = components['schemas']['User'];
export type LoginRequest = components['schemas']['LoginRequest'];
