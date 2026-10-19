import type { Archetype } from "./stats";
import { makeStats } from "./stats";
import type { Hero, Npc, ScenarioId, World } from "./types";

export interface CareerState {
  profession: string;
  unlocked: string[];
  readyAt: Record<string, number>;
  barrier: number;
  tactic: "balanced" | "aggressive" | "cautious";
}
export interface CharacterRecord {
  id: string;
  name: string;
  profession: string;
  level: number;
  xp: number;
  unlocked: string[];
}
export interface Profession {
  id: string;
  world: ScenarioId;
  name: string;
  role: Archetype;
  description: string;
  playable: boolean;
}
export interface CareerSkill {
  id: string;
  world: ScenarioId;
  profession?: string;
  name: string;
  kind: "attack" | "heal" | "guard" | "recover";
  power: number;
  energy: number;
  cooldown: number;
  level: number;
  points: number;
  requires: string[];
  description: string;
}
export const CAREER_WORLDS: {
  id: ScenarioId;
  name: string;
  tradition: string;
}[] = [
  {
    id: "succession",
    name: "九阙争衡",
    tradition: "江湖武学 · 术法 · 禁军战阵",
  },
  { id: "crown", name: "王座余烬", tradition: "游猎 · 奥术 · 誓约" },
  { id: "spirit", name: "灵境回廊", tradition: "界隙行走 · 魂术 · 灵契" },
];
const definitions: [ScenarioId, string, string, Archetype, string, string[]][] =
  [
    [
      "succession",
      "swordsman",
      "游侠",
      "wanderer",
      "轻快出手，以守势衔接破阵。",
      ["逐风斩", "卸锋式", "断水连击", "万里归锋"],
    ],
    [
      "succession",
      "alchemist",
      "方士",
      "scholar",
      "调息与疗伤维持气力，再以术法破敌。",
      ["衡光诀", "回元术", "离火符", "天衡敕令"],
    ],
    [
      "succession",
      "vanguard",
      "禁卫",
      "guard",
      "立盾承伤，等候破阵的时机。",
      ["破阵刺", "铁衣阵", "镇关击", "九阙镇军"],
    ],
    [
      "crown",
      "hunter",
      "游猎者",
      "wanderer",
      "保持耐力，以精准射击穿透防线。",
      ["瞄准射击", "林间隐护", "穿心矢", "风暴箭雨"],
    ],
    [
      "crown",
      "arcanist",
      "奥术师",
      "scholar",
      "以护身术与魔力恢复组织连续施法。",
      ["奥术飞弹", "生命编织", "裂解光束", "星陨"],
    ],
    [
      "crown",
      "oathkeeper",
      "誓约骑士",
      "guard",
      "用誓约护盾守住阵线，再发起裁决。",
      ["誓约重击", "誓盾", "裁决之刃", "王冠破晓"],
    ],
    [
      "spirit",
      "riftwalker",
      "界行者",
      "wanderer",
      "借界隙避锋，寻找爆发窗口。",
      ["裂隙斩", "折影屏障", "虚空穿刺", "千界归一"],
    ],
    [
      "spirit",
      "soulsinger",
      "魂咏者",
      "scholar",
      "以魂歌修复生命，蓄力释放灵潮。",
      ["魂音", "归魂曲", "灵潮", "万魂回响"],
    ],
    [
      "spirit",
      "spiritguard",
      "灵契卫",
      "guard",
      "以灵契抵挡伤害并反压敌人。",
      ["灵印击", "契约壁", "震魂锤", "不灭灵誓"],
    ],
    [
      "succession",
      "wild",
      "山野异兽",
      "beast",
      "扑击、蜷守与撕裂。",
      ["扑击", "硬皮", "撕裂", "山野狂袭"],
    ],
    [
      "crown",
      "corrupted",
      "腐化兽",
      "beast",
      "腐化的肉身仍有猎食本能。",
      ["噬咬", "骨甲", "裂骨", "腐潮爆发"],
    ],
    [
      "spirit",
      "echo",
      "回响兽",
      "beast",
      "在灵流间蓄势猎食。",
      ["魂爪", "灵壳", "吞灵", "回响震荡"],
    ],
  ];
