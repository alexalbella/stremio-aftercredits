import { describe, expect, it } from "vitest";
import acDetail from "./fixtures/ac-detail-deadpool-wolverine.html?raw";
import acSearchDeadpool from "./fixtures/ac-search-deadpool.html?raw";
import acSearchOppenheimer from "./fixtures/ac-search-oppenheimer.html?raw";
import acRestThor from "./fixtures/ac-rest-search-thor.json";
import acRestAvengers from "./fixtures/ac-rest-search-the-avengers.json";
import acPostThor from "./fixtures/ac-post-1777.json";
import acPostFerris from "./fixtures/ac-post-3512.json";
import msSearchDeadpool from "./fixtures/ms-search-deadpool.html?raw";
import msSearchOppenheimer from "./fixtures/ms-search-oppenheimer.html?raw";
import wiki2010s from "./fixtures/wiki-2010s.wikitext?raw";
import wiki2020s from "./fixtures/wiki-2020s.wikitext?raw";
import wikiBefore2000 from "./fixtures/wiki-before_2000.wikitext?raw";
import * as ac from "../src/sources/aftercredits.js";
import * as ms from "../src/sources/mediastinger.js";
import * as wiki from "../src/sources/wikipedia.js";
import { normalizeTitle, parseListedTitle, pickSameFilm } from "../src/text.js";

describe("titles", () => {
  it("normalizes punctuation, accents, ampersands and leading articles", () => {
    expect(normalizeTitle("Deadpool &#038; Wolverine")).toBe("deadpool and wolverine");
    expect(normalizeTitle("Spider-Man: No Way Home")).toBe("spider man no way home");
    expect(normalizeTitle("Amélie")).toBe("amelie");
    expect(normalizeTitle("The NeverEnding Story")).toBe(normalizeTitle("NeverEnding Story"));
  });

  it("parses listings with year, marker and a trailing article", () => {
    expect(parseListedTitle("Deadpool &#038; Wolverine (2024)*")).toEqual({ title: "Deadpool & Wolverine", year: 2024, marker: "*" });
    expect(parseListedTitle("Peas and Carrots (2024)?")).toEqual({ title: "Peas and Carrots", year: 2024, marker: "?" });
    expect(parseListedTitle("NeverEnding Story, The (1984)")).toEqual({ title: "The NeverEnding Story", year: 1984, marker: "" });
  });

  it("matches the same film only, preferring the exact year", () => {
    const candidates = [
      { title: "Thor: Ragnarok", year: 2017 },
      { title: "Thor", year: 2012 },
      { title: "Thor", year: 2011 },
    ];
    expect(pickSameFilm(candidates, { title: "Thor", year: 2011 })).toBe(candidates[2]);
    expect(pickSameFilm(candidates, { title: "Thor", year: 2015 })).toBeUndefined();
  });
});

