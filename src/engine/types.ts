export type LocationId =
  | "courtyard"
  | "archive"
  | "throne"
  | "rift"
  | "smithy"
  | "shop";
export type ScenarioId = "crown" | "spirit";
export type HeroId = "ranger" | "mage" | "warden";
export type NpcId =
  | "king"
  | "prince"
  | "sentinel"
  | "fallen"
  | "smith"
  | "merchant";
export type Tone = "story" | "combat" | "world" | "system" | "dialogue";
export interface Hero {
  id: HeroId;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
  skillRank: number;
  corruption: number;
  retired: boolean;
  inventory: string[];
  weapon?: string | null;
}
export interface Npc {
  id: NpcId;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  location: LocationId;
  relation: "neutral" | "hostile" | "ally";
  goal: string;
  knowledge: string;
  corruption: number;
}
export interface JournalEntry {
  id: number;
  minute: number;
  title: string;
  text: string;
  tone: Tone;
  formula?: string;
  location?: LocationId;
}
export interface World {
  schemaVersion: 1;
  rulesVersion: "0.1.0";
  seed: number;
  rng: number;
  revision: number;
  scenario: ScenarioId;
  location: LocationId;
  minute: number;
  heroes: Hero[];
  npcs: Npc[];
  flags: {
    lore: boolean;
    kingKiller: string | null;
    deathNewsAt: number | null;
    throneOwner: string | null;
    resolved: boolean;
    spiritReward: boolean;
  };
  journal: JournalEntry[];
  history: Command[];
  playerId?: HeroId;
  collected?: string[];
  turn?: { queue: (NpcId | "narrator")[]; spoken: boolean; steps: number };
}
interface Base {
  id: string;
  expectedRevision: number;
  actor: HeroId;
}
export type Command = Base &
  (
    | { type: "move"; destination: LocationId }
    | { type: "attack"; target: NpcId; skill: boolean }
    | { type: "heal"; target: HeroId }
    | { type: "begin" }
    | { type: "strike"; target: NpcId; skill: boolean }
    | { type: "say"; target: NpcId | "narrator"; text: string }
    | { type: "equip"; weapon: string | null }
    | { type: "take"; item: string }
    | { type: "use"; item: string }
    | {
        type: "npc_turn";
        npc: NpcId | "narrator";
        choice: "speak" | "attack" | "end";
        text: string;
        done: boolean;
        source: "agent" | "rules";
      }
    | {
        type:
          | "inspect"
          | "talk"
          | "wait"
          | "rest"
          | "claim"
          | "cleanse"
          | "upgrade"
          | "convert"
          | "travel";
      }
  );
export interface ReplayFile {
  format: "big-building-replay";
  version: 1;
  seed: number;
  commands: Command[];
}
