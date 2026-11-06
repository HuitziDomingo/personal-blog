import type { components } from '@personal-blog/api-types';

// Alias de los tipos generados del contrato (ADR-012): ningún tipo de la API
// se escribe a mano.
export type User = components['schemas']['User'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type Problem = components['schemas']['Problem'];
export type PostStatus = components['schemas']['PostStatus'];
export type PostSummary = components['schemas']['PostSummary'];
export type PostPage = components['schemas']['PostPage'];
export type Post = components['schemas']['Post'];
export type PostWrite = components['schemas']['PostWrite'];
