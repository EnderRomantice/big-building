import { characterFromWorld, validateCharacter } from "../engine/careers";
import type { CharacterRecord } from "../engine/careers";
import { execute } from "../engine/engine";
import type { World } from "../engine/types";
export const CHARACTERS_KEY = "big-building:characters:v1";
export function readCharacters(): CharacterRecord[] {
  const raw = localStorage.getItem(CHARACTERS_KEY);
  if (!raw) return [];
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length > 100)
    throw new Error("角色列表无法读取，请先保留原存档。");
  values.forEach(validateCharacter);
  return values;
}
export function saveCharacter(profile: CharacterRecord) {
  validateCharacter(profile);
  const all = readCharacters(),
    old = all.find((p) => p.id === profile.id);
  if (!old && all.length >= 100) throw new Error("角色列表已满。");
  if (old) {
    if (old.profession !== profile.profession)
      throw new Error("同一角色不能拥有两个职业身份。");
    const higher =
      old.level > profile.level ||
      (old.level === profile.level && old.xp > profile.xp)
        ? old
        : profile;
    profile = {
      ...higher,
      unlocked: [...new Set([...old.unlocked, ...profile.unlocked])],
    };
    validateCharacter(profile);
  }
  localStorage.setItem(
    CHARACTERS_KEY,
    JSON.stringify([...all.filter((p) => p.id !== profile.id), profile]),
  );
}
export function rememberCharacter(world: World) {
  const p = characterFromWorld(world);
  if (p) saveCharacter(p);
}
export function enableCareers(world: World) {
  if (world.careersVersion || world.turn?.queue.length) return world;
  return execute(world, {
    type: "enable_careers",
    actor: world.playerId!,
    id: crypto.randomUUID(),
    expectedRevision: world.revision,
  });
}
export function enterCharacter(world: World, profile: CharacterRecord) {
  world = enableCareers(world);
  const current = characterFromWorld(world);
  if (current && JSON.stringify(current) === JSON.stringify(profile))
    return world;
  return execute(world, {
    type: "adopt_character",
    profile,
    actor: world.playerId!,
    id: crypto.randomUUID(),
    expectedRevision: world.revision,
  });
}
