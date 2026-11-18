const USER_AGENT =
  "Mozilla/5.0 (compatible; StremioAfterCredits/2.0; +https://github.com/alexalbella/stremio-aftercredits)";

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Seconds Cloudflare's edge may keep the upstream response (Workers only). */
  edgeCacheTtl?: number;
};

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const init: RequestInit & { cf?: Record<string, unknown> } = {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...options.headers },
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    redirect: "follow",
  };
  if (options.edgeCacheTtl) init.cf = { cacheTtl: options.edgeCacheTtl, cacheEverything: true };
  const response = await fetch(url, init);
  if (!response.ok) throw new HttpError(url, response.status);
  return response.text();
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  return JSON.parse(await fetchText(url, options)) as T;
}
