import { useMotionState } from "../game/motion";
import { useRef, useState } from "react";
import { clockText, dayText, replay, toReplay } from "../engine/engine";
import type { World } from "../engine/types";
import {
  download,
  exportJourney,
  readJourney,
  SAVE_KEY,
} from "../game/journey";
import Modal from "./Modal";

export default function JourneyMenu({
  world,
  onClose,
  onRestore,
  onReset,
}: {
  world: World;
  onClose: () => void;
  onRestore: (world: World) => void;
  onReset: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useMotionState<World | null>(null);
  const [reset, setReset] = useMotionState(false);
  const [message, setMessage] = useMotionState("");
  const [reading, setReading] = useState(false);
  async function importFile(selected?: File) {
    if (!selected) return;
    setReading(true);
    setMessage("");
    setPending(null);
    setReset(false);
    try {
      setPending(await readJourney(selected));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取存档。");
    } finally {
      setReading(false);
    }
  }
  return (
    <Modal title="这段旅程" onClose={onClose}>
      <p className="modal-copy">
        {dayText(world.minute)} · {clockText(world.minute)} ·{" "}
        {world.history.length} 次行动
        <br />
        每次行动后自动保存在此浏览器。
      </p>
      <div className="menu-list">
        <button onClick={() => exportJourney(world)}>
          导出旅程 <span>JSON ↗</span>
        </button>
        <button disabled={reading} onClick={() => file.current?.click()}>
          {reading ? "正在读取…" : "导入旅程"}
          <span>↗</span>
        </button>
        <button
          onClick={() => {
            try {
              replay(toReplay(world));
              setMessage(`已重放并验证 ${world.history.length} 次行动。`);
            } catch {
              setMessage("重放验证失败，请保留存档。");
            }
          }}
        >
          验证记录 <span>↗</span>
        </button>
        <button
          onClick={() => {
            setReset(true);
            setPending(null);
          }}
        >
          重新开始 <span>↗</span>
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          void importFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {(reset || pending) && (
        <div className="replace-confirm">
          <p>
            {pending
              ? `已验证导入文件的 ${pending.history.length} 次行动。恢复后会替换当前进度。`
              : world.characterId
                ? "重新开始会重置本世界的剧情、地点与物品；跨世界角色的等级、经验和技能树保留。"
                : "重新开始会替换当前角色在这个剧本中的进度。可以先导出，保留这段旅程。"}
          </p>
          <div className="modal-actions">
            <button
              className="quiet"
              onClick={() => {
                setReset(false);
                setPending(null);
              }}
            >
              取消
            </button>
            <button
              className="primary-button"
              onClick={() => (pending ? onRestore(pending) : onReset())}
            >
              {pending ? "恢复这段旅程" : "开始新旅程"}
            </button>
          </div>
        </div>
      )}
      <details className="disclosure">
        <summary tabIndex={0}>如何游玩</summary>
        <p className="modal-copy">
          在 Home 选择剧本和角色，每个角色分别保存进度。右侧通过「场景 /
          地图」切换内容。点击角色姓名或 NPC
          查看详情；点击道路确认路程与耗时，抵达后才会知道陌生地点的名字。先选攻击或治疗，再选场景中的对象。友善人物也能攻击，但会降低好感。
        </p>
        <p className="modal-copy">
          每次行动后，在场 NPC
          会自行决定说话、攻击、离开或结束回合。随身物品可以更换武器、使用药草。
          {world.campaign === "succession-v1"
            ? "客栈可付费休整，医馆可以疗伤。寻找各地的师承与封存文书，七日后决定在登阙议会上支持谁。"
            : "庭院可以休整；时间推进时，王子的计划也会继续。"}
        </p>
        <p className="modal-copy">
          输入框可以切换行动和说话；行动先识别并确认，说话直接作为台词发送。Enter
          发送，Shift + Enter 换行。发送后会等待 NPC
          回应；取消则放弃整个未完成回合。模型不可用时，会明确标注规则回应。
        </p>
      </details>
      <details className="disclosure">
        <summary tabIndex={0}>存档恢复</summary>
        <p className="hint">
          如果自动存档读取失败，可以先下载浏览器中的原记录。
        </p>
        <button
          className="text-button"
          onClick={() => {
            try {
              const raw = localStorage.getItem(SAVE_KEY);
              if (raw) download(raw, "界构-原始存档.json");
              else setMessage("浏览器中没有保存的记录。");
            } catch {
              setMessage("浏览器存储不可用。");
            }
          }}
        >
          导出浏览器原记录
        </button>
      </details>
    </Modal>
  );
}