export const PROFESSIONS: Profession[] = definitions.map(
  ([world, id, name, role, description]) => ({
    id,
    world,
    name,
    role,
    description,
    playable: role !== "beast",
  }),
);
export const CAREER_SKILLS: CareerSkill[] = definitions.flatMap(
  ([world, profession, , role, , names]) =>
    names.map((name, index) => ({
      id: `job-${profession}-${index}`,
      world,
      profession,
      name,
      kind: index === 1 ? (role === "scholar" ? "heal" : "guard") : "attack",
      power: [5, role === "scholar" ? 10 : 9, 12, 20][index],
      energy: [5, 6, 11, 16][index],
      cooldown: [0, 1, 2, 3][index],
      level: [1, 2, 4, 6][index],
      points: index === 0 ? 0 : 1,
      requires:
        index === 0
          ? []
          : index === 3
            ? [`job-${profession}-1`, `job-${profession}-2`]
            : [`job-${profession}-0`],
      description:
        index === 1
          ? role === "scholar"
            ? "恢复目标生命，留出喘息的机会。"
            : "为自己建立护盾，吸收后续伤害。"
          : [
              "职业基础招式。",
              "",
              "进阶爆发，需规划气力和冷却。",
              "融会攻守两支传承的终阶技能。",
            ][index],
    })),
);
for (const world of CAREER_WORLDS) {
  const names =
    world.id === "succession"
      ? ["治疗术", "吐纳", "固守"]
      : world.id === "crown"
        ? ["治疗术", "冥想", "防护术"]
        : ["治疗术", "引灵", "凝魂"];
  CAREER_SKILLS.push(
    ...names.map(
      (name, i): CareerSkill => ({
        id: `job-common-${world.id}-${i}`,
        world: world.id,
        name,
        kind: i === 0 ? "heal" : i === 1 ? "recover" : "guard",
        power: i === 0 ? 5 : 8,
        energy: i === 0 ? 6 : i === 1 ? 0 : 3,
        cooldown: i === 0 ? 0 : 1,
        level: i === 0 ? 1 : 2,
        points: i === 0 ? 0 : 1,
        requires: i === 0 ? [] : [`job-common-${world.id}-0`],
        description:
          i === 0
            ? "对存活且受伤的对象恢复 5 HP。"
            : i === 1
              ? "恢复 8 气力，占用本轮行动。"
              : "吸收接下来受到的 8 点伤害。",
      }),
    ),
  );
}
export const professionById = (id?: string) =>
  PROFESSIONS.find((p) => p.id === id);
export const careerSkill = (id: string) =>
  CAREER_SKILLS.find((s) => s.id === id);
