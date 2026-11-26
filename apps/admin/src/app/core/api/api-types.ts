import type { components } from '@personal-blog/api-types';

// Alias de los tipos generados del contrato (ADR-012): ningún tipo de la API
// se escribe a mano.
export type User = components['schemas']['User'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type PasswordChange = components['schemas']['PasswordChange'];
export type Problem = components['schemas']['Problem'];
export type PostStatus = components['schemas']['PostStatus'];
export type PostSummary = components['schemas']['PostSummary'];
export type PostPage = components['schemas']['PostPage'];
export type Post = components['schemas']['Post'];
export type PostWrite = components['schemas']['PostWrite'];
export type AssistantDraft = components['schemas']['AssistantDraft'];
export type ImprovedWriting = components['schemas']['ImprovedWriting'];
export type AssistantMetadata = components['schemas']['MetadataSuggestion'];
export type CoverSuggestion = components['schemas']['CoverSuggestion'];
export type ContextDraft = components['schemas']['ContextDraft'];
export type ContextualSuggestion = components['schemas']['ContextualSuggestion'];
export type ContextSource = components['schemas']['ContextSource'];
export type RagStatus = components['schemas']['RagStatus'];
export type ReindexResult = components['schemas']['ReindexResult'];
export type CommentStatus = components['schemas']['CommentStatus'];
export type Comment = components['schemas']['Comment'];
export type CommentPage = components['schemas']['CommentPage'];
export type Moderation = components['schemas']['Moderation'];
export type ModerationVerdict = components['schemas']['ModerationVerdict'];
export type ModerationCategory = components['schemas']['ModerationCategory'];
export type AuthorReply = components['schemas']['AuthorReply'];
export type CVLanguage = components['schemas']['CVLanguage'];
export type CVVersion = components['schemas']['CVVersion'];
export type CVVersionList = components['schemas']['CVVersionList'];
