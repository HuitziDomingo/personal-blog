'use client';

import { Badge, Box, Button, chakra, Flex, HStack, Link, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { createContext, useContext, useId, useRef, useState, type SubmitEvent, type ReactNode } from 'react';

import { COMMENT_LIMITS, submitComment, waitText, type SubmitResult } from '@/lib/comments';

import { ClockIcon, ReplyIcon, SendIcon, ShieldIcon, WarningIcon, XCircleIcon } from './comment-icons';
import { CommentText } from './comment-text';
import { Avatar } from './comment-avatar';
import { RULES_PATH } from './rules-path';
import { tone } from './tones';

interface ReplyTarget {
  id: string;
  name: string;
}

interface CommentsContextValue {
  replyTo: (target: ReplyTarget) => void;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

/** Comentario enviado en esta página: solo lo ve quien lo envió, hasta recargar. */
interface PendingComment {
  key: number;
  name: string;
  content: string;
}

type Status = { kind: 'idle' } | { kind: 'sending' } | SubmitResult;

const Input = chakra('input');
const Textarea = chakra('textarea');

const fieldStyles = {
  w: 'full',
  px: '3',
  borderWidth: '1px',
  borderColor: { _light: '#b9ab99', _dark: '#4a4a52' },
  borderRadius: 'md',
  bg: { _light: 'white', _dark: '#18181b' },
  color: 'fg',
  fontSize: { base: '16px', md: '15px' },
  _placeholder: { color: 'fg.muted' },
  _focusVisible: { outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '1px' },
} as const;

/**
 * Formulario y estado de cliente de los comentarios. La lista de aprobados
 * llega como `children`, ya renderizada en el servidor con el ISR del post;
 * sus botones «Responder» usan este contexto para elegir a quién responder.
 * Nada se guarda en el navegador: el «pendiente» vive solo en esta página
 * (ADR-022, punto 6).
 */
export function CommentsClient({ apiBaseUrl, slug, children }: { apiBaseUrl: string; slug: string; children: ReactNode }) {
  const ids = { name: useId(), content: useId(), counter: useId(), website: useId(), notice: useId() };
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [website, setWebsite] = useState('');
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, setPending] = useState<PendingComment[]>([]);
  const [sentName, setSentName] = useState('');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const contextValue: CommentsContextValue = {
    replyTo(target) {
      setReply(target);
      setStatus({ kind: 'idle' });
      contentRef.current?.focus();
      contentRef.current?.scrollIntoView({ block: 'center' });
    },
  };

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === 'sending' || !name.trim() || !content.trim()) {
      return;
    }

    setStatus({ kind: 'sending' });
    const result = await submitComment(apiBaseUrl, slug, {
      name,
      content,
      website,
      ...(reply ? { parentId: reply.id } : {}),
    });
    setStatus(result);

    if (result.kind === 'pending') {
      setPending((items) => [...items, { key: Date.now(), name: name.trim(), content: content.trim() }]);
      setSentName(name.trim());
      setContent('');
      setReply(null);
    }
    // El mensaje recibe el foco para que se anuncie y quede a la vista.
    requestAnimationFrame(() => statusRef.current?.focus());
  }

  const sending = status.kind === 'sending';

  return (
    <CommentsContext.Provider value={contextValue}>
      <Stack gap="6">
        <chakra.form
          onSubmit={(event: SubmitEvent<HTMLFormElement>) => void onSubmit(event)}
          aria-label="Escribir un comentario"
          id="comentar"
          display="flex"
          flexDirection="column"
          gap="3.5"
          p={{ base: '4', md: '5' }}
          borderWidth="1px"
          borderRadius="xl"
          bg="brand.surface"
          position="relative"
        >
          {reply && (
            <HStack justify="space-between" gap="3" fontSize="sm" color="fg.muted" wrap="wrap">
              <HStack gap="1.5">
                <ReplyIcon />
                <Text as="span">
                  Respondiendo a <strong>{reply.name}</strong>
                </Text>
              </HStack>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                minH="11"
                color="brand.link"
                onClick={() => {
                  setReply(null);
                }}
              >
                Cancelar respuesta
              </Button>
            </HStack>
          )}

          <Stack gap="1.5">
            <chakra.label htmlFor={ids.name} fontSize="sm" fontWeight="semibold">
              Nombre
            </chakra.label>
            <Input
              id={ids.name}
              name="name"
              type="text"
              required
              maxLength={COMMENT_LIMITS.name}
              autoComplete="nickname"
              placeholder="Cómo quieres aparecer"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              h="11"
              {...fieldStyles}
            />
          </Stack>

          <Stack gap="1.5">
            <chakra.label htmlFor={ids.content} fontSize="sm" fontWeight="semibold">
              Comentario
            </chakra.label>
            <Textarea
              ref={contentRef}
              id={ids.content}
              name="content"
              required
              rows={5}
              maxLength={COMMENT_LIMITS.content}
              placeholder="Escribe tu comentario. Puedes usar `código en línea`."
              aria-describedby={`${ids.counter} ${ids.notice}`}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
              }}
              py="2.5"
              lineHeight="1.5"
              resize="vertical"
              {...fieldStyles}
            />
            <Text id={ids.counter} fontSize="xs" color="fg.muted" alignSelf="flex-end">
              {content.length} / {COMMENT_LIMITS.content}
              <span className="sr-only"> caracteres</span>
            </Text>
          </Stack>

          {/* Campo trampa (ADR-022, punto 3): fuera de la pantalla, fuera del
              orden de tabulación y oculto a los lectores de pantalla. Una
              persona nunca lo llena; un bot que llena todo, sí. */}
          <Box aria-hidden="true" position="absolute" left="-10000px" top="auto" w="1px" h="1px" overflow="hidden">
            <label htmlFor={ids.website}>Sitio web, déjalo vacío</label>
            <input
              id={ids.website}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => {
                setWebsite(event.target.value);
              }}
            />
          </Box>

          <Flex
            id={ids.notice}
            gap="2.5"
            align="flex-start"
            p="3"
            borderRadius="lg"
            borderWidth="1px"
            bg={tone.notice.bg}
            borderColor={tone.notice.border}
            fontSize="sm"
            lineHeight="1.5"
          >
            <Box as="span" color="brand.accent" mt="0.5" flexShrink={0} fontSize="lg">
              <ShieldIcon />
            </Box>
            <Text>
              Tu comentario lo revisa primero un modelo de IA (Gemini) para filtrar spam y abuso, y después yo. Se envía a Google,
              en su plan gratuito, que puede usar el texto para mejorar sus productos: no incluyas datos personales. No pedimos tu
              correo.{' '}
              <Link asChild color="brand.link" textDecoration="underline">
                <NextLink href={RULES_PATH}>Reglas de los comentarios</NextLink>
              </Link>
            </Text>
          </Flex>

          <Flex justify="flex-end">
            <Button
              type="submit"
              disabled={sending}
              minH="11"
              w={{ base: 'full', sm: 'auto' }}
              px="5"
              borderRadius="lg"
              fontWeight="bold"
              bg="brand.accent"
              color={{ _light: 'white', _dark: '#18181b' }}
              _hover={{ opacity: 0.92 }}
              _focusVisible={{ outline: '2px solid', outlineColor: 'fg', outlineOffset: '2px' }}
            >
              <SendIcon />
              {sending ? 'Enviando…' : 'Enviar comentario'}
            </Button>
          </Flex>
        </chakra.form>

        <Box ref={statusRef} tabIndex={-1} outline="none" _empty={{ display: 'none' }}>
          <SubmitStatus status={status} name={sentName} />
        </Box>

        {pending.map((item) => (
          <PendingCard key={item.key} name={item.name} content={item.content} />
        ))}

        {children}
      </Stack>
    </CommentsContext.Provider>
  );
}

