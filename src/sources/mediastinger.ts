// MediaStinger — each search result carries a one-line verdict such as
// "Extra Scenes During and After the Credits" or "No Extras During or After the Credits".

import { fetchText } from "../http.js";
import { parseListedTitle, pickSameFilm, stripTags, type ListedTitle } from "../text.js";
import type { Film, SourceResult } from "../types.js";

const BASE = "https://mediastinger.com";

export type SearchHit = ListedTitle & { url: string; subtitle: string };

export function searchUrl(title: string): string {
  const query = title.replace(/[^\p{L}\p{N}\s'&-]/gu, " ").replace(/\s+/g, " ").trim();
  return `${BASE}/?tab=MOVIES&s=${encodeURIComponent(query)}`;
}

export function parseSearch(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const pattern =
    // [^<]* keeps a result that lacks its subtitle from swallowing the next one.
    /<span class="title"\s*>\s*<a href="([^"]+)"[^>]*>([^<]*)<\/a>\s*<\/span>\s*<span class="subtitle"\s*>([^<]*)<\/span>/gi;
  for (const match of html.matchAll(pattern)) {
    hits.push({ ...parseListedTitle(stripTags(match[2])), url: match[1], subtitle: stripTags(match[3]) });
  }
  return hits;
}

export function readSubtitle(subtitle: string): Pick<SourceResult, "hasExtras" | "during" | "after"> {
  const text = subtitle.toLowerCase();
  if (/\b(no|nothing|none|not any)\b/.test(text)) return { hasExtras: false, during: 0, after: 0 };
  const during = /\bduring\b/.test(text) ? 1 : 0;
  const after = /\bafter\b/.test(text) ? 1 : 0;
  if (during || after || /\bextra|\bscene/.test(text)) return { hasExtras: true, during, after };
  return { hasExtras: null, during: 0, after: 0 };
}

export async function lookupMediaStinger(film: Film): Promise<SourceResult | null> {
  const hit = pickSameFilm(parseSearch(await fetchText(searchUrl(film.title))), film);
  if (!hit) return null;
  return { source: "mediastinger", link: hit.url, ...readSubtitle(hit.subtitle) };
}
