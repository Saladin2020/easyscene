import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LAYERS } from "../../src/shared/scene";
import { composeScene, exportScene, fetchScene, fetchWorkspace, partImageUrl, saveScene } from "./api";
import { loadImage, toCanvas, type LoadedPart } from "./draw";
import { ParallaxPreview } from "./components/ParallaxPreview";
import { SceneEditor, type Tool } from "./components/SceneEditor";
import { rangeFill } from "./ui";
import {
  DEFAULT_SCROLL,
  EXPORT_PRESETS,
  TILE_CODES,
  TILE_CODE_LABELS,
  type BackgroundPart,
  type ExportPresetId,
  type PartMeta,
  type SceneDoc,
  type SceneLayer,
  type TileCode,
  type WorkspaceSummary,
} from "./types";

const LS_EXPORT_DIR = "easyscene.exportDir";
const LS_SCENE = "easyscene.scene";

function readLs(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeLs(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // private mode
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "scene";
}

/** Atlas cell used as the toolbar icon for each tile code (see src/shared/tiles.ts layout). */
const TILE_ICON: Record<TileCode, { col: number; row: number } | null> = {
  ".": null,
  "#": { col: 2, row: 3 },
  "=": { col: 2, row: 4 },
  "/": { col: 0, row: 5 },
  "\\": { col: 1, row: 5 },
};
const TILE_SHORT: Record<TileCode, string> = { ".": "Erase", "#": "Ground", "=": "Platform", "/": "Slope ↗", "\\": "Slope ↖" };

function TileIcon({ code, tileset }: { code: TileCode; tileset: string }) {
  const cell = TILE_ICON[code];
  if (!cell) return <span className="tile-icon tile-icon-empty" aria-hidden />;
  return (
    <span
      className="tile-icon"
      aria-hidden
      style={{ backgroundImage: `url(${partImageUrl(tileset)})`, backgroundPosition: `${-cell.col * 24}px ${-cell.row * 24}px` }}
    />
  );
}

type Toast = { msg: string; kind: "" | "ok" | "err"; id: number };

export function App() {
  const [ws, setWs] = useState<WorkspaceSummary | null>(null);
  const [parts, setParts] = useState<Map<string, LoadedPart>>(new Map());
  const [doc, setDoc] = useState<SceneDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "export" | "new">("");
  const [tool, setTool] = useState<Tool>({ kind: "tile", code: "#" });
  const [propPart, setPropPart] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [preset, setPreset] = useState<ExportPresetId>("godot");
  const [exportDir, setExportDir] = useState(readLs(LS_EXPORT_DIR));
  const [toast, setToast] = useState<Toast | null>(null);
  const [loadError, setLoadError] = useState("");
  const [exported, setExported] = useState<{ dir: string; paths: string[] } | null>(null);
  const [newName, setNewName] = useState("");

  const say = useCallback((msg: string, kind: Toast["kind"] = "") => setToast({ msg, kind, id: Date.now() }), []);

  useEffect(() => {
    if (!toast || toast.kind === "err") return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const summary = await fetchWorkspace();
        setWs(summary);
        const loaded = new Map<string, LoadedPart>();
        await Promise.all(
          summary.parts.map(async (meta) => {
            const img = await loadImage(partImageUrl(meta.id));
            loaded.set(meta.id, { meta, img, canvas: toCanvas(img) });
          }),
        );
        setParts(loaded);
        const want = readLs(LS_SCENE);
        const first = summary.scenes.find((s) => s.id === want) ?? summary.scenes[0];
        if (first) setDoc(await fetchScene(first.id));
        setPropPart(summary.parts.find((p) => p.kind === "prop")?.id ?? null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Workspace unavailable");
      }
    })();
  }, []);

  const backgrounds = useMemo(() => ws?.parts.filter((p): p is BackgroundPart => p.kind === "background") ?? [], [ws]);
  const tilesets = useMemo(() => ws?.parts.filter((p) => p.kind === "tileset") ?? [], [ws]);
  const props = useMemo(() => ws?.parts.filter((p) => p.kind === "prop") ?? [], [ws]);

  const update = (next: SceneDoc) => {
    setDoc(next);
    setDirty(true);
  };

  const updateLayer = (i: number, patch: Partial<SceneLayer>) => {
    if (!doc) return;
    update({ ...doc, layers: doc.layers.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  };

  const moveLayer = (i: number, d: -1 | 1) => {
    if (!doc) return;
    const j = i + d;
    if (j < 0 || j >= doc.layers.length) return;
    const layers = [...doc.layers];
    [layers[i], layers[j]] = [layers[j]!, layers[i]!];
    update({ ...doc, layers });
  };

  const openScene = async (id: string) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setDoc(await fetchScene(id));
    setDirty(false);
    setSelected(null);
    writeLs(LS_SCENE, id);
  };

  const refreshList = async () => setWs(await fetchWorkspace());

  const onSave = async () => {
    if (!doc) return;
    setBusy("save");
    try {
      const res = await saveScene(doc);
      setDoc(res.scene);
      setDirty(false);
      await refreshList();
      say(`Saved ${res.path}${res.warnings.length ? ` · ${res.warnings.join("; ")}` : ""}`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Save failed", "err");
    } finally {
      setBusy("");
    }
  };

  const onNew = async () => {
    const name = newName.trim() || "New scene";
    setBusy("new");
    try {
      const res = await composeScene({ id: slugify(name), name, layers: DEFAULT_LAYERS });
      await refreshList();
      setDoc(res.scene);
      setDirty(false);
      setNewName("");
      writeLs(LS_SCENE, res.scene.id);
      say(`Created ${res.scene.id}`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Create failed", "err");
    } finally {
      setBusy("");
    }
  };

  const onExport = async () => {
    if (!doc) return;
    try {
      if (dirty) await onSave();
      setBusy("export");
      writeLs(LS_EXPORT_DIR, exportDir);
      const res = await exportScene({ id: doc.id, preset, dir: exportDir.trim() || undefined });
      setExported({ dir: res.dir, paths: res.paths });
      say(`Exported ${preset} → ${res.dir}${res.warnings.length ? ` · ${res.warnings.join("; ")}` : ""}`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Export failed", "err");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!ws || !doc) {
    const empty = ws && !doc && !loadError;
    return (
      <div className="splash">
        <div className="splash-card">
          <span className="brand-mark" aria-hidden />
          <h1 className="brand">
            Easy <span>Scene</span>
          </h1>
          {loadError ? (
            <>
              <p className="splash-msg err">{loadError}</p>
              <p className="hint">
                Is the API running? Start it with <code>npm run serve</code> (or <code>npm run dev</code>) and reload.
              </p>
              <button type="button" className="primary" onClick={() => location.reload()}>Retry</button>
            </>
          ) : empty ? (
            <p className="splash-msg">
              No scenes yet. Run <code>npm run init</code> to seed the demo scenes.
            </p>
          ) : (
            <>
              <p className="splash-msg">Lighting the lanterns…</p>
              <div className="loader" aria-label="Loading workspace"><span /><span /><span /></div>
            </>
          )}
        </div>
      </div>
    );
  }

  const sel = selected !== null ? doc.props[selected] : undefined;
  const setProp = (patch: Partial<SceneDoc["props"][number]>) =>
    update({ ...doc, props: doc.props.map((p, i) => (i === selected ? { ...p, ...patch } : p)) });
  const nameOf = (id: string) => parts.get(id)?.meta.name ?? id;
  const toolHint =
    tool.kind === "tile"
      ? "Drag to paint · ground autotiles its edges"
      : tool.kind === "prop"
        ? "Click to place · snaps to the ground (hold Shift to place at the cursor)"
        : "Click a prop to select · drag to move";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1 className="brand">
              Easy <span>Scene</span>
            </h1>
            <p className="brand-th">ฉากเกมด้านข้าง · หมู่บ้านอบอุ่น</p>
            <div className="sub">
              <span className="tag tag-sky">side-view</span>
              <span className="tag">{doc.tileSize}px tiles</span>
              <span className="tag">{doc.viewport.width}×{doc.viewport.height}</span>
              <span className="tag">{ws.parts.length} parts</span>
              <span className="tag tag-leaf">compose only</span>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="tool-group">
            <label className="field-label" htmlFor="scene-pick">Scene</label>
            <div className="row nowrap">
              <select id="scene-pick" value={doc.id} onChange={(e) => void openScene(e.target.value)}>
                {ws.scenes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {!ws.scenes.some((s) => s.id === doc.id) && <option value={doc.id}>{doc.name}</option>}
              </select>
              <button type="button" className={`save-btn${dirty ? " is-dirty" : ""}`} disabled={busy === "save"} title="Save (Ctrl/⌘+S)" onClick={() => void onSave()}>
                <span className="dot" aria-hidden />
                {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            </div>
          </div>
          <form className="tool-group" onSubmit={(e) => { e.preventDefault(); void onNew(); }}>
            <label className="field-label" htmlFor="new-scene">New scene</label>
            <div className="row nowrap">
              <input id="new-scene" value={newName} placeholder="Forest evening" onChange={(e) => setNewName(e.target.value)} />
              <button type="submit" disabled={busy === "new"}>+ New</button>
            </div>
          </form>
          <div className="tool-group export-group">
            <span className="field-label">Export</span>
            <div className="row nowrap">
              <div className="segmented" role="radiogroup" aria-label="Export preset">
                {EXPORT_PRESETS.map((p) => (
                  <button type="button" key={p.id} role="radio" aria-checked={preset === p.id} className={preset === p.id ? "active" : ""} title={p.description} onClick={() => setPreset(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input aria-label="Export folder" className="export-dir" value={exportDir} placeholder="exports/ (workspace)" onChange={(e) => setExportDir(e.target.value)} />
              <button type="button" className="primary" disabled={busy === "export"} onClick={() => void onExport()}>
                {busy === "export" ? "Exporting…" : "Export"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="panel panel-layers">
          <h2>
            <span className="step">1</span>Layers <small>back → front</small>
          </h2>
          <div className="field">
            <label className="field-label" htmlFor="scene-name">Scene name</label>
            <input id="scene-name" value={doc.name} onChange={(e) => update({ ...doc, name: e.target.value })} />
          </div>
          {doc.layers.length === 0 && <p className="empty">No parallax layers yet — add a sky to start.</p>}
          {doc.layers.map((layer, i) => {
            const meta = parts.get(layer.part)?.meta as BackgroundPart | undefined;
            const band = meta?.band ?? "sky";
            return (
              <div className={`layer-card band-${band}`} key={`${i}-${layer.part}`}>
                <div className="layer-thumb" aria-hidden>
                  <img src={partImageUrl(layer.part)} alt="" />
                </div>
                <div className="layer-body">
                  <header>
                    <span className="band">{meta?.band ?? "?"}</span>
                    <select className="grow" aria-label={`Layer ${i + 1} part`} value={layer.part} onChange={(e) => {
                      const m = backgrounds.find((b) => b.id === e.target.value);
                      updateLayer(i, { part: e.target.value, scroll: m?.defaultScroll ?? layer.scroll });
                    }}>
                      {backgrounds.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </header>
                  <div className="icon-row">
                    <button type="button" className="icon" title="Move back" aria-label="Move back" disabled={i === 0} onClick={() => moveLayer(i, -1)}>↑</button>
                    <button type="button" className="icon" title="Move front" aria-label="Move front" disabled={i === doc.layers.length - 1} onClick={() => moveLayer(i, 1)}>↓</button>
                    <button type="button" className="icon danger" title="Remove layer" aria-label="Remove layer" onClick={() => update({ ...doc, layers: doc.layers.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                </div>
                <label className="slider">
                  <span>Scroll</span>
                  <input type="range" min={0} max={1} step={0.01} value={layer.scroll} style={rangeFill(layer.scroll, 0, 1)} onChange={(e) => updateLayer(i, { scroll: Number(e.target.value) })} />
                  <output>×{layer.scroll.toFixed(2)}</output>
                </label>
                <div className="colors">
                  <label className={`chip${layer.color ? " on" : ""}`}>
                    <input type="checkbox" checked={Boolean(layer.color)} onChange={(e) => updateLayer(i, { color: e.target.checked ? meta?.recolorBase ?? "#888888" : undefined })} />
                    Recolor
                    <input type="color" aria-label="Recolor" value={layer.color ?? meta?.recolorBase ?? "#888888"} onChange={(e) => updateLayer(i, { color: e.target.value })} />
                  </label>
                  <label className={`chip${layer.tint ? " on" : ""}`}>
                    <input type="checkbox" checked={Boolean(layer.tint)} onChange={(e) => updateLayer(i, { tint: e.target.checked ? "#ff9a6a" : undefined })} />
                    Tint
                    <input type="color" aria-label="Tint" value={layer.tint ?? "#ff9a6a"} onChange={(e) => updateLayer(i, { tint: e.target.value })} />
                  </label>
                </div>
                {layer.tint && (
                  <label className="slider">
                    <span>Amount</span>
                    <input type="range" min={0} max={1} step={0.05} value={layer.tintAmount ?? 0.35} style={rangeFill(layer.tintAmount ?? 0.35, 0, 1)} onChange={(e) => updateLayer(i, { tintAmount: Number(e.target.value) })} />
                    <output>{(layer.tintAmount ?? 0.35).toFixed(2)}</output>
                  </label>
                )}
              </div>
            );
          })}
          {doc.layers.length < ws.config.maxLayers ? (
            <button type="button" className="add-btn" onClick={() => {
              const b = backgrounds[0];
              if (b) update({ ...doc, layers: [...doc.layers, { part: b.id, scroll: b.defaultScroll ?? DEFAULT_SCROLL[b.band] }] });
            }}>+ Add layer <small>{doc.layers.length}/{ws.config.maxLayers}</small></button>
          ) : (
            <p className="hint">Layer limit reached ({ws.config.maxLayers}).</p>
          )}
          <div className="field section">
            <label className="field-label" htmlFor="tileset">Tileset</label>
            <select id="tileset" value={doc.tileset} onChange={(e) => update({ ...doc, tileset: e.target.value })}>
              {tilesets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <dl className="stats">
            <div><dt>Grid</dt><dd>{doc.width}×{doc.height}</dd></div>
            <div><dt>Pixels</dt><dd>{doc.width * doc.tileSize}×{doc.height * doc.tileSize}</dd></div>
            <div><dt>Props</dt><dd>{doc.props.length}</dd></div>
          </dl>
        </aside>

        <main className="center">
          <section className="panel">
            <h2>
              <span className="step">2</span>Scene <small>{doc.id}</small>
              {dirty && <span className="badge-dirty">unsaved</span>}
            </h2>
            <div className="tool-row">
              <div className="segmented tools" role="toolbar" aria-label="Paint tools">
                {TILE_CODES.map((c) => (
                  <button type="button" key={c} className={tool.kind === "tile" && tool.code === c ? "active" : ""} title={TILE_CODE_LABELS[c]} onClick={() => setTool({ kind: "tile", code: c })}>
                    <TileIcon code={c} tileset={doc.tileset} />
                    {TILE_SHORT[c]}
                  </button>
                ))}
              </div>
              <div className="segmented tools">
                <button type="button" className={tool.kind === "prop" ? "active" : ""} title="Place the selected prop" onClick={() => setTool({ kind: "prop" })}>
                  <span className="glyph" aria-hidden>✚</span>Place prop
                </button>
                <button type="button" className={tool.kind === "select" ? "active" : ""} title="Select and drag props" onClick={() => setTool({ kind: "select" })}>
                  <span className="glyph" aria-hidden>⤧</span>Select
                </button>
              </div>
              <div className="view-opts">
                <label className="switch">
                  <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
                  <span className="track" aria-hidden />
                  Grid
                </label>
                <div className="segmented small" role="radiogroup" aria-label="Zoom">
                  {[1, 2, 3].map((z) => (
                    <button type="button" key={z} role="radio" aria-checked={zoom === z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>
                  ))}
                </div>
              </div>
            </div>
            <SceneEditor doc={doc} parts={parts} tool={tool} propPart={propPart} selected={selected} zoom={zoom} showGrid={grid}
              onChange={update} onSelect={setSelected} onHover={setHover} />
            <div className="statusbar">
              <span>{toolHint}</span>
              <span className="mono">{hover ? `tile ${hover.x},${hover.y} · px ${hover.x * doc.tileSize},${hover.y * doc.tileSize}` : `${doc.width}×${doc.height} tiles`}</span>
            </div>
          </section>

          <section className="panel">
            <h2>
              <span className="step step-leaf">3</span>Parallax preview <small>game camera</small>
            </h2>
            <ParallaxPreview doc={doc} parts={parts} walkFrames={ws.config.character.walkFrames} />
            {exported && (
              <details className="export-list" open>
                <summary>
                  Last export · {exported.paths.length} files <span className="mono">{exported.dir}</span>
                </summary>
                <ul>
                  {exported.paths.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </main>

        <aside className="panel panel-props">
          <h2>
            <span className="step">4</span>Props <small>{props.length} parts</small>
          </h2>
          <div className="prop-grid">
            {props.map((p: PartMeta) => (
              <button type="button" key={p.id} className={`prop-btn${propPart === p.id ? " active" : ""}`} title={p.id}
                onClick={() => { setPropPart(p.id); setTool({ kind: "prop" }); }}>
                <span className="prop-img"><img src={partImageUrl(p.id)} alt="" /></span>
                <span className="prop-name">{p.name}</span>
              </button>
            ))}
          </div>
          <h3 className="sub-head">Placed <span className="count">{doc.props.length}</span></h3>
          {doc.props.length === 0 ? (
            <p className="empty">Nothing placed yet. Pick a prop above, then click on the scene.</p>
          ) : (
            <div className="prop-list" role="listbox" aria-label="Placed props">
              {doc.props.map((p, i) => (
                <button type="button" role="option" aria-selected={selected === i} key={i} className={`item${selected === i ? " active" : ""}`} onClick={() => { setSelected(i); setTool({ kind: "select" }); }}>
                  <span className="mini-thumb"><img src={partImageUrl(p.part)} alt="" /></span>
                  <span className="grow">{nameOf(p.part)}</span>
                  <span className="mono coords">{p.x},{p.y}</span>
                </button>
              ))}
            </div>
          )}
          {sel && selected !== null && (
            <div className="inspector">
              <header>
                <span className="band">prop</span>
                <span className="grow">{nameOf(sel.part)}</span>
                <span className="mono coords">#{selected + 1}</span>
              </header>
              <div className="inspector-grid">
                <button type="button" className={sel.flipX ? "active" : ""} onClick={() => setProp({ flipX: !sel.flipX })}>⇋ Flip</button>
                <select aria-label="Draw layer" value={sel.layer ?? "auto"} onChange={(e) => setProp({ layer: e.target.value === "auto" ? undefined : (e.target.value as "back" | "front") })}>
                  <option value="auto">Default layer</option>
                  <option value="back">Behind tiles</option>
                  <option value="front">In front</option>
                </select>
                <label className={`chip${sel.color ? " on" : ""}`}>
                  Recolor
                  <input type="color" aria-label="Recolor prop" value={sel.color ?? parts.get(sel.part)?.meta.recolorBase ?? "#888888"} onChange={(e) => setProp({ color: e.target.value })} />
                </label>
                <button type="button" className="danger" onClick={() => { update({ ...doc, props: doc.props.filter((_, i) => i !== selected) }); setSelected(null); }}>Delete</button>
              </div>
            </div>
          )}
          <p className="hint foot">Sample parts are generated by code (CC0). Drop your own art in <code>parts/</code>.</p>
        </aside>
      </div>

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <span className="toast-msg">{toast.msg}</span>
          <button type="button" className="icon" aria-label="Dismiss" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
