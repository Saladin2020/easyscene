import type { ComposeSceneInput } from "../../src/shared/scene";
import type { ExportPresetId, SceneDoc, WorkspaceSummary } from "./types";

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const fetchWorkspace = () => fetch("/api/workspace").then((r) => json<WorkspaceSummary>(r));
export const fetchScene = (id: string) => fetch(`/api/scenes/${encodeURIComponent(id)}`).then((r) => json<SceneDoc>(r));
export const partImageUrl = (id: string) => `/api/parts/${encodeURIComponent(id)}/image`;
export const characterUrl = (p: string) => `/api/character?path=${encodeURIComponent(p)}`;

export const saveScene = (scene: SceneDoc) =>
  post("/api/scenes", { scene }).then((r) => json<{ scene: SceneDoc; path: string; warnings: string[] }>(r));

export const composeScene = (input: ComposeSceneInput) =>
  post("/api/compose", input).then((r) => json<{ scene: SceneDoc; path: string; warnings: string[] }>(r));

export const exportScene = (body: { id: string; preset: ExportPresetId; dir?: string; godotParallax?: "parallax2d" | "legacy" }) =>
  post("/api/export", body).then((r) => json<{ dir: string; paths: string[]; warnings: string[] }>(r));
