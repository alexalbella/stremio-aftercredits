// Wikipedia's "List of films with post-credits scenes", now split into one
// page per period. It only lists films that have extras, so it can confirm
// but never deny. Each page is parsed once into a compact index and kept a day.

import { HttpError, fetchText } from "../http.js";
import { pickSameFilm } from "../text.js";
import type { Film, SourceResult } from "../types.js";

export type WikiEntry = { title: string; year: number; link: string; during: number; after: number };

const INDEX_TTL_SECONDS = 60 * 60 * 24;
const memory = new Map<string, { at: number; entries: WikiEntry[] }>();

export function pageFor(year: number): string {
  if (year < 2000) return "before_2000";
  if (year >= 2030) return "2030s";
  return `${Math.floor(year / 10) * 10}s`;
}

/** The page's wikitext: a third of the rendered HTML, and a much simpler table format. */
export function pageUrl(page: string): string {
  return `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(pageTitle(page))}&action=raw`;
}

export function articleUrl(target: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(target.trim().replace(/ /g, "_")).replace(/%2F/g, "/")}`;
}

function pageTitle(page: string): string {
  return `List_of_films_with_post-credits_scenes_(${page})`;
}

export function classifyDescription(description: string): { during: number; after: number } {
  // Keep only the visible text of [[target|text]] links: "[[Post-credits scene|mid-credits scene]]"
  // is a mid-credits scene, whatever the article it points to.
  const text = description.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").toLowerCase();
  const during = /mid-?\s?credits?|during the (end )?credits|halfway through the credits/.test(text) ? 1 : 0;
  const after = /post-?\s?credits?|after the (end )?credits|end of the (end )?credits|after all the credits/.test(text) ? 1 : 0;
  return { during, after };
}

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;

/**
 * Indexes the wikitext tables. Rows look like:
 *   |- id="2020"
 *   | rowspan="74" | 2020        <- year, only on the first row of the year
 *   | ''[[Bad Boys for Life]]''   <- title
 *   | In a mid-credits scene, …   <- description (may span lines)
 */
export function parseIndex(wikitext: string): WikiEntry[] {
  const entries: WikiEntry[] = [];
  const tables = wikitext.split(/^\{\|/m).slice(1).map((t) => t.split(/^\|\}/m)[0]);
  for (const table of tables) {
    if (!/^!\s*Year\b/m.test(table)) continue;
    let year = 0;
    for (const row of table.split(/^\|-.*$/m)) {
      let body = row;
      const yearLine = body.match(/^\|\s*(?:rowspan="?\d+"?\s*\|\s*)?(\d{4})\s*$/m);
      if (yearLine) {
        year = Number(yearLine[1]);
        body = body.slice(0, yearLine.index) + body.slice((yearLine.index ?? 0) + yearLine[0].length);
      }
      const titleLine = body.match(/^\|(?!\|)\s*(.+)$/m);
      if (!titleLine || !year) continue;
      const cells = titleLine[1].split("||");
      const link = cells[0].match(WIKILINK);
      const italic = cells[0].match(/''([^']+)''/);
      const title = (link ? (link[2] ?? link[1]) : italic?.[1] ?? "").replace(/''/g, "").trim();
      if (!title) continue;
      const description = cells.slice(1).join(" ") + body.slice((titleLine.index ?? 0) + titleLine[0].length);
      entries.push({
        title,
        year,
        link: link ? articleUrl(link[1]) : "",
        ...classifyDescription(description),
      });
    }
  }
  return entries;
}

async function loadIndex(page: string, kv?: KVNamespace): Promise<WikiEntry[]> {
  const cached = memory.get(page);
  if (cached && Date.now() - cached.at < INDEX_TTL_SECONDS * 1000) return cached.entries;

  const kvKey = `wiki:v2:${page}`;
  const stored = kv ? await kv.get<WikiEntry[]>(kvKey, "json") : null;
  if (stored) {
    memory.set(page, { at: Date.now(), entries: stored });
    return stored;
  }

  let entries: WikiEntry[];
  try {
    entries = parseIndex(await fetchText(pageUrl(page), { edgeCacheTtl: INDEX_TTL_SECONDS, timeoutMs: 5000 }));
  } catch (error) {
    // A period that has no page yet (the 2030s, today) simply lists nothing.
    if (error instanceof HttpError && error.status === 404) entries = [];
    else throw error;
  }
  memory.set(page, { at: Date.now(), entries });
  if (kv && entries.length > 0) {
    // KV allows one write per key per second; losing this write only costs a re-parse.
    await kv.put(kvKey, JSON.stringify(entries), { expirationTtl: INDEX_TTL_SECONDS }).catch(() => {});
  }
  return entries;
}

export async function lookupWikipedia(film: Film, kv?: KVNamespace): Promise<SourceResult | null> {
  if (!film.year) return null;
  const pages = new Set([pageFor(film.year - 1), pageFor(film.year), pageFor(film.year + 1)]);
  const indexes = await Promise.all([...pages].map((page) => loadIndex(page, kv)));
  const entry = pickSameFilm(indexes.flat(), film);
  if (!entry) return null;
  return {
    source: "wikipedia",
    link: entry.link || articleUrl(pageTitle(pageFor(entry.year))),
    hasExtras: true,
    during: entry.during,
    after: entry.after,
  };
}

/** For tests. */
export function clearWikipediaMemory(): void {
  memory.clear();
}
