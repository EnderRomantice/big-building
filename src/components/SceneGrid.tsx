import { careerSkill } from "../engine/careers";
import { REGIONAL_SKILLS, CAMPAIGN_ITEMS } from "../engine/succession";
import { useEffect, useRef } from "react";
import { LOCATIONS } from "../engine/content";
import type { ActionAim, HeroId, Npc, NpcId, World } from "../engine/types";
import type { ActionOption } from "../engine/actions";
export default function SceneGrid({
  world,
  options,
  nearby,
  aiming,
  onCancelAim,
  busy,
  onSelect,
  onAction,
  onInspect,
}: {
  world: World;
  options: ActionOption[];
  nearby: Npc[];
  aiming: ActionAim | null;
  onCancelAim: () => void;
  busy: boolean;
  onSelect: (id: HeroId | NpcId) => void;
  onAction: (option: ActionOption) => void;
  onInspect: (id: NpcId) => void;
}) {
  const targets = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aiming === null) return;
    const first = targets.current?.querySelector<HTMLButtonElement>(
      ".targetable:not(:disabled)",
    );
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "nearest" });
  }, [aiming]);
  const learned = REGIONAL_SKILLS.find((s) => s.id === aiming);
  const job = aiming?.startsWith("job-") ? careerSkill(aiming) : undefined;
  const healing =
    aiming === "heal" || learned?.kind === "heal" || job?.kind === "heal";
  const objects = options.filter((o) =>
    [
      "take",
      "inspect",
      "cleanse",
      "rest",
      "travel",
      "learn",
      "pledge",
      "wait",
    ].includes(o.command.type),
  );
  return (
    <>
      <section className="objects-section" aria-label="在场人物与物品">
        <div className="scene-heading">
          <h2>
            {world.scenario === "spirit"
              ? "灵境回廊"
              : LOCATIONS[world.location].name}
          </h2>
          {aiming !== null ? (
            <button className="quiet" onClick={onCancelAim}>
              选择对象 · 取消
            </button>
          ) : (
            <span>人物与物品</span>
          )}
        </div>
        <p className="scene-description">
          {world.scenario === "spirit"
            ? "界隙之后，熟悉的力量正在改变。"
            : LOCATIONS[world.location].description}
        </p>
        {world.campaign &&
          CAMPAIGN_ITEMS.filter(
            (i) =>
              i.location === world.location && !world.collected?.includes(i.id),
          ).map((i) => (
            <p className="hint" key={i.id}>
              当地陈列：{i.name} · {i.price} 铜钱。{i.description}
            </p>
          ))}
        {world.campaign &&
          REGIONAL_SKILLS.filter(
            (s) =>
              s.location === world.location &&
              !world.heroes[0].skills?.includes(s.id),
          ).map((s) => (
            <p className="hint" key={s.id}>
              这里可以学习{s.name} · 需要 Lv.{s.level} 与 10 铜钱。
              {s.description}
            </p>
          ))}
        <div ref={targets} className="tile-grid object-grid">
          {healing &&
            world.heroes
              .filter((hero) => !hero.retired)
              .map((hero) => {
                const canHeal = options.some(
                  (o) =>
                    (job
                      ? o.command.type === "invoke" &&
                        o.command.skill === job.id
                      : learned
                        ? o.command.type === "cast" &&
                          o.command.skill === learned.id
                        : o.command.type === "mend") &&
                    "target" in o.command &&
                    o.command.target === hero.id,
                );
                return (
                  <button
                    key={hero.id}
                    className={`tile heal-self ${canHeal ? "targetable" : ""}`}
                    disabled={busy || !canHeal}
                    onClick={() => onSelect(hero.id)}
                    aria-label={`${hero.name}，自己，生命 ${hero.hp}/${hero.maxHp}，治疗对象`}
                  >
                    <span>{hero.name} · 自己</span>
                    <small>
                      {hero.hp}/{hero.maxHp} HP
                      {canHeal
                        ? ` · 恢复最多 ${job?.power ?? learned?.bonus ?? 5} HP`
                        : " · 无需治疗"}
                    </small>
                  </button>
                );
              })}
          {nearby.map((npc) => {
            const canTarget =
              aiming !== null &&
              options.some((o) =>
                job
                  ? o.command.type === "invoke" &&
                    o.command.skill === job.id &&
                    o.command.target === npc.id
                  : learned
                    ? o.command.type === "cast" &&
                      o.command.skill === learned.id &&
                      o.command.target === npc.id
                    : aiming === "heal"
                      ? o.command.type === "mend" && o.command.target === npc.id
                      : (o.command.type === "strike" ||
                          o.command.type === "assault") &&
                        o.command.target === npc.id &&
                        o.command.skill === (aiming === "skill"),
              );
            return (
              <button
                key={npc.id}
                className={`tile npc-tile relation-${npc.relation} ${canTarget ? "targetable" : ""}`}
                aria-label={`${npc.name}，${npc.relation === "hostile" ? "敌对" : npc.relation === "ally" ? "友善／同阵营" : "中立"}，生命 ${npc.hp}/${npc.maxHp}${canTarget ? "，选择为行动对象" : "，查看详情"}`}
                disabled={aiming !== null && (busy || !canTarget)}
                onClick={() =>
                  aiming !== null ? onSelect(npc.id) : onInspect(npc.id)
                }
              >
                <span>{npc.name}</span>
                <small>
                  {canTarget
                    ? healing
                      ? `治疗 · 恢复最多 ${job?.power ?? learned?.bonus ?? 5} HP`
                      : "选择对象"
                    : `生命 ${npc.hp}/${npc.maxHp}`}
                </small>
              </button>
            );
          })}
          {objects.map((option) => (
            <button
              key={option.label}
              className="tile object-tile"
              disabled={busy || aiming !== null}
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
