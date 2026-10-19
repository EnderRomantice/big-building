import { LOCATIONS, GROUND_ITEMS } from "./content";
import { geographyFor } from "./geography";
import {
  CAMPAIGN_ITEMS,
  CAMPAIGN_PLACES,
  campaignNeighbors,
} from "./succession";
import type { LocationId, Npc, World } from "./types";
export function visitedPlaces(world: World): LocationId[] {
  return (
    world.exploration?.visited ?? [
      ...new Set<LocationId>([
        "courtyard",
        world.location,
        ...world.journal.flatMap((e) => (e.location ? [e.location] : [])),
      ]),
    ]
  );
}
export function discovered(world: World, id: LocationId) {
  return visitedPlaces(world).includes(id);
}
export function locationName(world: World, id: LocationId) {
  return discovered(world, id)
    ? (LOCATIONS[id]?.name ?? "未知地点")
    : "未探索的去处";
}
export function pathsFrom(world: World) {
  if (world.campaign) return campaignNeighbors(world.location);
  if (world.scenario === "spirit") return [];
  return geographyFor(world.seed)
    .roads.filter((r) => r.from === world.location || r.to === world.location)
    .map((r, i) => ({
      ...r,
      destination: r.from === world.location ? r.to : r.from,
      clue: `${["向北延伸", "穿过街巷", "绕过坡地", "通向远处"][i % 4]}的道路，沿途尚未探索`,
    }));
}
export function groundItems(world: World) {
  return world.campaign ? CAMPAIGN_ITEMS : GROUND_ITEMS;
}
export function affinityOf(npc: Npc) {
  return (
    npc.affinity ??
    (npc.relation === "ally" ? 55 : npc.relation === "hostile" ? -50 : 0)
  );
}
export function aggression(world: World, target: Npc) {
  const before = affinityOf(target);
  target.affinity = Math.max(-100, before - 30);
  target.relation =
    target.affinity >= 25
      ? "ally"
      : target.affinity <= -20
        ? "hostile"
        : "neutral";
  for (const witness of world.npcs) {
    if (
      witness.id === target.id ||
      witness.location !== target.location ||
      witness.hp <= 0
    )
      continue;
    if (
      witness.relationships?.some((r) => r.target === target.id) ||
      (witness.faction && witness.faction === target.faction)
    ) {
      witness.affinity = Math.max(-100, affinityOf(witness) - 8);
      witness.relation =
        witness.affinity >= 25
          ? "ally"
          : witness.affinity <= -20
            ? "hostile"
            : "neutral";
    }
  }
  return `${target.name}好感 ${before} → ${target.affinity}（−30）。`;
}
export function localContext(world: World) {
  const place = CAMPAIGN_PLACES[world.location];
  return place?.town ?? place?.city ?? "legacy";
}
