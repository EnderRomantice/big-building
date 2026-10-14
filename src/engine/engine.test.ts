import { describe, expect, it } from "vitest";
import { activeNpcs, createWorld, execute, replay, toReplay } from "./engine";
import type { Command, HeroId, World } from "./types";
function act(
  w: World,
  type: Command["type"],
  args: Record<string, unknown> = {},
  actor: HeroId = "ranger",
) {
  return execute(w, {
    id: `cmd-${w.revision}`,
    expectedRevision: w.revision,
    actor,
    type,
    ...args,
  } as Command);
}
function regicide() {
  let w = act(createWorld(), "move", { destination: "throne" });
  while (w.npcs[0].hp > 0)
    w = act(w, "attack", { target: "king", skill: true });
  return w;
}
describe("world rules without a model", () => {
  it("advances a seeded immutable world, rejecting stale and duplicate commands", () => {
    const start = createWorld();
    const snapshot = structuredClone(start);
    const next = act(start, "wait");
    expect(start).toEqual(snapshot);
    expect(next.minute).toBe(540);
    expect(() => execute(next, next.history[0])).toThrow("已经结算");
    expect(() => execute(next, { ...next.history[0], id: "new" })).toThrow(
      "世界状态已变化",
    );
  });
  it("rejects unrecognized commands, forged effects, foreign targets, and prototype locations", () => {
    const w = createWorld();
    expect(() => act(w, "wait", { damage: 9999 })).toThrow("不支持");
    expect(() => act(w, "admin" as Command["type"])).toThrow("未知");
    expect(() => act(w, "move", { destination: "__proto__" })).toThrow(
      "未知地点",
    );
    expect(() => act(w, "attack", { target: "king", skill: "true" })).toThrow(
      "格式",
    );
    expect(() => act(w, "attack", { target: "king", skill: true })).toThrow(
      "不在此地",
    );
    expect(w.revision).toBe(0);
  });
  it("keeps the original plot alive when the party does nothing", () => {
    let w = createWorld();
    for (let i = 0; i < 4; i++) w = act(w, "wait");
    expect(w.minute).toBe(720);
    expect(w.npcs[0].hp).toBe(0);
    expect(w.flags.kingKiller).toBe("prince");
    expect(w.npcs[1].corruption).toBe(40);
    for (let i = 0; i < 3; i++) w = act(w, "wait");
    expect(w.npcs[1].corruption).toBe(100);
    expect(w.npcs[1].relation).toBe("hostile");
    w = act(w, "move", { destination: "throne" });
    while (w.npcs[1].hp > 0)
      w = act(w, "attack", { target: "prince", skill: true });
    expect(w.flags.resolved).toBe(true);
  });
  it("delays news before the prince can change plans", () => {
    let w = regicide();
    expect(w.npcs[1].relation).toBe("neutral");
    expect(w.npcs[1].location).toBe("archive");
    expect(w.flags.deathNewsAt).toBe(w.minute + 20);
    w = act(w, "wait");
    expect(w.npcs[1].relation).toBe("ally");
    expect(w.npcs[1].goal).toContain("放弃刺杀");
    expect(w.flags.throneOwner).toBeNull();
    expect(w.flags.kingKiller).toBe("艾琳");
  });
  it("can resolve the chapter through knowledge and purification, with no forced boss", () => {
    let w = act(createWorld(), "move", { destination: "archive" });
    w = act(w, "inspect");
    w = act(w, "move", { destination: "throne" });
    while (w.npcs[0].hp > 0)
      w = act(w, "attack", { target: "king", skill: true }, "mage");
    w = act(w, "cleanse", {}, "mage");
    expect(w.flags.resolved).toBe(true);
    expect(w.flags.throneOwner).toBeNull();
    expect(w.npcs.some((n) => n.id === "fallen")).toBe(false);
    for (let i = 0; i < 8; i++) w = act(w, "wait");
    expect(w.npcs[1].relation).toBe("ally");
    expect(w.npcs[1].corruption).toBe(0);
  });
  it("supports an explicit player-to-boss branch and ally assistance", () => {
    let w = regicide();
    w = act(w, "claim");
    expect(w.heroes[0].retired).toBe(true);
    expect(w.npcs.find((n) => n.id === "fallen")?.relation).toBe("hostile");
    expect(() => act(w, "wait")).toThrow("无法行动");
    w = act(w, "wait", {}, "mage");
    while (w.npcs.find((n) => n.id === "fallen")!.hp > 0)
      w = act(w, "attack", { target: "fallen", skill: true }, "mage");
    expect(w.flags.resolved).toBe(true);
    expect(w.journal.some((e) => e.title === "王子援护")).toBe(true);
  });
  it("prevents energy overdraft and escape during combat", () => {
    let w = act(createWorld(), "move", { destination: "throne" });
    w = act(w, "attack", { target: "king", skill: false });
    expect(() => act(w, "move", { destination: "courtyard" })).toThrow(
      "战斗中",
    );
    w.heroes[0].energy = 0;
    expect(() => act(w, "attack", { target: "king", skill: true })).toThrow(
      "能量不足",
    );
    expect(w.heroes[0].energy).toBe(0);
  });
  it("limits upgrades to level and awards shared XP", () => {
    expect(() => act(createWorld(), "upgrade")).toThrow("提升角色等级");
    let w = regicide();
    expect(w.heroes.map((h) => h.level)).toEqual([2, 2, 2]);
    w = act(w, "upgrade");
    expect(w.heroes[0].skillRank).toBe(2);
    expect(() => act(w, "upgrade")).toThrow("提升角色等级");
  });
  it("heals fallen allies without exceeding their maximum health", () => {
    const w = createWorld();
    w.heroes[1].hp = 0;
    const next = act(w, "heal", { target: "mage" });
    expect(next.heroes[1].hp).toBe(16);
    expect(next.heroes[0].energy).toBe(18);
    expect(() => act(next, "heal", { target: "warden" })).toThrow("需要治疗");
  });
  it("preserves characters and items across worlds with lossy energy conversion", () => {
    let w = regicide();
    w = act(w, "move", { destination: "rift" });
    const items = structuredClone(w.heroes[0].inventory);
    const levels = w.heroes.map((h) => h.level);
    const energies = w.heroes.map((h) => h.energy);
    w = act(w, "travel");
    expect(w.scenario).toBe("spirit");
    expect(w.heroes[0].inventory).toEqual(items);
    expect(w.heroes.map((h) => h.level)).toEqual(levels);
    expect(w.heroes.map((h) => h.energy)).toEqual(
      energies.map((e) => Math.floor(e * 0.7)),
    );
    expect(activeNpcs(w).map((n) => n.id)).toEqual(["sentinel"]);
    expect(() => act(w, "travel")).toThrow("战斗");
    while (w.npcs[2].hp > 0)
      w = act(w, "attack", { target: "sentinel", skill: true }, "mage");
    expect(w.heroes[1].inventory).toContain("灵境结晶");
    w = act(w, "travel");
    expect(w.scenario).toBe("crown");
    expect(w.heroes[0].inventory).toEqual(items);
  });
  it("cannot create energy with round-trip conversion and updates the distant world", () => {
    let w = act(createWorld(), "move", { destination: "rift" });
    w = act(w, "convert");
    expect(w.heroes[0].energy).toBe(18);
    w = act(w, "travel");
    for (let i = 0; i < 6; i++) w = act(w, "wait");
    expect(w.scenario).toBe("spirit");
    expect(w.npcs[0].hp).toBe(0);
    expect(w.npcs[1].relation).toBe("hostile");
  });
  it("replays a full branching game identically after serialization", () => {
    let w = regicide();
    w = act(w, "wait");
    w = act(w, "move", { destination: "rift" });
    w = act(w, "travel");
    while (w.npcs[2].hp > 0)
      w = act(w, "attack", { target: "sentinel", skill: true }, "mage");
    const restored = replay(JSON.parse(JSON.stringify(toReplay(w))));
    expect(restored).toEqual(w);
    expect(replay(toReplay(restored))).toEqual(w);
  });
  it("rejects incompatible and corrupt imports without mutating current progress", () => {
    expect(() => replay({ ...toReplay(createWorld()), seed: -1 })).toThrow(
      "随机种子",
    );
    expect(() => replay({ ...toReplay(createWorld()), version: 2 })).toThrow(
      "版本",
    );
    expect(() =>
      replay({ ...toReplay(createWorld()), commands: [null] }),
    ).toThrow("格式");
  });
});
