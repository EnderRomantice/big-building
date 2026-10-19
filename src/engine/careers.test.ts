import { describe, it, expect, vi } from "vitest";
import { createSuccession } from "./succession";
import {
  createWorld,
  ensureAdventure,
  execute,
  replay,
  toReplay,
} from "./engine";
import {
  CAREER_WORLDS,
  PROFESSIONS,
  starterSkills,
  skillTree,
  skillPoints,
  characterFromWorld,
  validateCharacter,
} from "./careers";
import type { CharacterRecord } from "./careers";
import {
  enableCareers,
  enterCharacter,
  saveCharacter,
  readCharacters,
} from "../game/characters";
import { journeySlot } from "../game/journey";
import { legalOptions, type ActionPayload } from "./actions";
import { finishByRules } from "./turn";
import { usableNpcSkills } from "./careerCombat";
import type { World } from "./types";
const act = (w: World, p: ActionPayload) =>
  execute(w, {
    ...p,
    actor: w.playerId!,
    id: crypto.randomUUID(),
    expectedRevision: w.revision,
  });
const finish = (w: World) => finishByRules(w).reduce(execute, w);
const profile = (profession = "soulsinger", level = 1): CharacterRecord => ({
  id: "test-traveler",
  name: "越界者",
  profession,
  level,
  xp: 0,
  unlocked: starterSkills(profession),
});

