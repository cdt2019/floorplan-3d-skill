# 第 4 轮对比图（人眼漫游前的准备：每个房间、阳台夜景）：
#   out/look/round4-rooms.png        每个房间一张人眼高度静帧（烘焙光照、蓝调开灯），横版 16:9
#   out/look/round4-rooms-phone.png  其中几间的竖版 9:16
#   out/look/round4-night.png        阳台夜景三个方案 n1 / n2 / n3 并排（横版）
#   out/look/round4-night-phone.png  同上，竖版
# 先准备素材（先 npm run dev，烘焙文件在 public/bake/opus55-m3/）：
#   node tools/room-shots.mjs --dir out/look/round4                                  → room-<房间>.png
#   node tools/room-shots.mjs --dir out/look/round4 --v living kitchen bath master   → room-<房间>-v.png
#   node tools/room-shots.mjs --dir out/look/round4 --night n1 night  （n2、n3 同理，再各加 --v）
# 用法：python tools/round4-compare.py
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "out" / "look" / "round4"
OUT = ROOT / "out" / "look"
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
mono = lambda s: ImageFont.truetype("C:/Windows/Fonts/consola.ttf", s)
PAPER, INK, SOFT, FAINT = "#f4f1ec", "#1c1b19", "#5f5d57", "#8a857c"
Q = "?look=pro&pbr&view=eye&baked"


def tile(c, d, img, x, y, W, H, title, sub, q, bar=78):
    d.text((x + 18, y + 6), title, font=font(24, True), fill=INK)
    d.text((x + 18 + d.textlength(title, font=font(24, True)) + 16, y + 14), sub, font=font(15), fill=SOFT)
    d.text((x + 18, y + 48), q, font=mono(14), fill=FAINT)
    if img.exists():
        c.paste(Image.open(img).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + bar))
    else:
        d.text((x + W // 2 - 60, y + bar + H // 2), "（缺图）", font=font(20), fill=FAINT)


ROOMS = [
    ("living", "客厅", "沙发、茶几、挂画、落地灯；墙和窗帘不再发花"),
    ("dining", "餐厅", "吊灯、餐桌；左边入户门外是新加的公共走廊（不再看到天）"),
    ("kitchen", "厨房", "胡桃木地柜 + 石英台面、水槽龙头、黑玻璃灶、吊柜灯带、烟机、墙裙砖、冰箱"),
    ("bath", "卫生间", "悬挂柜 + 台上盆、镜柜（镜子反射本房间的探针）、马桶、玻璃淋浴房 + 墙砖"),
    ("bed2", "次卧", "1.5 米床：软包床头、被子垂边带褶、枕头；书桌 + 椅子、床头柜"),
    ("master", "主卧", "1.8 米床、床头画（长宽比固定，长墙时不再被拉扁）、阅读角"),
    ("balcony", "阳台", "栏板、绿植、灯笼、小桌椅；窗外是默认夜景 n3"),
]


def bake_note():
    f = ROOT / "public" / "bake" / "opus55-m3" / "bake-log.json"
    if not f.exists(): return ""
    L = json.load(open(f, encoding="utf8"))
    td = L.get("texel_density", {})
    dens = "  ".join(f"{k} {v['px_per_m']:.0f}" for k, v in td.items() if k in ("floor", "wall", "furn", "curtain", "bedding", "ceil"))
    return f"烘焙：{L['res']}×{L['res']} 一张、{L['samples']} 采样、OIDN；光照贴图 {L.get('bake_lightmap', 0) / 60:.0f} 分钟，全程 {L.get('total', 0) / 60:.0f} 分钟（GTX 1050 Ti · CUDA）。像素密度（像素/米）：{dens}"


def rooms():
    W, H, BAR = 960, 540, 78
    rows = (len(ROOMS) + 1) // 2
    c = Image.new("RGB", (2 * W, rows * (H + BAR) + 60), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, t, s) in enumerate(ROOMS):
        tile(c, d, SRC / f"room-{k}.png", (i % 2) * W, (i // 2) * (H + BAR), W, H, t, s, f"{Q}&cam=…&tgt=…（tools/room-shots.mjs {k}）")
    if len(ROOMS) % 2:  # 最后一格：说明
        x, y = W, (rows - 1) * (H + BAR)
        d.text((x + 30, y + 30), "第 4 轮 · 每个房间都在人眼高度（1.6 米）", font=font(26, True), fill=INK)
        lines = ["光照：Blender 烘焙的光照贴图（蓝调开灯 m3）× 反照率 + 实时高光",
                 "反射：每个房间一张探针，相机在哪间就用哪间（玻璃、镜子按房间盒子校正）",
                 "灯色往中性收（之前 2400K 偏橘，白墙发黄发灰）",
                 "新建模：床 + 床品、衣柜、书桌、整体厨房、冰箱、马桶、洗手台 + 镜柜、淋浴房",
                 "去掉的问题：窗帘发花、主卧挂画拉扁、玻璃里的大吊灯倒影"]
        for j, ln in enumerate(lines):
            d.text((x + 30, y + 90 + j * 34), "· " + ln, font=font(18), fill=SOFT)
    d.text((18, rows * (H + BAR) + 16), bake_note(), font=font(16), fill=SOFT)
    c.save(OUT / "round4-rooms.png")
    print("已保存", OUT / "round4-rooms.png", c.size)


def rooms_phone(keys=("living", "kitchen", "bath", "master")):
    W, H, BAR = 540, 960, 78
    c = Image.new("RGB", (len(keys) * W, H + BAR), PAPER)
    d = ImageDraw.Draw(c)
    names = dict((k, t) for k, t, _ in ROOMS)
    for i, k in enumerate(keys):
        tile(c, d, SRC / f"room-{k}-v.png", i * W, 0, W, H, names[k], "竖版 9:16", f"{Q}（--v {k}）")
    c.save(OUT / "round4-rooms-phone.png")
    print("已保存", OUT / "round4-rooms-phone.png", c.size)


NIGHTS = [
    ("n1", "n1 程序城市（第 2 版）", "近 / 中 / 远三层、退台塔冠、窗灯不规则、路网路灯车灯、雾、远处光点"),
    ("n2", "n2 外滩 HDRI 背景板 · 江景", "Poly Haven Shanghai Bund（CC0），调成和屋里同一种蓝；地平线以下换成江面倒影 + 江边步道"),
    ("n3", "n3 混合（默认）", "外滩的天和远处天际线 + 程序生成的近 / 中两层楼、行道树、路网"),
]


def night():
    W, H, BAR = 960, 540, 78
    c = Image.new("RGB", (3 * W, H + BAR), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, t, s) in enumerate(NIGHTS):
        tile(c, d, SRC / f"room-night-{k}.png", i * W, 0, W, H, t, s, f"{Q}&night={k}")
    c.save(OUT / "round4-night.png")
    print("已保存", OUT / "round4-night.png", c.size)


def night_phone():
    W, H, BAR = 540, 960, 78
    c = Image.new("RGB", (3 * W, H + BAR), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, t, _) in enumerate(NIGHTS):
        tile(c, d, SRC / f"room-night-{k}-v.png", i * W, 0, W, H, t, "竖版 9:16", f"{Q}&night={k}")
    c.save(OUT / "round4-night-phone.png")
    print("已保存", OUT / "round4-night-phone.png", c.size)


rooms()
rooms_phone()
night()
night_phone()