describe("aftercredits.com", () => {
  it("reads search results with their markers", () => {
    const hits = ac.parseHtmlSearch(acSearchDeadpool);
    const dw = hits.find((h) => h.title === "Deadpool & Wolverine");
    expect(dw).toMatchObject({ year: 2024, marker: "*", url: "https://aftercredits.com/2024/07/deadpool-wolverine-2024/" });
    expect(hits.find((h) => h.title === "Deadpool" && h.year === 2016)?.marker).toBe("*");
  });

  it("finds older films through the relevance-ranked REST search", () => {
    const thor = pickSameFilm(ac.parseRestSearch(acRestThor), { title: "Thor", year: 2011 });
    expect(thor).toMatchObject({ marker: "*", postId: 1777 });
    const avengers = pickSameFilm(ac.parseRestSearch(acRestAvengers), { title: "The Avengers", year: 2012 });
    expect(avengers).toMatchObject({ title: "The Avengers", marker: "*" });
  });

  it("stays fast on a near miss (no catastrophic backtracking)", () => {
    const nearMiss = "What's After The Credits?" + " ".repeat(5000) + "&#160;".repeat(2000) + " Unknown";
    const started = performance.now();
    expect(ac.parseFilmPage(nearMiss).after).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("reads the old page wording too", () => {
    expect(ac.parseFilmPage(acPostThor.content.rendered)).toMatchObject({ during: false, after: true, worthIt: { yes: 2, votes: 3 } });
    expect(ac.parseFilmPage(acPostFerris.content.rendered)).toMatchObject({ during: true, after: true, duringScenes: 1, afterScenes: 1 });
  });

  it("reads a film without extras as an explicit no", () => {
    const hit = pickSameFilm(ac.parseHtmlSearch(acSearchOppenheimer), { title: "Oppenheimer", year: 2023 });
    expect(hit?.marker).toBe("");
  });

  it("reads the film page: during, after, scene counts and the worth-it vote", () => {
    expect(ac.parseFilmPage(acDetail)).toEqual({
      during: true,
      after: true,
      duringScenes: 1,
      afterScenes: 1,
      worthIt: { yes: 7, votes: 7 },
    });
  });
});

describe("MediaStinger", () => {
  it("reads search results and their one-line verdicts", () => {
    const hits = ms.parseSearch(msSearchDeadpool);
    expect(hits.find((h) => h.title === "Deadpool 2")?.subtitle).toBe("Extra Scenes During the Credits");
    expect(ms.readSubtitle("Extra Scenes During and After the Credits")).toEqual({ hasExtras: true, during: 1, after: 1 });
    expect(ms.readSubtitle("Extra Scenes After the Credits")).toEqual({ hasExtras: true, during: 0, after: 1 });
  });

  it("reads every negative wording as a no", () => {
    expect(ms.readSubtitle("Nothing After the Credits").hasExtras).toBe(false);
    expect(ms.readSubtitle("No Extras During or After the Credits").hasExtras).toBe(false);
  });

  it("does not let a result without subtitle swallow the next one", () => {
    const html =
      '<span class="title" ><a href="https://x/a">Alpha (2020)</a></span><span class="pinfo">x</span>' +
      '<span class="title" ><a href="https://x/b">Beta (2021)</a></span>\n<span class="subtitle" >Extra Scenes After the Credits</span>';
    expect(ms.parseSearch(html).map((h) => h.title)).toEqual(["Beta"]);
  });

  it("reads 'No Extras During or After' as an explicit no", () => {
    const hit = pickSameFilm(ms.parseSearch(msSearchOppenheimer), { title: "Oppenheimer", year: 2023 });
    expect(hit && ms.readSubtitle(hit.subtitle)).toEqual({ hasExtras: false, during: 0, after: 0 });
  });
});

describe("Wikipedia", () => {
  it("picks the page for each period", () => {
    expect(wiki.pageFor(1984)).toBe("before_2000");
    expect(wiki.pageFor(2008)).toBe("2000s");
    expect(wiki.pageFor(2016)).toBe("2010s");
    expect(wiki.pageFor(2024)).toBe("2020s");
  });

  it("indexes every table row with its year, carried across rowspans", () => {
    const entries = wiki.parseIndex(wiki2020s);
    expect(entries.length).toBeGreaterThan(300);
    expect(entries.find((e) => e.title === "Bad Boys for Life")).toMatchObject({
      year: 2020,
      link: "https://en.wikipedia.org/wiki/Bad_Boys_for_Life",
    });
    expect(entries.find((e) => e.title === "Deadpool & Wolverine")?.year).toBe(2024);
    expect(entries.every((e) => e.year >= 2020 && e.year <= 2029)).toBe(true);
  });

  it("indexes the older pages too", () => {
    expect(wiki.parseIndex(wiki2010s).length).toBeGreaterThan(300);
    expect(wiki.parseIndex(wikiBefore2000).length).toBeGreaterThan(50);
  });

  it("classifies the description into during / after", () => {
    expect(wiki.classifyDescription('In a mid-credits scene, "Boxes of Bush" is sung.')).toEqual({ during: 1, after: 0 });
    expect(wiki.classifyDescription("In a post-credits scene, Thanos smiles.")).toEqual({ during: 0, after: 1 });
    expect(wiki.classifyDescription("In a [[Post-credits scene|mid-credits scene]], a ship appears.")).toEqual({ during: 1, after: 0 });
  });

  it("reads inline cells, multi-line descriptions and piped links", () => {
    const entries = wiki.parseIndex(wiki2010s);
    expect(entries.find((e) => e.title === "Thor: Ragnarok")).toMatchObject({
      year: 2017,
      during: 1,
      after: 1,
      link: "https://en.wikipedia.org/wiki/Thor%3A_Ragnarok",
    });
    expect(entries.find((e) => e.title === "A StoryBots Christmas")?.year).toBe(2017);
    const old = wiki.parseIndex(wikiBefore2000);
    expect(old.find((e) => e.title === "The Silencers")).toMatchObject({ year: 1966, link: "https://en.wikipedia.org/wiki/The_Silencers_(film)" });
    expect(old.find((e) => e.title === "What's Up, Tiger Lily?")?.year).toBe(1966);
  });
});
