/**
 * What the end of a chart says when the rest of it would not load. Without it a
 * chart cut short at the payload's edge reads as the whole chart, and a mode
 * filtering it would answer from a fraction of what it names.
 */
export function TailUnread() {
  return (
    <li className="text-fg-3 text-small px-2 py-6 text-center">
      The rest of this chart would not load.
    </li>
  );
}
