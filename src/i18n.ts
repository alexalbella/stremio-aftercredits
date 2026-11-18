import type { Language } from "./config.js";
import type { SourceId } from "./types.js";

/** Short names: the card's source line has room for three of them. */
export const SOURCE_NAMES: Record<SourceId, string> = {
  aftercredits: "aftercredits",
  mediastinger: "MediaStinger",
  tmdb: "TMDB",
  wikipedia: "Wikipedia",
};

type Strings = {
  description: string;
  stay: (scenes: number) => string;
  go: string;
  during: (n: number) => string;
  after: (n: number) => string;
  somewhere: string;
  none: string;
  worthIt: (yes: number, votes: number) => string;
  notWorthIt: (yes: number, votes: number) => string;
};

export const STRINGS: Record<Language, Strings> = {
  en: {
    description: "Tells you whether a film has scenes during or after the credits, before you press play.",
    stay: (n) => (n === 0 ? "Stay" : `Stay · ${n} ${n === 1 ? "scene" : "scenes"}`),
    go: "You can go",
    during: (n) => (n > 1 ? `🎬 ${n} scenes midway through the credits` : "🎬 Midway through the credits"),
    after: (n) => (n > 1 ? `🎬 ${n} scenes at the very end` : "🎬 At the very end"),
    somewhere: "🎬 Somewhere in the credits",
    none: "Nothing during or after the credits",
    worthIt: (yes, votes) => `👍 ${yes} of ${votes} say it's worth the wait`,
    notWorthIt: (yes, votes) => `👎 Only ${yes} of ${votes} say it's worth the wait`,
  },
  es: {
    description: "Te dice si una película tiene escenas durante o después de los créditos antes de darle al play.",
    stay: (n) => (n === 0 ? "Quédate" : `Quédate · ${n} ${n === 1 ? "escena" : "escenas"}`),
    go: "Puedes irte",
    during: (n) => (n > 1 ? `🎬 ${n} escenas a mitad de los créditos` : "🎬 A mitad de los créditos"),
    after: (n) => (n > 1 ? `🎬 ${n} escenas al final del todo` : "🎬 Al final del todo"),
    somewhere: "🎬 En algún momento de los créditos",
    none: "Nada durante ni después de los créditos",
    worthIt: (yes, votes) => `👍 ${yes} de ${votes} dicen que merece la pena`,
    notWorthIt: (yes, votes) => `👎 Solo ${yes} de ${votes} dicen que merece la pena`,
  },
};
