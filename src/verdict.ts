import type { SourceId, SourceResult, Verdict } from "./types.js";

/**
 * Trust order. The dedicated sites answer yes *and* no; TMDB and Wikipedia can
 * only say yes. The first site with a definite answer decides; the rest either
 * agree or disagree.
 */
export const SOURCE_PRIORITY: SourceId[] = ["aftercredits", "mediastinger", "tmdb", "wikipedia"];

export function decide(results: SourceResult[], now = new Date()): Verdict {
  const ranked = [...results].sort(
    (a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source),
  );
  const checkedAt = now.toISOString();
  const primary = ranked.find((r) => r.hasExtras !== null);
  if (!primary) {
    return { status: "unknown", during: 0, after: 0, agree: [], disagree: [], checkedAt };
  }

  const others = ranked.filter((r) => r !== primary && r.hasExtras !== null);
  const agree = others.filter((r) => r.hasExtras === primary.hasExtras).map((r) => r.source);
  const disagree = others.filter((r) => r.hasExtras !== primary.hasExtras).map((r) => r.source);

  let { during, after } = primary;
  if (primary.hasExtras && !during && !after) {
    // The primary knows there is something but not when; borrow the timing
    // from the first agreeing site that knows it.
    const timed = ranked.find((r) => r.hasExtras && (r.during || r.after));
    if (timed) ({ during, after } = timed);
  }

  return {
    status: primary.hasExtras ? "extras" : "none",
    during: primary.hasExtras ? during : 0,
    after: primary.hasExtras ? after : 0,
    primary: { source: primary.source, link: primary.link },
    agree,
    disagree,
    worthIt: primary.hasExtras ? ranked.find((r) => r.worthIt)?.worthIt : undefined,
    checkedAt,
  };
}

const DAY = 60 * 60 * 24;

/**
 * How long a verdict stays cached. Recent films change most (sites post after
 * release, "?" turns into an answer), so they are rechecked within hours.
 */
export function cacheTtlSeconds(verdict: Verdict, released?: string, year?: number, now = new Date()): number {
  const releasedAt = released ? Date.parse(released) : year ? Date.UTC(year, 6, 1) : Number.NaN;
  const ageDays = Number.isFinite(releasedAt) ? (now.getTime() - releasedAt) / (DAY * 1000) : Number.POSITIVE_INFINITY;
  const recent = ageDays < 90;
  if (verdict.status === "unknown") return recent ? DAY / 4 : DAY * 3;
  if (recent) return DAY / 2;
  return verdict.status === "extras" ? DAY * 30 : DAY * 14;
}
