import { GROUND_ITEMS, LOCATIONS } from "./content";
import type { LocationId, World } from "./types";

export type RegionId = "crown" | "town" | "lowlands" | "wilds";
export interface Point {
  x: number;
  y: number;
}
export interface Region {
  id: RegionId;
  name: string;
  terrain: string;
  parent: "ashen-realm";
  polygon: Point[];
  center: Point;
}
export interface MapPlace extends Point {
  id: LocationId;
  region: RegionId;
}
export interface Road {
  id: string;
  from: LocationId;
  to: LocationId;
  points: Point[];
  distance: number;
  minutes: number;
  terrain: "石板路" | "荒野小径" | "山路";
  requirement?: "lore";
}
export interface Geography {
  seed: number;
  outline: Point[];
  regions: Region[];
  places: Record<LocationId, MapPlace>;
  roads: Road[];
}
export interface Route {
  stops: LocationId[];
  roads: Road[];
  distance: number;
  minutes: number;
}
export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 640;
export const LEGACY_LOCATIONS: LocationId[] = [
  "courtyard",
  "archive",
  "throne",
  "rift",
  "smithy",
  "shop",
];
const REGION_SITES: {
  id: RegionId;
  name: string;
  terrain: string;
  x: number;
  y: number;
}[] = [
  { id: "crown", name: "王冠高地", terrain: "高墙与古老石阶", x: 300, y: 180 },
  { id: "town", name: "灰石城", terrain: "街巷与炉火", x: 270, y: 410 },
  { id: "lowlands", name: "雾河低地", terrain: "草坡与河谷", x: 580, y: 440 },
  { id: "wilds", name: "界隙荒境", terrain: "山脊与遗迹", x: 695, y: 215 },
];
const PLACE_LAYOUT: [LocationId, RegionId, number, number][] = [
  ["archive", "crown", -50, 25],
  ["throne", "crown", 85, -5],
  ["smithy", "town", -70, -25],
  ["shop", "town", 65, -30],
  ["courtyard", "town", 0, 85],
  ["gate", "lowlands", -80, 35],
  ["valley", "lowlands", 80, -10],
  ["rift", "wilds", -75, 35],
  ["ruins", "wilds", 65, -5],
];

