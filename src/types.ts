export type Film = {
  imdbId: string;
  title: string;
  year?: number;
  /** ISO date of release, when Cinemeta knows it. */
  released?: string;
};

export type SourceId = "aftercredits" | "mediastinger" | "tmdb" | "wikipedia";

/** What one site says about one film. A site that has no page for it returns nothing. */
export type SourceResult = {
  source: SourceId;
  link: string;
  /** true: there are extras. false: the site says explicitly there are none. null: page exists, answer pending. */
  hasExtras: boolean | null;
  /** Scenes during the credits (0 when none or unknown). */
  during: number;
  /** Scenes after the credits (0 when none or unknown). */
  after: number;
  /** aftercredits.com readers' vote on whether the wait is worth it. */
  worthIt?: { yes: number; votes: number };
};

export type Verdict = {
  status: "extras" | "none" | "unknown";
  during: number;
  after: number;
  /** The most trusted site that gave a definite answer. */
  primary?: { source: SourceId; link: string };
  agree: SourceId[];
  disagree: SourceId[];
  worthIt?: { yes: number; votes: number };
  checkedAt: string;
};
