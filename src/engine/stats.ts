/** Players, townspeople, royalty and monsters all use these level/role formulas. */
export type Archetype = "wanderer" | "scholar" | "guard" | "civilian" | "beast";
export interface StatBlock {
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  skillRank: number;
  corruption: number;
}
const ROLES = {
  wanderer: [36, 24, 6, 2],
  scholar: [28, 36, 5, 1],
  guard: [44, 20, 7, 4],
  civilian: [28, 20, 4, 1],
  beast: [32, 20, 6, 2],
} as const;
export function makeStats(level = 1, role: Archetype = "civilian"): StatBlock {
  const [health, energy, attack, defense] = ROLES[role];
  const maxHp = health + (level - 1) * 6,
    maxEnergy = energy + (level - 1) * 3;
  return {
    level,
    xp: 0,
    hp: maxHp,
    maxHp,
    energy: maxEnergy,
    maxEnergy,
    attack: attack + (level - 1) * 2,
    defense: defense + Math.floor((level - 1) / 2),
    skillRank: 1,
    corruption: 0,
  };
}
export function damageFor(
  attacker: StatBlock,
  defender: StatBlock,
  weapon = 0,
  die = 0,
  skill = 0,
) {
  return Math.max(1, attacker.attack + weapon + die + skill - defender.defense);
}
