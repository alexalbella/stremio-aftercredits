import { fetchJson } from "./http.js";
import { lookupAfterCredits } from "./sources/aftercredits.js";
import { lookupMediaStinger } from "./sources/mediastinger.js";
import { lookupTmdb } from "./sources/tmdb.js";
import { lookupWikipedia } from "./sources/wikipedia.js";
import type { Film, SourceId, SourceResult, Verdict } from "./types.js";
import { cacheTtlSeconds, decide } from "./verdict.js";

export type LookupEnv = { CACHE?: KVNamespace; TMDB_TOKEN?: string };

/** One overall deadline per source, so a slow site cannot hold the card back. */
const SOURCE_DEADLINE_MS = 6000;
/** After any source error the verdict may be incomplete; recheck soon. */
const DEGRADED_TTL_SECONDS = 6 * 60 * 60;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`deadline of ${ms} ms passed`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

type CinemetaResponse = {
  meta?: { name?: string; releaseInfo?: string | number; year?: string | number; released?: string };
};

export async function getFilm(imdbId: string): Promise<Film | null> {
  const data = await fetchJson<CinemetaResponse>(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`, {
    edgeCacheTtl: 60 * 60 * 24,
    timeoutMs: 5000,
  });
  const meta = data.meta;
  if (!meta?.name) return null;
  const yearText = String(meta.releaseInfo ?? meta.year ?? meta.released ?? "");
  const year = Number.parseInt(yearText.slice(0, 4), 10);
  return {
    imdbId,
    title: meta.name,
    year: Number.isFinite(year) ? year : undefined,
    released: meta.released,
  };
}

export type SourceReport = { source: SourceId; ms: number } & (
  | { outcome: "found"; result: SourceResult }
  | { outcome: "not-found" }
  | { outcome: "skipped" }
  | { outcome: "error"; error: string }
);

export async function askSources(film: Film, env: LookupEnv): Promise<SourceReport[]> {
  const sources: [SourceId, () => Promise<SourceResult | null>][] = [
    ["aftercredits", () => lookupAfterCredits(film)],
    ["mediastinger", () => lookupMediaStinger(film)],
    ["tmdb", () => lookupTmdb(film, env.TMDB_TOKEN)],
    ["wikipedia", () => lookupWikipedia(film, env.CACHE)],
  ];
  return Promise.all(
    sources.map(async ([source, run]): Promise<SourceReport> => {
      if (source === "tmdb" && !env.TMDB_TOKEN) return { source, ms: 0, outcome: "skipped" };
      const started = Date.now();
      try {
        const result = await withDeadline(run(), SOURCE_DEADLINE_MS);
        const ms = Date.now() - started;
        return result ? { source, ms, outcome: "found", result } : { source, ms, outcome: "not-found" };
      } catch (error) {
        return { source, ms: Date.now() - started, outcome: "error", error: String(error) };
      }
    }),
  );
}

export type Lookup = { film: Film; verdict: Verdict; reports?: SourceReport[]; cached: boolean };

const cacheKey = (imdbId: string) => `verdict:v2:${imdbId}`;

export async function lookup(
  imdbId: string,
  env: LookupEnv,
  waitUntil: (promise: Promise<unknown>) => void,
  options: { fresh?: boolean } = {},
): Promise<Lookup | null> {
  if (!options.fresh && env.CACHE) {
    const hit = await env.CACHE.get<{ film: Film; verdict: Verdict }>(cacheKey(imdbId), "json");
    if (hit) return { ...hit, cached: true };
  }

  const film = await getFilm(imdbId);
  if (!film) return null;

  const reports = await askSources(film, env);
  const results = reports.flatMap((r) => (r.outcome === "found" ? [r.result] : []));
  const verdict = decide(results);

  console.log(
    JSON.stringify({
      event: "lookup",
      imdbId,
      title: film.title,
      year: film.year,
      status: verdict.status,
      primary: verdict.primary?.source,
      sources: Object.fromEntries(reports.map((r) => [r.source, `${r.outcome} ${r.ms}ms`])),
    }),
  );

  // Every source failing is an outage, not an answer: don't remember it.
  const allFailed = reports.every((r) => r.outcome === "error" || r.outcome === "skipped");
  if (env.CACHE && !allFailed) {
    const anyFailed = reports.some((r) => r.outcome === "error");
    const ttl = Math.min(cacheTtlSeconds(verdict, film.released, film.year), anyFailed ? DEGRADED_TTL_SECONDS : Infinity);
    waitUntil(env.CACHE.put(cacheKey(imdbId), JSON.stringify({ film, verdict }), { expirationTtl: ttl }));
  }

  return { film, verdict, reports, cached: false };
}
