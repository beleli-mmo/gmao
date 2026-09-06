/** Filtre texte simple, insensible a la casse et aux accents. */
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function matches(query: string, ...parts: (string | number | null | undefined)[]): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  const hay = norm(parts.filter((p) => p != null && p !== '').join(' '));
  return q.split(/\s+/).every((tok) => hay.includes(tok));
}
