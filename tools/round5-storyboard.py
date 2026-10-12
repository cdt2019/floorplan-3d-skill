# 第 5 轮分镜表：从预览视频里每 2 秒抽一帧，标上秒数和这一拍在干什么，拼成一张图。
#   out/look/round5-storyboard.png        横版（round5-seq-16x9-preview.mp4）
#   out/look/round5-storyboard-phone.png  竖版（round5-seq-9x16-preview.mp4）
# 用法：python tools/round5-storyboard.py [--step 2]
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "look"
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
PAPER, INK, SOFT = "#f4f1ec", "#1c1b19", "#5f5d57"
STEP = float(sys.argv[sys.argv.index("--step") + 1]) if "--step" in sys.argv else 2.0
# 每一拍在干什么（开始秒数, 说明）——和 src/look/tour.js 的时间线一致
BEATS = [(0, "书桌上的图纸"), (1.5, "墙 → 门窗 → 家具"), (5.4, "软装按房间成组落下，开始绕圈"), (7.4, "绕圈 + 一天过去"), (9.4, "走廊长出来，白色人偶走向入户门"),
         (11.9, "门打开，镜头扎向人偶"), (13.9, "第一人称：进门"), (15.2, "左手边厨房"), (16.75, "餐桌 → 客厅（外滩）"), (18.45, "沙发、茶几"), (19.8, "卫生间瞄一眼"),
         (21.1, "进次卧：书桌、床"), (23.8, "次卧里转身（南墙的画）"), (25.6, "出次卧 → 主卧"), (27.4, "主卧：床、阅读角、窗"), (29.35, "主卧里转身"),
         (31.9, "出主卧，穿过客厅"), (33.0, "沙发和茶几之间，推拉门滑开"), (35.75, "走上阳台：灯笼、绿植、小桌椅"), (37.5, "抬头：外滩和江")]
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
    narrow = tw < 300                       # 竖版：秒数和说明分两行，不然挤在一起
    bar, pad, head = (66 if narrow else 46), 14, 70
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
        if narrow:
            txt = beat(t)
            while d.textlength(txt, font=font(15)) > tw - 4 and len(txt) > 2: txt = txt[:-2] + "…"
            d.text((x + 2, y + 38), txt, font=font(15), fill=SOFT)
        else:
            d.text((x + 92, y + 11), beat(t), font=font(17), fill=SOFT)
        c.paste(im.resize((tw, th), Image.LANCZOS), (x, y + bar))
    c.save(out)
    print("saved", out, c.size)


board(OUT / "round5-seq-16x9-preview.mp4", OUT / "round5-storyboard.png", 5, 420, "第 5 轮 · 第一人称漫游（横版 16:9，每 2 秒一帧）")
if (OUT / "round5-seq-9x16-preview.mp4").exists():
    board(OUT / "round5-seq-9x16-preview.mp4", OUT / "round5-storyboard-phone.png", 7, 250, "第 5 轮 · 第一人称漫游（竖版 9:16，每 2 秒一帧）")
