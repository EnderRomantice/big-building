import { careerSkill, cooldownLeft, skillPoints, skillTree } from "./careers";
import { damageFor } from "./stats";
import { aggression } from "./worldContent";
import type { Command, Hero, Npc, World } from "./types";

export const MAJOR_ACTIONS = ["attack", "cast", "guard", "recover"];
export function majorAvailable(w: World) {
  return !w.turn?.actions?.some((a) => MAJOR_ACTIONS.includes(a));
}
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function absorbDamage(target: Hero | Npc, amount: number) {
  const absorbed = Math.min(target.career?.barrier ?? 0, amount);
  if (target.career) target.career.barrier -= absorbed;
  return amount - absorbed;
}
const local = (w: World) =>
  w.npcs.filter(
    (n) =>
      n.hp > 0 &&
      n.location === w.location &&
      (w.scenario === "spirit" ? n.id === "sentinel" : n.id !== "sentinel"),
  );
function log(
  w: World,
  title: string,
  text: string,
  tone: "combat" | "system" = "combat",
) {
  w.journal.push({
    id: w.journal.length + 1,
    minute: w.minute,
    location: w.location,
    title,
    text,
    tone,
  });
}
/** Mutates only the engine's draft. Returns action minutes when handled. */
export function applyCareerAction(
  w: World,
  c: Command,
  h: Hero,
  weaponPower: number,
  onKill: (target: Npc) => void,
): number | undefined {
  const extension =
    c.type === "invoke" ||
    c.type === "unlock_skill" ||
    (c.type === "npc_step" &&
      ["cast", "guard", "recover", "plan"].includes(c.action));
  if (!w.careersVersion) {
    check(!extension, "请先启用职业体系。");
    return;
  }
  if (
    (c.type === "npc_step" && MAJOR_ACTIONS.includes(c.action)) ||
    (c.type === "npc_turn" && c.choice === "attack")
  )
    check(majorAvailable(w), "本轮已使用主要行动，请安排下一轮或结束回合。");
  if (c.type === "unlock_skill") {
    const skill = skillTree(h.career!.profession).find((s) => s.id === c.skill);
    check(skill, "这项技能不属于你的职业体系。");
    check(!h.career!.unlocked.includes(skill.id), "已经掌握这项技能。");
    check(h.level >= skill.level, `需要达到 Lv.${skill.level}。`);
    check(
      skill.requires.every((id) => h.career!.unlocked.includes(id)),
      "请先掌握前置技能。",
    );
    check(skillPoints(h) >= skill.points, "技能点不足，升级后再来。");
    check(
      !local(w).some((n) => n.relation === "hostile"),
      "战斗中不能研习技能。",
    );
    h.career!.unlocked.push(skill.id);
    log(
      w,
      "技能树成长",
      `掌握${skill.name}，消耗 ${skill.points} 技能点。`,
      "system",
    );
    return 0;
  }
  if (!extension) return;
  const npcCommand = c.type === "npc_step";
  let caster: Hero | Npc = h;
  if (npcCommand) {
    check(w.turn?.queue[0] === c.npc, "NPC 回合顺序不正确。");
    const npc = local(w).find((n) => n.id === c.npc);
    check(npc?.career, "这个 NPC 不能使用职业行动。");
    caster = npc;
    check((w.turn!.actions?.length ?? 0) < 5, "请结束当前回合。");
    check(!w.turn!.actions?.includes(c.action), "本轮已执行过此动作。");
  }
  if (c.type === "invoke" || (npcCommand && c.action === "cast")) {
    const skill = careerSkill(c.skill!);
    check(
      skill && caster.career?.unlocked.includes(skill.id),
      "尚未掌握这个技能。",
    );
    check(!cooldownLeft(w, caster, skill.id), "技能尚在冷却。");
    check(caster.energy >= skill.energy, `需要 ${skill.energy} 点气力。`);
    const target =
      c.target === h.id ? h : local(w).find((n) => n.id === c.target);
    check(target && target.hp > 0, "目标必须存活且在场。");
    if (skill.kind === "attack") {
      check(
        npcCommand
          ? "relation" in caster &&
              caster.relation === "hostile" &&
              target === h
          : target !== h,
        "只能攻击合法的对手。",
      );
      const penalty = npcCommand ? "" : aggression(w, target as Npc);
      w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
      const damage = absorbDamage(
        target,
        damageFor(
          caster,
          target,
          npcCommand ? 0 : weaponPower,
          (w.rng % 6) + 1,
          skill.power,
        ),
      );
      target.hp = Math.max(0, target.hp - damage);
      log(
        w,
        `${caster.name}施放${skill.name}`,
        `${target.name}受到 ${damage} 点伤害。${penalty}`,
      );
      if (!target.hp && target !== h) onKill(target as Npc);
    } else if (skill.kind === "heal") {
      check(target.hp < target.maxHp, "目标没有受伤。");
      check(
        !npcCommand ||
          target === caster ||
          ("relation" in target &&
            target.relation === (caster as Npc).relation),
        "只能治疗自己或同阵营人物。",
      );
      const amount = Math.min(skill.power, target.maxHp - target.hp);
      target.hp += amount;
      log(
        w,
        `${caster.name}施放${skill.name}`,
        `${target.name}恢复 ${amount} HP。`,
      );
    } else {
      check(target === caster, "此技能只能对自己使用。");
      if (skill.kind === "recover") {
        check(caster.energy < caster.maxEnergy, "气力已满。");
        caster.energy = Math.min(caster.maxEnergy, caster.energy + skill.power);
      } else
        caster.career!.barrier = Math.max(caster.career!.barrier, skill.power);
      log(
        w,
        `${caster.name}施放${skill.name}`,
        skill.kind === "recover"
          ? `恢复最多 ${skill.power} 气力。`
          : `获得 ${skill.power} 点护盾；受击时消耗，不能叠加。`,
      );
    }
    caster.energy -= skill.energy;
    caster.career!.readyAt[skill.id] =
      (w.combatRound ?? 0) + skill.cooldown + 1;
  } else if (npcCommand && c.action === "plan") {
    check(c.tactic, "请选择战术。");
    caster.career!.tactic = c.tactic;
    log(
      w,
      `${caster.name}调整战术`,
      `${{ balanced: "攻守平衡", aggressive: "主动压制", cautious: "谨慎蓄势" }[c.tactic]}：${c.intent}`,
      "system",
    );
  } else if (npcCommand && c.action === "guard") {
    caster.career!.barrier = Math.max(
      caster.career!.barrier,
      6 + Math.floor(caster.level / 2),
    );
    log(
      w,
      `${caster.name}采取守势`,
      `获得 ${caster.career!.barrier} 点护盾，放弃本轮进攻。`,
    );
  } else if (npcCommand && c.action === "recover") {
    check(caster.energy < caster.maxEnergy, "气力已满。");
    const amount = Math.min(8, caster.maxEnergy - caster.energy);
    caster.energy += amount;
    log(w, `${caster.name}调息`, `恢复 ${amount} 气力，放弃本轮进攻。`);
  }
  if (npcCommand) {
    const npc = caster as Npc;
    npc.intent = c.intent;
    w.journal.at(-1)!.decision = { intent: c.intent, tool: `npc_${c.action}` };
    (w.turn!.actions ??= []).push(c.action);
    if (!h.hp) w.turn!.queue = [];
  }
  return npcCommand ? 0 : 10;
}
export function usableNpcSkills(w: World, npc: Npc) {
  return (npc.career?.unlocked ?? []).flatMap((id) => {
    const s = careerSkill(id)!;
    const targets: (Hero["id"] | Npc["id"])[] =
      s.kind === "attack"
        ? npc.relation === "hostile"
          ? [w.playerId!]
          : []
        : s.kind === "heal"
          ? [
              npc,
              ...local(w).filter(
                (n) => n.id !== npc.id && n.relation === npc.relation,
              ),
            ]
              .filter((n) => n.hp < n.maxHp)
              .map((n) => n.id)
          : s.kind === "recover" && npc.energy >= npc.maxEnergy
            ? []
            : [npc.id];
    return [
      {
        ...s,
        remainingCooldown: cooldownLeft(w, npc, id),
        targets,
        usable:
          majorAvailable(w) &&
          !cooldownLeft(w, npc, id) &&
          npc.energy >= s.energy &&
          targets.length > 0,
      },
    ];
  });
}
