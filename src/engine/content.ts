import type { Hero, LocationId, Npc, ScenarioId } from "./types";
export const RULES_VERSION = "0.1.0" as const;
export const LOCATIONS: Record<
  LocationId,
  { name: string; subtitle: string; description: string; x: number; y: number }
> = {
  courtyard: {
    name: "灰石庭院",
    subtitle: "THE ASHEN COURT",
    description: "钟声穿过空旷的庭院。王城仍在沉睡，但每一个人的计划都在继续。",
    x: 30,
    y: 69,
  },
  archive: {
    name: "秘典书库",
    subtitle: "THE SILENT ARCHIVE",
    description:
      "尘封的卷轴记载着王座的代价。王子独自站在窗边，手里的信尚未寄出。",
    x: 25,
    y: 28,
  },
  throne: {
    name: "荆棘王座",
    subtitle: "THE THORN THRONE",
    description:
      "高窗投下最后的天光。王冠之下，一个古老的意志正在等待新的容器。",
    x: 68,
    y: 33,
  },
  rift: {
    name: "界隙之门",
    subtitle: "THE WORLD BETWEEN",
    description:
      "石环里浮现出另一个世界。随身物品得以保留，力量却必须遵守彼岸的规则。",
    x: 76,
    y: 78,
  },
};
export const SCENARIOS: Record<
  ScenarioId,
  { name: string; subtitle: string; energy: string; color: string }
> = {
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
