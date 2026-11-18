// aftercredits.com — the most detailed source. Titles carry a marker ("*" has
// extras, "?" not yet known, nothing = no extras), and each film page answers
// "during" and "after" separately and lets readers vote on whether the wait is
// worth it.
//
// The site is WordPress, so its REST API gives relevance-ranked search and the
// bare post body as small JSON. The theme's HTML search (newest first, one page
// only) is kept as a fallback in case the API is ever closed.

import { fetchJson, fetchText } from "../http.js";
import { attr, parseListedTitle, pickSameFilm, stripTags, type ListedTitle } from "../text.js";
import type { Film, SourceResult } from "../types.js";

const BASE = "https://aftercredits.com";

export type SearchHit = ListedTitle & { url: string; postId?: number };

type RestPost = { id: number; link: string; title: { rendered: string }; content?: { rendered: string } };

function searchQuery(title: string): string {
  return title.replace(/[^\p{L}\p{N}\s'&-]/gu, " ").replace(/\s+/g, " ").trim();
}

export function restSearchUrl(title: string): string {
  const params = new URLSearchParams({
    search: searchQuery(title),
    per_page: "50",
    orderby: "relevance",
    _fields: "id,link,title",
  });
  return `${BASE}/wp-json/wp/v2/posts?${params}`;
}

export function htmlSearchUrl(title: string): string {
  return `${BASE}/?s=${encodeURIComponent(searchQuery(title))}`;
}

export function parseRestSearch(posts: RestPost[]): SearchHit[] {
  return posts.map((post) => ({ ...parseListedTitle(post.title.rendered), url: post.link, postId: post.id }));
}

export function parseHtmlSearch(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const pattern = /<h3\b[^>]*class="[^"]*\bentry-title\b[^"]*"[^>]*>\s*<a\b([^>]*)>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = attr(match[1], "href");
    const title = attr(match[1], "title");
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    hits.push({ ...parseListedTitle(title), url });
  }
  return hits;
}

export type FilmPage = {
  during: boolean | null;
  after: boolean | null;
  duringScenes: number;
  afterScenes: number;
  worthIt?: { yes: number; votes: number };
};

/**
 * Reads a film page or bare post body. Two generations of wording exist:
 * "Are There Any Extras During The Credits? Yes" (new) and "During Credits? Yes" (old).
 */
export function parseFilmPage(html: string): FilmPage {
  // On a full page only the post body matters; slicing keeps the regex work tiny.
  // Anchor on a question that is followed by its Yes/No, so the site's own name
  // ("What's After The Credits?") in the header does not count.
  // The alternatives are disjoint and bounded, so a near miss cannot backtrack exponentially.
  const start = html.search(/(During|After) (The )?Credits\?(?:<[^>]+>|&[#\w]+;|[^A-Za-z<&]){0,300}(Yes|No)\b/i);
  const chunk = start >= 0 ? html.slice(Math.max(0, start - 200), start + 40_000) : "";
  const text = stripTags(chunk);

  const answer = (when: string): boolean | null => {
    const match = text.match(new RegExp(`${when} (?:The )?Credits\\?[^A-Za-z]*(Yes|No)\\b`, "i"));
    return match ? match[1].toLowerCase() === "yes" : null;
  };

  let duringScenes = 0;
  let afterScenes = 0;
  for (const match of chunk.matchAll(/class="spoiler-head[^"]*"[^>]*>([^<]*)</gi)) {
    const head = match[1].toLowerCase();
    if (head.includes("during")) duringScenes++;
    else if (head.includes("after")) afterScenes++;
  }

  let worthIt: FilmPage["worthIt"];
  const vote = text.match(/\(\s*([+-]?\d+)\s*rating,\s*(\d+)\s*votes?\s*\)/i);
  if (vote) {
    const score = Number(vote[1]);
    const votes = Number(vote[2]);
    // Up/down voting: score = yes - no, votes = yes + no.
    if (votes > 0) worthIt = { yes: Math.round((votes + score) / 2), votes };
  }

  return { during: answer("During"), after: answer("After"), duringScenes, afterScenes, worthIt };
}

async function search(film: Film): Promise<SearchHit[]> {
  try {
    return parseRestSearch(await fetchJson<RestPost[]>(restSearchUrl(film.title)));
  } catch {
    return parseHtmlSearch(await fetchText(htmlSearchUrl(film.title)));
  }
}

async function filmPage(hit: SearchHit): Promise<FilmPage> {
  if (hit.postId) {
    try {
      const post = await fetchJson<RestPost>(`${BASE}/wp-json/wp/v2/posts/${hit.postId}?_fields=content`);
      if (post.content?.rendered) return parseFilmPage(post.content.rendered);
    } catch {
      // fall through to the full page
    }
  }
  return parseFilmPage(await fetchText(hit.url));
}

export async function lookupAfterCredits(film: Film): Promise<SourceResult | null> {
  const hit = pickSameFilm(await search(film), film);
  if (!hit) return null;

  const base = { source: "aftercredits" as const, link: hit.url, during: 0, after: 0 };
  if (hit.marker === "?") return { ...base, hasExtras: null };
  if (hit.marker === "") return { ...base, hasExtras: false };

  try {
    const page = await filmPage(hit);
    const during = page.during === true ? Math.max(1, page.duringScenes) : 0;
    const after = page.after === true ? Math.max(1, page.afterScenes) : 0;
    return { ...base, hasExtras: true, during, after, worthIt: page.worthIt };
  } catch {
    // The title marker alone is enough to say there is something.
    return { ...base, hasExtras: true };
  }
}
