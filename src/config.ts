// User settings travel in the install URL, the Stremio way:
//   https://host/es,hidenone/manifest.json
// Tokens are comma-separated and order does not matter; unknown ones are ignored.

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export type Config = {
  lang: Language;
  /** Hide the card when the sites say there is nothing after the credits. */
  hideNone: boolean;
};

export const DEFAULT_CONFIG: Config = { lang: "en", hideNone: false };

export function parseConfig(segment: string | undefined): Config {
  const config = { ...DEFAULT_CONFIG };
  if (!segment) return config;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // keep the raw segment
  }
  for (const token of decoded.toLowerCase().split(/[,|+\s]+/)) {
    if ((LANGUAGES as readonly string[]).includes(token)) config.lang = token as Language;
    else if (token === "hidenone") config.hideNone = true;
  }
  return config;
}

/** Empty string for the default config, so the plain /manifest.json URL keeps working. */
export function serializeConfig(config: Config): string {
  const tokens: string[] = [];
  if (config.lang !== DEFAULT_CONFIG.lang) tokens.push(config.lang);
  if (config.hideNone) tokens.push("hidenone");
  return tokens.join(",");
}
