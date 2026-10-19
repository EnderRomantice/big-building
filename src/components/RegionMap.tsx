import { useMotionState } from "../game/motion";
import { useCallback, useId, useMemo } from "react";
import { LOCATIONS } from "../engine/content";
import { clockText, dayText } from "../engine/engine";
import {
  describeRoute,
  findRoute,
  formatDistance,
  geographyFor,
  MAP_HEIGHT,
  MAP_WIDTH,
  regionAt,
  regionIntel,
  roadBlock,
  routeUnavailable,
} from "../engine/geography";
import type { Point, RegionId } from "../engine/geography";
import type { LocationId, World } from "../engine/types";
import type { ActionOption } from "../engine/actions";
import Modal from "./Modal";

// Texture alone distinguishes terrain. Blur applies to grains, never roads or text.
const REGION_TEXTURES: Record<
  RegionId,
  { spacing: number; radius: number; blur: number; opacity: number }
> = {
  crown: { spacing: 13, radius: 0.7, blur: 0, opacity: 0.4 },
  town: { spacing: 9, radius: 0.85, blur: 0.1, opacity: 0.45 },
  lowlands: { spacing: 15, radius: 2.8, blur: 1.7, opacity: 0.24 },
  wilds: { spacing: 10, radius: 1.65, blur: 0.35, opacity: 0.4 },
};

