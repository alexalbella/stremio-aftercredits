import type { Config } from "./config.js";
import { SOURCE_NAMES, STRINGS } from "./i18n.js";
import type { Verdict } from "./types.js";

/** The subset of Stremio's Stream object this addon uses. */
export type Stream = {
  name: string;
  /**
   * The card text. Only `title`: stremio-core reads it as an alias of
   * `description`, and a stream carrying both fails to parse ("duplicate
   * field"), which makes Stremio drop the whole response. Older clients read
   * `title` directly.
   */
  title: string;
  externalUrl: string;
};

/** Minimum votes before the "worth the wait" line means anything. */
const MIN_VOTES = 3;

/**
 * The card reads like the Ratings addon's: a coloured dot and the verdict in
 * the name, one short line per fact, sources on one line.
 *   🟢 stay   ⚪ you can go   🟡 a source says otherwise
 */
export function toStreams(verdict: Verdict, config: Config): Stream[] {
  if (verdict.status === "unknown" || !verdict.primary) return [];
  if (verdict.status === "none" && config.hideNone) return [];

  const t = STRINGS[config.lang];
  const disputed = verdict.disagree.length > 0;
  const lines: string[] = [];
  let name: string;

  if (verdict.status === "extras") {
    name = `${disputed ? "🟡" : "🟢"} ${t.stay(verdict.during + verdict.after)}`;
    if (verdict.during) lines.push(t.during(verdict.during));
    if (verdict.after) lines.push(t.after(verdict.after));
    if (!verdict.during && !verdict.after) lines.push(t.somewhere);
    const vote = verdict.worthIt;
    if (vote && vote.votes >= MIN_VOTES) {
      lines.push(vote.yes * 2 >= vote.votes ? t.worthIt(vote.yes, vote.votes) : t.notWorthIt(vote.yes, vote.votes));
    }
  } else {
    name = `${disputed ? "🟡" : "⚪"} ${t.go}`;
    lines.push(t.none);
  }

  const names = (ids: typeof verdict.agree) => ids.map((s) => SOURCE_NAMES[s]).join(" • ");
  let sources = `✓ ${names([verdict.primary.source, ...verdict.agree])}`;
  if (disputed) sources += `   ✗ ${names(verdict.disagree)}`;
  lines.push(sources);

  return [
    {
      name,
      title: lines.join("\n"),
      externalUrl: verdict.primary.link,
    },
  ];
}
