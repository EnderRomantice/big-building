import { careerSkill, skillTree } from "./careers";
import {
  CAMPAIGN_ITEMS,
  CAMPAIGN_PLACES,
  REGIONAL_SKILLS,
  campaignNeighbors,
} from "./succession";
import { locationName, pathsFrom } from "./worldContent";
import {
  ENERGY_COST,
  GROUND_ITEMS,
  LOCATIONS,
  SKILLS,
  skillName,
  WEAPONS,
  heldWeapon,
} from "./content";
import { activeNpcs, execute } from "./engine";
import type { Command, HeroId, World } from "./types";

type Payload<T> = T extends Command
  ? Omit<T, "id" | "expectedRevision" | "actor">
  : never;
export type ActionPayload = Payload<Command>;
export interface ActionOption {
  label: string;
  command: Command;
  costMinutes: number;
  energyCost: number;
  confirmation?: string;
}

/** One action catalog for the UI and model. execute remains the authority. */
export function legalOptions(
  world: World,
  actor: HeroId,
  includeClaim = false,
): ActionOption[] {
  const base = world.campaign
    ? successionOptions(world, actor)
    : legacyOptions(world, actor, includeClaim);
  if (!world.careersVersion) return base;
  const ordinary = base.filter(
    (o) =>
      !(o.command.type === "assault" && o.command.skill) &&
      o.command.type !== "mend" &&
      o.command.type !== "upgrade",
  );
  const h = world.heroes.find((h) => h.id === actor)!;
  const extra: {
    action: ActionPayload;
    label: string;
    confirmation?: string;
  }[] = [];
  for (const s of skillTree(h.career!.profession)) {
    if (!h.career!.unlocked.includes(s.id))
      extra.push({
        action: { type: "unlock_skill", skill: s.id },
        label: `掌握${s.name}`,
      });
    else
      for (const target of s.kind === "attack"
        ? activeNpcs(world)
        : s.kind === "heal"
          ? [h, ...activeNpcs(world)]
          : [h])
        extra.push({
          action: { type: "invoke", skill: s.id, target: target.id },
          label: `${s.name} · ${target.name}`,
          ...(s.kind === "attack" &&
          "relation" in target &&
          target.relation !== "hostile"
            ? {
                confirmation: `攻击${target.name}会降低 30 好感，可能引发反击。`,
              }
            : {}),
        });
  }
  return [
    ...ordinary,
    ...extra.flatMap(({ action, label, confirmation }) => {
      const command = {
        ...action,
        actor,
        id: crypto.randomUUID(),
        expectedRevision: world.revision,
      } as Command;
      try {
        const next = execute(world, command);
        return [
          {
            command,
            label,
            confirmation,
            costMinutes: next.minute - world.minute,
            energyCost:
              action.type === "invoke" ? careerSkill(action.skill)!.energy : 0,
          },
        ];
      } catch {
        return [];
      }
    }),
  ];
}
function legacyOptions(
  world: World,
  actor: HeroId,
  includeClaim = false,
): ActionOption[] {
  if (world.playerId && (actor !== world.playerId || world.turn?.queue.length))
    return [];
  const hero = world.heroes.find((h) => h.id === actor)!;
  const raw: { label: string; action: ActionPayload; confirmation?: string }[] =
    [
      ...Object.entries(LOCATIONS)
        .filter(
          ([id]) =>
            !id.startsWith("s-") &&
            (!world.playerId ||
              pathsFrom(world).some((r) => r.destination === id)),
        )
        .map(([destination]) => ({
          label: `前往${locationName(world, destination as never)}`,
          action: { type: "move", destination } as ActionPayload,
        })),
      ...activeNpcs(world).flatMap((n) =>
        [false, true].map((skill) => ({
          label: `${skill ? SKILLS[actor] : world.playerId ? `用${heldWeapon(hero)}攻击` : "普通攻击"} · ${n.name}`,
          action: {
            type: world.playerId ? "assault" : "attack",
            target: n.id,
            skill,
          } as ActionPayload,
          ...(n.relation !== "hostile"
            ? {
                confirmation: `${n.name}尚未与你为敌。攻击会降低 30 好感；关系恶化后可能反击，目击者也可能降低好感。`,
              }
            : {}),
        })),
      ),
      ...(world.playerId
        ? [
            ...GROUND_ITEMS.filter(
              (item) =>
                item.location === world.location &&
                !world.collected?.includes(item.id),
            ).map((item) => ({
              label: `拾取${item.name}`,
              action: { type: "take", item: item.id } as ActionPayload,
            })),
            ...[
              null,
              ...hero.inventory.filter((item) => Object.hasOwn(WEAPONS, item)),
            ]
              .filter((weapon) => weapon !== hero.weapon)
              .map((weapon) => ({
                label: weapon ? `装备${weapon}` : "空手",
                action: { type: "equip", weapon } as ActionPayload,
              })),
            {
              label: "使用药草",
              action: { type: "use", item: "药草" } as ActionPayload,
            },
          ]
        : []),
      ...(world.playerId
        ? [
            ...world.heroes.filter((h) => !h.retired && h.hp > 0),
            ...activeNpcs(world),
          ]
        : world.heroes.filter((h) => !h.retired)
      )
        .filter((target) => target.hp < target.maxHp)
        .map((target) => ({
          label: `治疗${target.name}${world.playerId ? " · 恢复 5 HP" : ""}`,
          action: {
            type: world.playerId ? "mend" : "heal",
            target: target.id,
          } as ActionPayload,
        })),
      ...(
        [
          ["inspect", "调查王座秘典"],
          ["talk", "与王子交谈"],
          ["cleanse", "净化王座"],
          ["upgrade", "提升技能"],
          ["rest", "篝火休整"],
          [
            "travel",
            world.scenario === "crown" ? "进入灵境回廊" : "返回王座余烬",
          ],
          ["convert", "测试能量转换"],
          ["wait", "等待一小时"],
        ] as const
      ).map(([type, label]) => ({ label, action: { type } })),
      ...(includeClaim
        ? [
            {
              label: "接受王座",
              action: { type: "claim" } as const,
              confirmation:
                "当前角色将永久退出可控小队，成为敌对首领。你将切换到其他队员，继续面对这位曾经的同伴。",
            },
          ]
        : []),
    ];
  return raw.flatMap(({ label, action, confirmation }) => {
    const command: Command = {
      ...action,
      id: crypto.randomUUID(),
      expectedRevision: world.revision,
      actor,
    };
    try {
      const next = execute(world, command);
      const beforeHero = world.heroes.find((h) => h.id === actor)!;
      const energyCost =
        (action.type === "attack" ||
          action.type === "strike" ||
          action.type === "assault") &&
        action.skill
          ? ENERGY_COST.skill
          : action.type === "heal" || action.type === "mend"
            ? ENERGY_COST.heal
            : action.type === "cleanse"
              ? ENERGY_COST.cleanse
              : action.type === "convert"
                ? ENERGY_COST.convert
                : action.type === "travel"
                  ? beforeHero.energy - Math.floor(beforeHero.energy * 0.7)
                  : 0;
      return [
        {
          label,
          command,
          costMinutes: next.minute - world.minute,
          energyCost,
          confirmation,
        },
      ];
    } catch {
      return [];
    }
  });
}