function path(points: Point[], closed = false) {
  return (
    points
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ") + (closed ? " Z" : "")
  );
}
export default function RegionMap({
  world,
  options,
  busy,
  aiming,
  onAction,
}: {
  world: World;
  options: ActionOption[];
  busy: boolean;
  aiming: boolean;
  onAction: (option: ActionOption) => void;
}) {
  const textureId = useId();
  const map = useMemo(() => geographyFor(world.seed), [world.seed]);
  const currentRegion = regionAt(map, world.location);
  const [hovered, setHovered] = useMotionState<RegionId | null>(null);
  const [pinned, setPinned] = useMotionState<RegionId | null>(null);
  const infoRegion = map.regions.find(
    (region) => region.id === (hovered ?? pinned),
  );
  const info = infoRegion ? regionIntel(world, infoRegion.id) : null;
  const [selection, setSelection] = useMotionState<{
    id: LocationId;
    revision: number;
  } | null>(null);
  const selected = selection?.revision === world.revision ? selection.id : null;
  const route = selected ? findRoute(world, selected, map) : null;
  const option = options.find(
    (o) => o.command.type === "move" && o.command.destination === selected,
  );
  const blocked = selected ? routeUnavailable(world, selected) : undefined;
  const view = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
  const closeRoute = useCallback(() => setSelection(null), []);
  function select(id: LocationId) {
    setHovered(null);
    setPinned(null);
    setSelection({ id, revision: world.revision });
  }
  const activeRoads = new Set(route?.roads.map((road) => road.id));
  if (world.scenario === "spirit")
    return (
      <section className="map-section spirit-atlas" aria-label="灵境地图">
        <span className="section-label">世界彼岸 / 灵境回廊</span>
        <svg viewBox="0 0 640 230" aria-hidden="true">
          <path d="M190 159 L212 70 L299 30 L404 48 L451 130 L409 195 L290 210 Z" />
          <ellipse cx="320" cy="120" rx="31" ry="57" />
          <circle cx="320" cy="120" r="5" />
        </svg>
        <p>你在灵境回廊</p>
        <small>完成当前试炼后，可通过下方界隙返回王座余烬。</small>
      </section>
    );
  return (
    <section
      className="map-section atlas"
      aria-label="地点地图"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setHovered(null);
          setPinned(null);
        }
      }}
    >
      <div className="atlas-heading">
        <div aria-live="polite" aria-atomic="true">
          <span className="section-label">王座余烬 / {currentRegion.name}</span>
          <h2>
            {LOCATIONS[world.location].name}
            <small>当前位置</small>
          </h2>
        </div>
      </div>
      <div className="atlas-caption">
        <span>沿道路探索 · 点击地点确认路程</span>
        <span aria-label="地图上北下南，左西右东">北 ↑</span>
      </div>
      <div className="atlas-stage" onPointerLeave={() => setHovered(null)}>
        {infoRegion && info && (
          <aside
            className="region-info"
            id={`${textureId}-info`}
            aria-label={`${infoRegion.name}区域信息`}
          >
            <div className="region-info-title">
              <strong>{infoRegion.name}</strong>
              <button
                className="quiet"
                aria-label="关闭区域信息"
                onClick={() => {
                  setHovered(null);
                  setPinned(null);
                }}
              >
                关闭
              </button>
            </div>
            <p>{infoRegion.terrain}</p>
            <dl>
              <dt>危险等级</dt>
              <dd>
                {info.danger} / 5 · {info.dangerLabel}
              </dd>
              <dt>资源</dt>
              <dd>
                {info.resources.length
                  ? info.resources.join("、")
                  : "暂无已知可获取资源"}
              </dd>
              <dt>关键人物</dt>
              <dd>
                {info.people.length
                  ? info.people
                      .map((person) => `${person.name}（${person.location}）`)
                      .join("、")
                  : "暂无已知人物"}
              </dd>
            </dl>
          </aside>
        )}
        <div
          className="atlas-scroll"
          tabIndex={0}
          aria-label="地图画布，窄屏可横向滚动"
        >
          <div
            className="atlas-canvas"
            style={{ aspectRatio: `${view.width} / ${view.height}` }}
          >
            <svg
              viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
              aria-label="不规则区域与道路"
              role="group"
            >
              <defs>
                {map.regions.map((region) => {
                  const texture = REGION_TEXTURES[region.id];
                  const id = `${textureId}-${region.id}`;
                  return (
                    <g key={id}>
                      <filter
                        id={`${id}-blur`}
                        x="-50%"
                        y="-50%"
                        width="200%"
                        height="200%"
                        colorInterpolationFilters="sRGB"
                      >
                        <feGaussianBlur stdDeviation={texture.blur} />
                      </filter>
                      <pattern
                        id={id}
                        width={texture.spacing}
                        height={texture.spacing}
                        patternUnits="userSpaceOnUse"
                      >
                        <rect
                          width={texture.spacing}
                          height={texture.spacing}
                          fill="white"
                        />
                        <g
                          fill="black"
                          opacity={texture.opacity}
                          filter={`url(#${id}-blur)`}
                        >
                          <circle
                            cx={texture.spacing * 0.25}
                            cy={texture.spacing * 0.3}
                            r={texture.radius}
                          />
                          <circle
                            cx={texture.spacing * 0.72}
                            cy={texture.spacing * 0.76}
                            r={texture.radius * 0.65}
                          />
                        </g>
                      </pattern>
                    </g>
                  );
                })}
              </defs>
              {map.regions.map((region) => (
                <g
                  key={region.id}
                  className={`atlas-region region-${region.id} ${region.id === currentRegion.id ? "inhabited" : ""} ${infoRegion?.id === region.id ? "inspected" : ""}`}
                >
                  <path
                    d={path(region.polygon, true)}
                    style={{ fill: `url(#${textureId}-${region.id})` }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={pinned === region.id}
                    aria-describedby={
                      infoRegion?.id === region.id
                        ? `${textureId}-info`
                        : undefined
                    }
                    aria-label={`查看${region.name}区域信息`}
                    onPointerEnter={() => setHovered(region.id)}
                    onFocus={() => setHovered(region.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => setPinned(region.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setPinned(region.id);
                      }
                    }}
                  />
                  {
                    <text
                      x={region.center.x}
                      y={region.center.y - 73}
                      className="region-name"
                    >
                      {region.name}
                    </text>
                  }
                </g>
              ))}
              <g className="atlas-roads" aria-hidden="true">
                {map.roads.map((road) => (
                  <path
                    key={road.id}
                    d={path(road.points)}
                    className={`${roadBlock(world, road) ? "road-blocked" : ""} ${activeRoads.has(road.id) ? "road-selected" : ""}`}
                  />
                ))}
              </g>
              <path
                d={path(map.outline, true)}
                className="atlas-coast"
                aria-hidden="true"
              />
            </svg>
            {Object.values(map.places).map((place) => {
              const current = place.id === world.location;
              const unavailable = place.id === "ruins" && !world.flags.lore;
              return (
                <button
                  key={place.id}
                  className={`map-place ${current ? "here" : ""} ${selected === place.id ? "selected" : ""} ${unavailable ? "unreachable" : ""}`}
                  style={{
                    left: `${((place.x - view.x) / view.width) * 100}%`,
                    top: `${((place.y - view.y) / view.height) * 100}%`,
                  }}
                  aria-current={current ? "location" : undefined}
                  aria-pressed={selected === place.id}
                  aria-label={`${LOCATIONS[place.id].name}${current ? "，当前位置" : unavailable ? "，需解读石门符文" : "，规划路线"}`}
                  onClick={() => select(place.id)}
                >
                  <span className="place-dot" aria-hidden="true">
                    {unavailable ? "×" : ""}
                  </span>
                  <span className="place-name">{LOCATIONS[place.id].name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="atlas-footer">
        <div className="map-legend" aria-label="图例">
          <span>● 你的位置</span>
          <span>─ 道路</span>
          <span>┄ 条件未满足</span>
        </div>
        <label className="map-destination">
          目的地
          <select
            value={selected ?? ""}
            onChange={(event) => {
              if (event.target.value) select(event.target.value as LocationId);
              else setSelection(null);
            }}
          >
            <option value="">选择地点</option>
            {Object.keys(map.places).map((id) => (
              <option key={id} value={id}>
                {LOCATIONS[id as LocationId].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected && (
        <Modal title={`前往${LOCATIONS[selected].name}？`} onClose={closeRoute}>
          <div className="route-preview">
            <p className="section-label">{regionAt(map, selected).name}</p>
            <p className="route-description">
              {LOCATIONS[selected].description}
            </p>
            {blocked ? (
              <p className="route-condition">{blocked}</p>
            ) : (
              route && (
                <>
                  <p className="route-itinerary">{describeRoute(route)}</p>
                  <div className="route-summary">
                    <strong>
                      {formatDistance(route.distance)} <span> / </span>{" "}
                      {route.minutes} 分钟
                    </strong>
                    <span>
                      预计 {dayText(world.minute + route.minutes)}{" "}
                      {clockText(world.minute + route.minutes)} 抵达
                    </span>
                  </div>
                  <details className="route-segments">
                    <summary>道路畅通 · 查看各段路程</summary>
                    <ul>
                      {route.roads.map((road, i) => (
                        <li key={road.id}>
                          <span>
                            {LOCATIONS[route.stops[i]].name} →{" "}
                            {LOCATIONS[route.stops[i + 1]].name}
                          </span>
                          <span>
                            {road.terrain} · {formatDistance(road.distance)} ·{" "}
                            {road.minutes} 分钟
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )
            )}
            <p className="hint">
              {busy
                ? "等待当前回合结束"
                : aiming
                  ? "先完成或取消对象选择"
                  : "途中时间流逝，远方人物也会继续行动。"}
            </p>
            <div className="modal-actions">
              <button className="quiet" onClick={closeRoute}>
                暂不过去
              </button>
              {selected !== world.location && (
                <button
                  className="primary-button"
                  disabled={!option || busy || aiming || Boolean(blocked)}
                  onClick={() => {
                    if (option) {
                      setSelection(null);
                      onAction(option);
                    }
                  }}
                >
                  确认出发 →
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      <p className="atlas-hint">
        点击地点确认路程；悬停或点击区域，查看危险、资源与关键人物。
      </p>
    </section>
  );
}
