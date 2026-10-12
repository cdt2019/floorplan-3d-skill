# 氛围预设第 1 轮的对比图（先跑 node tools/look-shots.mjs m1 m2 m3 m4 和 --v m1 m2 m3 m4、t0…t7）：
#   out/look/round1-moods.png        横版 2×2，每格标预设名 + 网址参数
#   out/look/round1-moods-phone.png  竖版 4 张并排
#   out/look/tod-strip.png           一天的时间 tod = 0, 0.15, … 1 共 8 张一条
# 用法：python tools/mood-compare.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "out" / "look"
BASE = "style=e2&stage=6&finish=1&plan=opus55&clean"
MOODS = [
    ("m1", "m1  午后暖阳", "低角度暖阳 · 奶油墙 · 蜂蜜色木地板 · 偏硬的长影子"),
    ("m2", "m2  奶油阴天", "阴天柔光 · 低反差 · 奶油 / 米色配色"),
    ("m3", "m3  蓝调时刻", "日落后蓝色天光 · 屋里开灯 · 窗户透光 · 反差最强"),
    ("m4", "m4  微缩手办", "强移轴 · 饱和度略高 · 底座 + 书桌 + 铅笔 · 影棚光"),
]
TODS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
mono = lambda s: ImageFont.truetype("C:/Windows/Fonts/consola.ttf", s)
PAPER, INK, SOFT, FAINT = "#f4f1ec", "#1c1b19", "#5f5d57", "#8a857c"


def grid():
    W, H, BAR = 960, 540, 78
    c = Image.new("RGB", (2 * W, 2 * (H + BAR)), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, title, sub) in enumerate(MOODS):
        x, y = (i % 2) * W, (i // 2) * (H + BAR)
        d.text((x + 18, y + 6), title, font=font(24, True), fill=INK)
        d.text((x + 230, y + 14), sub, font=font(15), fill=SOFT)
        d.text((x + 18, y + 48), f"?{BASE}&look=pro&pbr&mood={k}", font=mono(14), fill=FAINT)
        f = OUT / f"{k}.png"
        if f.exists():
            c.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + BAR))
    c.save(OUT / "round1-moods.png")
    print("已保存", OUT / "round1-moods.png", c.size)


def phone():
    W, H, BAR, GAP = 540, 960, 120, 12
    c = Image.new("RGB", (4 * W + 3 * GAP, H + BAR), PAPER)
    d = ImageDraw.Draw(c)
    for i, (k, title, sub) in enumerate(MOODS):
        x = i * (W + GAP)
        d.text((x + 14, 6), title, font=font(24, True), fill=INK)
        d.text((x + 14, 44), sub, font=font(14), fill=SOFT)
        d.text((x + 14, 72), f"…&look=pro&pbr&mood={k}", font=mono(14), fill=FAINT)
        d.text((x + 14, 92), "1080×1920", font=mono(13), fill=FAINT)
        f = OUT / f"{k}-v.png"
        if f.exists():
            c.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (x, BAR))
    c.save(OUT / "round1-moods-phone.png")
    print("已保存", OUT / "round1-moods-phone.png", c.size)


def strip():
    W, H, BAR, GAP = 480, 270, 44, 6
    c = Image.new("RGB", (4 * W + 3 * GAP, 2 * (H + BAR) + 40), PAPER)
    d = ImageDraw.Draw(c)
    d.text((14, 6), f"一天过去：tod = 0 → 1（?{BASE}&look=pro&pbr&mood=m1&tod=…，tod 管光，m1 管配色和机位）", font=font(18, True), fill=INK)
    for i, t in enumerate(TODS):
        x, y = (i % 4) * (W + GAP), 40 + (i // 4) * (H + BAR)
        name = {0: "正午", 0.3: "下午", 0.6: "金色时刻", 0.75: "日落", 0.9: "蓝调 → 夜", 1: "夜里"}.get(t, "")
        d.text((x + 10, y + 8), f"tod={t}", font=mono(20), fill=INK)
        d.text((x + 120, y + 10), name, font=font(17), fill=SOFT)
        f = OUT / f"t{i}.png"
        if f.exists():
            c.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + BAR))
    c.save(OUT / "tod-strip.png")
    print("已保存", OUT / "tod-strip.png", c.size)


grid()
phone()
strip()
