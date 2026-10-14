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
  if (npc?.relation === "hostile")
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
/** Used when the provider fails, still enforcing the same turn rules. */
export function finishByRules(world: World): Command[] {
  const commands: Command[] = [];
  while (world.turn?.queue.length) {
    const command = npcCommand(world, ruleDecision(world), "rules");
    world = execute(world, command);
    commands.push(command);
  }
  return commands;
}
