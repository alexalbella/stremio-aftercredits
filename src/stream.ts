import type { Config } from "./config.js";
import { SOURCE_NAMES, STRINGS } from "./i18n.js";
import type { Verdict } from "./types.js";

/** The subset of Stremio's Stream object this addon uses. */
export type Stream = {
  name: string;
  /** Stremio 5 reads `description`; older clients read `title`. */
  description: string;
  title: string;
  externalUrl: string;
};

/** Minimum votes before the "worth the wait" line means anything. */
const MIN_VOTES = 3;

export function toStreams(verdict: Verdict, config: Config): Stream[] {
  if (verdict.status === "unknown" || !verdict.primary) return [];
  if (verdict.status === "none" && config.hideNone) return [];

  const t = STRINGS[config.lang];
  const lines: string[] = [];

  if (verdict.status === "extras") {
    if (verdict.during) lines.push(t.during(verdict.during));
    if (verdict.after) lines.push(t.after(verdict.after));
    if (!verdict.during && !verdict.after) lines.push(t.somewhere);
    if (verdict.worthIt && verdict.worthIt.votes >= MIN_VOTES) {
      lines.push(t.worthIt(verdict.worthIt.yes, verdict.worthIt.votes));
    }
  } else {
    lines.push(t.none);
  }

  let source = t.source(SOURCE_NAMES[verdict.primary.source]);
  if (verdict.agree.length) source += ` · ${t.confirmedBy(verdict.agree.map((s) => SOURCE_NAMES[s]))}`;
  lines.push(source);
  if (verdict.disagree.length) lines.push(t.disagree(verdict.disagree.map((s) => SOURCE_NAMES[s])));

  const text = lines.join("\n");
  return [
    {
      name: verdict.status === "extras" ? t.nameExtras : t.nameNone,
      description: text,
      title: text,
      externalUrl: verdict.primary.link,
    },
  ];
}
