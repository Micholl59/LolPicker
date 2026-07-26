export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export interface Recommendation {
  key: string;
  name: string;
  title: string;
  icon: string;
  tags: string[];
  score: number;
  wrPatch: number | null;
  gamesPatch: number;
  pickRate: number | null;
  difficulty: number;
  persoGames: number;
  persoWr: number | null;
  persoKda: number | null;
  reason: string;
  blurb: string;
  tips: string[];
  archetype: string | null;
  styleTags: string[];
  plan: { early: string; mid: string; late: string; draft: string } | null;
  styleBonus: number;
  draftDelta?: number;
  counter?: {
    delta: number;
    wr: number;
    games: number;
    enemyName: string;
  } | null;
}

export interface PlayerProfile {
  style: Record<string, number>;
  tempo: number;
  games: number;
  topTags: string[];
}

export interface TeamAnalysis {
  picks: string[];
  lanes: (Role | null)[];
  gauges: { cc: number; frontline: number; engage: number; peel: number; adPct: number };
  labels: string[];
}

export interface CounterEntry {
  name: string;
  icon: string;
  wr: number;
  games: number;
}

export interface DraftResult {
  role: Role;
  counters: {
    enemyName: string;
    enemyIcon: string;
    best: CounterEntry[];
    worst: CounterEntry[];
  } | null;
  patch: { ddragonVersion: string; display: string; statsFetchedAt: number };
  player: {
    riotId: string | null;
    personalAvailable: boolean;
    personalError: string | null;
    analyzedMatches: number;
    pendingMatches: number;
    fetchedAt: number | null;
    profile: PlayerProfile | null;
  };
  ally: TeamAnalysis;
  enemy: TeamAnalysis;
  recommendations: { pool: Recommendation[]; discover: Recommendation[] };
}
