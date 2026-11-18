import { describe, expect, it } from "vitest";
import { parseConfig, serializeConfig } from "../src/config.js";
import { toStreams } from "../src/stream.js";
import type { SourceResult } from "../src/types.js";
import { cacheTtlSeconds, decide } from "../src/verdict.js";

const r = (source: SourceResult["source"], hasExtras: boolean | null, during = 0, after = 0): SourceResult => ({
  source,
  link: `https://${source}.example/film`,
  hasExtras,
  during,
  after,
});

describe("decide", () => {
  it("lets the most trusted definite source decide, whatever order results arrive in", () => {
    const v = decide([r("wikipedia", true, 0, 1), r("mediastinger", true, 1, 1), r("aftercredits", true, 1, 0)]);
    expect(v).toMatchObject({ status: "extras", during: 1, after: 0, primary: { source: "aftercredits" } });
    expect(v.agree).toEqual(["mediastinger", "wikipedia"]);
  });

  it("skips a source whose answer is still pending", () => {
    const v = decide([r("aftercredits", null), r("mediastinger", false)]);
    expect(v).toMatchObject({ status: "none", primary: { source: "mediastinger" } });
  });

  it("records disagreement instead of hiding it", () => {
    const v = decide([r("aftercredits", false), r("tmdb", true, 0, 1)]);
    expect(v).toMatchObject({ status: "none", disagree: ["tmdb"] });
  });

  it("borrows the timing when the primary only knows there is something", () => {
    const v = decide([r("aftercredits", true), r("wikipedia", true, 1, 0)]);
    expect(v).toMatchObject({ during: 1, after: 0, primary: { source: "aftercredits" } });
  });

  it("is unknown when nobody has an answer", () => {
    expect(decide([]).status).toBe("unknown");
    expect(decide([r("aftercredits", null)]).status).toBe("unknown");
  });
});

describe("cache lifetime", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("rechecks recent films within hours and old ones in weeks", () => {
    const extras = decide([r("aftercredits", true, 0, 1)], now);
    expect(cacheTtlSeconds(extras, "2026-11-01T00:00:00Z", 2026, now)).toBe(12 * 3600);
    expect(cacheTtlSeconds(extras, "2016-02-12T00:00:00Z", 2016, now)).toBe(30 * 86400);
    expect(cacheTtlSeconds(decide([], now), undefined, 2010, now)).toBe(3 * 86400);
  });
});

describe("config", () => {
  it("round-trips through the install URL", () => {
    expect(parseConfig("es,hidenone")).toEqual({ lang: "es", hideNone: true });
    expect(parseConfig("hidenone%2Ces")).toEqual({ lang: "es", hideNone: true });
    expect(parseConfig("nonsense")).toEqual({ lang: "en", hideNone: false });
    expect(serializeConfig({ lang: "en", hideNone: false })).toBe("");
    expect(serializeConfig({ lang: "es", hideNone: true })).toBe("es,hidenone");
  });
});

describe("streams", () => {
  it("writes the card in Spanish: green dot, one line per scene, vote, sources", () => {
    const v = decide([
      { ...r("aftercredits", true, 1, 1), worthIt: { yes: 7, votes: 7 } },
      r("mediastinger", true, 1, 1),
      r("wikipedia", true, 0, 1),
    ]);
    const [stream] = toStreams(v, parseConfig("es"));
    expect(stream.name).toBe("🟢 Quédate · 2 escenas");
    expect(stream.title).toBe(
      [
        "🎬 A mitad de los créditos",
        "🎬 Al final del todo",
        "👍 7 de 7 dicen que merece la pena",
        "✓ aftercredits • MediaStinger • Wikipedia",
      ].join("\n"),
    );
    expect(stream.externalUrl).toBe("https://aftercredits.example/film");
  });

  it("turns the vote around when most readers say it is not worth it", () => {
    const v = decide([{ ...r("aftercredits", true, 0, 1), worthIt: { yes: 1, votes: 5 } }]);
    const [stream] = toStreams(v, parseConfig("en"));
    expect(stream.name).toBe("🟢 Stay · 1 scene");
    expect(stream.title).toBe("🎬 At the very end\n👎 Only 1 of 5 say it's worth the wait\n✓ aftercredits");
  });

  it("says you can go, marks a dispute in yellow, and hides the card on request", () => {
    const v = decide([r("aftercredits", false), r("mediastinger", true, 1, 0), r("wikipedia", true, 0, 1)]);
    const [stream] = toStreams(v, parseConfig("es"));
    expect(stream.name).toBe("🟡 Puedes irte");
    expect(stream.title).toBe("Nada durante ni después de los créditos\n✓ aftercredits   ✗ MediaStinger • Wikipedia");
    expect(toStreams(decide([r("aftercredits", false)]), parseConfig("en"))[0].name).toBe("⚪ You can go");
    expect(toStreams(v, parseConfig("hidenone"))).toEqual([]);
  });

  it("shows nothing at all when the film is unknown", () => {
    expect(toStreams(decide([]), parseConfig("es"))).toEqual([]);
  });
});
