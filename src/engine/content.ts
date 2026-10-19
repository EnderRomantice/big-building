import { makeStats } from "./stats";
import { CAMPAIGN_PLACES, CAMPAIGN_ITEMS } from "./succession";
import type { Hero, HeroId, LocationId, Npc, ScenarioId, World } from "./types";
export const ENERGY_COST = {
  skill: 8,
  heal: 6,
  cleanse: 12,
  convert: 6,
} as const;
export const RULES_VERSION = "0.1.0" as const;
// Coordinates below are retained for legacy content; generated positions live in geography.ts.
export const LOCATIONS: Record<
  LocationId,
  { name: string; subtitle: string; description: string; x: number; y: number }
> = {
  ...CAMPAIGN_PLACES,
  courtyard: {
    name: "灰石庭院",
    subtitle: "THE ASHEN COURT",
    description: "钟声穿过空旷的庭院。王城仍在沉睡，但每一个人的计划都在继续。",
    x: 2,
    y: 3,
  },
  archive: {
    name: "秘典书库",
    subtitle: "THE SILENT ARCHIVE",
    description:
      "尘封的卷轴记载着王座的代价。王子独自站在窗边，手里的信尚未寄出。",
    x: 2,
    y: 1,
  },
  throne: {
    name: "荆棘王座",
    subtitle: "THE THORN THRONE",
    description: "天光穿过高窗。王冠之下，一个古老的意志正在等待新的容器。",
    x: 3,
    y: 1,
  },
  smithy: {
    name: "铁匠铺",
    subtitle: "THE FORGE",
    description: "炉火映着铁砧。铁匠正在整理一把新打好的铁剑。",
    x: 1,
    y: 2,
  },
  shop: {
    name: "商店",
    subtitle: "THE LITTLE SHOP",
    description: "柜台上摆着药草。店主抬头看了你一眼，等你开口。",
    x: 2,
    y: 2,
  },
  rift: {
    name: "界隙之门",
    subtitle: "THE WORLD BETWEEN",
    description:
      "石环里浮现出另一个世界。随身物品得以保留，力量却必须遵守彼岸的规则。石环旁的古道通往遗迹，入口被符文石门封住。",
    x: 3,
    y: 3,
  },
  gate: {
    name: "城郊关口",
    subtitle: "THE OUTER GATE",
    description: "旧城墙在这里结束。石板路沿着草坡延伸，通往雾河谷。",
    x: 4,
    y: 3,
  },
  valley: {
    name: "雾河谷",
    subtitle: "THE MIST VALLEY",
    description:
      "薄雾贴着河床流动。山径通向界隙，回望来路，城郊关口已经隐入雾中。",
    x: 5,
    y: 3,
  },
  ruins: {
    name: "旧日遗迹",
    subtitle: "THE OLD RUINS",
    description:
      "古老的符文刻在石门上。断墙间长满青苔，远方的王城只剩一个轮廓。",
    x: 5,
    y: 1,
  },
};
export const SCENARIOS: Record<
  ScenarioId,
  { name: string; subtitle: string; energy: string; color: string }
