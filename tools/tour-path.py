# 第 6、7 轮：把 tools/tour-path.mjs 采样的漫游路线画到户型上（俯视）：墙、门扇、推拉门扇、家具、高的东西；
# 路线按速度着色（0 → 1.1 米 / 秒），每 2 秒一个机位（视野扇形 + 秒数），停下来摇的地方画圈、标停几秒；右边列各房间的进出时间和用时、速度 / 转头统计。
# 用法：node tools/tour-path.mjs [--v] && python tools/tour-path.py [--v] [--out 路径]
#   → 默认 out/look/tmp/tour-path[-v].png
import json, math, sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.cm as cm
from matplotlib.colors import Normalize
from matplotlib.patches import Rectangle, Circle, Wedge

ROOT = Path(__file__).resolve().parent.parent
V = "--v" in sys.argv
OUT = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else ROOT / "out/look/tmp" / f"tour-path{'-v' if V else ''}.png"
D = json.load(open(ROOT / "out/look/tmp" / f"tour-path{'-v' if V else ''}.json", encoding="utf-8"))
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei"]
fig = plt.figure(figsize=(19, 12.5), dpi=110)
ax = fig.add_axes([0.03, 0.05, 0.66, 0.88])
ax.set_aspect("equal")
for r in D["plan"]["rooms"]:
    x0, z0, x1, z1 = r["rect"]
    ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc="#f4f1ea" if not r.get("outdoor") else "#e8eef2", ec="none"))
    ax.text((x0 + x1) / 2, z0 + 0.25, r["name"], ha="center", fontsize=10, color="#999")
for b in D["boxes"]:
    x0, z0, x1, z1 = b["box"]
    ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc="#c9b8a0" if b["tall"] else "#e2d6c4", ec="#8a7a66", lw=0.6))
    ax.text((x0 + x1) / 2, (z0 + z1) / 2, b["type"], ha="center", va="center", fontsize=7, color="#6a5a46")
for c in D["circles"]:
    ax.add_patch(Circle(c["c"], c["r"], fc="#9fc59a" if "plant" in c["kind"] else "#f0c27a", ec="#555", lw=0.5, alpha=0.7))
for g in D["segs"]:
    col = {"wall": "#333", "leaf": "#c0392b", "panel": "#5d8fc9"}[g["kind"]]
    ax.plot([g["a"][0], g["b"][0]], [g["a"][1], g["b"][1]], color=col, lw=g["r"] * 2 * 38 if g["kind"] == "wall" else 3, solid_capstyle="butt")
S = D["samples"]
norm = Normalize(0, 1.1)
for a, b in zip(S, S[1:]):
    ax.plot([a["x"], b["x"]], [a["z"], b["z"]], color=cm.viridis(norm(a["speed"])), lw=3.2, solid_capstyle="round")
# 降进屋里那段（俯视投影，虚线）
ds = D["descent"]
ax.plot([s["x"] for s in ds], [s["z"] for s in ds], color="#888", lw=1.2, ls="--")
asp = D["aspect"]
for s in S:
    t = s["t"]
    if abs(t / 2 - round(t / 2)) > 0.017: continue
    hf = math.degrees(2 * math.atan(math.tan(math.radians(s["fov"] / 2)) * asp))
    ang = math.degrees(math.atan2(math.cos(math.radians(s["yaw"])), math.sin(math.radians(s["yaw"]))))
    ax.add_patch(Wedge((s["x"], s["z"]), 0.5, ang - hf / 2, ang + hf / 2, fc="#3d7be0", alpha=0.08, ec="#3d7be0", lw=0.4))
    ax.plot(s["x"], s["z"], "o", ms=2.5, color="#222")
    ax.text(s["x"] + 0.05, s["z"] - 0.05, f"{t:.0f}", fontsize=7, color="#c0392b" if s.get("clear", 9) < 0.28 else "#222")
# 停下来摇的地方
for nd in D["nodes"]:
    if nd["hold"] > 0:
        ax.add_patch(Circle(nd["p"], 0.13, fc="none", ec="#e67e22", lw=2))
        ax.text(nd["p"][0] + 0.16, nd["p"][1] + 0.2, f"停 {nd['hold']:.1f}s\n{nd['t']:.1f}–{nd['tout']:.1f}", fontsize=8, color="#d35400", weight="bold")
ax.set_xlim(-0.4, 10.4); ax.set_ylim(10.0, -0.4)
ax.grid(True, lw=0.3, alpha=0.4)
sm = cm.ScalarMappable(norm=norm, cmap="viridis")
cb = fig.colorbar(sm, ax=ax, fraction=0.025, pad=0.01)
cb.set_label("速度（米 / 秒）")
ax.set_title(f"第 7 轮漫游路线（{'竖版 9:16' if V else '横版 16:9'}）：颜色 = 速度，扇形 = 每 2 秒的水平视野，数字 = 视频秒，橙圈 = 停下来摇", fontsize=13)

# 右栏：各房间用时 + 统计
tx = fig.add_axes([0.72, 0.05, 0.27, 0.88]); tx.axis("off")
inner = [s for s in S if s["t"] > D["tLand"] + 0.2]
mx = lambda k: max(inner, key=lambda s: abs(s[k]))
lines = ["各段用时（视频秒）", ""]
lines += [f"  0.0–12.2   搭建、软装、绕圈 + 一天过去"]
for v in D.get("segments") or D["visits"]:
    lines.append(f"{v['t0']:5.1f}–{v['t1']:5.1f}   {v.get('name') or v['room']}  {v['t1'] - v['t0']:4.1f} 秒")
lines += ["", f"总长 {D['end']:.1f} 秒（第一人称 {D['end'] - D['tLand']:.1f} 秒）", f"厨房推拉门 {D['slideK'][0]:.1f}–{D['slideK'][1]:.1f} 秒，阳台推拉门 {D['slideB'][0]:.1f}–{D['slideB'][1]:.1f} 秒", ""]
m1, m2, m3, m4 = mx("speed"), mx("acc"), mx("accAll"), mx("yawRate")
lines += ["第一人称的镜头", f"  速度最大 {m1['speed']:.2f} 米/秒（{m1['t']:.0f}s）",
          f"  加速度最大 {abs(m2['acc']):.2f} 米/秒²（沿路线）", f"            {m3['accAll']:.2f} 米/秒²（含拐弯）",
          f"  转头最快 {abs(m4['yawRate']):.1f}°/秒（{m4['t']:.0f}s）",
          f"  转头 > 20°/秒 共 {sum(1 for s in inner if abs(s['yawRate']) > 20) / 30:.1f} 秒，> 30°/秒 {sum(1 for s in inner if abs(s['yawRate']) > 30) / 30:.1f} 秒",
          f"  转头角加速度最大 {max(abs(s['yawAcc']) for s in inner):.0f}°/秒²",
          f"  俯仰 {min(s['pitch'] for s in inner):.0f}° … {max(s['pitch'] for s in inner):.0f}°（不侧倾、眼高 1.6 米不晃）",
          f"  离墙 / 门框最近 {min(s['clear'] for s in inner):.2f} 米"]
tx.text(0, 1, "\n".join(lines), va="top", fontsize=11.5, family="Microsoft YaHei", linespacing=1.5)
fig.savefig(OUT, bbox_inches="tight")
print("saved", OUT)