export function skillTree(profession: string) {
  const p = professionById(profession);
  return p
    ? CAREER_SKILLS.filter(
        (s) => s.profession === p.id || (!s.profession && s.world === p.world),
      )
    : [];
}
export function starterSkills(profession: string) {
  return skillTree(profession)
    .filter((s) => !s.points)
    .map((s) => s.id);
}
export function skillPoints(person: Hero | Npc) {
  return Math.max(
    0,
    person.level -
      (person.career?.unlocked.reduce(
        (n, id) => n + (careerSkill(id)?.points ?? 0),
        0,
      ) ?? 0),
  );
}
export function cooldownLeft(w: World, person: Hero | Npc, id: string) {
  return Math.max(0, (person.career?.readyAt[id] ?? 0) - (w.combatRound ?? 0));
}
export function defaultProfession(w: World, person: Hero | Npc) {
  const origin = w.campaign
    ? "succession"
    : "id" in person && person.id === "sentinel"
      ? "spirit"
      : "crown";
  const role =
    person.archetype ??
    (person.id === "mage"
      ? "scholar"
      : person.id === "warden" ||
          person.id === "king" ||
          person.id === "prince" ||
          person.id === "sentinel"
        ? "guard"
        : "wanderer");
  return PROFESSIONS.find(
    (p) =>
      p.world === origin &&
      p.role === (role === "civilian" ? "wanderer" : role),
  )!;
}
export function initializeCareers(w: World) {
  w.careersVersion = 1;
  w.combatRound ??= 0;
  for (const person of [...w.heroes, ...w.npcs]) {
    if (person.career) continue;
    const p = defaultProfession(w, person);
    let budget = person.level;
    const unlocked =
      "inventory" in person
        ? starterSkills(p.id)
        : skillTree(p.id)
            .filter((s) => {
              if (s.level > person.level || s.points > budget) return false;
              budget -= s.points;
              return true;
            })
            .map((s) => s.id);
    person.career = {
      profession: p.id,
      unlocked,
      readyAt: {},
      barrier: 0,
      tactic: "balanced",
    };
    const hp = person.hp / person.maxHp,
      energy = person.energy / person.maxEnergy,
      xp = person.xp,
      corruption = person.corruption;
    Object.assign(person, makeStats(person.level, p.role), {
      xp,
      corruption,
      archetype: p.role,
    });
    person.hp = Math.floor(person.maxHp * hp);
    person.energy = Math.floor(person.maxEnergy * energy);
    if ("inventory" in person) person.title = p.name;
  }
}
export function validateCharacter(
  input: unknown,
): asserts input is CharacterRecord {
  if (!input || typeof input !== "object")
    throw new Error("角色档案格式错误。");
  const p = input as CharacterRecord,
    job = professionById(p.profession);
  if (
    typeof p.id !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 24 ||
    !job?.playable ||
    !Number.isInteger(p.level) ||
    p.level < 1 ||
    p.level > 100 ||
    !Number.isInteger(p.xp) ||
    p.xp < 0 ||
    p.xp >= p.level * 30 ||
    !Array.isArray(p.unlocked) ||
    new Set(p.unlocked).size !== p.unlocked.length
  )
    throw new Error("角色姓名、职业或成长记录无效。");
  const tree = skillTree(job.id);
  if (
    p.unlocked.some(
      (id) =>
        !tree.some(
          (s) =>
            s.id === id &&
            s.level <= p.level &&
            s.requires.every((r) => p.unlocked.includes(r)),
        ),
    ) ||
    starterSkills(job.id).some((id) => !p.unlocked.includes(id)) ||
    p.unlocked.reduce((n, id) => n + careerSkill(id)!.points, 0) > p.level
  )
    throw new Error("技能树前置、等级或技能点不符合规则。");
}
export function characterFromWorld(w: World): CharacterRecord | null {
  const h = w.heroes.find((h) => h.id === w.playerId);
  if (!w.characterId || !h?.career) return null;
  return {
    id: w.characterId,
    name: h.name,
    profession: h.career.profession,
    level: h.level,
    xp: h.xp,
    unlocked: [...h.career.unlocked],
  };
}
export function applyCharacter(w: World, profile: CharacterRecord) {
  validateCharacter(profile);
  if (w.characterId && w.characterId !== profile.id)
    throw new Error("不能把另一名角色覆盖到这个旅程。");
  const h = w.heroes.find((h) => h.id === w.playerId)!,
    p = professionById(profile.profession)!;
  if (
    w.characterId &&
    (h.career?.profession !== p.id ||
      profile.level < h.level ||
      (profile.level === h.level && profile.xp < h.xp) ||
      h.career.unlocked.some((id) => !profile.unlocked.includes(id)))
  )
    throw new Error("角色成长不能倒退或更换职业。");
  const health = h.hp / h.maxHp,
    energy = h.energy / h.maxEnergy;
  if (!w.characterId) {
    const source = CAREER_WORLDS.find((world) => world.id === p.world)!.name;
    h.background = `你名叫${profile.name}，承继${source}的${p.name}传承。${p.description} 此次跨界，等级与所学随你同行，新的地方恩怨由你亲自经历。`;
    if (w.journal[0])
      w.journal[0].text = `${h.background} ${w.campaign ? "昭帝病危，九子争储。七日后登阙议会开席；探访九地，寻找至少三份封存证词，再决定自己的立场。" : "你抵达灰石庭院。王子将在正午行动；先探索这座城，还是面对王宫中的权力？"}`;
  }
  Object.assign(h, makeStats(profile.level, p.role), {
    name: profile.name,
    title: p.name,
    archetype: p.role,
    xp: profile.xp,
    corruption: h.corruption,
    skillRank: h.skillRank,
  });
  h.hp = Math.floor(h.maxHp * health);
  h.energy = Math.floor(h.maxEnergy * energy);
  h.career = {
    profession: p.id,
    unlocked: [...profile.unlocked],
    readyAt: h.career?.readyAt ?? {},
    barrier: h.career?.barrier ?? 0,
    tactic: "balanced",
  };
  w.characterId = profile.id;
}
