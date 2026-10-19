import { applyCareerAction, absorbDamage } from "./careerCombat";
import type { Command, Npc, World } from "./types";
import {
  CAMPAIGN_ITEMS,
  CAMPAIGN_PLACES,
  REGIONAL_SKILLS,
  CITIES,
  campaignRoad,
} from "./succession";
import { damageFor, makeStats } from "./stats";
import { aggression, affinityOf } from "./worldContent";
// Content is immutable and shared; all mutable state lives in the replayable World.
const weapons: Record<string, number> = {
  旅人短刀: 3,
  毛笔铁尺: 2,
  旧制长枪: 4,
  ...Object.fromEntries(
    CAMPAIGN_ITEMS.filter((i) => i.power).map((i) => [i.name, i.power!]),
  ),
};
function rule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function executeSuccession(previous: World, c: Command): World {
  rule(
    c.expectedRevision === previous.revision,
    "世界状态已变化，请重新选择行动。",
  );
  rule(
    !previous.history.some((x) => x.id === c.id),
    "这条行动已经结算，请勿重复提交。",
  );
  rule(previous.history.length < 2000, "本次旅程已达到行动上限，请导出记录。");
  rule(c.actor === previous.playerId, "只能控制当前角色。");
  const npcTurn = c.type === "npc_step" || c.type === "npc_turn";
  rule(!previous.turn?.queue.length || npcTurn, "NPC 尚未结束回合。");
  const w = structuredClone(previous),
    h = w.heroes[0],
    exp = w.exploration!;
  rule(h.hp > 0 && !h.retired, "你的角色已无法行动。");
  const local = () =>
    w.npcs.filter((n) => n.location === w.location && n.hp > 0);
  const hostiles = () => local().filter((n) => n.relation === "hostile");
  const log = (
    title: string,
    text: string,
    tone: World["journal"][number]["tone"] = "story",
    formula?: string,
  ) =>
    w.journal.push({
      id: w.journal.length + 1,
      minute: w.minute,
      location: w.location,
      title,
      text,
      tone,
      ...(formula ? { formula } : {}),
    });
  const die = () => {
    w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
    return (w.rng % 6) + 1;
  };
  let cost = 0;
  function hit(target: Npc, bonus: number, label: string) {
    const penalty = aggression(w, target),
      roll = die(),
      weapon = h.weapon ? (weapons[h.weapon] ?? 0) : 0;
    const amount = absorbDamage(
      target,
      damageFor(h, target, weapon, roll, bonus),
    );
    target.hp = Math.max(0, target.hp - amount);
    log(
      `${h.name}${label}`,
      `${target.name}受到 ${amount} 点伤害。${penalty}`,
      "combat",
      `${h.attack} 基础攻击 + ${weapon} 武器 + ${roll} 骰点 + ${bonus} 技能 − ${target.defense} 防御 = ${amount}`,
    );
    if (!target.hp) {
      h.xp += target.level * 10;
      h.gold = (h.gold ?? 0) + target.level * 3;
      log(
        `${target.name}倒下`,
        `获得 ${target.level * 10} 经验与 ${target.level * 3} 铜钱。`,
      );
    }
  }
  const careerCost = applyCareerAction(
    w,
    c,
    h,
    h.weapon ? (weapons[h.weapon] ?? 0) : 0,
    (target) => {
      h.xp += target.level * 10;
      h.gold = (h.gold ?? 0) + target.level * 3;
      log(
        `${target.name}倒下`,
        `获得 ${target.level * 10} 经验与 ${target.level * 3} 铜钱。`,
      );
    },
  );
  if (careerCost !== undefined) cost = careerCost;
  else
    switch (c.type) {
      case "move": {
        rule(!hostiles().length, "战斗中无法离开，请先解决当前敌对关系。");
        const road = campaignRoad(w.location, c.destination);
        rule(road, "没有直达的道路，请沿已发现的路径逐段探索。");
        w.location = c.destination;
        cost = road.minutes;
        const first = !exp.visited.includes(w.location);
        if (first) exp.visited.push(w.location);
        log(
          first ? "发现新地点" : "重访旧地",
          `抵达${CAMPAIGN_PLACES[w.location].name}，路程 ${(road.distance / 1000).toFixed(1)} 公里，耗时 ${cost} 分钟。${CAMPAIGN_PLACES[w.location].description}`,
        );
        break;
      }
      case "assault":
      case "strike": {
        const target = local().find((n) => n.id === c.target);
        rule(target, "攻击对象已不在场。");
        rule(!c.skill || h.energy >= 8, "技能需要 8 点气力。");
        if (c.skill) h.energy -= 8;
        hit(
          target,
          c.skill ? 6 + h.skillRank * 2 : 0,
          c.skill ? "施放战斗技能" : "发动攻击",
        );
        cost = 10;
        break;
      }
      case "mend":
      case "cast": {
        const skill =
          c.type === "cast"
            ? REGIONAL_SKILLS.find((s) => s.id === c.skill)
            : undefined;
        rule(
          c.type !== "cast" || (skill && h.skills?.includes(skill.id)),
          "尚未学会这个技能。",
        );
        const energy = skill?.energy ?? 6;
        rule(h.energy >= energy, `需要 ${energy} 点气力。`);
        if (skill?.kind === "attack") {
          const target = local().find((n) => n.id === c.target);
          rule(target, "技能目标不在场。");
          h.energy -= energy;
          hit(target, skill.bonus, `施放${skill.name}`);
        } else {
          const target =
            c.target === h.id ? h : local().find((n) => n.id === c.target);
          rule(target && target.hp > 0, "请选择存活且在场的对象。");
          rule(target.hp < target.maxHp, "对象没有受伤。");
          const amount = Math.min(skill?.bonus ?? 5, target.maxHp - target.hp);
          target.hp += amount;
          h.energy -= energy;
          log(
            `${h.name}施放${skill?.name ?? "治疗术"}`,
            `${target.name}恢复 ${amount} HP。`,
            "system",
          );
        }
        cost = 10;
        break;
      }
      case "say":
        rule(
          c.target === "narrator" || local().some((n) => n.id === c.target),
          "交谈对象已不在场。",
        );
        log(h.name, c.text.trim(), "dialogue");
        cost = 1;
        break;
      case "equip":
        rule(
          c.weapon === null ||
            (h.inventory.includes(c.weapon) && weapons[c.weapon]),
          "只能装备持有的武器。",
        );
        h.weapon = c.weapon;
        log("更换武器", `现在使用${c.weapon ?? "拳头"}。`, "system");
        break;
      case "take": {
        const item = CAMPAIGN_ITEMS.find((i) => i.id === c.item);
        rule(
          item &&
            item.location === w.location &&
            !w.collected?.includes(item.id),
          "物品不在这里，或已取走。",
        );
        rule(!hostiles().length, "战斗结束后才能交易。");
        rule(
          local().some((n) => n.kind !== "monster"),
          "无人提供这件物品。",
        );
        rule((h.gold ?? 0) >= (item.price ?? 0), "铜钱不足。");
        h.gold! -= item.price ?? 0;
        h.inventory.push(item.name);
        w.collected!.push(item.id);
        log(
          "交易完成",
          `以 ${item.price ?? 0} 铜钱购得${item.name}。`,
          "system",
        );
        cost = 2;
        break;
      }
      case "use":
        rule(
          c.item === "药草" && h.inventory.includes(c.item),
          "没有可以使用的药草。",
        );
        rule(h.hp < h.maxHp, "生命已满。");
        h.inventory.splice(h.inventory.indexOf(c.item), 1);
        {
          const amount = Math.min(16, h.maxHp - h.hp);
          h.hp += amount;
          log("使用药草", `恢复 ${amount} HP。`, "system");
        }
        cost = 1;
        break;
      case "learn": {
        const skill = REGIONAL_SKILLS.find((s) => s.id === c.skill);
        rule(
          skill && skill.location === w.location,
          "这里没有传授此技能的老师。",
        );
        rule(
          !hostiles().length &&
            local().some(
              (n) => n.archetype === "scholar" && n.relation !== "hostile",
            ),
          "需要一位愿意授课的教习。",
        );
        rule(!h.skills!.includes(skill.id), "已经学会此技能。");
        rule(h.level >= skill.level, `需要达到 Lv.${skill.level}。`);
        rule((h.gold ?? 0) >= 10, "学习需要 10 铜钱。");
        h.gold! -= 10;
        h.skills!.push(skill.id);
        log(
          "习得新技能",
          `你学会了${skill.name}。${skill.description}`,
          "system",
        );
        cost = 30;
        break;
      }
      case "inspect": {
        const p = CAMPAIGN_PLACES[w.location];
        rule(!exp.inspected.includes(w.location), "此处已经调查过。");
        rule(!hostiles().length, "先解决眼前的敌意。");
        exp.inspected.push(w.location);
        h.xp += 5;
        const city = CITIES.find((c) => c.id === p.city)!;
        if (p.building === "palace" && city.id !== "capital") {
          h.inventory.push(`${city.title}·封存证词`);
          log(
            "获得封存证词",
            `${city.history} 这份记录能在登阙议会上支持或质疑他的承诺。`,
          );
        } else if (p.town) {
          h.gold = (h.gold ?? 0) + 8;
          log(
            "调查地方旧事",
            `${p.description} 你核对了留下的记录，得到当地人支付的 8 铜钱跑腿酬劳。`,
          );
        } else
          log(
            "读到议会告示",
            "七日后议会开席。持有至少三地的封存证词，并亲自见过尚存的王爵，便可在承天宫表明立场。也可以不支持任何人，继续查证。",
          );
        cost = 15;
        break;
      }
      case "rest": {
        const clinic = CAMPAIGN_PLACES[w.location].building === "clinic";
        rule(
          !hostiles().length &&
            (clinic || CAMPAIGN_PLACES[w.location].building === "inn"),
          "需要没有敌意的客栈或医馆。",
        );
        const price = clinic ? 5 : 3;
        rule((h.gold ?? 0) >= price, `需要 ${price} 铜钱。`);
        h.gold! -= price;
        h.hp = h.maxHp;
        if (!clinic) h.energy = h.maxEnergy;
        cost = clinic ? 20 : 60;
        log(
          clinic ? "医馆疗伤" : "客栈休整",
          `支付 ${price} 铜钱，${clinic ? "生命恢复" : "生命与气力恢复"}。`,
          "system",
        );
        break;
      }
      case "wait":
        rule(!hostiles().length, "不能在战斗中等待。");
        cost = 60;
        log("静候片刻", "驿道上的人继续赶路，争储的消息仍在传播。");
        break;
      case "pledge": {
        rule(w.location === "s-capital-palace", "只能在承天宫表明议会立场。");
        rule(w.minute >= 6 * 1440 + 480, "登阙议会将在第七日开席。");
        rule(!w.flags.resolved, "此轮议会已经落幕。");
        rule(!hostiles().length, "先平息宫中的敌意。");
        rule(
          h.inventory.filter((i) => i.endsWith("封存证词")).length >= 3,
          "至少需要三地的封存证词。",
        );
        const prince = w.npcs.find((n) => n.id === c.target);
        rule(
          prince &&
            prince.id !== "n-capital-royal" &&
            prince.id.endsWith("-royal") &&
            prince.hp > 0 &&
            exp.visited.includes(prince.location),
          "只能支持亲自见过且仍然存活的王爵。",
        );
        exp.pledged = prince.id;
        w.flags.resolved = true;
        w.flags.throneOwner = prince.name;
        prince.affinity = Math.min(100, affinityOf(prince) + 40);
        prince.relation = "ally";
        log(
          "登阙议会 · 立场落定",
          `你带着地方证词支持${prince.name}。${prince.goal}，成为新政公开写下的承诺。储位的争夺暂告一段落，九地的旧债仍等待兑现。`,
        );
        cost = 60;
        break;
      }
      case "npc_step":
      case "npc_turn": {
        rule(w.turn?.queue[0] === c.npc, "NPC 回合顺序不正确。");
        const turn = w.turn!,
          npc = local().find((n) => n.id === c.npc);
        rule(c.npc === "narrator" || npc, "NPC 已离开场景。");
        const action = c.type === "npc_step" ? c.action : c.choice,
          actions = (turn.actions ??= []);
        rule(actions.length < 6, "NPC 行动次数超过上限。");
        rule(
          action === "end" || !actions.includes(action),
          "本轮已执行过此动作。",
        );
        if (action === "speak") {
          rule(!turn.spoken && c.text?.trim(), "本轮已说过话，或台词为空。");
          log(npc?.name ?? "旁白", c.text!, "dialogue");
          turn.spoken = true;
        } else if (action === "attack") {
          rule(npc?.relation === "hostile", "只有敌对者可以反击。");
          const amount = absorbDamage(h, damageFor(npc, h, 0, die()));
          h.hp = Math.max(0, h.hp - amount);
          log(
            `${npc.name}发动攻击`,
            `你受到 ${amount} 点伤害${h.hp ? "。" : "，已倒下。"}`,
            "combat",
          );
        } else if (action === "ceasefire") {
          rule(npc?.relation === "hostile", "当前没有敌意需要解除。");
          npc.relation = "neutral";
          npc.affinity = Math.max(-19, affinityOf(npc));
          log(`${npc.name}收起敌意`, "停战，不再拦住你离开。");
        } else if (action === "move") {
          rule(
            c.type === "npc_step" &&
              npc &&
              c.destination &&
              campaignRoad(npc.location, c.destination),
            "没有可走的邻接道路。",
          );
          npc.location = c.destination;
          log(`${npc.name}离开`, "身影消失在街巷另一端。");
        } else
          log(
            `${npc?.name ?? "旁白"} · 回合结束`,
            c.type === "npc_turn" && c.text ? c.text : "暂时没有进一步行动。",
            "system",
          );
        if (c.type === "npc_step") {
          if (npc) npc.intent = c.intent;
          w.journal.at(-1)!.decision = {
            intent: c.intent,
            tool: `npc_${action}`,
          };
        }
        actions.push(action);
        if (
          action === "end" ||
          action === "move" ||
          !h.hp ||
          (c.type === "npc_turn" && c.done)
        ) {
          turn.queue.shift();
          turn.spoken = false;
          turn.actions = [];
        }
        if (!h.hp) turn.queue = [];
        break;
      }
      default:
        throw new Error("此剧本不支持这个行动。");
    }
  while (h.xp >= h.level * 30) {
    h.xp -= h.level * 30;
    const next = makeStats(h.level + 1, h.archetype);
    Object.assign(h, {
      level: next.level,
      attack: next.attack,
      defense: next.defense,
      maxHp: next.maxHp,
      maxEnergy: next.maxEnergy,
      hp: Math.min(next.maxHp, h.hp + 6),
      energy: Math.min(next.maxEnergy, h.energy + 3),
    });
    log(
      "等级提升",
      `${h.name}升至 Lv.${h.level}。所有角色遵循相同的成长公式。`,
    );
  }
  if (w.careersVersion && !npcTurn && c.type !== "unlock_skill")
    w.combatRound = (w.combatRound ?? 0) + 1;
  w.minute += cost;
  for (const [day, text] of [
    [2, "北境递交欠饷账册，议会开始质疑军费去向。"],
    [4, "漕运商会拒绝再垫粮银，数位王爵的借据浮出水面。"],
    [7, "登阙议会开席。三份以上的地方证词，可以换来一次公开陈述立场的机会。"],
  ] as const) {
    if (w.minute >= (day - 1) * 1440 + 480 && !exp.events.includes(day)) {
      exp.events.push(day);
      log("驿报", text, "world");
    }
  }
  if (!npcTurn && c.type !== "unlock_skill" && h.hp > 0) {
    const queue = local().map((n) => n.id);
    w.turn = {
      queue: queue.length ? queue : ["narrator"],
      spoken: false,
      steps: 0,
    };
  }
  w.revision++;
  w.history.push(structuredClone(c));
  return w;
}
