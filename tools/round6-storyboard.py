# 第 6 轮分镜表：从顺滑预览视频里每 3 秒抽一帧，标上秒数和这一拍在干什么，拼成一张图。
#   out/look/round6-storyboard.png        横版（round6-seq-16x9-smooth.mp4）
#   out/look/round6-storyboard-phone.png  竖版（round6-seq-9x16-smooth.mp4）
# 每一拍的说明：搭建那段写在下面 BUILD 里；第一人称那段读 out/look/tmp/tour-path.json 里各节点的 beat（src/look/tour.js 的 ROUTE）和时间。
# 用法：node tools/tour-path.mjs && python tools/round6-storyboard.py [--step 3]
import json, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "look"
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
PAPER, INK, SOFT = "#f4f1ec", "#1c1b19", "#5f5d57"
STEP = float(sys.argv[sys.argv.index("--step") + 1]) if "--step" in sys.argv else 3.0
J = json.load(open(ROOT / "out/look/tmp/tour-path.json", encoding="utf-8"))
BUILD = [(0, "书桌上的图纸"), (1.5, "墙 → 门窗 → 家具"), (5.4, "软装按房间成组落下，开始绕圈"), (7.4, "绕圈 + 一天过去"), (9.0, "往入户门那边推近"),
         (12.2, "从敞开的顶上降进入户门里（2.8 米以下天花板才出现）")]
BEATS = BUILD + [(n["t"], n["beat"]) for n in J["nodes"] if n.get("beat")] + [(J["slideB"][0], "阳台推拉门滑开")]
BEATS.sort()
beat = lambda t: [b for s, b in BEATS if s <= t + 1e-6][-1]


def frame(video, t, tmp):
    f = Path(tmp) / f"f{t:05.1f}.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1", str(f)], check=True)
    return Image.open(f).convert("RGB")


def board(video, out, cols, tw, title):
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)], capture_output=True, text=True).stdout)
    ts = [round(i * STEP, 2) for i in range(int(dur / STEP) + 1) if i * STEP <= dur - 0.05]
    with tempfile.TemporaryDirectory() as tmp:
        frames = [frame(video, t, tmp) for t in ts]
    w0, h0 = frames[0].size
    th = round(tw * h0 / w0)
    narrow = tw < 300                       # 竖版：秒数和说明分两行
    bar, pad, head = (70 if narrow else 46), 14, 70
    rows = (len(frames) + cols - 1) // cols
    W = pad + cols * (tw + pad)
    H = head + rows * (th + bar + pad) + pad
    c = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(c)
    d.text((pad + 4, 16), title, font=font(28, True), fill=INK)
    for i, (t, im) in enumerate(zip(ts, frames)):
        x = pad + (i % cols) * (tw + pad)
        y = head + (i // cols) * (th + bar + pad)
        d.text((x + 2, y + 6), f"{t:4.1f} s", font=font(22, True), fill=INK)
        txt, fs = beat(t), 15 if narrow else 16
        room = tw - 6 if narrow else tw - 96
        while d.textlength(txt, font=font(fs)) > room and len(txt) > 2: txt = txt[:-2] + "…"
        d.text((x + 2, y + 40) if narrow else (x + 92, y + 11), txt, font=font(fs), fill=SOFT)
        c.paste(im.resize((tw, th), Image.LANCZOS), (x, y + bar))
    c.save(out)
    print("saved", out, c.size)


if (OUT / "round6-seq-16x9-smooth.mp4").exists():
    board(OUT / "round6-seq-16x9-smooth.mp4", OUT / "round6-storyboard.png", 6, 400, f"第 6 轮 · 第一人称漫游（横版 16:9，每 {STEP:g} 秒一帧）")
if (OUT / "round6-seq-9x16-smooth.mp4").exists():
    board(OUT / "round6-seq-9x16-smooth.mp4", OUT / "round6-storyboard-phone.png", 9, 230, f"第 6 轮 · 第一人称漫游（竖版 9:16，每 {STEP:g} 秒一帧）")
