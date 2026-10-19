import { useCallback } from "react";
import { useMotionState } from "../game/motion";
import { LOCATIONS } from "../engine/content";
import { CAMPAIGN_PLACES } from "../engine/succession";
import {
  discovered,
  locationName,
  pathsFrom,
  visitedPlaces,
} from "../engine/worldContent";
import { clockText } from "../engine/engine";
import type { World, LocationId } from "../engine/types";
import type { ActionOption } from "../engine/actions";
import Modal from "./Modal";

export default function LocalMap({
  world,
  options,
  busy,
  movingTo,
  onAction,
}: {
  world: World;
  options: ActionOption[];
  busy: boolean;
  movingTo?: LocationId | null;
  aiming?: boolean;
  onAction: (option: ActionOption) => void;
}) {
  const [selected, setSelected] = useMotionState<{
    id: LocationId;
    revision: number;
  } | null>(null);
  const close = useCallback(() => setSelected(null), [setSelected]);
  const roads = pathsFrom(world),
    selection =
      selected?.revision === world.revision
        ? roads.find((r) => r.destination === selected.id)
        : undefined;
  const option = selection
    ? options.find(
        (o) =>
          o.command.type === "move" &&
          o.command.destination === selection.destination,
      )
    : undefined;
  const place = CAMPAIGN_PLACES[world.location];
  if (world.scenario === "spirit")
    return (
      <section className="local-map">
        <h2>灵境回廊</h2>
        <p className="hint">这里没有普通道路。返回场景，通过界隙离开。</p>
      </section>
    );
  return (
    <section className="local-map" aria-label="局部探索地图">
      <div className="atlas-heading">
        <div>
          <span className="section-label">
            脚下与前路 / {visitedPlaces(world).length} 处足迹
          </span>
          <h2>
            {LOCATIONS[world.location].name}
            <small>当前位置</small>
          </h2>
        </div>
      </div>
      <p className="scene-description">
        地图只记录你走过的路。陌生方向只有线索，抵达后才会揭晓名字。
      </p>
      <div className="local-terrain">
        <svg viewBox="0 0 760 280" role="group" aria-label="附近道路示意">
          <defs>
            <pattern
              id="local-grain"
              width="9"
              height="11"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="3" r="0.65" fill="#888" />
              <circle cx="7" cy="8" r="0.4" fill="#aaa" />
            </pattern>
            <radialGradient id="local-fog">
              <stop offset="35%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="white" stopOpacity="1" />
            </radialGradient>
          </defs>
          <path
            d="M36 146L71 70L159 39L239 62L311 30L401 48L464 25L563 44L674 90L723 161L665 233L568 254L451 237L336 266L217 229L120 248L55 212Z"
            fill="url(#local-grain)"
            stroke="#bbb"
          />
          {roads.map((r, i) => {
            const angle = (i / Math.max(roads.length, 1)) * Math.PI * 2;
            const x = 380 + Math.cos(angle) * 270,
              y = 140 + Math.sin(angle) * 100;
            return (
              <g key={r.destination}>
                <path
                  d={`M380 140 Q${(380 + x) / 2 + 15} ${(140 + y) / 2 - 10} ${x} ${y}`}
                  fill="none"
                  stroke={discovered(world, r.destination) ? "#555" : "#aaa"}
                  strokeDasharray={
                    discovered(world, r.destination) ? undefined : "3 6"
                  }
                />
                <g
                  className={`local-road-node ${movingTo === r.destination ? "is-moving" : ""}`}
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-disabled={busy}
                  aria-busy={movingTo === r.destination}
                  aria-label={`道路 ${i + 1}：${discovered(world, r.destination) ? locationName(world, r.destination) : r.clue}，${r.minutes} 分钟`}
                  onClick={() =>
                    !busy &&
                    setSelected({ id: r.destination, revision: world.revision })
                  }
                  onKeyDown={(event) => {
                    if (!busy && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setSelected({
                        id: r.destination,
                        revision: world.revision,
                      });
                    }
                  }}
                >
                  <circle cx={x} cy={y} r="4" fill="white" stroke="#777" />
                  <circle cx={x} cy={y} r="20" fill="transparent" />
                  <text
                    x={x}
                    y={y - 12}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#555"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </text>
                </g>
              </g>
            );
          })}
          <rect
            width="760"
            height="280"
            fill="url(#local-fog)"
            pointerEvents="none"
          />
          <circle cx="380" cy="140" r="7" fill="#222" />
          <circle cx="380" cy="140" r="12" stroke="#777" fill="none" />
          <text x="380" y="173" textAnchor="middle" fontSize="11">
            你在这里
          </text>
        </svg>
      </div>
      <div className="local-paths" aria-label="可探索的道路">
        {roads.map((road, i) => (
          <button
            key={road.destination}
            className={`local-path ${movingTo === road.destination ? "is-moving" : ""}`}
            disabled={busy}
            aria-busy={movingTo === road.destination}
            onClick={() =>
              setSelected({ id: road.destination, revision: world.revision })
            }
          >
            <span className="path-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{locationName(world, road.destination)}</strong>
              <small>
                {discovered(world, road.destination)
                  ? "走过的路，可以重访"
                  : road.clue}
              </small>
            </span>
            <span className="path-time">
              {movingTo === road.destination ? (
                <span className="t-shimmer" data-text="移动中…">
                  移动中…
                </span>
              ) : (
                <>
                  {road.minutes} 分钟 <span aria-hidden="true">↗</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
      {movingTo && (
        <p className="hint" role="status">
          正沿选中的道路移动中… 抵达后进入场景。
        </p>
      )}
      {place && (
        <p className="hint">
          此地适合 Lv.{place.level}{" "}
          左右的旅者。人物、资源与地方旧事在进入场景后发现。
        </p>
      )}
      {selection && (
        <Modal
          title={
            discovered(world, selection.destination)
              ? `前往${locationName(world, selection.destination)}？`
              : "沿这条道路探索？"
          }
          onClose={close}
        >
          <p className="modal-copy">
            {discovered(world, selection.destination)
              ? LOCATIONS[selection.destination].description
              : selection.clue + "。目的地的名字和人物尚未揭晓。"}
          </p>
          <div className="route-summary">
            <strong>
              {(selection.distance / 1000).toFixed(1)} 公里 /{" "}
              {selection.minutes} 分钟
            </strong>
            <span>预计 {clockText(world.minute + selection.minutes)} 抵达</span>
          </div>
          {!option && (
            <p role="status" className="hint">
              {busy
                ? "等待当前回合结束。"
                : "当前无法通行。请先解决在场的敌对关系或未完成回合。"}
            </p>
          )}
          <div className="modal-actions">
            <button className="quiet" onClick={close}>
              暂不过去
            </button>
            <button
              className="primary-button"
              disabled={busy || !option}
              onClick={() => {
                if (option) {
                  close();
                  onAction(option);
                }
              }}
            >
              确认出发 →
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
