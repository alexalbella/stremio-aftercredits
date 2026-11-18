// Small, dependency-free helpers for pulling text out of HTML and comparing
// film titles across sites that spell them differently.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  raquo: "»",
  laquo: "«",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(
    html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads one attribute out of the inside of a tag (`href="…" title="…"`). */
export function attr(tagInner: string, name: string): string | undefined {
  const match = tagInner.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : undefined;
}

/**
 * Reduces a title to a comparable key: no accents, no punctuation, "&" read as
 * "and", and no leading article. "The NeverEnding Story" and
 * "NeverEnding Story, The" both become "neverending story".
 */
export function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export type ListedTitle = {
  title: string;
  year?: number;
  /** Trailing marker some sites use: "*" has extras, "?" not yet known. */
  marker: "" | "*" | "?";
};

/** Parses listings like "Deadpool & Wolverine (2024)*" or "NeverEnding Story, The (1984)". */
export function parseListedTitle(raw: string): ListedTitle {
  let text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  let marker: ListedTitle["marker"] = "";
  const markerMatch = text.match(/([*?])\s*$/);
  if (markerMatch) {
    marker = markerMatch[1] as "*" | "?";
    text = text.slice(0, markerMatch.index).trim();
  }
  let year: number | undefined;
  const yearMatch = text.match(/\((\d{4})\)\s*$/);
  if (yearMatch) {
    year = Number(yearMatch[1]);
    text = text.slice(0, yearMatch.index).trim();
  }
  const article = text.match(/^(.*),\s*(the|a|an)$/i);
  if (article) text = `${article[2]} ${article[1]}`;
  return { title: text, year, marker };
}

export type FilmKey = { title: string; year?: number };

/**
 * Picks the candidate that is the same film: same normalized title, and a year
 * at most one off (festival vs. wide release). An exact year wins.
 */
export function pickSameFilm<T extends FilmKey>(candidates: T[], target: FilmKey): T | undefined {
  const key = normalizeTitle(target.title);
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (normalizeTitle(candidate.title) !== key) continue;
    // A listing without a year is usually an article, not the film's entry.
    if (target.year && !candidate.year) continue;
    const distance = candidate.year && target.year ? Math.abs(candidate.year - target.year) : 0.5;
    if (distance > 1) continue;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