/** Mensaje después de enviar: uno por estado de Estados.dc.html. */
function SubmitStatus({ status, name }: { status: Status; name: string }) {
  switch (status.kind) {
    case 'pending':
      return (
        <Notice role="status" icon={<ClockIcon />} tone="info" title={`Gracias, ${name}. Tu comentario está en revisión.`}>
          Aparecerá aquí cuando lo apruebe.
        </Notice>
      );
    case 'invalid':
      return (
        <Notice role="alert" icon={<XCircleIcon />} tone="danger" title="No pudimos publicar este comentario.">
          Revisa que el nombre y el comentario cumplan las reglas. Si crees que es un error, edítalo y vuelve a intentarlo.{' '}
          <Link asChild color="brand.link" textDecoration="underline">
            <NextLink href={RULES_PATH}>Reglas de los comentarios</NextLink>
          </Link>
        </Notice>
      );
    case 'rate-limited':
      return (
        <Notice role="alert" icon={<WarningIcon />} tone="warning" title="Enviaste varios comentarios seguidos.">
          Espera {waitText(status.retryAfterSeconds)} antes de enviar otro. Tu texto sigue en el formulario.
        </Notice>
      );
    case 'unavailable':
      return (
        <Notice role="alert" icon={<WarningIcon />} tone="warning" title="Los comentarios no están disponibles ahora.">
          Tu texto sigue en el formulario.
        </Notice>
      );
    case 'error':
      return (
        <Notice role="alert" icon={<XCircleIcon />} tone="danger" title="No pudimos enviar tu comentario.">
          Revisa tu conexión y vuelve a intentarlo. Tu texto sigue en el formulario.
        </Notice>
      );
    default:
      return null;
  }
}

function Notice({
  role,
  icon,
  tone: kind,
  title,
  children,
}: {
  role: 'status' | 'alert';
  icon: ReactNode;
  tone: 'info' | 'danger' | 'warning';
  title: string;
  children: ReactNode;
}) {
  const colors = tone[kind];

  return (
    <Flex role={role} gap="3.5" p="4.5" borderRadius="xl" borderWidth="1px" bg={colors.bg} borderColor={colors.border}>
      <Box as="span" color={colors.icon} fontSize="xl" flexShrink={0} mt="0.5">
        {icon}
      </Box>
      <Stack gap="1.5">
        <Text fontWeight="bold">{title}</Text>
        <Text fontSize="sm" lineHeight="1.55">
          {children}
        </Text>
      </Stack>
    </Flex>
  );
}

function PendingCard({ name, content }: { name: string; content: string }) {
  return (
    <Flex as="article" gap="3.5" p="4" borderRadius="xl" borderWidth="1px" borderStyle="dashed" borderColor="fg.muted">
      <Avatar name={name} />
      <Stack gap="1.5" flex="1" minW="0">
        <HStack gap="2" wrap="wrap">
          <Text as="strong" fontWeight="bold">
            {name}
          </Text>
          <Badge bg="brand.code" color="fg" textTransform="none" fontWeight="medium">
            Pendiente · solo tú lo ves
          </Badge>
        </HStack>
        <CommentText content={content} muted />
      </Stack>
    </Flex>
  );
}

/** «Responder» de un comentario aprobado: lleva al formulario con su padre. */
export function ReplyButton({ id, name }: ReplyTarget) {
  const context = useContext(CommentsContext);
  if (!context) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      alignSelf="flex-start"
      minH="11"
      px="2"
      ms="-2"
      color="fg.muted"
      fontWeight="normal"
      onClick={() => {
        context.replyTo({ id, name });
      }}
    >
      <ReplyIcon />
      Responder<span className="sr-only"> a {name}</span>
    </Button>
  );
}
