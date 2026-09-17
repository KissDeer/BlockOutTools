import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** 分隔条本身占的宽度（与 CSS 里的 grid 列宽一致） */
const DIVIDER_PX = 8;

/** 拖动分隔条时给两侧加的最小宽度，避免拖出一个看不见的画布 */
const MIN_SIDE_PX = 120;

/**
 * 左右分屏：左边逻辑图，右边拼接图，中间一根可拖的分隔条。
 *
 * 为什么是分屏而不是页签：这两半说的是**同一个区域**的两面（里面有哪些子区域 /
 * 它自己长什么样），切成页签就等于进一个区域必须丢掉一半上下文。
 *
 * 比例由外部持有（`store.splitRatio`），所以调整完切走再回来还在原处。
 */
export function SplitPane({ ratio, onRatioChange, left, right }: {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  left: ReactNode;
  right: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  /**
   * 两个画布库都按容器尺寸测量：挂载那一刻测到 0 宽就可能"渲染了但看不见"。
   * 所以第一帧先只让左边可见，等两侧都拿到真实宽度再显示右边。
   * （图与画布都懒加载，一次 resize 通常不够。）
   */
  const [revealed, setRevealed] = useState(false);
  const [revision, setRevision] = useState(0);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setRevealed(true);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // 分隔条一拖，右侧必须立刻重测；否则 Konva 画布会保留旧宽度
  const bumpRevision = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!revealed || !rightRef.current) return;
    const observer = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    observer.observe(rightRef.current);
    return () => observer.disconnect();
  }, [revealed, revision]);

  const applyFromClientX = useCallback((clientX: number) => {
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const usable = box.width - DIVIDER_PX;
    if (usable <= MIN_SIDE_PX * 2) return;
    const min = MIN_SIDE_PX / usable;
    const max = 1 - MIN_SIDE_PX / usable;
    onRatioChange(Math.min(max, Math.max(min, (clientX - box.left - DIVIDER_PX / 2) / usable)));
    bumpRevision();
  }, [bumpRevision, onRatioChange]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      applyFromClientX(event.clientX);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("is-resizing-split");
    };
    // 指针可能滑出分隔条甚至滑出窗口，所以监听挂在 document 上
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [applyFromClientX]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    document.body.classList.add("is-resizing-split");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    applyFromClientX(event.clientX);
  };

  /** 键盘也能调：分隔条是个可聚焦的分隔器，不只是条装饰 */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft") { event.preventDefault(); onRatioChange(ratio - step); bumpRevision(); }
    if (event.key === "ArrowRight") { event.preventDefault(); onRatioChange(ratio + step); bumpRevision(); }
    if (event.key === "Home") { event.preventDefault(); onRatioChange(0.5); bumpRevision(); }
  };

  return (
    <div
      ref={hostRef}
      className="split-pane"
      style={{ gridTemplateColumns: `minmax(0, ${ratio}fr) ${DIVIDER_PX}px minmax(0, ${1 - ratio}fr)` }}
    >
      <section className="split-pane-side" data-pane-label="逻辑图" aria-label="这一层的逻辑图">{left}</section>
      <div
        className="split-pane-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整逻辑图与拼接图的宽度"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={20}
        aria-valuemax={80}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => { onRatioChange(0.5); bumpRevision(); }}
        title="拖动调整两边的宽度，双击对半"
      />
      <section
        ref={rightRef}
        className="split-pane-side"
        data-pane-label="拼接图"
        aria-label="这一层的拼接图"
        // 第一帧先不显示，等容器量到真实宽度再出现，免得画布按 0 宽初始化
        style={revealed ? undefined : { visibility: "hidden" }}
      >{right}</section>
    </div>
  );
}
