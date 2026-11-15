"""Backward-compatibility check: old scenes load, render and export byte-for-byte the same with this checkout as
with an older one (e.g. `git archive master`).

  python3 scripts/compat-check.py --old /tmp/easyscene-master [--report out.json] [--demo] <scene.json> ...

--demo also checks every demo scene a fresh `init` writes. Each scene runs in a throwaway workspace per checkout:
its own project copied over a fresh workspace made by the OLD checkout (so sample parts exist), then
`get` (load + normalize), `render` (level and viewport) and `export --preset all`. Every output must be identical.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, tempfile

ap = argparse.ArgumentParser()
ap.add_argument("--old", required=True)
ap.add_argument("--new", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument("--report")
ap.add_argument("--demo", action="store_true")
ap.add_argument("scenes", nargs="*")
a = ap.parse_args()
tmp = tempfile.mkdtemp(prefix="es-compat-")
IGNORE = shutil.ignore_patterns("exports", "*.mp4", "*.mov", "*.gif", "render", "work", "node_modules", ".git", "stills", "audio", "*-godot", "*-png", "*-pixi", "game", "shots")


def cli(repo, *args):
    r = subprocess.run(["npx", "tsx", "src/cli.ts", *args], cwd=repo, capture_output=True, text=True, timeout=600)
    return r.returncode, r.stdout, r.stderr


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def tree(d):
    out = {}
    for r, _, fs in os.walk(d):
        for f in fs:
            p = os.path.join(r, f)
            out[os.path.relpath(p, d)] = sha(p)
    return out


def workspace(side, name, scene_file):
    dst = os.path.join(tmp, side, name)
    cli(a.old, "init", "--workspace", dst)
    scenes_dir = "scenes"
    if scene_file:
        proj = os.path.dirname(os.path.dirname(os.path.abspath(scene_file)))
        sub = os.path.basename(os.path.dirname(os.path.abspath(scene_file)))
        shutil.copytree(proj, dst, ignore=IGNORE, dirs_exist_ok=True, symlinks=True)
        os.makedirs(os.path.join(dst, "scenes"), exist_ok=True)
        shutil.copy(scene_file, os.path.join(dst, "scenes", os.path.basename(scene_file)))
    return dst, scenes_dir


jobs = [(s, os.path.splitext(os.path.basename(s))[0]) for s in a.scenes]
if a.demo:
    probe = os.path.join(tmp, "probe")
    cli(a.old, "init", "--workspace", probe)
    jobs += [(None, f[:-5]) for f in sorted(os.listdir(os.path.join(probe, "scenes"))) if f.endswith(".json")]
results, bad = [], 0
for scene_file, sid in jobs:
    name = (os.path.relpath(os.path.abspath(scene_file), "/").replace("/", "__") if scene_file else f"demo__{sid}").removesuffix(".json")
    outs = {}
    for side, repo in (("old", a.old), ("new", a.new)):
        ws, sd = workspace(side, name, scene_file)
        r_get = cli(repo, "get", sid, "--workspace", ws)
        shots = os.path.join(tmp, side, f"{name}-shots")
        os.makedirs(shots, exist_ok=True)
        rr = []
        for mode in ("level", "viewport", "parallax"):
            rr.append(cli(repo, "render", "--id", sid, "--mode", mode, "--out", os.path.join(shots, f"{mode}.png"), "--workspace", ws)[0])
        exp = os.path.join(tmp, side, f"{name}-exports")
        er = cli(repo, "export", "--id", sid, "--preset", "all", "--out", exp, "--workspace", ws, "--json")
        outs[side] = {"get": r_get[0], "doc": r_get[1], "render_rc": rr, "shots": tree(shots), "export_rc": er[0], "export_err": er[2][-300:], "files": tree(exp) if os.path.isdir(exp) else {}}
    o, n = outs["old"], outs["new"]
    diffs = sorted(k for k in set(o["files"]) | set(n["files"]) if o["files"].get(k) != n["files"].get(k))
    shot_diffs = sorted(k for k in set(o["shots"]) | set(n["shots"]) if o["shots"].get(k) != n["shots"].get(k))
    e = {
        "scene": scene_file or f"(demo) {sid}",
        "load_same": o["get"] == n["get"] == 0 and o["doc"] == n["doc"],
        "render_same": o["render_rc"] == n["render_rc"] and not shot_diffs,
        "renders": len(o["shots"]),
        "export_ok": o["export_rc"] == n["export_rc"] == 0,
        "export_files": len(o["files"]),
        "export_diffs": diffs,
    }
    e["ok"] = e["load_same"] and e["render_same"] and e["export_ok"] and not diffs
    if not e["export_ok"]:
        e["export_err"] = [o["export_err"], n["export_err"]]
    bad += 0 if e["ok"] else 1
    results.append(e)
    print(f"{'OK ' if e['ok'] else 'BAD'} {e['scene']}: load+normalize same={e['load_same']} · {e['renders']} renders identical={e['render_same']} · export {e['export_files']} files, {len(diffs)} differ")
    for d in diffs:
        print(f"      DIFF {d}")
    if not e["export_ok"]:
        print("      export failed:", e["export_err"])
if a.report:
    json.dump(results, open(a.report, "w"), indent=1)
print(f"{len(results) - bad}/{len(results)} scenes backward compatible")
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if bad else 0)
