import { ExternalLink } from '@/components/external-link';
import { debredUrl } from '@/lib/site';

/** Texto de lib/content con el link a Debred donde dice `{debred}`. */
export function WithDebredLink({ text }: { text: string }) {
  const [before, after] = text.split('{debred}');
  if (after === undefined) {
    return text;
  }

  return (
    <>
      {before}
      <ExternalLink href={debredUrl}>Debred</ExternalLink>
      {after}
    </>
  );
}
