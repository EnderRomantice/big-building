import { rememberCharacter } from "./characters";
import { useEffect, useReducer, useRef, useState } from "react";
import { toReplay } from "../engine/engine";
import type { Command } from "../engine/types";
import type { TurnResponse } from "../engine/turn";
import type { Advice } from "../engine/advice";
import { journeyReducer, loadJourney, SAVE_KEY, journeySlot } from "./journey";

export function useJourney() {
  const [journey, dispatch] = useReducer(
    journeyReducer,
    undefined,
    loadJourney,
  );
  const previous = useRef(journey.world);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [movingTo, setMovingTo] = useState<
    import("../engine/types").LocationId | null
  >(null);
  const [planning, setPlanning] = useState(false);
  const [warning, setWarning] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (previous.current === journey.world) return;
    previous.current = journey.world;
    try {
      const saved = JSON.stringify(toReplay(journey.world));
      localStorage.setItem(SAVE_KEY, saved);
      localStorage.setItem(journeySlot(journey.world), saved);
      rememberCharacter(journey.world);
      setSaveError("");
    } catch {
      setSaveError("自动保存失败，请导出旅程保存进度。");
    }
  }, [journey.world]);
  useEffect(() => () => controller.current?.abort(), [journey.session]);
  async function propose(intent: string): Promise<Advice | null> {
    if (controller.current || journey.world.turn?.queue.length) return null;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setPlanning(true);
    setWarning("");
    dispatch({ type: "error", message: "" });
    try {
      const response = await fetch("/api/agent/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: current.signal,
        body: JSON.stringify({
          replay: toReplay(journey.world),
          actor: journey.actorId,
          intent,
        }),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("无法连接行动服务，请重新运行 pnpm run dev。");
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "无法识别行动，请重试。");
      if (current.signal.aborted) return null;
      if (typeof result.narration !== "string" || !("proposal" in result))
        throw new Error("行动返回格式错误。");
      return result as Advice;
    } catch (error) {
      if (!current.signal.aborted)
        dispatch({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "行动识别失败，输入已保留。",
        });
      return null;
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
        setPlanning(false);
      }
    }
  }
  async function act(command?: Command): Promise<boolean> {
    if (controller.current) return false;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setMovingTo(command?.type === "move" ? command.destination : null);
    setWarning("");
    dispatch({ type: "error", message: "" });
    try {
      const response = await fetch("/api/agent/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: current.signal,
        body: JSON.stringify({ replay: toReplay(journey.world), command }),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("无法连接回合服务，请重新运行 pnpm run dev。");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "本回合未完成，请重试。");
      if (current.signal.aborted) return false;
      const result = data as TurnResponse;
      if (!Array.isArray(result.commands))
        throw new Error("回合返回格式错误。");
      const event = {
        type: "batch" as const,
        commands: result.commands,
        session: journey.session,
      };
      const checked = journeyReducer(journey, event);
      if (checked.error) throw new Error(checked.error);
      if (checked.world.turn?.queue.length)
        throw new Error("NPC 回合没有完整结束，请重试。");
      if (
        command &&
        JSON.stringify(result.commands[0]) !== JSON.stringify(command)
      )
        throw new Error("返回的行动与提交不一致。");
      dispatch(event);
      setWarning(result.warning ?? "");
      return true;
    } catch (error) {
      if (!current.signal.aborted)
        dispatch({
          type: "error",
          message:
            error instanceof Error && error.message !== "Failed to fetch"
              ? error.message
              : "无法连接本地服务，请确认 pnpm run dev 正在运行。",
        });
      return false;
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
        setMovingTo(null);
      }
    }
  }
  return {
    ...journey,
    dispatch,
    act,
    propose,
    planning,
    busy,
    movingTo,
    warning,
    saveError,
    cancel: () => controller.current?.abort(),
  };
}
