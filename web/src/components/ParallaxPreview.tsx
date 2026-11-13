import { useEffect, useRef, useState } from "react";
import { characterUrl } from "../api";
import { drawScene, type LoadedPart } from "../draw";
import type { SceneDoc } from "../types";

interface Props {
  doc: SceneDoc;
  parts: Map<string, LoadedPart>;
  walkFrames: number[];
}

/**
 * Live game-camera preview at the scene viewport size. The camera pans across the
 * level (or follows an Easy Sprite side-view character) so every layer scrolls at its factor.
 */
export function ParallaxPreview({ doc, parts, walkFrames }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.5);
  const [camX, setCamX] = useState(0);
  const [sheetPath, setSheetPath] = useState(doc.character?.sheet ?? "");
  const [sheet, setSheet] = useState<HTMLImageElement | null>(null);
  const [msg, setMsg] = useState("");
  const state = useRef({ x: 40, dir: 1, t: 0, cam: 0 });
  const vw = doc.viewport.width;
  const vh = doc.viewport.height;
  const mapW = doc.width * doc.tileSize;
  const mapH = doc.height * doc.tileSize;

  const loadSheet = async (src: string, label: string) => {
    const img = new Image();
    img.src = src;
    try {
      await img.decode();
      setSheet(img);
      setMsg(`Character ${label} (${img.naturalWidth}×${img.naturalHeight})`);
    } catch {
      setMsg(`Could not load ${label}`);
    }
  };

  useEffect(() => {
    if (doc.character?.sheet) void loadSheet(characterUrl(doc.character.sheet), doc.character.sheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 16.67;
      last = now;
      const s = state.current;
      const maxCam = Math.max(0, mapW - vw);
      if (playing) {
        s.t += dt;
        if (sheet) {
          s.x += s.dir * speed * dt;
          if (s.x > mapW - 48) s.dir = -1;
          if (s.x < 0) s.dir = 1;
          s.cam = Math.min(maxCam, Math.max(0, s.x - vw / 3));
        } else {
          s.cam += s.dir * speed * dt;
          if (s.cam > maxCam) s.dir = -1;
          if (s.cam < 0) s.dir = 1;
          s.cam = Math.min(maxCam, Math.max(0, s.cam));
        }
      }
      const c = ref.current;
      if (c) {
        const ctx = c.getContext("2d")!;
        const frame = walkFrames[Math.floor(s.t / 8) % walkFrames.length] ?? 0;
        drawScene(ctx, doc, parts, s.cam, Math.max(0, mapH - vh), vw, vh,
          sheet ? { sheet, x: s.x, col: playing ? frame : 0, row: s.dir > 0 ? 0 : 1 } : undefined);
      }
      if (playing) setCamX(Math.round(s.cam));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc, parts, playing, speed, sheet, vw, vh, mapW, mapH, walkFrames]);

  return (
    <div className="parallax-box">
      <canvas ref={ref} className="pixel" width={vw} height={vh} style={{ aspectRatio: `${vw} / ${vh}` }} />
      <div className="row" style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <label className="inline-field grow">
          Camera x {camX}px
          <input type="range" min={0} max={Math.max(0, mapW - vw)} value={camX} disabled={playing}
            onChange={(e) => { setCamX(Number(e.target.value)); state.current.cam = Number(e.target.value); }} />
        </label>
        <label className="inline-field">
          Speed
          <input type="range" min={0.25} max={4} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
      </div>
      <div className="row" style={{ marginTop: "0.4rem" }}>
        <input className="grow" placeholder="Easy Sprite side-view sheet path (.png, 1440×144)" value={sheetPath}
          onChange={(e) => setSheetPath(e.target.value)} />
        <button type="button" disabled={!sheetPath.trim()} onClick={() => void loadSheet(characterUrl(sheetPath.trim()), sheetPath.trim())}>Load</button>
        <label className="mini button-like">
          <input type="file" accept="image/png" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadSheet(URL.createObjectURL(f), f.name); }} />
          <span className="tag">or pick file</span>
        </label>
        {sheet && <button type="button" className="mini" onClick={() => { setSheet(null); setMsg(""); }}>✕</button>}
      </div>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
