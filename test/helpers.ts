import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initWorkspace } from "../src/lib/workspace.js";

/** Fresh workspace with generated sample parts and demo scenes. */
export async function tempWorkspace(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "easyscene-test-"));
  await initWorkspace(root);
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
