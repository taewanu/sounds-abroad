/**
 * Delimits untrusted text inside a model prompt (#322). A prompt is one string,
 * so instruction and data share a channel; the fence marks the boundary and the
 * calling prompt states that fenced content is evidence, never instruction.
 * This mitigates rather than closes prompt injection: a model can still be
 * steered by fenced text, so the publish gate stays the trust arbiter.
 */
export function fenceUntrusted(tag: string, content: string): string {
  // Widening `</` to `< /` keeps every closing-tag form inert while leaving
  // ordinary angle brackets intact: legitimate names can carry them.
  const neutralized = content.replaceAll("</", "< /");
  return `<${tag}>${neutralized}</${tag}>`;
}
