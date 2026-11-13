import { useEffect, useRef, useState } from "react";
import { setTile, surfaceBelow } from "../../../src/shared/tiles";
import { drawScene, type LoadedPart } from "../draw";
import type { SceneDoc, TileCode } from "../types";

export type Tool = { kind: "tile"; code: TileCode } | { kind: "prop" } | { kind: "select" };

interface Props {
  doc: SceneDoc;
  parts: Map<string, LoadedPart>;
  tool: Tool;
  propPart: string | null;
  selected: number | null;
  zoom: number;
  showGrid: boolean;
  onChange: (doc: SceneDoc) => void;
  onSelect: (index: number | null) => void;
}

/** Full-level editor canvas: paint tiles, place and drag props. */
export function SceneEditor({ doc, parts, tool, propPart, selected, zoom, showGrid, onChange, onSelect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: "paint" | "move"; dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const ts = doc.tileSize;
  const W = doc.width * ts;
  const H = doc.height * ts;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = W * zoom;
    c.height = H * zoom;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    drawScene(ctx, doc, parts, 0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,240,200,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x++) {
        ctx.moveTo(x * ts * zoom + 0.5, 0);
        ctx.lineTo(x * ts * zoom + 0.5, H * zoom);
      }
      for (let y = 0; y <= doc.height; y++) {
        ctx.moveTo(0, y * ts * zoom + 0.5);
        ctx.lineTo(W * zoom, y * ts * zoom + 0.5);
      }
      ctx.stroke();
    }
    if (selected !== null && doc.props[selected]) {
      const p = doc.props[selected]!;
      const meta = parts.get(p.part)?.meta;
      if (meta) {
        ctx.strokeStyle = "#f4ae3d";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x * zoom, (p.y - meta.height) * zoom, meta.width * zoom, meta.height * zoom);
      }
    }
    if (hover && tool.kind === "tile") {
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * ts * zoom + 1, hover.y * ts * zoom + 1, ts * zoom - 2, ts * zoom - 2);
    }
  }, [doc, parts, zoom, showGrid, selected, hover, tool, W, H, ts]);

  const toWorld = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const hitProp = (x: number, y: number): number | null => {
    for (let i = doc.props.length - 1; i >= 0; i--) {
      const p = doc.props[i]!;
      const m = parts.get(p.part)?.meta;
      if (m && x >= p.x && x < p.x + m.width && y >= p.y - m.height && y < p.y) return i;
    }
    return null;
  };

  const paint = (x: number, y: number) => {
    if (tool.kind !== "tile") return;
    const cx = Math.floor(x / ts);
    const cy = Math.floor(y / ts);
    if (cx < 0 || cy < 0 || cx >= doc.width || cy >= doc.height) return;
    if (doc.tiles[cy]?.[cx] === tool.code) return;
    onChange({ ...doc, tiles: setTile(doc.tiles, cx, cy, tool.code) });
  };

  const onDown = (e: React.PointerEvent) => {
    const { x, y } = toWorld(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    if (tool.kind === "tile") {
      drag.current = { mode: "paint", dx: 0, dy: 0 };
      paint(x, y);
    } else if (tool.kind === "prop" && propPart) {
      const m = parts.get(propPart)?.meta;
      if (!m) return;
      const px = Math.round(x - m.width / 2);
      const py = e.shiftKey ? Math.round(y) : surfaceBelow(doc.tiles, Math.floor(x / ts), ts, y);
      const props = [...doc.props, { part: propPart, x: px, y: py }];
      onChange({ ...doc, props });
      onSelect(props.length - 1);
    } else {
      const i = hitProp(x, y);
      onSelect(i);
      if (i !== null) drag.current = { mode: "move", dx: x - doc.props[i]!.x, dy: y - doc.props[i]!.y };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const { x, y } = toWorld(e);
    setHover({ x: Math.floor(x / ts), y: Math.floor(y / ts) });
    if (!drag.current) return;
    if (drag.current.mode === "paint") paint(x, y);
    else if (selected !== null) {
      const props = doc.props.map((p, i) =>
        i === selected ? { ...p, x: Math.round(x - drag.current!.dx), y: Math.round(y - drag.current!.dy) } : p,
      );
      onChange({ ...doc, props });
    }
  };

  return (
    <div className="stage-wrap">
      <canvas
        ref={ref}
        className="pixel"
        style={{ width: W * zoom, height: H * zoom, cursor: tool.kind === "select" ? "default" : "crosshair" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