> = {
  succession: {
    name: "九阙争衡",
    subtitle: "一座帝都，九道封疆，尚未落定的储位。",
    energy: "气力",
    color: "#111",
  },
  crown: {
    name: "王座余烬",
    subtitle: "一顶王冠，未被写定的命运。",
    energy: "魔力",
    color: "#c0a572",
  },
  spirit: {
    name: "灵境回廊",
    subtitle: "同一个你，另一套世界法则。",
    energy: "灵力",
    color: "#8bb9ac",
  },
};
export const INITIAL_HEROES: Hero[] = [
  {
    ...makeStats(),
    id: "ranger",
    name: "艾琳",
    title: "游侠",
    hp: 44,
    maxHp: 44,
    energy: 24,
    maxEnergy: 24,
    attack: 12,
    defense: 3,
    level: 1,
    xp: 0,
    skillRank: 1,
    corruption: 0,
    retired: false,
    inventory: ["灰木长弓"],
  },
  {
    ...makeStats(),
    id: "mage",
    name: "索恩",
    title: "秘法师",
    hp: 32,
    maxHp: 32,
    energy: 40,
    maxEnergy: 40,
    attack: 15,
    defense: 1,
    level: 1,
    xp: 0,
    skillRank: 1,
    corruption: 0,
    retired: false,
    inventory: ["余烬法杖"],
  },
  {
    ...makeStats(),
    id: "warden",
    name: "洛克",
    title: "守誓者",
    hp: 56,
    maxHp: 56,
    energy: 28,
    maxEnergy: 28,
    attack: 10,
    defense: 5,
    level: 1,
    xp: 0,
    skillRank: 1,
    corruption: 0,
    retired: false,
    inventory: ["旧日盾徽"],
  },
];
export const INITIAL_NPCS: Npc[] = [
  {
    ...makeStats(),
    id: "king",
    name: "国王 · 奥德里克",
    hp: 38,
    maxHp: 38,
    attack: 8,
    defense: 2,
    location: "throne",
    relation: "neutral",
    goal: "守住王权，等待午后的议会。",
    knowledge: "尚不知道王子的刺杀计划。",
    corruption: 0,
  },
  {
    ...makeStats(),
    id: "prince",
    name: "王子 · 卡西安",
    hp: 50,
    maxHp: 50,
    attack: 12,
    defense: 3,
    location: "archive",
    relation: "neutral",
    goal: "正午刺杀国王，继承王座。",
    knowledge: "相信王座能够使王国重获自由。",
    corruption: 0,
  },
  {
    ...makeStats(),
    id: "sentinel",
    name: "界隙守卫",
    hp: 30,
    maxHp: 30,
    attack: 9,
    defense: 2,
    location: "rift",
    relation: "neutral",
    goal: "阻挡未经试炼的访客。",
    knowledge: "只接受灵境的能量契约。",
    corruption: 0,
  },
];
export const SKILLS = {
  ranger: "贯穿箭",
  mage: "余烬爆裂",
  warden: "誓约重击",
};
export const ITEMS: Record<string, string> = {
  灰木长弓: "初始装备 · 攻击已计入基础属性",
  余烬法杖: "初始装备 · 攻击已计入基础属性",
  旧日盾徽: "初始装备 · 防御已计入基础属性",
  王室印记: "跨剧本道具 · 纪念物，不提供额外属性",
  灵境结晶: "跨剧本道具 · 纪念物，不提供额外属性",
};

export const WEAPONS: Record<string, { power: number }> = {
  ...Object.fromEntries(
    CAMPAIGN_ITEMS.filter((item) => item.power).map((item) => [
      item.name,
      { power: item.power! },
    ]),
  ),
  旅人短刀: { power: 3 },
  毛笔铁尺: { power: 2 },
  旧制长枪: { power: 4 },
  灰木长弓: { power: 8 },
  铁剑: { power: 10 },
  余烬法杖: { power: 11 },
  旧日盾徽: { power: 6 },
};
export const GROUND_ITEMS = [
  {
    ...makeStats(),
    id: "iron-sword",
    name: "铁剑",
    location: "smithy",
    description: "铁匠为旅者准备的武器 · 拾取后可装备",
  },
  {
    ...makeStats(),
    id: "herb",
    name: "药草",
    location: "shop",
    description: "店主赠送的试用装 · 使用恢复 16 生命",
  },
] as const;
export const TOWN_NPCS: Npc[] = [
  {
    ...makeStats(),
    id: "smith",
    name: "铁匠 · 布兰",
    hp: 45,
    maxHp: 45,
    attack: 9,
    defense: 3,
    location: "smithy",
    relation: "neutral",
    corruption: 0,
    goal: "守好铁匠铺，帮旅者挑选装备。",
    knowledge: "知道柜台上的铁剑是赠给旅者的，王座的秘密并不清楚。",
  },
  {
    ...makeStats(),
    id: "merchant",
    name: "店主 · 米拉",
    hp: 28,
    maxHp: 28,
    attack: 5,
    defense: 1,
    location: "shop",
    relation: "neutral",
    corruption: 0,
    goal: "照顾商店，向旅者介绍药草。",
    knowledge: "知道药草能恢复生命，也听说书库收藏着古老秘典。没有其他现货。",
  },
];
export function heldWeapon(hero: Hero) {
  return hero.weapon ?? "拳头";
}

export function skillName(world: World, id: HeroId) {
  return world.campaign
    ? { ranger: "逐风斩", mage: "衡光诀", warden: "守阵击" }[id]
    : SKILLS[id];
}
