import { LOCATIONS } from "../engine/content";
import type { LocationId, Npc, NpcId, World } from "../engine/types";
import type { ActionOption } from "../engine/actions";
const MAP_ORDER: LocationId[] = [
  "courtyard",
  "smithy",
  "shop",
  "archive",
  "throne",
  "rift",
];
export default function SceneGrid({
  world,
  options,
  nearby,
  selected,
  busy,
  onSelect,
  onAction,
}: {
  world: World;
  options: ActionOption[];
  nearby: Npc[];
  selected: NpcId | null;
  busy: boolean;
  onSelect: (id: NpcId) => void;
  onAction: (option: ActionOption) => void;
}) {
  const objects = options.filter((o) =>
    ["take", "inspect", "cleanse", "rest", "travel"].includes(o.command.type),
  );
  return (
    <>
      <section className="map-section" aria-label="地点地图">
        <div className="tile-grid map-grid">
          {(world.scenario === "crown" ? MAP_ORDER : ["rift" as const]).map(
            (id) => {
              const current = world.location === id;
              const move = options.find(
                (o) =>
                  o.command.type === "move" && o.command.destination === id,
              );
              return (
                <button
                  key={id}
                  className={`tile map-tile ${current ? "current" : ""}`}
                  aria-current={current ? "location" : undefined}
                  aria-label={`${id === "throne" ? "王宫" : world.scenario === "spirit" ? "灵境回廊" : LOCATIONS[id].name}${current ? "，当前位置" : "，前往"}`}
                  disabled={busy || (!current && !move)}
                  onClick={() => {
                    if (move) onAction(move);
                  }}
                >
                  <span>
                    {id === "throne"
                      ? "王宫"
                      : world.scenario === "spirit"
                        ? "灵境回廊"
                        : LOCATIONS[id].name}
                  </span>
                  <small>
                    {current ? "你在这里" : move ? "30 分钟" : "暂不可达"}
                  </small>
                </button>
              );
            },
          )}
        </div>
      </section>
      <section className="objects-section" aria-label="在场人物与物品">
        <div className="scene-heading">
          <h2>
            {world.scenario === "spirit"
              ? "灵境回廊"
              : LOCATIONS[world.location].name}
          </h2>
          <span>人物与物品</span>
        </div>
        <div className="tile-grid object-grid">
          {nearby.map((npc) => (
            <button
              key={npc.id}
              className={`tile npc-tile ${selected === npc.id ? "selected" : ""}`}
              aria-pressed={selected === npc.id}
              disabled={busy}
              onClick={() => onSelect(npc.id)}
            >
              <small>
                {npc.relation === "hostile"
                  ? "敌对"
                  : npc.relation === "ally"
                    ? "盟友"
                    : "NPC"}
                {selected === npc.id ? " · 已选中" : ""}
              </small>
              <span>{npc.name}</span>
              <small>{`生命 ${npc.hp}/${npc.maxHp}`}</small>
            </button>
          ))}
          {objects.map((option) => (
            <button
              key={option.label}
              className="tile object-tile"
              disabled={busy}
              onClick={() => onAction(option)}
            >
              <small>
                {option.command.type === "take" ? "物品" : "可交互"}
              </small>
              <span>{option.label.replace(/^拾取/, "")}</span>
              <small>
                {option.costMinutes} 分钟
                {option.energyCost ? ` · ${option.energyCost} 能量` : ""}
              </small>
            </button>
          ))}
        </div>
        {!nearby.length && !objects.length && (
          <p className="hint">这里暂时没有可交互的人或物。</p>
        )}
      </section>
    </>
  );
}
