import { makeStats } from "./stats";
import type { Archetype } from "./stats";
import type { HeroId, LocationId, Npc, NpcId, World } from "./types";

export interface City {
  id: string;
  name: string;
  ruler: string;
  title: string;
  belief: string;
  history: string;
  specialty: string;
  level: number;
  towns: [string, string, string][];
}
export const CITIES: City[] = [
  {
    id: "capital",
    name: "承天城",
    ruler: "萧承晟",
    title: "昭帝",
    belief: "不让任何一门独占江山",
    history:
      "昭帝病危，传位诏书被分封九地的印玺制度锁住。七日后的登阙议会将决定谁执掌中枢。",
    specialty: "诏令与旧档",
    level: 1,
    towns: [
      ["白桥镇", "驿运", "军邮被换成了空白封套"],
      ["稻门镇", "皇粮", "去年的灾粮从账册中消失"],
      ["铜鼓镇", "铸币", "官钱混入了异地铜料"],
      ["清渠镇", "水利", "引水闸的工钱被截留"],
      ["松陵镇", "礼制", "先太子的祭册缺了一页"],
    ],
  },
  {
    id: "north",
    name: "朔宁城",
    ruler: "萧衡",
    title: "长子 · 宁王",
    belief: "以边军守住秩序",
    history:
      "宁王独守北境十年，战功最多，粮饷也欠得最多。他承诺禁军不得干预民政。",
    specialty: "军械",
    level: 2,
    towns: [
      ["雪砧镇", "锻造", "军甲交付后始终未收到银钱"],
      ["长烽镇", "烽燧", "边境警讯在朝廷被压下"],
      ["鹿原镇", "牧马", "战马被借走，牧民只得到空契"],
      ["寒井镇", "矿业", "封矿救灾与赶工军令冲突"],
      ["雁回镇", "戍屯", "退伍者没有拿到安置田"],
    ],
  },
  {
    id: "river",
    name: "临川城",
    ruler: "萧澄",
    title: "次子 · 澄王",
    belief: "让漕运养活百姓",
    history: "澄王把漕运交给商会以换取税银，商会如今要求赦免一笔沉船旧案。",
    specialty: "舟行",
    level: 2,
    towns: [
      ["渡月镇", "渡运", "一艘赈济船沉在浅滩"],
      ["芦汀镇", "织席", "官府采购价十年未变"],
      ["浮梁镇", "桥工", "过桥税被两家重复征收"],
      ["南埠镇", "仓储", "封存粮仓夜里仍有人进出"],
      ["鱼灯镇", "渔业", "禁渔令只约束小船"],
    ],
  },
  {
    id: "east",
    name: "东陵城",
    ruler: "萧瑾",
    title: "三子 · 瑾王",
    belief: "重立学校与文官选举",
    history: "瑾王主张以考选取代门阀世袭，但他的老师曾参与三年前的科场舞弊。",
    specialty: "典籍",
    level: 3,
    towns: [
      ["书溪镇", "造纸", "官卷被偷换为粗纸"],
      ["竹隐镇", "讲学", "寒门学生的名额被顶替"],
      ["墨池镇", "制墨", "贡墨案牵连无辜工匠"],
      ["石经镇", "刻书", "一部史书被命令销毁"],
      ["兰亭镇", "文会", "失踪的证人留下半首诗"],
    ],
  },
  {
    id: "west",
    name: "西陇城",
    ruler: "萧铮",
    title: "四子 · 陇王",
    belief: "军功决定继承，不靠血缘先后",
    history:
      "陇王在西路立下战功，却用严苛军法控制矿区。他怀疑皇城伪造了他的败报。",
    specialty: "重兵",
    level: 3,
    towns: [
      ["赤炉镇", "冶铁", "炉户被迫替战损填账"],
      ["石峡镇", "关防", "商队的通关凭证失效"],
      ["砺锋镇", "制刃", "流入黑市的刀带有王印"],
      ["黑石镇", "采矿", "矿难的死者人数被隐去"],
      ["孤堡镇", "军屯", "守军与逃荒者争夺水井"],
    ],
  },
  {
    id: "south",
    name: "南泽城",
    ruler: "萧岚",
    title: "五子 · 泽王",
    belief: "先赈灾，再谈皇位",
    history:
      "泽王开仓救了三郡，储粮因此见底。仁名背后，是一份向盐商借下的高息契约。",
    specialty: "医药",
    level: 2,
    towns: [
      ["药溪镇", "药圃", "救命药被改列为贡品"],
      ["莲浦镇", "水田", "洪水冲毁田界却没人重丈"],
      ["青禾镇", "农耕", "种粮与税粮共用一个仓"],
      ["白鹭镇", "堤防", "堤工发现了空心石基"],
      ["温泉镇", "疗养", "义诊名额被豪户占据"],
    ],
  },
  {
    id: "sea",
    name: "沧海城",
    ruler: "萧珩",
    title: "六子 · 海王",
    belief: "开港通商，换取新秩序",
    history:
      "海王拥有最富庶的港口和最薄弱的陆军。支持他的船主正秘密与另一位王爵交易。",
    specialty: "海贸",
    level: 4,
    towns: [
      ["盐湾镇", "晒盐", "私盐案的主使另有其人"],
      ["星港镇", "航海", "归航船带回矛盾的海图"],
      ["贝洲镇", "采珠", "采珠户被债契束缚"],
      ["风帆镇", "制帆", "官船订单挤走民船修理"],
      ["潮门镇", "海防", "海盗使用官制火药"],
    ],
  },
  {
    id: "mountain",
    name: "云岫城",
    ruler: "萧玄",
    title: "七子 · 玄王",
    belief: "以天象与信约安定人心",
    history: "玄王掌管祭祀与山地隘道。所谓天命石上，旧刻痕与最新神谕并不一致。",
    specialty: "秘术",
    level: 4,
    towns: [
      ["观星镇", "历算", "新历书提前写下了凶日"],
      ["灵泉镇", "泉祭", "祭司封住了百姓水源"],
      ["松隐镇", "香料", "贡香配方里混入迷药"],
      ["云阶镇", "山运", "失足脚夫的抚恤无人认领"],
      ["镜湖镇", "祠学", "湖底石碑出现旧朝文字"],
    ],
  },
  {
    id: "forest",
    name: "青梧城",
    ruler: "萧朔",
    title: "八子 · 梧王",
    belief: "削弱旧贵族，保护边地聚落",
    history:
      "梧王收容流民，也接纳了被朝廷追缉的人。他的联盟依赖一桩尚未揭开的灭村旧案。",
    specialty: "弓猎",
    level: 3,
    towns: [
      ["林隅镇", "伐木", "山林租约被官府重写"],
      ["猎风镇", "猎作", "兽群迁徙挤压猎民生计"],
      ["青藤镇", "藤编", "流民被行会拒之门外"],
      ["木河镇", "放排", "断裂木排冲毁了农田"],
      ["鸣雀镇", "驯鸟", "信鸟带回一枚追捕令"],
    ],
  },
  {
    id: "desert",
    name: "流沙城",
    ruler: "萧奕",
    title: "九子 · 奕王",
    belief: "把被遗忘的边地带回朝堂",
    history:
      "幼子奕王被远封商路尽头。他知道失踪先太子最后一封信的下落，却没有足够盟友保住它。",
    specialty: "商路",
    level: 5,
    towns: [
      ["月牙镇", "泉贸", "井水被迫按人头收费"],
      ["驼铃镇", "行商", "商路税单出现重复王印"],
      ["玉关镇", "玉石", "贡玉车队带走了一名证人"],
      ["流火镇", "窑业", "窑户被征用烧制密封陶匣"],
      ["望归镇", "客栈", "二十年前的客簿被人高价收购"],
    ],
  },
];
export const BUILDINGS = [
  ["square", "集市口", "人声从街道尽头传来", "里正"],
  ["inn", "客栈", "风里有饭香与柴火味", "掌柜"],
  ["smith", "铁匠铺", "巷内传来有节奏的锻铁声", "铁匠"],
  ["market", "杂货铺", "有人在门廊下整理货篓", "货商"],
  ["clinic", "医馆", "一缕药香穿过窄巷", "医师"],
  ["school", "书院", "墙内传来读书声", "教习"],
  ["shrine", "祠堂", "旧树后响起一声钟磬", "守祠人"],
  ["watch", "巡检所", "石阶旁立着一杆卷起的旗", "巡检"],
  ["homes", "民居", "街角飘出晚炊的烟", "居民"],
  ["wilds", "郊野", "篱笆外的草丛留下野兽足迹", "兽群"],
] as const;
export interface CampaignPlace {
  id: LocationId;
  name: string;
  subtitle: string;
  description: string;
  x: number;
  y: number;
  city: string;
  town?: string;
  building: string;
  level: number;
}
export interface CampaignRoad {
  from: LocationId;
  to: LocationId;
  minutes: number;
  distance: number;
  clue: string;
}
export interface RegionalItem {
  id: string;
  name: string;
  location: LocationId;
  description: string;
  power?: number;
  heal?: number;
  price?: number;
}
export interface RegionalSkill {
  id: string;
  name: string;
  city: string;
  location: LocationId;
  kind: "attack" | "heal";
  bonus: number;
  energy: number;
  level: number;
  description: string;
}
export const CAMPAIGN_PLACES: Record<string, CampaignPlace> = {};
export const CAMPAIGN_ROADS: CampaignRoad[] = [];
export const CAMPAIGN_ITEMS: RegionalItem[] = [];
export const REGIONAL_SKILLS: RegionalSkill[] = [];
const initialNpcs: Npc[] = [];
const surnames = ["周", "林", "许", "苏", "陈", "顾", "乔", "杜", "孟", "唐"];
const given = [
  "清禾",
  "知远",
  "如晦",
  "行舟",
  "闻溪",
  "照野",
  "停云",
  "怀瑾",
  "白露",
  "守拙",
];
const secrets = [
  "免去灾户欠税",
  "让家人安全团聚",
  "找回失踪的账册",
  "守住行会的独立",
  "偿还救命的旧债",
];
const weaponNames = [
  "禁卫短剑",
  "朔风长枪",
  "断水刀",
  "青简铁尺",
  "砺锋重剑",
  "药师竹杖",
  "潮鸣弯刀",
  "观星杖",
  "猎风弓",
  "流沙双刃",
];
const skillNames = [
  "定心诀",
  "破阵枪",
  "回流步",
  "明镜术",
  "断甲斩",
  "回春术",
  "潮汐击",
  "星火诀",
  "穿林箭",
  "砂影袭",
];
function addRoad(
  from: LocationId,
  to: LocationId,
  minutes: number,
  clue: string,
) {
  CAMPAIGN_ROADS.push({ from, to, minutes, distance: minutes * 70, clue });
}
function person(
  id: NpcId,
  name: string,
  location: LocationId,
  level: number,
  role: Archetype,
  city: City,
  background: string,
  goal: string,
): Npc {
  return {
    ...makeStats(level, role),
    id,
    name,
    location,
    archetype: role,
    relation: "neutral",
    affinity: 0,
    kind: "person",
    faction: city.title,
    background,
    goal,
    knowledge: `${background}。你只知道本地已发生的事情，不能代替玩家完成交易、学习或任务。`,
    relationships: [{target: `n-${city.id}-royal`, bond: "辖境之主；关注其施政承诺"}],
  };
}
CITIES.forEach((city, ci) => {
  const center = `s-${city.id}-center` as LocationId;
  for (const [bi, [building, name, clue, job]] of BUILDINGS.entries()) {
    if (
      !["square", "inn", "market", "school", "shrine", "watch"].includes(
        building,
      )
    )
      continue;
    const id =
      building === "square"
        ? center
        : (`s-${city.id}-${building}` as LocationId);
    CAMPAIGN_PLACES[id] = {
      id,
      name: building === "square" ? city.name : `${city.name}·${name}`,
      subtitle: city.title,
      description: `${city.history} 此处是${name}，${city.specialty}的消息沿街流转。`,
      city: city.id,
      building,
      level: city.level,
      x: ci * 10 + bi,
      y: 0,
    };
    if (id !== center) addRoad(center, id, 3, clue);
    const nid = `n-${city.id}-${building}` as NpcId;
    initialNpcs.push(
      person(
        nid,
        `${surnames[ci]}${given[bi]} · ${job}`,
        id,
        city.level,
        building === "watch" ? "guard" : "civilian",
        city,
        `在${city.name}生活二十年，亲历${city.specialty}兴衰，仍记得旧朝救济他的恩情`,
        city.belief,
      ),
    );
  }
  const palace = `s-${city.id}-palace` as LocationId;
  CAMPAIGN_PLACES[palace] = {
    id: palace,
    name: ci ? `${city.title.split(" · ")[1]}府` : "承天宫",
    subtitle: "权力与旧事",
    description: `${city.history} 案头的封存文书等待调查。`,
    city: city.id,
    building: "palace",
    level: city.level + 3,
    x: ci * 10 + 4,
    y: -2,
  };
  addRoad(center, palace, 5, "高墙后的仪门旁有人守候");
  const royal = person(
    `n-${city.id}-royal`,
    city.ruler,
    palace,
    ci ? 8 + Math.floor(ci / 3) : 12,
    "guard",
    city,
    city.history,
    city.belief,
  );
  royal.relationships = ci
    ? [
        { target: "n-capital-royal", bond: "父皇；等候传位诏书" },
        {
          target: `n-${CITIES[ci === 9 ? 1 : ci + 1].id}-royal`,
          bond:
            ci % 2 ? "政见对手，争取同一批官员" : "有借粮旧约，也有继承权之争",
        },
      ]
    : CITIES.slice(1).map((c) => ({
        target: `n-${c.id}-royal` as NpcId,
        bond: "受封的皇子；尚未指定继承人",
      }));
  initialNpcs.push(royal);
  city.towns.forEach(([townName, trade, wound], ti) => {
    const town = `${city.id}-${ti}`,
      square = `s-${town}-square` as LocationId;
    BUILDINGS.forEach(([building, name, clue, job], bi) => {
      const id = `s-${town}-${building}` as LocationId;
      CAMPAIGN_PLACES[id] = {
        id,
        name: `${townName}·${name}`,
        subtitle: trade,
        description: `${townName}以${trade}为生。${wound}。${building === "wilds" ? "失去栖地的兽群在此游荡。" : `${name}仍按自己的节奏运转，争储的消息已经改变了这里的人情往来。`}`,
        city: city.id,
        town,
        building,
        level: city.level + (building === "wilds" ? 1 : 0),
        x: ti * 12 + Math.cos(bi * 0.65) * 4,
        y: Math.sin(bi * 0.65) * 4,
      };
      if (bi) addRoad(square, id, building === "wilds" ? 12 : 2, clue);
      const nid = `n-${town}-${building}` as NpcId;
      const npc = person(
        nid,
        building === "wilds"
          ? `${townName}·失巢山兽`
          : `${surnames[(ci + ti) % 10]}${given[(bi + ti) % 10]} · ${job}`,
        id,
        city.level + (building === "wilds" ? 1 : 0),
        building === "wilds"
          ? "beast"
          : building === "watch"
            ? "guard"
            : building === "school"
              ? "scholar"
              : "civilian",
        city,
        `${townName}的${job}，曾因${wound}失去积蓄；如今靠${trade}维持生计`,
        secrets[(ci + ti + bi) % 5],
      );
      npc.relationships = [
        {
          target: `n-${town}-${BUILDINGS[(bi + 1) % 9][0]}`,
          bond: bi % 2 ? "旧友；曾为对方担保" : "债务牵连；仍希望和解",
        },
        { target: `n-${city.id}-royal`, bond: "辖境王爵；民生承诺尚未兑现" },
      ];
      if (building === "wilds") {
        npc.relationships = [{target:`n-${town}-watch`,bond:"被巡检驱逐，保护自己的巢穴"},{target:`n-${town}-homes`,bond:"栖地相邻，饥饿时争夺食物"}];
        npc.kind = "monster";
        npc.relation = "hostile";
        npc.affinity = -80;
        npc.background = `因${trade}扩张失去栖地的山兽，饥饿使它开始袭击道路。`;
        npc.goal = "保住巢穴，驱离闯入者";
      }
      initialNpcs.push(npc);
      if (building === "market")
        CAMPAIGN_ITEMS.push({
          id: `herb-${town}`,
          name: "药草",
          location: id,
          heal: 16,
          price: 5,
          description: "当地采集的疗伤药草，使用后恢复最多 16 HP。",
        });
      if (building === "smith")
        CAMPAIGN_ITEMS.push({
          id: `weapon-${city.id}${ti ? `-${ti}` : ""}`,
          name: weaponNames[ci],
          location: id,
          power: 4 + city.level,
          price: 12 + city.level * 3,
          description: `${city.specialty}工艺制成，装备后提高攻击。`,
        });
    });
    addRoad(
      center,
      square,
      25 + ti * 9,
      `一条${["沿河", "穿过田垄", "绕过山坡", "经过旧驿亭", "顺着林缘"][ti]}的官道通往远处的聚落`,
    );
  });
  REGIONAL_SKILLS.push({
    id: `art-${city.id}`,
    name: skillNames[ci],
    city: city.id,
    location: `s-${city.id}-0-school`,
    kind: ci === 0 || ci === 5 ? "heal" : "attack",
    bonus: ci === 5 ? 12 : ci === 0 ? 7 : 7 + city.level,
    energy: ci === 5 ? 10 : 8,
    level: Math.max(1, city.level - 1),
    description: `在本地书院传授的${city.specialty}技艺。`,
  });
  if (ci)
    addRoad(
      "s-capital-center",
      center,
      100 + ci * 17,
      `第${ci}条远行驿道，路标已被风沙磨去，仍有商旅足迹`,
    );
});
export const HERO_ORIGINS: Record<
  HeroId,
  {
    name: string;
    title: string;
    archetype: Archetype;
    background: string;
    start: LocationId;
    weapon: string;
  }
