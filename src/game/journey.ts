import {
  createWorld,
  ensureAdventure,
  execute,
  replay,
  toReplay,
} from "../engine/engine";
import type { Command, HeroId, JournalEntry, World } from "../engine/types";

export function journeySlot(world: World) {
  return `big-building:slot:${world.campaign ?? "crown"}:${world.characterId ?? world.initialHero ?? world.playerId ?? "ranger"}`;
}
export const SAVE_KEY = "big-building:journey:v1";
export interface Journey {
  world: World;
  actorId: HeroId;
  session: number;
  latest: JournalEntry[];
  error: string;
}
export function startJourney(world: World = createWorld()): Journey {
  world = ensureAdventure(world);
  return {
    world,
    actorId: world.playerId!,
    session: 0,
    latest: [],
    error: "",
  };
}
export function loadJourney(): Journey {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    return startJourney(saved ? replay(JSON.parse(saved)) : createWorld());
  } catch {
    return {
      ...startJourney(),
      error:
        "存档无法读取，已打开临时旅程。原记录会保留到下一次行动，请先导出浏览器中的原存档。",
    };
  }
}
export type JourneyEvent =
  | { type: "commit"; command: Command; session: number }
  | { type: "batch"; commands: Command[]; session: number }
  | { type: "replace"; world: World }
  | { type: "error"; message: string };

/** A single serialized commit path for direct actions and model proposals. */
export function journeyReducer(state: Journey, event: JourneyEvent): Journey {
  if (event.type === "error") return { ...state, error: event.message };
  if (event.type === "replace")
    return { ...startJourney(event.world), session: state.session + 1 };
  try {
    if (event.session !== state.session)
      throw new Error("旅程已更换，请重新选择行动。");
    const commands = event.type === "batch" ? event.commands : [event.command];
    if (!commands.length || commands.length > 43)
      throw new Error("回合记录格式错误。");
    let world = state.world;
    for (const command of commands) {
      if (command.actor !== state.actorId)
        throw new Error("只能控制自己的角色。");
      world = execute(world, command);
    }
    return {
      ...state,
      world,
      error: "",
      latest: world.journal.slice(state.world.journal.length),
      actorId: state.actorId,
    };
  } catch (error) {
    return {
      ...state,
      error: error instanceof Error ? error.message : "行动未能完成。",
    };
  }
}
export function exportJourney(world: World) {
  download(
    JSON.stringify(toReplay(world), null, 2),
    `界构-旅程-${world.revision}.json`,
  );
}
export function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readJourney(file: File): Promise<World> {
  if (file.size > 2_000_000) throw new Error("请选择小于 2 MB 的旅程文件。");
  return replay(JSON.parse(await file.text()));
}
