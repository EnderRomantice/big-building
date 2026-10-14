import {
  ENERGY_COST,
  GROUND_ITEMS,
  LOCATIONS,
  SKILLS,
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
  if (world.playerId && (actor !== world.playerId || world.turn?.queue.length))
    return [];
  const hero = world.heroes.find((h) => h.id === actor)!;
  const raw: { label: string; action: ActionPayload; confirmation?: string }[] =
    [
      ...Object.entries(LOCATIONS).map(([destination, place]) => ({
        label: `前往${place.name}`,
        action: { type: "move", destination } as ActionPayload,
      })),
      ...activeNpcs(world)
        .filter((n) => n.relation !== "ally")
        .flatMap((n) =>
          [false, true].map((skill) => ({
            label: `${skill ? SKILLS[actor] : world.playerId ? `用${heldWeapon(hero)}攻击` : "普通攻击"} · ${n.name}`,
            action: {
              type: world.playerId ? "strike" : "attack",
              target: n.id,
              skill,
            } as ActionPayload,
            ...(n.relation === "neutral"
              ? {
                  confirmation: `${n.name}尚未与你为敌。攻击将开始战斗。在场 NPC 会决定如何回应，战斗结束前无法离开。`,
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
      ...world.heroes
        .filter((h) => !h.retired && h.hp < h.maxHp)
        .map((h) => ({
          label: `治疗${h.name}`,
          action: { type: "heal", target: h.id } as ActionPayload,
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
        (action.type === "attack" || action.type === "strike") && action.skill
          ? ENERGY_COST.skill
          : action.type === "heal"
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