> = {
  ranger: {
    name: "沈砚",
    title: "驿路信使",
    archetype: "wanderer",
    background:
      "你在白桥驿长大。养父因一封被调换的军邮获罪，你带着他的旧邮牌回乡，想找到那封失踪的诏书。你不属于任何王爵。",
    start: "s-capital-0-square",
    weapon: "旅人短刀",
  },
  mage: {
    name: "陆微",
    title: "司天学徒",
    archetype: "scholar",
    background:
      "你出身医户，被司天台收为学徒。老师因反对伪造天象而失踪，留下九份彼此矛盾的星历。你决定从家乡药圃查起。",
    start: "s-south-0-square",
    weapon: "毛笔铁尺",
  },
  warden: {
    name: "裴照",
    title: "离籍禁卫",
    archetype: "guard",
    background:
      "你曾守卫先太子的书房。灭口军令下达的那夜，你放走了一名证人，也因此被削去军籍。北境欠饷的旧同袍，是你仅剩的人脉。",
    start: "s-north-0-square",
    weapon: "旧制长枪",
  },
};
export function createSuccession(
  seed: number,
  actor: HeroId = "ranger",
): World {
  const origin = HERO_ORIGINS[actor],
    npcs = structuredClone(initialNpcs);
  const friend = npcs.find((n) => n.location === origin.start)!;
  friend.relation = "ally";
  friend.affinity = 55;
  friend.background += `。你与${origin.name}自幼相识，愿意替其作保。`;
  return {
    schemaVersion: 1,
    rulesVersion: "0.1.0",
    campaign: "succession-v1",
    initialHero: actor,
    seed,
    rng: seed >>> 0,
    mapVersion: 1,
    initialMapVersion: 1,
    scenario: "succession",
    location: origin.start,
    minute: 480,
    revision: 0,
    playerId: actor,
    heroes: [
      {
        ...makeStats(1, origin.archetype),
        id: actor,
        name: origin.name,
        title: origin.title,
        archetype: origin.archetype,
        background: origin.background,
        retired: false,
        inventory: [origin.weapon, "药草"],
        weapon: origin.weapon,
        skills: [],
        gold: 30,
      },
    ],
    npcs,
    flags: {
      lore: false,
      kingKiller: null,
      deathNewsAt: null,
      throneOwner: null,
      resolved: false,
      spiritReward: false,
    },
    collected: [],
    history: [],
    exploration: { visited: [origin.start], inspected: [], events: [] },
    journal: [
      {
        id: 1,
        minute: 480,
        title: "九阙争衡 · 序章",
        text: `${origin.background} 七日后，皇城将召开登阙议会。你要寻访九地的封存文书，带着至少三份证据决定支持谁，或者继续追查。眼下，你只认得脚下这片街口。`,
        tone: "story",
        location: origin.start,
      },
    ],
  };
}
export const CAMPAIGN_NPC_IDS = new Set(initialNpcs.map((n) => n.id));
export function campaignNeighbors(id: LocationId) {
  return CAMPAIGN_ROADS.filter((r) => r.from === id || r.to === id).map(
    (r) => ({ ...r, destination: r.from === id ? r.to : r.from }),
  );
}
export function campaignRoad(from: LocationId, to: LocationId) {
  return campaignNeighbors(from).find((r) => r.destination === to);
}
export function factionName(id: string) {
  return CITIES.find((c) => c.id === id)?.title ?? id;
}
