import { useEffect, useRef, useState } from "react";
import { defaultLayout, facingRow, stillColumn } from "../../../src/shared/characters";
import {
  characterBaseline,
  characterList,
  characterRect,
  dragCharacter,
  hitCharacter,
  withCharacters,
  type EditorSelection,
} from "../../../src/shared/editorCharacters";
import { snapBuildingX } from "../../../src/shared/scene";
import { setTile, surfaceBelow } from "../../../src/shared/tiles";
import { drawScene, type CharacterDraw, type LoadedPart } from "../draw";
import type { SceneCharacter, SceneDoc, TileCode } from "../types";

export type Tool = { kind: "tile"; code: TileCode } | { kind: "prop" } | { kind: "select" } | { kind: "character" };

export interface LoadedSheet {
  path: string;
  img: HTMLImageElement;
  groundRow: number;
}

interface Props {
  doc: SceneDoc;
  parts: Map<string, LoadedPart>;
  sheets: Map<string, LoadedSheet>;
  tool: Tool;
  propPart: string | null;
  charSheet: string | null;
  selected: EditorSelection | null;
  zoom: number;
  showGrid: boolean;
  onChange: (doc: SceneDoc) => void;
  onSelect: (sel: EditorSelection | null) => void;
  onHover?: (tile: { x: number; y: number } | null) => void;
}

