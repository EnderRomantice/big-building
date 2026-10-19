import { majorAvailable, usableNpcSkills } from "./careerCombat";
import { activeNpcs, execute } from "./engine";
import type { Command, World } from "./types";
export type NpcTurn = Extract<Command, { type: "npc_turn" }>;
export type TurnDecision = Pick<NpcTurn, "choice" | "text" | "done">;
export interface TurnResponse {
  commands: Command[];
  degraded: boolean;
  warning?: string;
}

export function npcChoices(world: World): TurnDecision["choice"][] {
  const npc = activeNpcs(world).find((n) => n.id === world.turn?.queue[0]);
  return [
    ...(!world.turn?.spoken ? ["speak" as const] : []),
    ...(npc?.relation === "hostile" ? ["attack" as const] : []),
    "end",
  ];
}
export function npcCommand(
  world: World,
  decision: TurnDecision,
  source: NpcTurn["source"],
): NpcTurn {
  if (!world.playerId || !world.turn?.queue.length)
    throw new Error("没有待处理的 NPC 回合。");
  return {
    id: crypto.randomUUID(),
    expectedRevision: world.revision,
    actor: world.playerId,
    type: "npc_turn",
    npc: world.turn.queue[0],
    ...decision,
    source,
  };
}
export function ruleDecision(world: World): TurnDecision {
  const npc = activeNpcs(world).find((n) => n.id === world.turn?.queue[0]);
  if (
    npc?.relation === "hostile" &&
    (!world.careersVersion || majorAvailable(world))
  )
    return { choice: "attack", text: "", done: true };
  return {
    choice: "end",
    text: world.turn?.spoken
      ? ""
      : npc
        ? `${npc.name}暂时没有回应。`
        : "四周暂时没有回应。",
    done: true,
  };
}
/** Deterministic fallback uses the same skills and major-action budget as model tools. */
export function fallbackCommand(world: World): Command {
  const npc = activeNpcs(world).find((n) => n.id === world.turn?.queue[0]);
  if (npc?.career && npc.relation === "hostile" && majorAvailable(world)) {
    const skills = usableNpcSkills(world, npc).filter((s) => s.usable);
    const heal =
      npc.hp < npc.maxHp / 2
        ? skills.find((s) => s.kind === "heal" && s.targets.includes(npc.id))
        : undefined;
    const attack = skills
      .filter((s) => s.kind === "attack")
      .sort((a, b) => b.power - a.power)[0];
    const chosen = heal ?? attack;
    const base = {
      id: crypto.randomUUID(),
      expectedRevision: world.revision,
      actor: world.playerId!,
      type: "npc_step" as const,
      npc: npc.id,
    };
    if (chosen)
      return {
        ...base,
        action: "cast",
        skill: chosen.id,
        target: chosen.kind === "heal" ? npc.id : world.playerId!,
        intent: heal ? "先疗伤，保留后续进攻机会。" : "用可用的职业技能施压。",
      };
    if (npc.energy < 5)
      return { ...base, action: "recover", intent: "气力不足，先调息再进攻。" };
  }
  return npcCommand(world, ruleDecision(world), "rules");
}
/** Used when the provider fails, still enforcing the same turn rules. */
export function finishByRules(world: World): Command[] {
  const commands: Command[] = [];
  while (world.turn?.queue.length) {
    const command = fallbackCommand(world);
    world = execute(world, command);
    commands.push(command);
  }
  return commands;
}
