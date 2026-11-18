// TMDB — optional. Tags films with the keywords "duringcreditsstinger" and
// "aftercreditsstinger". A missing keyword proves nothing, so TMDB can only confirm.
// Needs the TMDB_TOKEN secret: either a v4 read token or a v3 API key.

import { fetchJson } from "../http.js";
import type { Film, SourceResult } from "../types.js";

const API = "https://api.themoviedb.org/3";

type FindResponse = { movie_results?: { id: number }[] };
type KeywordsResponse = { keywords?: { name: string }[] };

function withAuth(path: string, token: string): { url: string; headers: Record<string, string> } {
  const url = `${API}${path}`;
  // v3 keys are 32 hex characters; v4 read tokens are long JWTs.
  if (/^[0-9a-f]{32}$/i.test(token)) {
    const separator = url.includes("?") ? "&" : "?";
    return { url: `${url}${separator}api_key=${token}`, headers: { accept: "application/json" } };
  }
  return { url, headers: { accept: "application/json", authorization: `Bearer ${token}` } };
}

export async function lookupTmdb(film: Film, token?: string): Promise<SourceResult | null> {
  if (!token) return null;

  const find = withAuth(`/find/${film.imdbId}?external_source=imdb_id`, token);
  const found = await fetchJson<FindResponse>(find.url, { headers: find.headers });
  const tmdbId = found.movie_results?.[0]?.id;
  if (!tmdbId) return null;

  const kw = withAuth(`/movie/${tmdbId}/keywords`, token);
  const { keywords = [] } = await fetchJson<KeywordsResponse>(kw.url, { headers: kw.headers });
  const names = new Set(keywords.map((k) => k.name.toLowerCase()));
  const during = names.has("duringcreditsstinger") ? 1 : 0;
  const after = names.has("aftercreditsstinger") ? 1 : 0;
  if (!during && !after) return null;

  return { source: "tmdb", link: `https://www.themoviedb.org/movie/${tmdbId}`, hasExtras: true, during, after };
}
