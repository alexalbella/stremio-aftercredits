import type { Config } from "./config.js";
import { STRINGS } from "./i18n.js";

export const VERSION = "2.0.0";

export function manifest(config: Config, origin: string) {
  return {
    id: "com.alexalbella.aftercredits",
    version: VERSION,
    name: "AfterCredits",
    description: STRINGS[config.lang].description,
    logo: `${origin}/logo.png`,
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}
