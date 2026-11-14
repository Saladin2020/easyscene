import { useEffect, useRef, useState } from "react";
import { characterUrl } from "../api";
import { defaultLayout, facingRow, sceneCharacters, stillColumn, walkColumns } from "../../../src/shared/characters";
import { detectSheetGroundRow, drawScene, type CharacterDraw, type LoadedPart } from "../draw";
import type { SceneCharacter } from "../types";
import { rangeFill } from "../ui";
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.5);
  const [camX, setCamX] = useState(0);
  const [sheetPath, setSheetPath] = useState(doc.character?.sheet ?? "");
  const [sheet, setSheet] = useState<HTMLImageElement | null>(null);
  const [sheetGround, setSheetGround] = useState(47);
  const [cast, setCast] = useState<Array<{ img: HTMLImageElement; spec: SceneCharacter; groundRow: number }>>([]);
  const castState = useRef<Array<{ x: number; dir: number }>>([]);
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
      setSheetGround(detectSheetGroundRow(img) ?? 47);
      setMsg(`Character ${label} (${img.naturalWidth}×${img.naturalHeight})`);
    } catch {
      setMsg(`Could not load ${label}`);
    }
  };

  useEffect(() => {
    if (doc.character?.sheet) void loadSheet(characterUrl(doc.character.sheet), doc.character.sheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // the scene's placed cast (`characters`): drawn where they stand, walking in place or on patrol
  const castKey = JSON.stringify(doc.characters ?? []);
  useEffect(() => {
    let alive = true;
    const specs = sceneCharacters({ characters: doc.characters });
    void Promise.all(
      specs.map(async (spec) => {
        const img = new Image();
        img.src = characterUrl(spec.sheet);
        try {
          await img.decode();
        } catch {
          return null;
        }
        const layout = defaultLayout({ width: img.naturalWidth, height: img.naturalHeight });
        const { row } = facingRow(layout, spec.facing ?? "right");
        return { img, spec, groundRow: spec.groundRow ?? detectSheetGroundRow(img, 0, row) ?? 47 };
      }),
    ).then((list) => {
      if (!alive) return;
      const ok = list.filter((c): c is NonNullable<typeof c> => Boolean(c));
      castState.current = ok.map((c) => ({ x: c.spec.x ?? 96, dir: c.spec.facing === "left" ? -1 : 1 }));
      setCast(ok);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, castKey]);

  // whole-number upscaling once there is room for 2×, so game pixels stay even squares
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => {
      const room = (el.clientWidth - 8) / vw;
      setScale(room >= 2 ? Math.floor(room) : Math.max(0.5, Math.floor(room * 20) / 20));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vw]);

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
        const draws: CharacterDraw[] = cast.map((c, i) => {
          const st = castState.current[i] ?? { x: c.spec.x ?? 96, dir: 1 };
          const p = c.spec.patrol;
          if (playing && p && (p.speed ?? 24) > 0 && p.maxX > p.minX) {
            st.x += st.dir * ((p.speed ?? 24) / 60) * dt;
            if (st.x >= p.maxX) { st.x = p.maxX; st.dir = -1; }
            if (st.x <= p.minX) { st.x = p.minX; st.dir = 1; }
          }
          const layout = defaultLayout({ width: c.img.naturalWidth, height: c.img.naturalHeight });
          const facing = p ? (st.dir < 0 ? "left" : "right") : c.spec.facing ?? "right";
          const { row, flipX } = facingRow(layout, facing);
          const walk = walkColumns(layout);
          const col = c.spec.anim === "walk" && playing ? walk[Math.floor(s.t / 8) % walk.length]! : stillColumn(layout, c.spec);
          return { sheet: c.img, x: st.x, y: c.spec.y, col, row, flipX, groundRow: c.groundRow, layer: c.spec.layer };
        });
        if (sheet) draws.push({ sheet, x: s.x, col: playing ? frame : 0, row: s.dir > 0 ? 0 : 1, groundRow: sheetGround });
        drawScene(ctx, doc, parts, s.cam, Math.max(0, mapH - vh), vw, vh, draws);
      }
      if (playing) setCamX(Math.round(s.cam));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc, parts, playing, speed, sheet, sheetGround, cast, vw, vh, mapW, mapH, walkFrames]);

  return (
    <div className="parallax-box">
      <div className="screen" ref={boxRef}>
        <canvas ref={ref} className="pixel" width={vw} height={vh} style={{ width: Math.round(vw * scale), height: Math.round(vh * scale) }} />
        <span className="screen-badge mono">{vw}×{vh} · {Number.isInteger(scale) ? scale : scale.toFixed(2)}×</span>
      </div>
      <div className="transport">
        <button type="button" className={`play${playing ? " active" : ""}`} aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          {playing ? "❚❚" : "▶"}
        </button>
        <label className="slider grow">
          <span>Camera</span>
          <input type="range" min={0} max={Math.max(0, mapW - vw)} value={camX} disabled={playing} style={rangeFill(camX, 0, Math.max(1, mapW - vw))}
            onChange={(e) => { setCamX(Number(e.target.value)); state.current.cam = Number(e.target.value); }} />
          <output>{camX}px</output>
        </label>
        <label className="slider speed">
          <span>Speed</span>
          <input type="range" min={0.25} max={4} step={0.25} value={speed} style={rangeFill(speed, 0.25, 4)} onChange={(e) => setSpeed(Number(e.target.value))} />
          <output>{speed.toFixed(2)}×</output>
        </label>
      </div>
      <form className="row nowrap char-row" onSubmit={(e) => { e.preventDefault(); if (sheetPath.trim()) void loadSheet(characterUrl(sheetPath.trim()), sheetPath.trim()); }}>
        <span className="field-label">Walker</span>
        <input className="grow" aria-label="Character sheet path" placeholder="Easy Sprite side-view sheet (.png, 1440×144)" value={sheetPath}
          onChange={(e) => setSheetPath(e.target.value)} />
        <button type="submit" disabled={!sheetPath.trim()}>Load</button>
        <label className="file-btn">
          <input type="file" accept="image/png"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadSheet(URL.createObjectURL(f), f.name); }} />
          Pick file…
        </label>
        {sheet && <button type="button" className="icon" aria-label="Remove character" title="Remove character" onClick={() => { setSheet(null); setMsg(""); }}>✕</button>}
      </form>
      {msg && <p className={`hint${sheet ? " ok" : " err"}`}>{msg}</p>}
    </div>
  );
}
