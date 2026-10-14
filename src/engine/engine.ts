import {
  ENERGY_COST,
  GROUND_ITEMS,
  TOWN_NPCS,
  WEAPONS,
  heldWeapon,
  INITIAL_HEROES,
  INITIAL_NPCS,
  LOCATIONS,
  RULES_VERSION,
  SKILLS,
} from "./content";
import type {
  Command,
  Hero,
  JournalEntry,
  Npc,
  ReplayFile,
  World,
} from "./types";

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
function log(
  w: World,
  title: string,
  text: string,
  tone: JournalEntry["tone"] = "story",
  formula?: string,
) {
  w.journal.push({
    id: w.journal.length + 1,
    minute: w.minute,
    title,
    text,
    tone,
    location: w.location,
    ...(formula ? { formula } : {}),
  });
}
export function createWorld(seed = 14026): World {
  const w: World = {
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    seed,
    rng: seed >>> 0,
    revision: 0,
    scenario: "crown",
    location: "courtyard",
    minute: 480,
    heroes: structuredClone(INITIAL_HEROES),
    npcs: structuredClone(INITIAL_NPCS),
    flags: {
      lore: false,
      kingKiller: null,
      deathNewsAt: null,
      throneOwner: null,
      resolved: false,
      spiritReward: false,
    },
    journal: [],
    history: [],
  };
  log(
    w,
    "故事由此展开",
    "你们抵达灰石庭院。传闻王子将在正午行动。探索书库、赶往王座，或任由时间流逝——选择属于你们。",
  );
  return w;
}
function roll(w: World) {
  w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
  return (w.rng % 6) + 1;
}
export function clockText(minute: number) {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function dayText(minute: number) {
  return `第 ${Math.floor(minute / 1440) + 1} 日`;
}
export function activeNpcs(w: World): Npc[] {
  return w.npcs.filter(
    (n) =>
      n.hp > 0 &&
      n.location === w.location &&
      (w.scenario === "spirit" ? n.id === "sentinel" : n.id !== "sentinel"),
  );
}
function award(w: World, amount: number) {
  for (const h of w.heroes.filter((h) => !h.retired)) {
    h.xp += amount;
    while (h.xp >= h.level * 30) {
      h.xp -= h.level * 30;
      h.level++;
      h.maxHp += 6;
      h.hp = Math.min(h.maxHp, h.hp + 6);
      h.attack += 2;
      h.maxEnergy += 4;
      h.energy = Math.min(h.maxEnergy, h.energy + 4);
      log(
        w,
        `${h.name}升至 Lv.${h.level}`,
        "生命上限 +6，攻击 +2，能量上限 +4。现在可以提升技能等级。",
        "system",
      );
    }
  }
}
function kingDies(w: World, killer: string) {
  w.flags.kingKiller = killer;
  w.flags.deathNewsAt = w.minute + 30;
  log(
    w,
    "王权出现了空缺",
    "国王已死。消息将在 30 分钟后传到王子耳中；他的下一步取决于此刻的王座归属。",
    "world",
  );
}
function finishEnemy(w: World, target: Npc, hero: Hero) {
  log(
    w,
    `${target.name}倒下了`,
    w.playerId
      ? "战斗结束。你获得 30 经验。"
      : "战斗结束。小队每人获得 30 经验。",
    "combat",
  );
  award(w, 30);
  if (target.id === "king") {
    hero.inventory.push("王室印记");
    kingDies(w, hero.name);
  }
  if (target.id === "sentinel") {
    w.flags.spiritReward = true;
    hero.inventory.push("灵境结晶");
    log(
      w,
      "灵境试炼完成",
      "灵境结晶已收入行囊。角色、等级和物品都可以带回王城。",
      "world",
    );
  }
  if (
    target.id === "fallen" ||
    (target.id === "prince" && target.corruption >= 100)
  ) {
    w.flags.resolved = true;
    w.flags.throneOwner = null;
    log(
      w,
      "王座的低语归于沉寂",
      "你们终结了被王座支配的统治者。这个世界的结局由你们的行动写成。",
      "world",
    );
  }
  if (target.id === "prince" && w.flags.throneOwner === "prince")
    w.flags.throneOwner = null;
}
function advance(w: World, minutes: number) {
  // Minute ticks are deterministic, including distant events while the party visits another world.
  for (let i = 0; i < minutes; i++) {
    w.minute++;
    const king = w.npcs.find((n) => n.id === "king")!;
    const prince = w.npcs.find((n) => n.id === "prince")!;
    if (
      w.flags.deathNewsAt !== null &&
      w.minute >= w.flags.deathNewsAt &&
      prince.hp > 0
    ) {
      w.flags.deathNewsAt = null;
      prince.knowledge = "已得知国王死亡，并确认了王座的危险。";
      if (w.flags.kingKiller !== "prince") {
        prince.relation = "ally";
        prince.location = "throne";
        prince.goal = "放弃刺杀，协助旅者终结王座诅咒。";
        log(
          w,
          "王子的计划发生改变",
          "死讯抵达。原定刺杀失去目标，卡西安转而协助你们对抗王座的腐蚀。",
          "world",
        );
      }
    }
    if (w.minute >= 720 && king.hp > 0 && prince.hp > 0 && !w.flags.resolved) {
      king.hp = 0;
      prince.location = "throne";
      w.flags.throneOwner = "prince";
      prince.corruption = 40;
      prince.goal = "以王座的力量重建王国。";
      prince.knowledge = "已刺杀国王，低估了王座的腐蚀。";
      kingDies(w, "prince");
      log(
        w,
        "正午 · 王子登上王座",
        "无人阻止的计划成为现实。王子杀死国王，戴上王冠。王座的腐蚀开始累积。",
        "world",
      );
    }
    if (
      w.minute > 720 &&
      w.minute % 30 === 0 &&
      w.flags.throneOwner === "prince" &&
      prince.hp > 0 &&
      prince.corruption < 100
    ) {
      prince.corruption = Math.min(100, prince.corruption + 10);
      if (prince.corruption === 100) {
        prince.relation = "hostile";
        prince.attack = 17;
        prince.goal = "消灭所有威胁王权的人。";
        log(
          w,
          "卡西安被王座吞噬",
          "腐蚀达到 100。王子成为敌对首领，正在荆棘王座等待你们。",
          "world",
        );
      }
    }
  }
}
export function execute(previous: World, command: Command): World {
  validateCommand(command);
  requireRule(
    !previous.history.some((c) => c.id === command.id),
    "这条行动已经结算，请勿重复提交。",
  );
  requireRule(
    command.expectedRevision === previous.revision,
    "世界状态已变化，请重新选择行动。",
  );
  requireRule(
    previous.history.length < 2000,
    "本次试玩已达到 2000 次行动上限，请导出记录并开始新旅程。",
  );
  const w = structuredClone(previous);
  const h = w.heroes.find((h) => h.id === command.actor);
  if (w.playerId) {
    requireRule(command.actor === w.playerId, "只能控制自己的角色。");
    requireRule(
      command.type !== "attack" && command.type !== "talk",
      "请使用当前回合的行动。",
    );
    requireRule(command.type !== "begin", "旅程已绑定角色。");
    requireRule(
      !w.turn?.queue.length || command.type === "npc_turn",
      "NPC 尚未结束回合。",
    );
  }
  requireRule(
    h && (command.type === "begin" || (!h.retired && h.hp > 0)),
    w.playerId
      ? "你的角色已无法行动。"
      : "这个角色无法行动，请选择仍然存活的小队成员。",
  );
  const hostiles = activeNpcs(w).filter((n) => n.relation === "hostile");
  let cost = 10;
  switch (command.type) {
    case "begin": {
      requireRule(
        !w.playerId && command.actor === "ranger",
        "只能以艾琳开始自己的旅程。",
      );
      w.playerId = h.id;
      h.weapon =
        h.inventory.find((item) => Object.hasOwn(WEAPONS, item)) ?? null;
      h.attack = 4 + (h.level - 1) * 2;
      w.heroes = [h];
      w.collected = [];
      w.npcs.push(...structuredClone(TOWN_NPCS));
      if (previous.revision === 0) {
        w.journal = [];
        log(
          w,
          "故事由此展开",
          "你抵达灰石庭院。王子将在正午行动。先探索这座城，还是直接前往王宫？",
        );
      }
      cost = 0;
      break;
    }
    case "strike": {
      requireRule(w.playerId, "尚未绑定玩家角色。");
      const target = activeNpcs(w).find((n) => n.id === command.target);
      requireRule(
        target && target.relation !== "ally",
        "请选择在场且可以攻击的 NPC。",
      );
      requireRule(
        !command.skill || h.energy >= ENERGY_COST.skill,
        "技能需要 8 点能量。",
      );
      if (command.skill) h.energy -= ENERGY_COST.skill;
      const power = h.attack + (h.weapon ? (WEAPONS[h.weapon]?.power ?? 0) : 0);
      const die = roll(w),
        bonus = command.skill ? 6 + h.skillRank * 2 : 0;
      const damage = Math.max(1, power + die + bonus - target.defense);
      target.hp = Math.max(0, target.hp - damage);
      target.relation = "hostile";
      log(
        w,
        command.skill
          ? `${h.name}施放${SKILLS[h.id]}`
          : `${h.name}用${heldWeapon(h)}攻击`,
        `${target.name}受到 ${damage} 点伤害。`,
        "combat",
        `${power} 攻击 + ${die} (d6) + ${bonus} 技能 − ${target.defense} 防御 = ${damage}`,
      );
      if (!target.hp) finishEnemy(w, target, h);
      break;
    }
    case "say":
      requireRule(w.playerId, "尚未绑定玩家角色。");
      requireRule(
        command.target === "narrator" ||
          activeNpcs(w).some((n) => n.id === command.target),
        "交谈对象已不在这里。",
      );
      log(w, h.name, command.text.trim(), "dialogue");
      cost = 1;
      break;
    case "equip":
      requireRule(
        w.playerId &&
          (command.weapon === null ||
            (h.inventory.includes(command.weapon) &&
              Object.hasOwn(WEAPONS, command.weapon))),
        "只能装备自己持有的武器。",
      );
      h.weapon = command.weapon;
      log(
        w,
        "更换武器",
        `你现在${h.weapon ? `手持${h.weapon}` : "空手，使用拳头攻击"}。`,
        "system",
      );
      cost = 0;
      break;
    case "take": {
      const item = GROUND_ITEMS.find((i) => i.id === command.item);
      requireRule(
        w.playerId &&
          item &&
          w.scenario === "crown" &&
          item.location === w.location &&
          !w.collected?.includes(item.id),
        "这个物品已不在这里。",
      );
      requireRule(!hostiles.length, "战斗结束后才能拾取物品。");
      h.inventory.push(item.name);
      w.collected!.push(item.id);
      log(w, `拾取${item.name}`, `${item.name}已放入你的行囊。`, "system");
      cost = 1;
      break;
    }
    case "use": {
      requireRule(
        w.playerId &&
          command.item === "药草" &&
          h.inventory.includes(command.item),
        "没有可以使用的药草。",
      );
      requireRule(h.hp < h.maxHp, "生命已满。");
      h.inventory.splice(h.inventory.indexOf(command.item), 1);
      const amount = Math.min(16, h.maxHp - h.hp);
      h.hp += amount;
      log(w, "使用药草", `恢复 ${amount} 点生命。`, "system");
      cost = 1;
      break;
    }
    case "npc_turn": {
      requireRule(
        w.playerId && w.turn?.queue[0] === command.npc,
        "NPC 回合已结束或顺序不正确。",
      );
      const turn = w.turn!;
      const npc = activeNpcs(w).find((n) => n.id === command.npc);
      requireRule(command.npc === "narrator" || npc, "NPC 已离开场景。");
      if (command.choice === "speak")
        requireRule(
          !turn.spoken && command.text.trim(),
          "本轮已经说过话，请行动或结束。",
        );
      if (turn.spoken)
        requireRule(!command.text.trim(), "本轮已经说过话，请直接行动或结束。");
      if (command.choice === "attack")
        requireRule(npc?.relation === "hostile", "只有敌对 NPC 可以攻击你。");
      if (command.text.trim())
        log(
          w,
          `${npc?.name ?? "旁白"}${command.source === "rules" ? " · 规则回应" : ""}`,
          command.text.trim(),
          "dialogue",
        );
      if (command.choice === "attack" && npc) {
        const damage = Math.max(1, npc.attack - h.defense);
        h.hp = Math.max(0, h.hp - damage);
        log(
          w,
          `${npc.name}发动攻击`,
          `你受到 ${damage} 点伤害${h.hp ? "。" : "，已倒下。旅程到此结束。"}`,
          "combat",
          `${npc.attack} 攻击 − ${h.defense} 防御 = ${damage}`,
        );
      }
      turn.steps++;
      if (command.choice !== "speak" || command.done || turn.spoken) {
        turn.queue.shift();
        turn.spoken = false;
      } else turn.spoken = true;
      requireRule(turn.steps <= 8, "NPC 回合已达到上限。");
      if (!h.hp || turn.steps === 8) turn.queue = [];
      cost = 0;
      break;
    }
    case "move":
      requireRule(Object.hasOwn(LOCATIONS, command.destination), "未知地点。");
      requireRule(
        w.scenario === "crown",
        "灵境首版只有回廊场景，使用穿越界隙返回。",
      );
      requireRule(command.destination !== w.location, "小队已经在这里了。");
      requireRule(!hostiles.length, "战斗中无法离开，请先击败当前敌人。");
      w.location = command.destination;
      cost = 30;
      log(
        w,
        w.playerId ? "启程" : "小队启程",
        `${w.playerId ? "你" : "你们"}前往${LOCATIONS[w.location].name}，路程需要 30 分钟。`,
      );
      break;
    case "attack": {
      const target = activeNpcs(w).find((n) => n.id === command.target);
      requireRule(target, "目标已不在此地，或已被击败。");
      requireRule(target.relation !== "ally", "首版不允许攻击盟友。");
      requireRule(
        !command.skill || h.energy >= ENERGY_COST.skill,
        "能量不足：技能需要 8 点能量。",
      );
      if (command.skill) h.energy -= ENERGY_COST.skill;
      const die = roll(w),
        bonus = command.skill ? 6 + h.skillRank * 2 : 0;
      const damage = Math.max(1, h.attack + die + bonus - target.defense);
      target.relation = "hostile";
      target.hp = Math.max(0, target.hp - damage);
      log(
        w,
        command.skill ? `${h.name}施放${SKILLS[h.id]}` : `${h.name}发动攻击`,
        `${target.name}受到 ${damage} 点伤害。`,
        "combat",
        `${h.attack} 攻击 + ${die} (d6) + ${bonus} 技能 − ${target.defense} 防御 = ${damage}`,
      );
      if (!target.hp) finishEnemy(w, target, h);
      else {
        const counter = Math.max(1, target.attack - h.defense);
        h.hp = Math.max(0, h.hp - counter);
        log(
          w,
          "敌人反击",
          `${h.name}受到 ${counter} 点伤害${h.hp === 0 ? "，已倒下。可以由队友治疗或在安全地休整。" : "。"}`,
          "combat",
          `${target.attack} 攻击 − ${h.defense} 防御 = ${counter}`,
        );
        const ally = w.npcs.find(
          (n) =>
            n.id === "prince" &&
            n.relation === "ally" &&
            n.hp > 0 &&
            n.location === w.location,
        );
        if (ally && target.id === "fallen") {
          target.hp = Math.max(0, target.hp - 6);
          log(
            w,
            "王子援护",
            "卡西安攻击被腐蚀的王座持有者，造成 6 点伤害。",
            "combat",
          );
          if (!target.hp) finishEnemy(w, target, h);
        }
      }
      break;
    }
    case "heal": {
      const target = w.heroes.find(
        (hero) => hero.id === command.target && !hero.retired,
      );
      requireRule(
        target && target.hp < target.maxHp,
        "请选择需要治疗的小队成员。",
      );
      requireRule(h.energy >= ENERGY_COST.heal, "治疗需要 6 点能量。");
      h.energy -= ENERGY_COST.heal;
      const amount = Math.min(16, target.maxHp - target.hp);
      target.hp += amount;
      log(
        w,
        "疗愈术",
        `${h.name}消耗 6 点能量，为${target.name}恢复 ${amount} 生命。`,
        "system",
      );
      break;
    }
    case "inspect":
      requireRule(
        w.scenario === "crown" && w.location === "archive",
        "需要先抵达秘典书库。",
      );
      requireRule(!w.flags.lore, "你们已经掌握了这份秘典。");
      w.flags.lore = true;
      award(w, 10);
      cost = 20;
      log(
        w,
        "发现 · 王座并非死物",
        `秘典记载：王座每半小时腐蚀其主人。净化需要空缺的王位、秘典知识和 12 点能量。${w.playerId ? "你" : "每位队员"}获得 10 经验。`,
        "world",
      );
      break;
    case "talk": {
      const prince = activeNpcs(w).find((n) => n.id === "prince");
      requireRule(
        prince && prince.relation !== "hostile",
        "这里没有可以交谈的王子。",
      );
      log(
        w,
        "卡西安的回答",
        prince.relation === "ally"
          ? "“我曾以为那顶王冠能救我们。现在，让我们一起结束它。”"
          : "“正午钟响之前，我还有一件必须完成的事。” 他看向王座的方向。",
      );
      break;
    }
    case "wait":
      cost = 60;
      log(
        w,
        "让时间继续",
        "小队等待一小时。远方的人物仍会执行自己的计划。",
        "system",
      );
      break;
    case "rest":
      requireRule(
        !hostiles.length &&
          (w.location === "courtyard" ||
            (w.scenario === "spirit" && w.flags.spiritReward)),
        "需要回到安全的灰石庭院，或完成灵境试炼后休整。",
      );
      for (const hero of w.heroes.filter((hero) => !hero.retired)) {
        hero.hp = Math.min(hero.maxHp, hero.hp + 20);
        hero.energy = Math.min(hero.maxEnergy, hero.energy + 12);
      }
      cost = 60;
      log(
        w,
        "篝火旁的片刻安宁",
        w.playerId
          ? "你恢复 20 生命与 12 能量。一小时过去了。"
          : "每位队员恢复 20 生命与 12 能量。一小时过去了。",
        "system",
      );
      break;
    case "claim": {
      requireRule(
        w.scenario === "crown" && w.location === "throne",
        "需要抵达荆棘王座。",
      );
      requireRule(
        !w.flags.resolved &&
          !w.flags.throneOwner &&
          w.npcs.find((n) => n.id === "king")!.hp === 0,
        "需要一个尚未净化、无人占据的王座。",
      );
      requireRule(
        w.playerId ||
          w.heroes.filter((hero) => !hero.retired && hero.hp > 0).length > 1,
        "需要至少一名仍能行动的队友来继续旅程。",
      );
      h.retired = true;
      h.corruption = 100;
      w.flags.throneOwner = h.id;
      w.npcs.push({
        id: "fallen",
        name: `堕落者 · ${h.name}`,
        hp: h.maxHp + 20,
        maxHp: h.maxHp + 20,
        attack: h.attack + 4,
        defense: h.defense,
        location: "throne",
        relation: "hostile",
        goal: "占据王座，清除一切威胁。",
        knowledge: "已主动接受王座的全部力量。",
        corruption: 100,
      });
      log(
        w,
        "一位旅者成为新的敌人",
        `${h.name}接受王座意志，退出可控小队并成为敌对首领。其他队员继续旅程；得知死讯后的王子将协助他们。`,
        "world",
      );
      break;
    }
    case "cleanse":
      requireRule(
        w.scenario === "crown" &&
          w.location === "throne" &&
          !w.flags.resolved &&
          !w.flags.throneOwner &&
          w.npcs.find((n) => n.id === "king")!.hp === 0 &&
          w.flags.lore,
        "净化需要：荆棘王座、国王死亡、空缺的王位，以及书库秘典。",
      );
      requireRule(h.energy >= ENERGY_COST.cleanse, "净化需要 12 点能量。");
      h.energy -= ENERGY_COST.cleanse;
      w.flags.resolved = true;
      award(w, 30);
      log(
        w,
        "结局 · 无人加冕",
        "你们切断了王座与世界的联系。没有新的统治者，也没有命中注定的最终敌人。",
        "world",
      );
      break;
    case "upgrade":
      requireRule(h.skillRank < h.level, "需要提升角色等级后才能升级技能。");
      h.skillRank++;
      cost = 0;
      log(
        w,
        "技能提升",
        `${h.name}的${SKILLS[h.id]}达到 ${h.skillRank} 级，技能伤害加成提升 2。`,
        "system",
      );
      break;
    case "convert": {
      requireRule(w.location === "rift", "能量转换需要抵达界隙之门。");
      requireRule(!hostiles.length, "战斗中无法进行能量转换。");
      requireRule(h.energy >= 10, "转换试验需要至少 10 点能量。");
      h.energy -= ENERGY_COST.convert;
      cost = 0;
      log(
        w,
        "能量往返转换",
        "10 单位原生能量 → 7 单位异域能量 → 4 单位原生能量。角色净损耗 6，无循环增益。",
        "system",
        "floor(floor(10 × 0.7) × 0.7) = 4",
      );
      break;
    }
    case "travel":
      requireRule(
        w.location === "rift" && !hostiles.length,
        "需要抵达界隙之门，且不处于战斗中。",
      );
      w.scenario = w.scenario === "crown" ? "spirit" : "crown";
      for (const hero of w.heroes.filter((hero) => !hero.retired))
        hero.energy = Math.floor(hero.energy * 0.7);
      if (w.scenario === "spirit")
        w.npcs.find((n) => n.id === "sentinel")!.relation = "hostile";
      cost = 30;
      log(
        w,
        "穿越世界边界",
        `${w.playerId ? "你" : "小队"}进入${w.scenario === "spirit" ? "灵境回廊" : "王座余烬"}。等级与物品保留；每人的当前能量按 70% 转换并向下取整，上限保持不变。`,
        "world",
      );
      break;
  }
  advance(w, cost);
  if (
    w.playerId &&
    command.type !== "npc_turn" &&
    command.type !== "begin" &&
    h.hp > 0 &&
    !h.retired
  ) {
    const queue = activeNpcs(w).map((n) => n.id);
    if (command.type === "say" && command.target !== "narrator") {
      const index = queue.indexOf(command.target);
      if (index > 0) queue.unshift(...queue.splice(index, 1));
    }
    w.turn = {
      queue: queue.length ? queue : ["narrator"],
      spoken: false,
      steps: 0,
    };
  }
  w.revision++;
  w.history.push(structuredClone(command));
  return w;
}
export function toReplay(w: World): ReplayFile {
  return {
    format: "big-building-replay",
    version: 1,
    seed: w.seed,
    commands: w.history,
  };
}
export function validateCommand(raw: unknown): asserts raw is Command {
  requireRule(typeof raw === "object" && raw !== null, "行动格式错误。");
  const c = raw as Record<string, unknown>;
  requireRule(
    typeof c.id === "string" &&
      c.id.length > 0 &&
      c.id.length <= 100 &&
      Number.isInteger(c.expectedRevision) &&
      Number(c.expectedRevision) >= 0,
    "行动标识错误。",
  );
  requireRule(
    ["ranger", "mage", "warden"].includes(String(c.actor)),
    "角色标识错误。",
  );
  const fields: Record<string, string[]> = {
    begin: [],
    strike: ["target", "skill"],
    say: ["target", "text"],
    equip: ["weapon"],
    take: ["item"],
    use: ["item"],
    npc_turn: ["npc", "choice", "text", "done", "source"],
    move: ["destination"],
    attack: ["target", "skill"],
    heal: ["target"],
    inspect: [],
    talk: [],
    wait: [],
    rest: [],
    claim: [],
    cleanse: [],
    upgrade: [],
    convert: [],
    travel: [],
  };
  requireRule(
    typeof c.type === "string" && Object.hasOwn(fields, c.type),
    "未知的行动类型。",
  );
  requireRule(
    Object.keys(c).every((key) =>
      [
        "id",
        "expectedRevision",
        "actor",
        "type",
        ...fields[c.type as string],
      ].includes(key),
    ),
    "行动包含不支持的参数。",
  );
  if (c.type === "move")
    requireRule(
      typeof c.destination === "string" &&
        Object.hasOwn(LOCATIONS, c.destination),
      "未知地点。",
    );
  if (c.type === "attack" || c.type === "strike")
    requireRule(
      typeof c.skill === "boolean" &&
        ["king", "prince", "sentinel", "fallen", "smith", "merchant"].includes(
          String(c.target),
        ),
      "攻击参数格式错误。",
    );
  const speakers = [
    "king",
    "prince",
    "sentinel",
    "fallen",
    "smith",
    "merchant",
    "narrator",
  ];
  if (c.type === "say")
    requireRule(
      speakers.includes(String(c.target)) &&
        typeof c.text === "string" &&
        c.text.trim().length > 0 &&
        c.text.length <= 2000,
      "对话格式错误。",
    );
  if (c.type === "equip")
    requireRule(
      c.weapon === null ||
        (typeof c.weapon === "string" && Object.hasOwn(WEAPONS, c.weapon)),
      "武器格式错误。",
    );
  if (c.type === "take" || c.type === "use")
    requireRule(
      typeof c.item === "string" && c.item.length <= 100,
      "物品格式错误。",
    );
  if (c.type === "npc_turn")
    requireRule(
      speakers.includes(String(c.npc)) &&
        ["speak", "attack", "end"].includes(String(c.choice)) &&
        typeof c.text === "string" &&
        c.text.length <= 500 &&
        typeof c.done === "boolean" &&
        ["agent", "rules"].includes(String(c.source)),
      "NPC 行动格式错误。",
    );
  if (c.type === "heal")
    requireRule(
      ["ranger", "mage", "warden"].includes(String(c.target)),
      "治疗参数格式错误。",
    );
}
export function replay(input: unknown): World {
  requireRule(typeof input === "object" && input !== null, "无效的旅程文件。");
  const file = input as ReplayFile;
  requireRule(
    file.format === "big-building-replay" && file.version === 1,
    "不支持的存档版本。",
  );
  requireRule(
    Number.isInteger(file.seed) && file.seed >= 0 && file.seed <= 0xffffffff,
    "无效的随机种子。",
  );
  requireRule(
    Array.isArray(file.commands) && file.commands.length <= 2000,
    "行动记录超过上限或格式错误。",
  );
  let world = createWorld(file.seed);
  for (const raw of file.commands) {
    world = execute(world, raw);
  }
  return world;
}

/** Migration is an explicit replayable command; legacy combat keeps its original semantics. */
export function ensureAdventure(world: World): World {
  return world.playerId
    ? world
    : execute(world, {
        type: "begin",
        actor: "ranger",
        expectedRevision: world.revision,
        id: crypto.randomUUID(),
      });
}
