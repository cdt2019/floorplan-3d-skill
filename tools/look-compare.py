# 把 out/look/ 里的 A–E 拼成一张带标注的对比图 out/look/compare.png（先跑 node tools/look-shots.mjs）
# 用法：python tools/look-compare.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "out" / "look"
BASE = "style=e2&stage=6&finish=1&plan=opus55&clean"
SHOTS = [
    ("a", "A  现在", "正交等轴测 · 不做色调映射 · 环境光 + 一盏平行光 · 墨线", f"?{BASE}"),
    ("b", "B  只换光照和后期", "透视鸟瞰 · 低角度暖阳 + 软阴影 · 柔光箱天光 · AO / 泛光 / 移轴 / 暗角 / SMAA · Neutral 色调映射", f"?{BASE}&look=pro"),
    ("c", "C  B + 换材质", "Poly Haven CC0：木地板、石膏墙、亚麻布、地砖贴图 + 茶几 / 绿植模型", f"?{BASE}&look=pro&pbr"),
    ("d", "D  人眼高度（实时）", "C 的材质 · 1.6 米站在客厅看阳台 · 满层高 + 天花板 · 阳光从阳台门照进来", f"?{BASE}&look=pro&pbr&view=eye&cut=2.8"),
    ("e", "E  路径追踪（D 的机位）", "three-gpu-pathtracer · 光线真的在屋里反弹 · 静帧累积采样", f"?{BASE}&look=pt&view=eye&cut=2.8  （96 采样）"),
]
W, H = 960, 540
BAR = 74
font = lambda s, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", s)
mono = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 13)

tiles = [(k, t, sub, url) for k, t, sub, url in SHOTS if (OUT / f"{k}.png").exists()]
cols = 2
rows = (len(tiles) + cols - 1) // cols
canvas = Image.new("RGB", (cols * W, rows * (H + BAR)), "#f4f1ec")
d = ImageDraw.Draw(canvas)
for i, (k, title, sub, url) in enumerate(tiles):
    x, y = (i % cols) * W, (i // cols) * (H + BAR)
    d.text((x + 18, y + 8), title, font=font(24, True), fill="#1c1b19")
    d.text((x + 18, y + 40), sub, font=font(14), fill="#5f5d57")
    d.text((x + 18, y + 58), url, font=mono, fill="#9a958c")
    im = Image.open(OUT / f"{k}.png").convert("RGB").resize((W, H), Image.LANCZOS)
    canvas.paste(im, (x, y + BAR))
# 空着的格子写说明
if len(tiles) % cols:
    x, y = (len(tiles) % cols) * W, (rows - 1) * (H + BAR)
    notes = [
        "同一套户型数据、同一个完成状态（第 6 步），只换渲染管线。",
        "A→B：光照 + 色调映射 + AO + 移轴，提升最大；",
        "B→C：贴图和模型在鸟瞰距离下只是细节；",
        "D：一进屋，实时光栅化没有反弹光，墙和天花板发灰发平；",
        "E：光会在屋里反弹，明暗才对，但 96 采样仍有噪点。",
        "GTX 1050 Ti，1920×1080，实时帧率（关垂直同步）：",
        "A 50–130 · B 约 43 · C 约 39 · D 约 30 fps",
        "路径追踪：每个采样约 3.7 秒，96 采样约 6 分钟",
        "（首次编译着色器另要 2–3 分钟）",
    ]
    for j, line in enumerate(notes):
        d.text((x + 40, y + BAR + 40 + j * 38), line, font=font(20), fill="#3a3732")
canvas.save(OUT / "compare.png")
print("已保存", OUT / "compare.png", canvas.size)
