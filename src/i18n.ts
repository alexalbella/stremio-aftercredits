import type { Language } from "./config.js";
import type { SourceId } from "./types.js";

export const SOURCE_NAMES: Record<SourceId, string> = {
  aftercredits: "aftercredits.com",
  mediastinger: "MediaStinger",
  tmdb: "TMDB",
  wikipedia: "Wikipedia",
};

type Strings = {
  description: string;
  nameExtras: string;
  nameNone: string;
  during: (n: number) => string;
  after: (n: number) => string;
  somewhere: string;
  none: string;
  worthIt: (yes: number, votes: number) => string;
  source: (name: string) => string;
  confirmedBy: (names: string[]) => string;
  disagree: (names: string[]) => string;
};

const list = (lang: Language, items: string[]) =>
  new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(items);

export const STRINGS: Record<Language, Strings> = {
  en: {
    description: "Tells you whether a film has scenes during or after the credits, before you press play.",
    nameExtras: "AfterCredits\n⏳ Stay",
    nameNone: "AfterCredits\n✓ No extras",
    during: (n) => (n > 1 ? `🎬 ${n} scenes during the credits` : "🎬 A scene during the credits"),
    after: (n) => (n > 1 ? `🎬 ${n} scenes after the credits` : "🎬 A scene after the credits"),
    somewhere: "🎬 An extra scene in the credits",
    none: "Nothing during or after the credits",
    worthIt: (yes, votes) => `👍 Worth the wait: ${yes} of ${votes} votes`,
    source: (name) => `Source: ${name}`,
    confirmedBy: (names) => `confirmed by ${list("en", names)}`,
    disagree: (names) => `⚠️ ${list("en", names)} ${names.length > 1 ? "say" : "says"} otherwise`,
  },
  es: {
    description: "Te dice si una película tiene escenas durante o después de los créditos antes de darle al play.",
    nameExtras: "AfterCredits\n⏳ Quédate",
    nameNone: "AfterCredits\n✓ Sin extras",
    during: (n) => (n > 1 ? `🎬 ${n} escenas durante los créditos` : "🎬 Una escena durante los créditos"),
    after: (n) => (n > 1 ? `🎬 ${n} escenas al final de los créditos` : "🎬 Una escena al final de los créditos"),
    somewhere: "🎬 Una escena extra en los créditos",
    none: "Nada durante ni después de los créditos",
    worthIt: (yes, votes) => `👍 Merece la pena esperar: ${yes} de ${votes} votos`,
    source: (name) => `Fuente: ${name}`,
    confirmedBy: (names) => `${names.length > 1 ? "lo confirman" : "lo confirma"} ${list("es", names)}`,
    disagree: (names) => `⚠️ ${list("es", names)} ${names.length > 1 ? "dicen" : "dice"} lo contrario`,
  },
};
