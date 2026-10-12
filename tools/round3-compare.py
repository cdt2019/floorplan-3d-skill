# 第 3 轮对比图（人眼高度 + 烘焙光照）：
#   out/look/eye-compare.png  同一个机位（客厅东北角看阳台）：D 第 1 轮实时人眼 / E 第 1 轮浏览器路径追踪 / 新的烘焙光照（实时）/ Blender 路径追踪参考
#   out/look/eye-stills.png   成片里人眼高度那段的 3 帧（横版）+ 1 帧竖版
# 先准备素材（先 npm run dev，烘焙文件在 public/bake/opus55-m3/）：
#   node tools/look-shots.mjs eyeb                                   → out/look/eyeb.png（新：烘焙光照，D 的机位）
#   node tools/seq-stills.mjs --t 32.6,36.3,40 --name eye --dir out/look      → out/look/eye-32.6.png …
#   node tools/seq-stills.mjs --v --t 36.3 --name eyev --dir out/look        → out/look/eyev-36.3.png
#   （d.png、e.png 是第 1 轮的；public/bake/opus55-m3/reference.png 是 bake.py --ref 渲的）
# 用法：python tools/round3-compare.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "look"
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
mono = lambda s: ImageFont.truetype("C:/Windows/Fonts/consola.ttf", s)
PAPER, INK, SOFT, FAINT = "#f4f1ec", "#1c1b19", "#5f5d57", "#8a857c"


def tile(c, d, img, x, y, W, H, title, sub, q):
    d.text((x + 18, y + 6), title, font=font(24, True), fill=INK)
    d.text((x + 18 + d.textlength(title, font=font(24, True)) + 18, y + 14), sub, font=font(15), fill=SOFT)
    d.text((x + 18, y + 48), q, font=mono(14), fill=FAINT)
    if img.exists():
        c.paste(Image.open(img).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + 78))


def compare():
    W, H, BAR = 960, 540, 78
    items = [
        (OUT / "d.png", "D  第 1 轮：实时人眼高度", "白天 · 没有反弹光，墙和天花板一样平，像游戏", "?look=pro&pbr&view=eye&cut=2.8  (round 1)"),
        (OUT / "e.png", "E  第 1 轮：浏览器路径追踪", "反弹光对了，但 GTX 1050 Ti 上一帧要几分钟、满屏噪点", "?look=pt&view=eye&cut=2.8  (round 1)"),
        (OUT / "eyeb.png", "新  烘焙光照（实时渲染）", "Blender 烘的光照贴图 × 反照率 + 实时高光 · 蓝调开灯", "?look=pro&pbr&view=eye&baked"),
        (ROOT / "public" / "bake" / "opus55-m3" / "reference.png", "参照  Blender 直接路径追踪", "同一个场景、同一个机位（Cycles 256 采样 + 降噪），看烘焙差多少", "tools/blender/bake.py --ref"),
    ]
    c = Image.new("RGB", (2 * W, 2 * (H + BAR)), PAPER)
    d = ImageDraw.Draw(c)
    for i, (f, t, s, q) in enumerate(items):
        tile(c, d, f, (i % 2) * W, (i // 2) * (H + BAR), W, H, t, s, q)
    c.save(OUT / "eye-compare.png")
    print("已保存", OUT / "eye-compare.png", c.size)


def stills():
    W, H, BAR, VW, VH = 800, 450, 78, 450, 800
    c = Image.new("RGB", (3 * W + VW + 12, VH + BAR), PAPER)
    d = ImageDraw.Draw(c)
    hs = [("eye-32.6.png", "32.6 秒", "降到人眼高度：吊灯在左前，沙发、落地灯、窗外蓝调"),
          ("eye-36.3.png", "36.3 秒", "慢慢往前推，吊灯滑出画面"),
          ("eye-40.png", "40 秒（结尾）", "落地灯、茶几、窗外的城市")]
    for i, (f, t, s) in enumerate(hs):
        tile(c, d, OUT / f, i * W, 0, W, H, t, s, "?rec&…&look=pro&pbr&seq=final&at=" + t.split(" ")[0])
    d.text((18, H + BAR + 20), "横版 16:9（1920×1080）：成片 32.6–40 秒的人眼高度推镜；右边是同一时刻的竖版 9:16", font=font(18), fill=SOFT)
    x = 3 * W + 12
    d.text((x + 14, 6), "竖版 36.3 秒", font=font(24, True), fill=INK)
    d.text((x + 14, 48), "?rec=v&…&seq=final", font=mono(14), fill=FAINT)
    f = OUT / "eyev-36.3.png"
    if f.exists():
        c.paste(Image.open(f).convert("RGB").resize((VW, VH), Image.LANCZOS), (x, BAR))
    c.save(OUT / "eye-stills.png")
    print("已保存", OUT / "eye-stills.png", c.size)


compare()
stills()