/** Full-level editor canvas: paint tiles, place and drag props and characters. */
export function SceneEditor({
  doc, parts, sheets, tool, propPart, charSheet, selected, zoom, showGrid, onChange, onSelect, onHover,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: "paint" | "move" | "move-char"; dx: number; dy: number } | null>(null);
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);
  const hover = hoverPx && { x: Math.floor(hoverPx.x / doc.tileSize), y: Math.floor(hoverPx.y / doc.tileSize) };
  const hoverKey = hover ? `${hover.x},${hover.y}` : "";
  const ghostKey =
    (tool.kind === "prop" || tool.kind === "character") && hoverPx ? `${Math.round(hoverPx.x)},${Math.round(hoverPx.y)}` : "";

  const chars = characterList(doc);
  const groundOf = (ch: SceneCharacter) => sheets.get(ch.sheet)?.groundRow ?? ch.groundRow ?? 47;

  const charDraws = (): CharacterDraw[] =>
    chars.flatMap((ch) => {
      const sheet = sheets.get(ch.sheet);
      if (!sheet) return [];
      const layout = defaultLayout({ width: sheet.img.naturalWidth, height: sheet.img.naturalHeight });
      const { row, flipX } = facingRow(layout, ch.facing ?? "right");
      return [{
        sheet: sheet.img,
        x: ch.x ?? 96,
        y: ch.y,
        col: stillColumn(layout, ch),
        row,
        flipX,
        groundRow: ch.groundRow ?? sheet.groundRow,
        layer: ch.layer,
      }];
    });

  /** Buildings snap to neighbouring buildings' edges, else to the tile grid (hold Shift for free placement). */
  const snapX = (partId: string, rawLeft: number, free: boolean, skip: number | null = null): number => {
    const m = parts.get(partId)?.meta;
    if (!m || free) return Math.round(rawLeft);
    const neighbours = doc.props.flatMap((p, i) => {
      const pm = parts.get(p.part)?.meta;
      return i !== skip && pm?.kind === "prop" && pm.category === "building" ? [{ x: p.x, width: pm.width }] : [];
    });
    return snapBuildingX(m, rawLeft, doc.tileSize, neighbours);
  };

  useEffect(() => {
    onHover?.(hover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverKey]);
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
    drawScene(ctx, doc, parts, 0, 0, W, H, charDraws());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (showGrid) {
      for (const major of [false, true]) {
        ctx.strokeStyle = major ? "rgba(255,226,170,0.16)" : "rgba(255,240,200,0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= doc.width; x++) {
          if ((x % 4 === 0) !== major) continue;
          ctx.moveTo(x * ts * zoom + 0.5, 0);
          ctx.lineTo(x * ts * zoom + 0.5, H * zoom);
        }
        for (let y = 0; y <= doc.height; y++) {
          if (((doc.height - y) % 4 === 0) !== major) continue;
          ctx.moveTo(0, y * ts * zoom + 0.5);
          ctx.lineTo(W * zoom, y * ts * zoom + 0.5);
        }
        ctx.stroke();
      }
    }
    if (hoverPx && tool.kind === "prop" && propPart && !drag.current) {
      const part = parts.get(propPart);
      if (part) {
        const gx = snapX(propPart, hoverPx.x - part.meta.width / 2, false);
        const gy = surfaceBelow(doc.tiles, Math.floor(hoverPx.x / ts), ts, hoverPx.y);
        ctx.globalAlpha = 0.55;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(part.canvas, gx * zoom, (gy - part.meta.height) * zoom, part.meta.width * zoom, part.meta.height * zoom);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffd27a";
        ctx.fillRect(gx * zoom, gy * zoom - 1, part.meta.width * zoom, 2);
      }
    }
    if (hoverPx && tool.kind === "character" && charSheet && !drag.current) {
      const sheet = sheets.get(charSheet);
      const groundRow = sheet?.groundRow ?? 47;
      const x = Math.round(hoverPx.x - 24);
      const ghost: SceneCharacter = { sheet: charSheet, x };
      const r = characterRect(doc, ghost, groundRow);
      ctx.globalAlpha = 0.55;
      ctx.imageSmoothingEnabled = false;
      if (sheet) ctx.drawImage(sheet.img, 0, 0, 48, 48, r.x * zoom, r.y * zoom, 48 * zoom, 48 * zoom);
      else {
        ctx.strokeStyle = "#ffd27a";
        ctx.strokeRect(r.x * zoom + 0.5, r.y * zoom + 0.5, 48 * zoom - 1, 48 * zoom - 1);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#79c48a";
      ctx.fillRect(r.x * zoom, (r.y + r.h) * zoom - 1, 48 * zoom, 2);
    }
    const strokeBox = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(13,9,6,0.85)";
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) ctx.fillRect(hx - 2, hy - 2, 4, 4);
    };
    if (selected?.kind === "prop" && doc.props[selected.index]) {
      const p = doc.props[selected.index]!;
      const meta = parts.get(p.part)?.meta;
      if (meta) strokeBox(p.x * zoom - 1.5, (p.y - meta.height) * zoom - 1.5, meta.width * zoom + 3, meta.height * zoom + 3, "#ffd27a");
    }
    if (selected?.kind === "character" && chars[selected.index]) {
      const r = characterRect(doc, chars[selected.index]!, groundOf(chars[selected.index]!));
      strokeBox(r.x * zoom - 1.5, r.y * zoom - 1.5, r.w * zoom + 3, r.h * zoom + 3, "#79c48a");
    }
    if (hover && tool.kind === "tile") {
      const [x, y, s] = [hover.x * ts * zoom, hover.y * ts * zoom, ts * zoom];
      ctx.fillStyle = tool.code === "." ? "rgba(229,128,108,0.22)" : "rgba(255,210,122,0.18)";
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = tool.code === "." ? "#e5806c" : "#ffd27a";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  }, [doc, parts, sheets, zoom, showGrid, selected, hoverKey, ghostKey, tool, propPart, charSheet, W, H, ts]);

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
      return;
    }
    const ci = hitCharacter(doc, chars, x, y, chars.map(groundOf));
    if (tool.kind === "character" && charSheet && ci === null) {
      const next = [...chars, { sheet: charSheet, x: Math.round(x - 24) }];
      onChange(withCharacters(doc, next));
      onSelect({ kind: "character", index: next.length - 1 });
      return;
    }
    if (tool.kind === "prop" && propPart && ci === null) {
      const m = parts.get(propPart)?.meta;
      if (!m) return;
      const px = snapX(propPart, x - m.width / 2, e.shiftKey);
      const py = e.shiftKey ? Math.round(y) : surfaceBelow(doc.tiles, Math.floor(x / ts), ts, y);
      const props = [...doc.props, { part: propPart, x: px, y: py }];
      onChange({ ...doc, props });
      onSelect({ kind: "prop", index: props.length - 1 });
      return;
    }
    if (ci !== null) {
      onSelect({ kind: "character", index: ci });
      const ch = chars[ci]!;
      drag.current = { mode: "move-char", dx: x - (ch.x ?? 96), dy: y - characterBaseline(doc, ch, groundOf(ch)) };
      return;
    }
    const i = hitProp(x, y);
    onSelect(i !== null ? { kind: "prop", index: i } : null);
    if (i !== null) drag.current = { mode: "move", dx: x - doc.props[i]!.x, dy: y - doc.props[i]!.y };
  };

  const onMove = (e: React.PointerEvent) => {
    const { x, y } = toWorld(e);
    setHoverPx({ x, y });
    if (!drag.current) return;
    if (drag.current.mode === "paint") paint(x, y);
    else if (drag.current.mode === "move" && selected?.kind === "prop") {
      const props = doc.props.map((p, i) =>
        i === selected.index ? { ...p, x: snapX(p.part, x - drag.current!.dx, e.shiftKey, i), y: Math.round(y - drag.current!.dy) } : p,
      );
      onChange({ ...doc, props });
    } else if (drag.current.mode === "move-char" && selected?.kind === "character" && chars[selected.index]) {
      const next = chars.map((c, i) =>
        i === selected.index ? dragCharacter(c, x, y, drag.current!, { free: e.shiftKey }) : c,
      );
      onChange(withCharacters(doc, next));
    }
  };

  const overChar = hoverPx ? hitCharacter(doc, chars, hoverPx.x, hoverPx.y, chars.map(groundOf)) !== null : false;
  const overProp = hoverPx ? hitProp(hoverPx.x, hoverPx.y) !== null : false;
  const cursor =
    tool.kind === "select" || tool.kind === "character" || tool.kind === "prop"
      ? overChar || overProp
        ? "move"
        : tool.kind === "select"
          ? "default"
          : "crosshair"
      : "crosshair";

  return (
    <div className="stage-wrap">
      <canvas
        ref={ref}
        className="pixel"
        style={{ width: W * zoom, height: H * zoom, cursor }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => setHoverPx(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