// Separate PRNG: drawing or planning a route never consumes combat randomness.
function randomSource(seed: number) {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function clip(polygon: Point[], a: Point, b: Point): Point[] {
  const nx = b.x - a.x,
    ny = b.y - a.y;
  const limit = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2;
  const side = (p: Point) => p.x * nx + p.y * ny - limit;
  return polygon.flatMap((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const dp = side(p),
      dq = side(q);
    const result: Point[] = dp <= 0 ? [p] : [];
    if (dp <= 0 !== dq <= 0) {
      const t = dp / (dp - dq);
      result.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
    return result;
  });
}
export function containsPoint(polygon: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function regionAt(map: Geography, id: LocationId) {
  return map.regions.find((region) => region.id === map.places[id].region)!;
}

/** Seeded Voronoi cells clipped to a convex, irregular coastline; shared borders have no gaps. */
export function generateGeography(seed: number): Geography {
  const random = randomSource(seed);
  const jitter = (range: number) => (random() - 0.5) * range;
  const outline = Array.from({ length: 19 }, (_, i) => {
    const angle = ((i + jitter(0.6)) * Math.PI * 2) / 19;
    return { x: 480 + Math.cos(angle) * 435, y: 320 + Math.sin(angle) * 282 };
  });
  const sites = REGION_SITES.map((site) => ({
    ...site,
    x: site.x + jitter(48),
    y: site.y + jitter(40),
  }));
  const regions: Region[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    terrain: site.terrain,
    parent: "ashen-realm",
    center: { x: site.x, y: site.y },
    polygon: sites
      .filter((other) => other.id !== site.id)
      .reduce((polygon, other) => clip(polygon, site, other), outline),
  }));
  // Perturb each shared border once, then reuse it in reverse for its neighbor.
  // This gives natural broken contours without independent polygons drifting apart.
  const borderRandom = randomSource(seed ^ 0x85ebca6b);
  const keyFor = (p: Point) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
  const borders = new Map<string, { count: number; points: Point[] }>();
  for (const region of regions) {
    region.polygon.forEach((a, i) => {
      const b = region.polygon[(i + 1) % region.polygon.length];
      const forward = keyFor(a) < keyFor(b);
      const key = [keyFor(a), keyFor(b)].sort().join("/");
      const existing = borders.get(key);
      if (existing) existing.count++;
      else borders.set(key, { count: 1, points: forward ? [a, b] : [b, a] });
    });
  }
  for (const border of borders.values()) {
    if (border.count !== 2) continue;
    const [a, b] = border.points;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const segments = Math.max(2, Math.ceil(length / 40));
    border.points = Array.from({ length: segments + 1 }, (_, i) => {
      if (i === 0) return a;
      if (i === segments) return b;
      const t = i / segments;
      const offset =
        (borderRandom() - 0.5) *
        Math.min(24, length * 0.1) *
        Math.sin(Math.PI * t);
      return {
        x: a.x + (b.x - a.x) * t - ((b.y - a.y) / length) * offset,
        y: a.y + (b.y - a.y) * t + ((b.x - a.x) / length) * offset,
      };
    });
  }
  for (const region of regions) {
    region.polygon = region.polygon.flatMap((a, i, polygon) => {
      const b = polygon[(i + 1) % polygon.length];
      const points = borders.get(
        [keyFor(a), keyFor(b)].sort().join("/"),
      )!.points;
      return (keyFor(a) < keyFor(b) ? points : [...points].reverse()).slice(
        0,
        -1,
      );
    });
  }
  const places = Object.fromEntries(
    PLACE_LAYOUT.map(([id, region, dx, dy]) => {
      const cell = regions.find((r) => r.id === region)!;
      const point = {
        x: cell.center.x + dx + jitter(18),
        y: cell.center.y + dy + jitter(18),
      };
      // Keep every marker and its label comfortably inside its region, even for extreme seeds.
      while (
        !containsPoint(cell.polygon, point) ||
        ![-42, 42].every((x) =>
          containsPoint(cell.polygon, { x: point.x + x, y: point.y + 27 }),
        )
      ) {
        point.x = (point.x + cell.center.x) / 2;
        point.y = (point.y + cell.center.y) / 2;
      }
      return [id, { ...point, id, region }];
    }),
  ) as Record<LocationId, MapPlace>;
  const links: [
    LocationId,
    LocationId,
    Road["terrain"],
    Road["requirement"]?,
  ][] = [
    ["courtyard", "shop", "石板路"],
    ["shop", "smithy", "石板路"],
    ["shop", "archive", "石板路"],
    ["archive", "throne", "石板路"],
    ["courtyard", "gate", "荒野小径"],
    ["gate", "valley", "荒野小径"],
    ["valley", "rift", "山路"],
    ["rift", "ruins", "山路", "lore"],
  ];
  if (random() > 0.5) links.push(["shop", "gate", "荒野小径"]);
  const roads = links.map(([from, to, terrain, requirement]) => {
    const a = places[from],
      b = places[to];
    const bend = jitter(0.16);
    const points = [
      a,
      {
        x: (a.x + b.x) / 2 - (b.y - a.y) * bend,
        y: (a.y + b.y) / 2 + (b.x - a.x) * bend,
      },
      b,
    ];
    // 100 map units = 1 km. Road time includes terrain speed, rounded once per segment.
    const distance = Math.round(
      points
        .slice(1)
        .reduce(
          (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
          0,
        ) * 10,
    );
    const metersPerMinute =
      terrain === "石板路" ? 100 : terrain === "荒野小径" ? 80 : 55;
    return {
      id: `${from}-${to}`,
      from,
      to,
      terrain,
      points,
      distance,
      minutes: Math.ceil(distance / metersPerMinute),
      ...(requirement ? { requirement } : {}),
    };
  });
  return { seed, outline, regions, places, roads };
}

// Bounded cache avoids regenerating geometry for every legal action and replay command.
const cache = new Map<number, Geography>();
export function geographyFor(seed: number): Geography {
  let map = cache.get(seed);
  if (!map) {
    map = generateGeography(seed);
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(seed, map);
  }
  return map;
}
export function roadBlock(world: World, road: Road): string | undefined {
  return road.requirement === "lore" && !world.flags.lore
    ? "需先在秘典书库调查，解读石门符文"
    : undefined;
}
function hostileAt(world: World, id: LocationId) {
  return world.npcs.some(
    (npc) =>
      npc.location === id &&
      npc.id !== "sentinel" &&
      npc.hp > 0 &&
      npc.relation === "hostile",
  );
}
/** Dijkstra over actual roads; hostile intermediate stops cannot be bypassed by a long move. */
export function findRoute(
  world: World,
  destination: LocationId,
  map = geographyFor(world.seed),
  from = world.location,
): Route | null {
  if (world.scenario !== "crown") return null;
  const distance = new Map<LocationId, number>([[from, 0]]);
  const previous = new Map<LocationId, { stop: LocationId; road: Road }>();
  const pending = new Set(Object.keys(map.places) as LocationId[]);
  while (pending.size) {
    const current = [...pending].sort(
      (a, b) => (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity),
    )[0];
    const cost = distance.get(current);
    if (cost === undefined) break;
    pending.delete(current);
    if (current === destination) {
      const stops: LocationId[] = [current],
        roads: Road[] = [];
      let cursor = current;
      while (cursor !== from) {
        const step = previous.get(cursor)!;
        roads.unshift(step.road);
        stops.unshift(step.stop);
        cursor = step.stop;
      }
      return {
        stops,
        roads,
        minutes: cost,
        distance: roads.reduce((sum, road) => sum + road.distance, 0),
      };
    }
    if (current !== from && hostileAt(world, current)) continue;
    for (const road of map.roads) {
      if (roadBlock(world, road)) continue;
      const next =
        road.from === current
          ? road.to
          : road.to === current
            ? road.from
            : null;
      if (!next || !pending.has(next)) continue;
      const nextCost = cost + road.minutes;
      if (nextCost < (distance.get(next) ?? Infinity)) {
        distance.set(next, nextCost);
        previous.set(next, { stop: current, road });
      }
    }
  }
  return null;
}
export function routeUnavailable(
  world: World,
  destination: LocationId,
): string | undefined {
  if (destination === world.location) return "你已在这里";
  if (world.scenario !== "crown") return "需要通过界隙返回王座余烬";
  if (destination === "ruins" && !world.flags.lore)
    return "需先在秘典书库调查，解读石门符文";
  if (hostileAt(world, world.location))
    return "战斗中无法离开，请先解决当前敌对关系";
  if (!findRoute(world, destination))
    return "没有可通行的道路，沿途可能有敌人阻拦";
  return undefined;
}
export function describeRoute(route: Route) {
  return route.stops.map((id) => LOCATIONS[id].name).join(" → ");
}
export function formatDistance(meters: number) {
  return meters < 1000 ? `${meters} 米` : `${(meters / 1000).toFixed(1)} 公里`;
}

/** Public map information; resources correspond to implemented interactions. */
export function regionIntel(world: World, id: RegionId) {
  const map = geographyFor(world.seed);
  const places = new Set(
    Object.values(map.places)
      .filter((place) => place.region === id)
      .map((place) => place.id),
  );
  const npcs = world.npcs.filter(
    (npc) => places.has(npc.location) && npc.hp > 0 && npc.id !== "sentinel",
  );
  const baseline = { crown: 3, town: 1, lowlands: 2, wilds: 4 }[id];
  const danger = npcs.some((npc) => npc.relation === "hostile")
    ? Math.max(4, baseline)
    : baseline;
  const resources = GROUND_ITEMS.filter(
    (item) => places.has(item.location) && !world.collected?.includes(item.id),
  ).map((item) => `${item.name} · ${LOCATIONS[item.location].name}`);
  if (places.has("archive"))
    resources.push(`王座秘典 · ${world.flags.lore ? "已调查" : "可调查"}`);
  return {
    danger,
    dangerLabel: ["", "低", "较低", "中", "高", "极高"][danger],
    resources,
    people: npcs.map((npc) => ({
      name: npc.name,
      location: LOCATIONS[npc.location].name,
    })),
  };
}
