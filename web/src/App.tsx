import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LAYERS } from "../../src/shared/scene";
import { composeScene, exportScene, fetchScene, fetchWorkspace, partImageUrl, saveScene } from "./api";
import { loadImage, toCanvas, type LoadedPart } from "./draw";
import { ParallaxPreview } from "./components/ParallaxPreview";
import { SceneEditor, type Tool } from "./components/SceneEditor";
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

export function App() {
  const [ws, setWs] = useState<WorkspaceSummary | null>(null);
  const [parts, setParts] = useState<Map<string, LoadedPart>>(new Map());
  const [doc, setDoc] = useState<SceneDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<Tool>({ kind: "tile", code: "#" });
  const [propPart, setPropPart] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(2);
  const [grid, setGrid] = useState(true);
  const [preset, setPreset] = useState<ExportPresetId>("godot");
  const [exportDir, setExportDir] = useState(readLs(LS_EXPORT_DIR));
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");
  const [exported, setExported] = useState<string[]>([]);
  const [newName, setNewName] = useState("");

  const say = (msg: string, kind: "" | "ok" | "err" = "") => {
    setStatus(msg);
    setStatusKind(kind);
  };

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
        say(e instanceof Error ? e.message : "Workspace unavailable", "err");
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
    try {
      const res = await saveScene(doc);
      setDoc(res.scene);
      setDirty(false);
      await refreshList();
      say(`Saved ${res.path}${res.warnings.length ? ` · ${res.warnings.join("; ")}` : ""}`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Save failed", "err");
    }
  };

  const onNew = async () => {
    const name = newName.trim() || "New scene";
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
    }
  };

  const onExport = async () => {
    if (!doc) return;
    try {
      if (dirty) await onSave();
      writeLs(LS_EXPORT_DIR, exportDir);
      const res = await exportScene({ id: doc.id, preset, dir: exportDir.trim() || undefined });
      setExported(res.paths);
      say(`Exported ${preset} → ${res.dir}${res.warnings.length ? ` · ${res.warnings.join("; ")}` : ""}`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Export failed", "err");
    }
  };

  if (!ws || !doc) {
    return (
      <div className="app">
        <h1 className="brand">
          Easy <span>Scene</span>
        </h1>
        <p className={`status ${statusKind}`}>{status || "Loading workspace…"}</p>
      </div>
    );
  }

  const sel = selected !== null ? doc.props[selected] : undefined;

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
          <label className="inline-field">
            Scene
            <select value={doc.id} onChange={(e) => void openScene(e.target.value)}>
              {ws.scenes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {!ws.scenes.some((s) => s.id === doc.id) && <option value={doc.id}>{doc.name}</option>}
            </select>
          </label>
          <label className="inline-field">
            New scene
            <div className="row">
              <input value={newName} placeholder="Forest evening" onChange={(e) => setNewName(e.target.value)} style={{ width: "9rem" }} />
              <button type="button" onClick={() => void onNew()}>+ New</button>
            </div>
          </label>
          <label className="inline-field">
            Export
            <select value={preset} onChange={(e) => setPreset(e.target.value as ExportPresetId)}>
              {EXPORT_PRESETS.map((p) => (
                <option key={p.id} value={p.id} title={p.description}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            Export folder
            <input value={exportDir} placeholder="exports/ (workspace)" onChange={(e) => setExportDir(e.target.value)} style={{ width: "12rem" }} />
          </label>
          <button type="button" onClick={() => void onSave()}>{dirty ? "● Save" : "Save"}</button>
          <button type="button" className="primary" onClick={() => void onExport()}>Export</button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <h2>
            <span className="step">1</span>Layers <small>back → front</small>
          </h2>
          <div className="field">
            <label htmlFor="scene-name">Name</label>
            <input id="scene-name" value={doc.name} onChange={(e) => update({ ...doc, name: e.target.value })} />
          </div>
          {doc.layers.map((layer, i) => {
            const meta = parts.get(layer.part)?.meta as BackgroundPart | undefined;
            return (
              <div className="layer-card" key={`${i}-${layer.part}`}>
                <header>
                  <span className="band">{meta?.band ?? "?"}</span>
                  <select className="grow" value={layer.part} onChange={(e) => {
                    const m = backgrounds.find((b) => b.id === e.target.value);
                    updateLayer(i, { part: e.target.value, scroll: m?.defaultScroll ?? layer.scroll });
                  }}>
                    {backgrounds.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <button type="button" className="mini" title="Move back" onClick={() => moveLayer(i, -1)}>↑</button>
                  <button type="button" className="mini" title="Move front" onClick={() => moveLayer(i, 1)}>↓</button>
                  <button type="button" className="mini" title="Remove" onClick={() => update({ ...doc, layers: doc.layers.filter((_, j) => j !== i) })}>✕</button>
                </header>
                <label className="inline-field">
                  Scroll ×{layer.scroll.toFixed(2)}
                  <input type="range" min={0} max={1} step={0.01} value={layer.scroll} onChange={(e) => updateLayer(i, { scroll: Number(e.target.value) })} />
                </label>
                <div className="colors">
                  <input type="checkbox" checked={Boolean(layer.color)} title="Recolor" onChange={(e) => updateLayer(i, { color: e.target.checked ? meta?.recolorBase ?? "#888888" : undefined })} />
                  <span className="row">
                    recolor
                    <input type="color" value={layer.color ?? meta?.recolorBase ?? "#888888"} onChange={(e) => updateLayer(i, { color: e.target.value })} />
                  </span>
                  <input type="checkbox" checked={Boolean(layer.tint)} title="Tint" onChange={(e) => updateLayer(i, { tint: e.target.checked ? "#ff9a6a" : undefined })} />
                  <span className="row">
                    tint
                    <input type="color" value={layer.tint ?? "#ff9a6a"} onChange={(e) => updateLayer(i, { tint: e.target.value })} />
                  </span>
                </div>
                {layer.tint && (
                  <label className="inline-field">
                    Tint amount {(layer.tintAmount ?? 0.35).toFixed(2)}
                    <input type="range" min={0} max={1} step={0.05} value={layer.tintAmount ?? 0.35} onChange={(e) => updateLayer(i, { tintAmount: Number(e.target.value) })} />
                  </label>
                )}
              </div>
            );
          })}
          {doc.layers.length < ws.config.maxLayers && (
            <button type="button" onClick={() => {
              const b = backgrounds[0];
              if (b) update({ ...doc, layers: [...doc.layers, { part: b.id, scroll: b.defaultScroll ?? DEFAULT_SCROLL[b.band] }] });
            }}>+ Add layer</button>
          )}
          <div className="field" style={{ marginTop: "0.9rem" }}>
            <label htmlFor="tileset">Tileset</label>
            <select id="tileset" value={doc.tileset} onChange={(e) => update({ ...doc, tileset: e.target.value })}>
              {tilesets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <p className="hint">{doc.width}×{doc.height} tiles · {doc.width * doc.tileSize}×{doc.height * doc.tileSize}px</p>
        </aside>

        <section className="panel">
          <h2>
            <span className="step">2</span>Scene <small>{doc.id}</small>
          </h2>
          <div className="tool-row">
            {TILE_CODES.map((c) => (
              <button type="button" key={c} className={tool.kind === "tile" && tool.code === c ? "active" : ""} title={TILE_CODE_LABELS[c]} onClick={() => setTool({ kind: "tile", code: c })}>
                <span className="code">{c}</span>{TILE_CODE_LABELS[c]}
              </button>
            ))}
            <button type="button" className={tool.kind === "prop" ? "active" : ""} onClick={() => setTool({ kind: "prop" })}>Place prop</button>
            <button type="button" className={tool.kind === "select" ? "active" : ""} onClick={() => setTool({ kind: "select" })}>Select / move</button>
            <label className="row tag">
              <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> grid
            </label>
            <label className="row tag">
              zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[1, 2, 3].map((z) => (
                  <option key={z} value={z}>{z}×</option>
                ))}
              </select>
            </label>
          </div>
          <SceneEditor doc={doc} parts={parts} tool={tool} propPart={propPart} selected={selected} zoom={zoom} showGrid={grid} onChange={update} onSelect={setSelected} />
          <p className="hint">Paint tiles by dragging · ground autotiles its edges · place props snaps to the ground (hold Shift to place at the cursor).</p>
          <h2 style={{ marginTop: "1rem" }}>
            <span className="step step-leaf">3</span>Parallax preview <small>game camera</small>
          </h2>
          <ParallaxPreview doc={doc} parts={parts} walkFrames={ws.config.character.walkFrames} />
          <p className={`status ${statusKind}`}>{status}</p>
          {exported.length > 0 && (
            <ul className="export-list">
              {exported.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel">
          <h2>
            <span className="step">4</span>Props
          </h2>
          <div className="prop-grid">
            {props.map((p: PartMeta) => (
              <button type="button" key={p.id} className={`prop-btn${propPart === p.id ? " active" : ""}`} title={p.id}
                onClick={() => { setPropPart(p.id); setTool({ kind: "prop" }); }}>
                <img src={partImageUrl(p.id)} alt="" />
                {p.name}
              </button>
            ))}
          </div>
          <div className="prop-list">
            {doc.props.map((p, i) => (
              <div key={i} className={`item${selected === i ? " active" : ""}`} onClick={() => setSelected(i)}>
                <span className="grow">{p.part} @ {p.x},{p.y}</span>
              </div>
            ))}
          </div>
          {sel && selected !== null && (
            <div className="layer-card" style={{ marginTop: "0.6rem" }}>
              <header>
                <span className="band">prop</span>
                <span className="grow">{sel.part}</span>
              </header>
              <div className="row">
                <button type="button" className="mini" onClick={() => update({ ...doc, props: doc.props.map((p, i) => (i === selected ? { ...p, flipX: !p.flipX } : p)) })}>⇋ Flip</button>
                <select value={sel.layer ?? "auto"} onChange={(e) => update({
                  ...doc,
                  props: doc.props.map((p, i) => (i === selected ? { ...p, layer: e.target.value === "auto" ? undefined : (e.target.value as "back" | "front") } : p)),
                })}>
                  <option value="auto">default layer</option>
                  <option value="back">behind tiles</option>
                  <option value="front">in front</option>
                </select>
                <input type="color" title="Recolor" value={sel.color ?? parts.get(sel.part)?.meta.recolorBase ?? "#888888"}
                  onChange={(e) => update({ ...doc, props: doc.props.map((p, i) => (i === selected ? { ...p, color: e.target.value } : p)) })} />
                <button type="button" className="mini" onClick={() => { update({ ...doc, props: doc.props.filter((_, i) => i !== selected) }); setSelected(null); }}>Delete</button>
              </div>
            </div>
          )}
          <p className="hint">Sample parts are generated by code (CC0). Drop your own art in parts/.</p>
        </aside>
      </div>
    </div>
  );
}
