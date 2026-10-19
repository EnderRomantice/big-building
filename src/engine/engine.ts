import {
  initializeCareers,
  applyCharacter,
  validateCharacter,
} from "./careers";
import { applyCareerAction, absorbDamage } from "./careerCombat";
import { makeStats } from "./stats";
import { CAMPAIGN_NPC_IDS, createSuccession } from "./succession";
import { executeSuccession } from "./successionEngine";
import { aggression } from "./worldContent";
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
import {
  describeRoute,
  findRoute,
  geographyFor,
  LEGACY_LOCATIONS,
  regionAt,
  routeUnavailable,
} from "./geography";

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
export function createWorld(seed = 14026, mapVersion: 0 | 1 = 1): World {
  const w: World = {
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    seed,
    mapVersion,
    initialMapVersion: mapVersion,
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
      if (w.careersVersion) {
        const stats = makeStats(h.level, h.archetype),
          hp = h.hp,
          energy = h.energy;
        Object.assign(h, {
          maxHp: stats.maxHp,
          maxEnergy: stats.maxEnergy,
          attack: stats.attack,
          defense: stats.defense,
          hp: Math.min(stats.maxHp, hp + 6),
          energy: Math.min(stats.maxEnergy, energy + 3),
        });
        log(
          w,
          `${h.name}升至 Lv.${h.level}`,
          "获得 1 技能点，可在职业技能树中研习。",
          "system",
        );
        continue;
      }
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
  if (command.type === "enable_careers" || command.type === "adopt_character") {
    requireRule(
      command.actor === previous.playerId &&
        command.expectedRevision === previous.revision &&
        !previous.history.some((c) => c.id === command.id) &&
        previous.history.length < 2000,
      "角色更新的版本或身份无效。",
    );
    requireRule(!previous.turn?.queue.length, "请先完成当前回合。");
    const next = structuredClone(previous);
    if (command.type === "enable_careers") {
      requireRule(!next.careersVersion, "职业体系已启用。");
      initializeCareers(next);
    } else {
      requireRule(
        next.careersVersion && next.heroes[0].hp > 0 && !next.heroes[0].retired,
        "当前角色无法跨界。",
      );
      requireRule(
        next.characterId ||
          !next.history.some(
            (c) => !["begin", "enable_map", "enable_careers"].includes(c.type),
          ),
        "只能在新旅程中建立角色身份。",
      );
      applyCharacter(next, command.profile);
    }
    next.revision++;
    next.history.push(structuredClone(command));
    return next;
  }
  if (previous.campaign) return executeSuccession(previous, command);
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
      !w.turn?.queue.length ||
        command.type === "enable_map" ||
        command.type === "npc_turn" ||
        command.type === "npc_step",
      "NPC 尚未结束回合。",
    );
  }
  requireRule(
    h &&
      (command.type === "begin" ||
        command.type === "enable_map" ||
        (!h.retired && h.hp > 0)),
    w.playerId
      ? "你的角色已无法行动。"
      : "这个角色无法行动，请选择仍然存活的小队成员。",
  );
  const hostiles = activeNpcs(w).filter((n) => n.relation === "hostile");
  const careerCost = applyCareerAction(
    w,
    command,
    h,
    h.weapon ? (WEAPONS[h.weapon]?.power ?? 0) : 0,
    (target) => finishEnemy(w, target, h),
  );
  let cost = careerCost ?? 10;
  if (careerCost === undefined)
    switch (command.type) {
      case "learn":
      case "cast":
      case "pledge":
        throw new RuleError("此行动仅在九阙争衡剧本中可用。");
      case "enable_map":
        requireRule(!w.mapVersion, "地图已展开。");
        w.mapVersion = 1;
        cost = 0;
        log(
          w,
          "地图展开",
          "城外的道路已标记。此后的旅程将按道路长度与地形计算耗时。",
          "system",
        );
        break;
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
      case "assault":
      case "strike": {
        requireRule(w.playerId, "尚未绑定玩家角色。");
        const target = activeNpcs(w).find((n) => n.id === command.target);
        requireRule(
          target && (command.type === "assault" || target.relation !== "ally"),
          "请选择在场且可以攻击的 NPC。",
        );
        requireRule(
          !command.skill || h.energy >= ENERGY_COST.skill,
          "技能需要 8 点能量。",
        );
        if (command.skill) h.energy -= ENERGY_COST.skill;
        const power =
          h.attack + (h.weapon ? (WEAPONS[h.weapon]?.power ?? 0) : 0);
        const die = roll(w),
          bonus = command.skill ? 6 + h.skillRank * 2 : 0;
        const damage = absorbDamage(
          target,
          Math.max(1, power + die + bonus - target.defense),
        );
        target.hp = Math.max(0, target.hp - damage);
        const penalty = command.type === "assault" ? aggression(w, target) : "";
        if (command.type !== "assault") target.relation = "hostile";
        log(
          w,
          command.skill
            ? `${h.name}施放${SKILLS[h.id]}`
            : `${h.name}用${heldWeapon(h)}攻击`,
          `${target.name}受到 ${damage} 点伤害。${penalty}`,
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
      case "npc_step": {
        requireRule(
          w.playerId && w.turn?.queue[0] === command.npc,
          "NPC 回合已结束或顺序不正确。",
        );
        const turn = w.turn!;
        const npc = activeNpcs(w).find((n) => n.id === command.npc);
        requireRule(command.npc === "narrator" || npc, "NPC 已离开场景。");
        const actions = (turn.actions ??= []);
        requireRule(actions.length < 6, "该 NPC 的行动次数已达上限。");
        requireRule(
          command.action === "end" || !actions.includes(command.action),
          "本轮已经执行过这个动作。",
        );
        requireRule(
          command.action === "end" || actions.length < 5,
          "请结束当前回合。",
        );
        const name = npc?.name ?? "旁白";
        if (command.action === "speak") {
          requireRule(
            !turn.spoken && command.text?.trim(),
            "本轮已经说过话，或台词为空。",
          );
          log(w, name, command.text!.trim(), "dialogue");
          turn.spoken = true;
        } else if (command.action === "attack") {
          requireRule(npc?.relation === "hostile", "只有敌对 NPC 可以攻击你。");
          const damage = absorbDamage(h, Math.max(1, npc.attack - h.defense));
          h.hp = Math.max(0, h.hp - damage);
          log(
            w,
            `${name}发动攻击`,
            `你受到 ${damage} 点伤害${h.hp ? "。" : "，已倒下。旅程到此结束。"}`,
            "combat",
            `${npc.attack} 攻击 − ${h.defense} 防御 = ${damage}`,
          );
        } else if (command.action === "ceasefire") {
          requireRule(
            npc?.relation === "hostile",
            "当前没有需要解除的敌对关系。",
          );
          npc.relation = "neutral";
          log(w, `${name}停止敌对`, "放下攻势，不再阻拦你离开。", "story");
        } else if (command.action === "move") {
          requireRule(npc && w.scenario === "crown", "当前角色不能移动。");
          requireRule(
            command.destination && command.destination !== npc.location,
            "请选择其他地点。",
          );
          if (w.mapVersion)
            requireRule(
              findRoute(
                w,
                command.destination,
                geographyFor(w.seed),
                npc.location,
              ),
              "没有可通行的道路。",
            );
          npc.location = command.destination;
          log(
            w,
            `${name}离开`,
            `前往${LOCATIONS[command.destination].name}。`,
            "story",
          );
        } else {
          log(w, `${name} · 回合结束`, "暂时没有进一步行动。", "system");
        }
        if (npc) npc.intent = command.intent;
        w.journal.at(-1)!.decision = {
          intent: command.intent,
          tool: `npc_${command.action}`,
        };
        actions.push(command.action);
        if (command.action === "end" || command.action === "move" || !h.hp) {
          turn.queue.shift();
          turn.spoken = false;
          turn.actions = [];
        }
        if (!h.hp) turn.queue = [];
        cost = 0;
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
          requireRule(
            !command.text.trim(),
            "本轮已经说过话，请直接行动或结束。",
          );
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
          const damage = absorbDamage(h, Math.max(1, npc.attack - h.defense));
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
      case "move": {
        requireRule(
          Object.hasOwn(LOCATIONS, command.destination),
          "未知地点。",
        );
        requireRule(
          w.scenario === "crown",
          "灵境首版只有回廊场景，使用穿越界隙返回。",
        );
        requireRule(command.destination !== w.location, "小队已经在这里了。");
        requireRule(!hostiles.length, "战斗中无法离开，请先击败当前敌人。");
        if (w.mapVersion) {
          const reason = routeUnavailable(w, command.destination);
          requireRule(!reason, reason ?? "没有可通行的道路。");
          const map = geographyFor(w.seed);
          const route = findRoute(w, command.destination, map);
          requireRule(route && route.roads.length, "没有可通行的道路。");
          log(
            w,
            w.playerId ? "启程" : "小队启程",
            `${describeRoute(route)}。预计 ${route.minutes} 分钟，沿道路前进。`,
          );
          for (let i = 0; i < route.roads.length; i++) {
            const fromRegion = regionAt(map, w.location);
            advance(w, route.roads[i].minutes);
            w.location = route.stops[i + 1];
            const toRegion = regionAt(map, w.location);
            if (fromRegion.id !== toRegion.id)
              log(
                w,
                `已进入${toRegion.name}`,
                `离开${fromRegion.name}，抵达${toRegion.name}。${toRegion.terrain}映入眼帘。`,
                "world",
              );
            if (
              i < route.roads.length - 1 &&
              activeNpcs(w).some((npc) => npc.relation === "hostile")
            ) {
              log(
                w,
                "旅程中断",
                `${LOCATIONS[w.location].name}出现了敌人。处理当前局势后才能继续前往${LOCATIONS[command.destination].name}。`,
                "world",
              );
              break;
            }
          }
          log(
            w,
            "抵达",
            `${w.playerId ? "你" : "你们"}抵达${LOCATIONS[w.location].name}，本次行走 ${w.minute - previous.minute} 分钟。`,
          );
          cost = 0; // Each road has already advanced the world, including scheduled events.
          break;
        }
        requireRule(
          LEGACY_LOCATIONS.includes(command.destination),
          "请先展开新地图。",
        );
        w.location = command.destination;
        cost = 30;
        log(
          w,
          w.playerId ? "启程" : "小队启程",
          `${w.playerId ? "你" : "你们"}前往${LOCATIONS[w.location].name}，路程需要 30 分钟。`,
        );
        break;
      }
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
      case "mend": {
        const target =
          w.heroes.find(
            (hero) =>
              hero.id === command.target && !hero.retired && hero.hp > 0,
          ) ?? activeNpcs(w).find((npc) => npc.id === command.target);
        requireRule(
          target && target.hp < target.maxHp,
          "请选择在场且受伤的存活对象。",
        );
        requireRule(h.energy >= ENERGY_COST.heal, "治疗术需要 6 点能量。");
        const amount = Math.min(5, target.maxHp - target.hp);
        h.energy -= ENERGY_COST.heal;
        target.hp += amount;
        log(
          w,
          `${h.name}施放治疗术`,
          `${target.name}恢复 ${amount} HP。`,
          "system",
          `min(5, ${target.maxHp} − ${target.hp - amount}) = ${amount}`,
        );
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
          ...makeStats(h.level, "guard"),
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
  if (
    w.careersVersion &&
    !["npc_step", "npc_turn", "unlock_skill"].includes(command.type)
  )
    w.combatRound = (w.combatRound ?? 0) + 1;
  advance(w, cost);
  if (w.careersVersion) initializeCareers(w);
  if (
    w.playerId &&
    command.type !== "npc_turn" &&
    command.type !== "npc_step" &&
    command.type !== "begin" &&
    command.type !== "enable_map" &&
    command.type !== "unlock_skill" &&
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
    ...(w.campaign ? { campaign: w.campaign, hero: w.initialHero } : {}),
    mapVersion: w.initialMapVersion,
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
    enable_careers: [],
    adopt_character: ["profile"],
    unlock_skill: ["skill"],
    invoke: ["skill", "target"],
    enable_map: [],
    strike: ["target", "skill"],
    assault: ["target", "skill"],
    learn: ["skill"],
    cast: ["skill", "target"],
    pledge: ["target"],
    say: ["target", "text"],
    equip: ["weapon"],
    take: ["item"],
    use: ["item"],
    npc_step: [
      "npc",
      "action",
      "intent",
      "text",
      "destination",
      "skill",
      "target",
      "tactic",
    ],
    npc_turn: ["npc", "choice", "text", "done", "source"],
    move: ["destination"],
    attack: ["target", "skill"],
    heal: ["target"],
    mend: ["target"],
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
  if (c.type === "attack" || c.type === "strike" || c.type === "assault")
    requireRule(
      typeof c.skill === "boolean" &&
        [
          "king",
          "prince",
          "sentinel",
          "fallen",
          "smith",
          "merchant",
          ...CAMPAIGN_NPC_IDS,
        ].includes(String(c.target)),
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
    ...CAMPAIGN_NPC_IDS,
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
  if (c.type === "npc_step") {
    requireRule(
      speakers.includes(String(c.npc)) &&
        [
          "speak",
          "attack",
          "ceasefire",
          "move",
          "end",
          "cast",
          "guard",
          "recover",
          "plan",
        ].includes(String(c.action)) &&
        typeof c.intent === "string" &&
        c.intent.trim().length > 0 &&
        c.intent.length <= 160,
      "NPC 决策格式错误。",
    );
    requireRule(
      c.action === "speak"
        ? typeof c.text === "string" &&
            c.text.trim().length > 0 &&
            c.text.length <= 500
        : c.text === undefined,
      "NPC 台词格式错误。",
    );
    requireRule(
      c.action === "move"
        ? typeof c.destination === "string" &&
            Object.hasOwn(LOCATIONS, c.destination)
        : c.destination === undefined,
      "NPC 移动格式错误。",
    );
  }
  if (c.type === "adopt_character") validateCharacter(c.profile);
  if (
    c.type === "unlock_skill" ||
    c.type === "invoke" ||
    (c.type === "npc_step" && c.action === "cast")
  )
    requireRule(
      typeof c.skill === "string" && c.skill.length < 100,
      "技能参数错误。",
    );
  if (c.type === "invoke" || (c.type === "npc_step" && c.action === "cast"))
    requireRule(
      [
        "ranger",
        "mage",
        "warden",
        ...speakers.filter((id) => id !== "narrator"),
      ].includes(String(c.target)),
      "技能目标错误。",
    );
  if (c.type === "npc_step") {
    requireRule(
      c.action === "cast" || (c.skill === undefined && c.target === undefined),
      "此工具不接受技能目标。",
    );
    requireRule(
      c.action === "plan"
        ? ["balanced", "aggressive", "cautious"].includes(String(c.tactic))
        : c.tactic === undefined,
      "战术参数错误。",
    );
  }
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
  if (c.type === "mend")
    requireRule(
      [
        "ranger",
        "mage",
        "warden",
        "king",
        "prince",
        "sentinel",
        "fallen",
        "smith",
        "merchant",
        ...CAMPAIGN_NPC_IDS,
      ].includes(String(c.target)),
      "治疗对象格式错误。",
    );
  if (c.type === "learn" || c.type === "cast")
    requireRule(
      typeof c.skill === "string" && c.skill.length < 100,
      "技能格式错误。",
    );
  if (c.type === "pledge")
    requireRule(CAMPAIGN_NPC_IDS.has(c.target as never), "立场对象错误。");
  if (c.type === "cast")
    requireRule(
      ["ranger", "mage", "warden", ...CAMPAIGN_NPC_IDS].includes(
        String(c.target),
      ),
      "技能目标格式错误。",
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
  requireRule(
    file.mapVersion === undefined ||
      file.mapVersion === 0 ||
      file.mapVersion === 1,
    "不支持的地图版本。",
  );
  requireRule(
    file.campaign === undefined || file.campaign === "succession-v1",
    "不支持的剧本版本。",
  );
  requireRule(
    file.hero === undefined || ["ranger", "mage", "warden"].includes(file.hero),
    "角色标识错误。",
  );
  let world = file.campaign
    ? createSuccession(file.seed, file.hero ?? "ranger")
    : createWorld(file.seed, file.mapVersion ?? 0);
  for (const raw of file.commands) {
    world = execute(world, raw);
  }
  return world;
}

/** Migration is an explicit replayable command; legacy combat keeps its original semantics. */
export function ensureAdventure(world: World): World {
  const bound = world.playerId
    ? world
    : execute(world, {
        type: "begin",
        actor: "ranger",
        expectedRevision: world.revision,
        id: crypto.randomUUID(),
      });
  return bound.mapVersion
    ? bound
    : execute(bound, {
        type: "enable_map",
        actor: bound.playerId!,
        expectedRevision: bound.revision,
        id: crypto.randomUUID(),
      });
}
