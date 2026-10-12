# 第 2 轮对比图（先跑 node tools/look-shots.mjs m2a m2b m2c m3 m4、--v m2a m2b m2c、cl-living-m2a cl-bed-m2a cl-living-m3 cl-bed-m3；
# 第 1 轮的 m2 / m2-v / m3 / m4 已另存为 round1-*.png）：
#   out/look/round2-m2.png             横版 2×2：m2a / m2b / m2c + 第 1 轮 m2 当参照，每格标名字和网址参数
#   out/look/round2-m2-phone.png       竖版 4 张并排（同上）
#   out/look/round2-decor-closeup.png  软装近景：客厅、主卧 × 白天（m2a）/ 夜里（m3）
#   out/look/round2-m3m4.png           m3、m4 第 1 轮 vs 第 2 轮
# 用法：python tools/round2-compare.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "out" / "look"
BASE = "style=e2&stage=6&finish=1&plan=opus55&clean&look=pro&pbr"
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
mono = lambda s: ImageFont.truetype("C:/Windows/Fonts/consola.ttf", s)
PAPER, INK, SOFT, FAINT = "#f4f1ec", "#1c1b19", "#5f5d57", "#8a857c"
M2 = [
    ("m2a", "m2a  奶油 · 胡桃木炭灰", "胡桃木家具 · 炭灰布艺 · 灰调中橡木地板 · 墙顶灰褐", "&mood=m2a"),
    ("m2b", "m2b  奶油 · 鼠尾草绿", "浅橡木 · 鼠尾草绿沙发和抱枕 · 墙顶灰绿", "&mood=m2b"),
    ("m2c", "m2c  奶油 · 陶土橙", "暖橡木 · 陶土橙点缀（品牌色）· 墙顶暖褐", "&mood=m2c"),
    ("round1-m2", "参照：第 1 轮 m2 奶油阴天", "太淡、看不清、软装太少（无软装）", "&mood=m2  (round 1)"),
]


def grid(items, out, W=960, H=540, BAR=78, src=lambda k: k + ".png"):
    c = Image.new("RGB", (2 * W, 2 * (H + BAR)), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, title, sub, q) in enumerate(items):
        x, y = (i % 2) * W, (i // 2) * (H + BAR)
        d.text((x + 18, y + 6), title, font=font(24, True), fill=INK)
        d.text((x + 18 + d.textlength(title, font=font(24, True)) + 20, y + 14), sub, font=font(15), fill=SOFT)
        d.text((x + 18, y + 48), f"?{BASE}{q}", font=mono(14), fill=FAINT)
        f = OUT / src(k)
        if f.exists():
            c.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + BAR))
    c.save(OUT / out)
    print("已保存", OUT / out, c.size)


def phone():
    W, H, BAR, GAP = 540, 960, 120, 12
    c = Image.new("RGB", (4 * W + 3 * GAP, H + BAR), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, title, sub, q) in enumerate(M2):
        x = i * (W + GAP)
        d.text((x + 14, 6), title, font=font(24, True), fill=INK)
        d.text((x + 14, 44), sub, font=font(14), fill=SOFT)
        d.text((x + 14, 72), f"…&look=pro&pbr{q}", font=mono(14), fill=FAINT)
        d.text((x + 14, 92), "1080×1920（竖版留边 13%）" if i < 3 else "1080×1920", font=font(13), fill=FAINT)
        f = OUT / f"{k}-v.png"
        if f.exists():
            c.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (x, BAR))
    c.save(OUT / "round2-m2-phone.png")
    print("已保存", OUT / "round2-m2-phone.png", c.size)


grid(M2, "round2-m2.png")
phone()
grid([
    ("cl-living-m2a", "客厅 · 白天（m2a）", "地毯、抱枕、搭毯、落地灯、挂画、茶几托盘、餐桌吊灯、桌旗、盘子、花瓶、果盘", "&mood=m2a&cam=0.6,4.0,10.2&tgt=4.0,0.4,6.0&fov=40"),
    ("cl-bed-m2a", "主卧 · 白天（m2a）", "被子、睡枕、靠垫、床尾巾、床头柜台灯 + 书、长绒地毯、横幅画、窗帘、休闲椅", "&mood=m2a&cam=5.9,3.6,9.4&tgt=8.6,0.4,5.4&fov=46"),
    ("cl-living-m3", "客厅 · 蓝调开灯（m3）", "灯都是软装规则放的：落地灯、餐桌吊灯", "&mood=m3&cam=0.6,4.0,10.2&tgt=4.0,0.4,6.0&fov=40"),
    ("cl-bed-m3", "主卧 · 蓝调开灯（m3）", "两盏床头灯 + 阅读角落地灯", "&mood=m3&cam=5.9,3.6,9.4&tgt=8.6,0.4,5.4&fov=46"),
], "round2-decor-closeup.png")
grid([
    ("round1-m3", "m3 蓝调 · 第 1 轮", "无软装，灯按家具写死", "&mood=m3  (round 1)"),
    ("m3", "m3 蓝调 · 第 2 轮", "和 m2a 同一个家；软装的灯照亮房间；点光源加了柔和衰减", "&mood=m3"),
    ("round1-m4", "m4 手办 · 第 1 轮", "模型太小（按外包框再放 2.6 米）", "&mood=m4  (round 1)"),
    ("m4", "m4 手办 · 第 2 轮", "m2a 配色和光 · 模型放大 · 移轴减弱", "&mood=m4"),
], "round2-m3m4.png")