function successionOptions(world: World, actor: HeroId): ActionOption[] {
  if (actor !== world.playerId || world.turn?.queue.length) return [];
  const h = world.heroes[0];
  if (!h.hp || h.retired) return [];
  const raw: { label: string; action: ActionPayload; confirmation?: string }[] =
    [];
  for (const road of campaignNeighbors(world.location))
    raw.push({
      label: `前往${locationName(world, road.destination)}`,
      action: { type: "move", destination: road.destination },
    });
  for (const n of activeNpcs(world))
    for (const skill of [false, true])
      raw.push({
        label: `${skill ? skillName(world, actor) : `用${heldWeapon(h)}攻击`} · ${n.name}`,
        action: { type: "assault", target: n.id, skill },
        ...(n.relation !== "hostile"
          ? {
              confirmation: `${n.name}尚未与你为敌。攻击降低 30 好感，目击者也可能受影响；关系恶化后对方可能反击。`,
            }
          : {}),
      });
  for (const target of [h, ...activeNpcs(world)])
    if (target.hp < target.maxHp)
      raw.push({
        label: `治疗${target.name} · 恢复 5 HP`,
        action: { type: "mend", target: target.id },
      });
  for (const item of CAMPAIGN_ITEMS.filter(
    (i) => i.location === world.location && !world.collected?.includes(i.id),
  ))
    raw.push({
      label: `购买${item.name} · ${item.price} 铜钱`,
      action: { type: "take", item: item.id },
    });
  for (const weapon of [null, ...h.inventory.filter((i) => WEAPONS[i])])
    if (weapon !== h.weapon)
      raw.push({
        label: weapon ? `装备${weapon}` : "空手",
        action: { type: "equip", weapon },
      });
  raw.push(
    { label: "使用药草", action: { type: "use", item: "药草" } },
    { label: "调查地方旧事", action: { type: "inspect" } },
    {
      label:
        CAMPAIGN_PLACES[world.location].building === "clinic"
          ? "医馆疗伤 · 5 铜钱"
          : "客栈休整 · 3 铜钱",
      action: { type: "rest" },
    },
    { label: "等待一小时", action: { type: "wait" } },
  );
  for (const skill of REGIONAL_SKILLS) {
    if (skill.location === world.location)
      raw.push({
        label: `学习${skill.name} · 10 铜钱 · Lv.${skill.level}`,
        action: { type: "learn", skill: skill.id },
      });
    if (h.skills?.includes(skill.id))
      for (const target of skill.kind === "heal"
        ? [h, ...activeNpcs(world)]
        : activeNpcs(world))
        raw.push({
          label: `${skill.name} · ${target.name}`,
          action: { type: "cast", skill: skill.id, target: target.id },
          ...(skill.kind === "attack" &&
          "relation" in target &&
          target.relation !== "hostile"
            ? {
                confirmation: `攻击${target.name}会降低 30 好感，可能引发反击。`,
              }
            : {}),
        });
  }
  if (world.location === "s-capital-palace")
    for (const n of world.npcs.filter(
      (n) =>
        n.id.endsWith("-royal") &&
        n.id !== "n-capital-royal" &&
        world.exploration!.visited.includes(n.location),
    ))
      raw.push({
        label: `在议会上支持${n.name}`,
        action: { type: "pledge", target: n.id },
        confirmation: `你将以证词支持${n.name}，结束本轮争储议会。这会记录为本剧本的结局。`,
      });
  return raw.flatMap(({ action, label, confirmation }) => {
    const command = {
      ...action,
      actor,
      id: crypto.randomUUID(),
      expectedRevision: world.revision,
    } as Command;
    try {
      const next = execute(world, command);
      return [
        {
          command,
          label,
          confirmation,
          costMinutes: next.minute - world.minute,
          energyCost:
            action.type === "assault" && action.skill
              ? 8
              : action.type === "mend"
                ? 6
                : action.type === "cast"
                  ? REGIONAL_SKILLS.find((s) => s.id === action.skill)!.energy
                  : 0,
        },
      ];
    } catch {
      return [];
    }
  });
}