describe("world careers and portable characters", () => {
  it("defines distinct professions, common skills and prerequisite branches in every world", () => {
    for (const world of CAREER_WORLDS) {
      const jobs = PROFESSIONS.filter(
        (p) => p.world === world.id && p.playable,
      );
      expect(jobs).toHaveLength(3);
      for (const p of jobs) {
        const tree = skillTree(p.id);
        expect(tree.filter((s) => !s.profession)).toHaveLength(3);
        expect(tree.filter((s) => s.profession)).toHaveLength(4);
        expect(tree.find((s) => s.level === 6)!.requires).toHaveLength(2);
      }
    }
  });
  it("migrates after existing history without rewriting legacy replay", () => {
    const old = finish(act(createSuccession(1), { type: "inspect" }));
    expect(old.careersVersion).toBeUndefined();
    const next = enableCareers(old);
    expect(next.history.slice(0, -1)).toEqual(old.history);
    expect(next.npcs.every((n) => n.career && skillPoints(n) >= 0)).toBe(true);
    expect(replay(toReplay(next))).toEqual(next);
    expect(replay(toReplay(old))).toEqual(old);
  });
  it("creates any world profession in another world and retains advancement on return", () => {
    let a = enterCharacter(
      enableCareers(createSuccession(2)),
      profile("soulsinger", 2),
    );
    a = act(a, { type: "unlock_skill", skill: "job-soulsinger-1" });
    const advanced = characterFromWorld(a)!;
    const b = enterCharacter(
      enableCareers(ensureAdventure(createWorld(3))),
      advanced,
    );
    expect(b.heroes[0].career!.profession).toBe("soulsinger");
    expect(b.heroes[0].level).toBe(2);
    expect(b.heroes[0].career!.unlocked).toContain("job-soulsinger-1");
    expect(journeySlot(a)).not.toBe(journeySlot(b));
    expect(replay(toReplay(b))).toEqual(b);
    expect(replay(toReplay(a))).toEqual(a);
    expect(enterCharacter(a, characterFromWorld(b)!)).toEqual(a);
  });
  it("enforces level, prerequisite, points and rejects malformed or regressive profiles", () => {
    let w = enterCharacter(enableCareers(createSuccession(2)), profile());
    expect(() =>
      act(w, { type: "unlock_skill", skill: "job-soulsinger-1" }),
    ).toThrow("Lv.2");
    expect(() =>
      act(w, { type: "unlock_skill", skill: "job-vanguard-0" }),
    ).toThrow("职业");
    w = enterCharacter(w, profile("soulsinger", 6));
    expect(() =>
      act(w, { type: "unlock_skill", skill: "job-soulsinger-3" }),
    ).toThrow("前置");
    expect(() => enterCharacter(w, profile())).toThrow("倒退");
    expect(() =>
      validateCharacter({ ...profile(), unlocked: ["job-arcanist-3"] }),
    ).toThrow("技能树");
  });
  it("casts actual healing, validates targets/energy, and respects cooldown across turns", () => {
    let w = enterCharacter(
      enableCareers(createSuccession(4)),
      profile("soulsinger", 2),
    );
    w = act(w, { type: "unlock_skill", skill: "job-soulsinger-1" });
    w.heroes[0].hp -= 25;
    const first = act(w, {
      type: "invoke",
      skill: "job-soulsinger-1",
      target: w.playerId!,
    });
    expect(first.heroes[0].hp - w.heroes[0].hp).toBe(10);
    expect(first.heroes[0].energy).toBe(w.heroes[0].energy - 6);
    w = finish(first);
    expect(() =>
      act(w, {
        type: "invoke",
        skill: "job-soulsinger-1",
        target: w.playerId!,
      }),
    ).toThrow("冷却");
    w = finish(act(w, { type: "say", target: "narrator", text: "稍候。" }));
    expect(() =>
      act(w, {
        type: "invoke",
        skill: "job-soulsinger-1",
        target: w.playerId!,
      }),
    ).not.toThrow();
    expect(() =>
      act(w, {
        type: "invoke",
        skill: "job-soulsinger-0",
        target: "n-desert-royal",
      }),
    ).toThrow("在场");
    w.heroes[0].energy = 0;
    expect(() =>
      act(w, {
        type: "invoke",
        skill: "job-soulsinger-1",
        target: w.playerId!,
      }),
    ).toThrow("气力");
  });
  it("provides real NPC skill targets and one major action budget, with shields absorbing damage", () => {
    let w = enableCareers(createSuccession(9));
    const npc = w.npcs.find((n) => n.location === w.location)!;
    npc.relation = "hostile";
    npc.affinity = -50;
    w = act(w, { type: "say", target: "narrator", text: "来吧" });
    w = act(w, {
      type: "npc_step",
      npc: npc.id,
      action: "plan",
      tactic: "cautious",
      intent: "先防守，等下一轮进攻。",
    });
    w = act(w, {
      type: "npc_step",
      npc: npc.id,
      action: "guard",
      intent: "挡住下一击。",
    });
    expect(() =>
      act(w, {
        type: "npc_step",
        npc: npc.id,
        action: "attack",
        intent: "继续攻击。",
      }),
    ).toThrow("主要行动");
    expect(
      usableNpcSkills(w, w.npcs.find((n) => n.id === npc.id)!).every(
        (s) => !s.usable,
      ),
    ).toBe(true);
    w = act(w, {
      type: "npc_step",
      npc: npc.id,
      action: "end",
      intent: "留待下轮。",
    });
    const shield = w.npcs.find((n) => n.id === npc.id)!.career!.barrier;
    const unguarded = structuredClone(w);
    unguarded.npcs.find((n) => n.id === npc.id)!.career!.barrier = 0;
    const damage = act(unguarded, {
      type: "assault",
      target: npc.id,
      skill: false,
    });
    const defended = act(w, { type: "assault", target: npc.id, skill: false });
    expect(
      defended.npcs.find((n) => n.id === npc.id)!.hp -
        damage.npcs.find((n) => n.id === npc.id)!.hp,
    ).toBe(shield);
    w = act(defended, {
      type: "npc_step",
      npc: npc.id,
      action: "cast",
      skill: "job-swordsman-0",
      target: w.playerId!,
      intent: "以逐风斩反击。",
    });
    expect(w.heroes[0].hp).toBeLessThan(defended.heroes[0].hp);
    expect(w.npcs.find((n) => n.id === npc.id)!.energy).toBe(npc.energy - 5);
  });
  it("keeps shared progress and learned skills when an older world save is remembered", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    try {
      const veteran = {
        ...profile("soulsinger", 4),
        xp: 17,
        unlocked: [...starterSkills("soulsinger"), "job-soulsinger-1"],
      };
      saveCharacter(veteran);
      saveCharacter(profile("soulsinger", 1));
      expect(readCharacters()).toEqual([veteran]);
      saveCharacter({
        ...veteran,
        unlocked: [...veteran.unlocked, "job-soulsinger-2"],
      });
      saveCharacter(veteran);
      expect(readCharacters()[0].unlocked).toContain("job-soulsinger-2");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("exposes career spells rather than old anonymous special attacks in both scripts", () => {
    for (const base of [createSuccession(9), ensureAdventure(createWorld(9))]) {
      const w = enableCareers(base),
        options = legalOptions(w, w.playerId!);
      expect(
        options.some((o) => o.command.type === "assault" && o.command.skill),
      ).toBe(false);
      expect(options.some((o) => o.command.type === "upgrade")).toBe(false);
      if (w.campaign)
        expect(options.some((o) => o.command.type === "invoke")).toBe(true);
    }
  });
});
