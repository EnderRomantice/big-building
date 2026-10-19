import type { CareerState, CharacterRecord } from "./careers";
import type { StatBlock, Archetype } from "./stats";
export type LocationId =
  | `s-${string}`
  | "courtyard"
  | "archive"
  | "throne"
  | "rift"
  | "smithy"
  | "shop"
  | "gate"
  | "valley"
  | "ruins";
export type ScenarioId = "crown" | "spirit" | "succession";
export type HeroId = "ranger" | "mage" | "warden";
export type NpcId =
  | `n-${string}`
  | "king"
  | "prince"
  | "sentinel"
  | "fallen"
  | "smith"
  | "merchant";
export type Tone = "story" | "combat" | "world" | "system" | "dialogue";
export type ActionAim =
  | "attack"
  | "skill"
  | "heal"
  | `art-${string}`
  | `job-${string}`;
export interface Hero extends StatBlock {
  career?: CareerState;
  background?: string;
  archetype?: Archetype;
  skills?: string[];
  gold?: number;
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
export interface Npc extends StatBlock {
  career?: CareerState;
  affinity?: number;
  background?: string;
  faction?: string;
  kind?: "person" | "monster";
  archetype?: Archetype;
  relationships?: { target: NpcId; bond: string }[];
  id: NpcId;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  location: LocationId;
  relation: "neutral" | "hostile" | "ally";
  goal: string;
  intent?: string;
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
  decision?: { intent: string; tool: string };
  location?: LocationId;
}
export interface World {
  careersVersion?: 1;
  combatRound?: number;
  characterId?: string;
  campaign?: "succession-v1";
  initialHero?: HeroId;
  exploration?: {
    visited: LocationId[];
    inspected: LocationId[];
    pledged?: NpcId;
    events: number[];
  };
  schemaVersion: 1;
  rulesVersion: "0.1.0";
  seed: number;
  mapVersion: 0 | 1;
  initialMapVersion: 0 | 1;
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
  turn?: {
    queue: (NpcId | "narrator")[];
    spoken: boolean;
    steps: number;
    actions?: string[];
  };
}
interface Base {
  id: string;
  expectedRevision: number;
  actor: HeroId;
}
export type Command = Base &
  (
    | {
        type: "npc_step";
        npc: NpcId | "narrator";
        action:
          | "speak"
          | "attack"
          | "ceasefire"
          | "move"
          | "end"
          | "cast"
          | "guard"
          | "recover"
          | "plan";
        skill?: string;
        target?: HeroId | NpcId;
        tactic?: CareerState["tactic"];
        intent: string;
        text?: string;
        destination?: LocationId;
      }
    | { type: "move"; destination: LocationId }
    | { type: "attack"; target: NpcId; skill: boolean }
    | { type: "heal"; target: HeroId }
    | { type: "mend"; target: HeroId | NpcId }
    | { type: "begin" }
    | { type: "enable_careers" }
    | { type: "adopt_character"; profile: CharacterRecord }
    | { type: "unlock_skill"; skill: string }
    | { type: "invoke"; skill: string; target: HeroId | NpcId }
    | { type: "enable_map" }
    | { type: "strike"; target: NpcId; skill: boolean }
    | { type: "assault"; target: NpcId; skill: boolean }
    | { type: "learn"; skill: string }
    | { type: "cast"; skill: string; target: HeroId | NpcId }
    | { type: "pledge"; target: NpcId }
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
  campaign?: "succession-v1";
  hero?: HeroId;
  format: "big-building-replay";
  version: 1;
  seed: number;
  mapVersion?: 0 | 1;
  commands: Command[];
}
