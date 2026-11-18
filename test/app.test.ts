import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import acDetail from "./fixtures/ac-detail-deadpool-wolverine.html?raw";
import acSearchDeadpool from "./fixtures/ac-search-deadpool.html?raw";
import acPostDeadpoolWolverine from "./fixtures/ac-post-65265.json";
import msSearchDeadpool from "./fixtures/ms-search-deadpool.html?raw";
import wiki2020s from "./fixtures/wiki-2020s.wikitext?raw";
import app from "../src/index.js";
import { clearWikipediaMemory } from "../src/sources/wikipedia.js";

class MemoryKV {
  store = new Map<string, string>();
  async get(key: string, type?: string) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

const CINEMETA = {
  meta: { id: "tt6263850", name: "Deadpool & Wolverine", releaseInfo: "2024", released: "2024-07-26T00:00:00.000Z" },
};

function routeFetch(url: string): Response {
  if (url.includes("cinemeta")) return Response.json(CINEMETA);
  if (url.startsWith("https://aftercredits.com/wp-json/wp/v2/posts?")) {
    return Response.json([{ id: 65265, link: "https://aftercredits.com/2024/07/deadpool-wolverine-2024/", title: { rendered: "Deadpool &#038; Wolverine (2024)*" } }]);
  }
  if (url.startsWith("https://aftercredits.com/wp-json/wp/v2/posts/65265")) return Response.json(acPostDeadpoolWolverine);
  if (url.startsWith("https://aftercredits.com/?s=")) return new Response(acSearchDeadpool);
  if (url === "https://aftercredits.com/2024/07/deadpool-wolverine-2024/") return new Response(acDetail);
  if (url.startsWith("https://mediastinger.com/")) return new Response(msSearchDeadpool);
  if (url.includes("post-credits_scenes_(2020s)") || url.includes("post-credits_scenes_%282020s%29")) return new Response(wiki2020s);
  return new Response("not found", { status: 404 });
}

let kv: MemoryKV;
let fetchMock: ReturnType<typeof vi.fn>;
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
const env = () => ({ CACHE: kv, ASSETS: { fetch: async () => new Response("<html>configure</html>") } });

beforeEach(() => {
  kv = new MemoryKV();
  clearWikipediaMemory();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => routeFetch(String(input)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const get = (path: string) => app.request(path, {}, env(), ctx as unknown as ExecutionContext);

describe("addon routes", () => {
  it("serves a configurable manifest, localized by the URL", async () => {
    const plain = await (await get("/manifest.json")).json();
    expect(plain).toMatchObject({ id: "com.alexalbella.aftercredits", resources: ["stream"], types: ["movie"] });
    const es = await (await get("/es,hidenone/manifest.json")).json();
    expect(es.description).toMatch(/créditos/);
    expect(es.behaviorHints.configurable).toBe(true);
  });

  it("answers a stream request from every source and caches the verdict", async () => {
    const res = await get("/es/stream/movie/tt6263850.json");
    const body = await res.json();
    expect(body.streams).toHaveLength(1);
    expect(body.streams[0].name).toBe("AfterCredits\n⏳ Quédate");
    expect(body.streams[0].description).toContain("Fuente: aftercredits.com · lo confirman MediaStinger y Wikipedia");
    expect(body.cacheMaxAge).toBeGreaterThan(0);

    await Promise.all(pending);
    expect([...kv.store.keys()]).toContain("verdict:v2:tt6263850");

    fetchMock.mockClear();
    const again = await (await get("/stream/movie/tt6263850.json")).json();
    expect(again.streams[0].name).toBe("AfterCredits\n⏳ Stay");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores ids that are not films from IMDb", async () => {
    expect((await (await get("/stream/series/tt0944947:1:1.json")).json()).streams).toEqual([]);
    expect((await (await get("/stream/movie/kitsu:1.json")).json()).streams).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache when every source is down", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("cinemeta") ? Response.json(CINEMETA) : new Response("down", { status: 503 }),
    );
    const body = await (await get("/stream/movie/tt6263850.json")).json();
    expect(body.streams).toEqual([]);
    await Promise.all(pending);
    expect(kv.store.has("verdict:v2:tt6263850")).toBe(false);
  });

  it("treats a period without a Wikipedia page as empty, not as an error", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cinemeta")) return Response.json({ meta: { name: "Future Film", releaseInfo: "2030" } });
      return new Response("missing", { status: 404 });
    });
    const body = await (await get("http://127.0.0.1/api/check/tt9999999?fresh=1")).json();
    expect(body.reports.find((r: { source: string }) => r.source === "wikipedia").outcome).toBe("not-found");
  });

  it("caches a verdict for at most six hours when a source failed", async () => {
    const puts: { key: string; ttl?: number }[] = [];
    kv.put = async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      puts.push({ key, ttl: opts?.expirationTtl });
      kv.store.set(key, value);
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("aftercredits.com")) return new Response("blocked", { status: 403 });
      return routeFetch(url);
    });
    await get("/stream/movie/tt6263850.json");
    await Promise.all(pending);
    expect(puts.find((p) => p.key === "verdict:v2:tt6263850")?.ttl).toBe(6 * 3600);
  });

  it("opens the configure page from the configured base URL", async () => {
    expect(await (await get("/es/configure")).text()).toContain("configure");
  });
});
