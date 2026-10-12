# 人眼高度要扛得住 1–3 米近看的几件家具，用 Blender 脚本建模，导出一个 GLB：
#   blender -b --factory-startup -P tools/blender/furniture.py     → public/assets/hero/furniture.glb
# 沙发（底座、扶手、靠背、两块坐垫、两块靠垫，倒角 + 细分 + 鼓起来，坐垫四周一圈包边，锥形胡桃木短腿）、
# 茶几（圆角胡桃木台面 + 斜脚锥腿 + 下层隔板）、电视柜（胡桃木竖条纹柜门 + 锥腿）和电视（窄边框 + 屏幕 + 底座）、
# 餐桌（圆角台面 + 牙板 + 锥形方腿）、餐椅（胡桃木框 + 弯背板 + 软包坐垫）。
# 尺寸和 src/look/decor.js 的 FURN 一致（软装要摆在上面）；局部坐标：地面中心为原点，正面朝 three.js 的 +z（Blender 的 -y）。
# 材质只留名字（sofa / cushion / wood / fabric / dark / screen / metal），页面上换成同名的共享材质（跟着配色走）。
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "hero", "furniture.glb")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fkit import *   # 工具箱：mat / rbox / slab / cushion / leg / pipe / loft …（tools/blender/fkit.py）

SOFA, CUSH, WOOD, FAB, DARK, SCREEN, METAL = (mat("sofa", (0.66, 0.6, 0.52)), mat("cushion", (0.85, 0.82, 0.76)), mat("wood", (0.1, 0.06, 0.04)),
                                               mat("fabric", (0.07, 0.065, 0.06)), mat("dark", (0.03, 0.03, 0.03)), mat("screen", (0.005, 0.005, 0.006)), mat("metal", (0.02, 0.02, 0.02)))


# ---------- 沙发 2.3 × 0.9，坐垫顶 0.53，扶手顶 0.62，靠背顶 0.85 ----------
def sofa():
    P = empty("sofa")
    W, D = 2.3, 0.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"sofa_leg{sx}{sy}", 0.1, 0.022, 0.014, (sx * (W / 2 - 0.12), sy * (D / 2 - 0.1), 0), WOOD, splay=(sy * 0.12, -sx * 0.12), parent=P)
    rbox("sofa_base", (W - 0.04, D - 0.04, 0.28), (0, 0, 0.1 + 0.14), SOFA, bevel=0.035, segs=4, parent=P)
    for sx in (-1, 1):   # 扶手：上面圆一点
        cushion(f"sofa_arm{sx}", (0.18, D, 0.52), (sx * (W / 2 - 0.09), 0, 0.1 + 0.26), SOFA, puff=0.0, piping=False, parent=P)
    rbox("sofa_back", (W - 0.36, 0.17, 0.4), (0, -Y * (D / 2 - 0.09), 0.38 + 0.2), SOFA, bevel=0.05, segs=4, parent=P)
    for i, x in enumerate((-0.49, 0.49)):
        cushion(f"sofa_seat{i}", (0.96, 0.66, 0.13), (x, Y * 0.085, 0.38 + 0.065), CUSH, puff=0.28, parent=P)
        cushion(f"sofa_backc{i}", (0.95, 0.17, 0.36), (x, -Y * 0.25, 0.53 + 0.15), CUSH, puff=0.25, parent=P, rot=(math.radians(-10) * -Y, 0, 0))
    return P

# ---------- 茶几 1.2 × 0.6，台面顶 0.39 ----------
def coffee():
    P = empty("coffee")
    slab("coffee_top", 1.2, 0.6, 0.032, (0, 0, 0.39 - 0.016), WOOD, corner=0.12, edge=0.008, parent=P)
    slab("coffee_shelf", 1.0, 0.44, 0.018, (0, 0, 0.12), WOOD, corner=0.08, edge=0.004, parent=P)
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"coffee_leg{sx}{sy}", 0.36, 0.019, 0.012, (sx * 0.5, sy * 0.21, 0.0), WOOD, splay=(sy * 0.06, -sx * 0.06), parent=P)
    return P

# ---------- 电视柜 1.9 × 0.4，顶 0.45；电视 1.45 × 0.84 ----------
def tv():
    P = empty("tv")
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"tv_leg{sx}{sy}", 0.14, 0.02, 0.013, (sx * 0.86, sy * 0.15, 0), WOOD, splay=(sy * 0.08, -sx * 0.08), parent=P)
    rbox("tv_body", (1.9, 0.4, 0.31), (0, 0, 0.14 + 0.155), WOOD, bevel=0.006, segs=2, parent=P)
    # 三扇柜门：竖条纹（半圆凹凸），门缝 4 毫米
    dw = (1.9 - 0.04) / 3
    for i in range(3):
        x0 = -0.93 + i * dw + dw / 2
        rbox(f"tv_door{i}", (dw - 0.004, 0.012, 0.27), (x0, Y * 0.206, 0.14 + 0.155), WOOD, bevel=0.002, segs=1, parent=P)
        n = int((dw - 0.03) / 0.024)
        bm = bmesh.new()
        for k in range(n):
            x = x0 - (n - 1) * 0.012 + k * 0.024
            c = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.0095, radius2=0.0095, depth=0.25)
            bmesh.ops.scale(bm, vec=(1, 0.45, 1), verts=c["verts"])
            bmesh.ops.translate(bm, vec=(x, Y * 0.212, 0.14 + 0.155), verts=c["verts"])
        finish(mesh_from_bm(f"tv_flutes{i}", bm, P), WOOD)
    # 电视：窄边框 + 屏幕 + 底座
    rbox("tv_panel", (1.45, 0.03, 0.84), (0, -Y * 0.03, 0.45 + 0.07 + 0.42), DARK, bevel=0.004, segs=2, parent=P)
    bm = box_bm(1.43, 0.002, 0.82, 0, Y * (0.016 - 0.03), 0.45 + 0.07 + 0.42)
    finish(mesh_from_bm("tv_screen", bm, P), SCREEN, smooth=False)
    rbox("tv_neck", (0.06, 0.03, 0.08), (0, -Y * 0.035, 0.45 + 0.04), METAL, bevel=0.004, parent=P)
    slab("tv_foot", 0.34, 0.2, 0.012, (0, -Y * 0.03, 0.45 + 0.006), METAL, corner=0.04, edge=0.002, parent=P)
    return P

# ---------- 餐桌 1.4 × 0.8，台面顶 0.765 ----------
def dining():
    P = empty("dining")
    slab("dining_top", 1.4, 0.8, 0.035, (0, 0, 0.765 - 0.0175), WOOD, corner=0.05, edge=0.007, parent=P)
    for sy in (-1, 1): rbox(f"dining_apron_x{sy}", (1.18, 0.022, 0.07), (0, sy * 0.33, 0.73 - 0.035), WOOD, bevel=0.003, segs=1, parent=P)
    for sx in (-1, 1): rbox(f"dining_apron_y{sx}", (0.022, 0.6, 0.07), (sx * 0.6, 0, 0.73 - 0.035), WOOD, bevel=0.003, segs=1, parent=P)
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"dining_leg{sx}{sy}", 0.73, 0.024, 0.015, (sx * 0.6, sy * 0.33, 0), WOOD, square=True, parent=P)
    return P

# ---------- 餐椅：坐高 0.45，坐面 0.44 × 0.44，靠背顶 0.80（正面朝 +z，靠背在后） ----------
def chair():
    P = empty("chair")
    for sx in (-1, 1):
        for sy in (-1, 1):
            back = sy == -Y  # Blender +y 是后面
            leg(f"chair_leg{sx}{sy}", 0.43 if not back else 0.43, 0.016, 0.011, (sx * 0.19, sy * 0.19, 0), WOOD, splay=(sy * 0.07, -sx * 0.05), parent=P)
    rbox("chair_frame", (0.42, 0.42, 0.03), (0, 0, 0.43 - 0.015 + 0.0), WOOD, bevel=0.006, segs=2, parent=P)
    cushion("chair_seat", (0.42, 0.42, 0.045), (0, 0, 0.43 + 0.02), FAB, puff=0.3, parent=P)
    for sx in (-1, 1):  # 后腿往上延伸成靠背立柱
        leg(f"chair_post{sx}", 0.36, 0.013, 0.016, (sx * 0.185, -Y * 0.2, 0.43), WOOD, splay=(math.radians(-8) * -Y, 0), parent=P)
    # 弯背板：圆柱面的一段
    bm = bmesh.new()
    segs, R, ang, h = 16, 0.55, math.radians(42), 0.15
    vs = []
    for i in range(segs + 1):
        a = -ang / 2 + ang * i / segs
        x, y = R * math.sin(a), R * (1 - math.cos(a))
        vs.append([bm.verts.new((x, y, -h / 2)), bm.verts.new((x, y, h / 2)), bm.verts.new((x, y + 0.018, -h / 2)), bm.verts.new((x, y + 0.018, h / 2))])
    for i in range(segs):
        a, b = vs[i], vs[i + 1]
        bm.faces.new((a[0], b[0], b[1], a[1])); bm.faces.new((a[3], b[3], b[2], a[2]))
        bm.faces.new((a[1], b[1], b[3], a[3])); bm.faces.new((a[2], b[2], b[0], a[0]))
    bm.faces.new((vs[0][0], vs[0][1], vs[0][3], vs[0][2])); bm.faces.new((vs[-1][2], vs[-1][3], vs[-1][1], vs[-1][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=(0, -Y * 0.2, 0.43 + 0.29), verts=bm.verts)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, -Y * 0.2, 0.43), matrix=Matrix.Rotation(math.radians(-8) * -Y, 3, "X"))
    o = mesh_from_bm("chair_back", bm, P)
    finish(o, WOOD, mods=[("BEVEL", dict(width=0.004, segments=2, limit_method="ANGLE", angle_limit=math.radians(40)))])
    return P

for build in (sofa, coffee, tv, dining, chair):
    build()
# 第 4 轮：其他房间的家具（床 + 床品、衣柜、书桌、整体厨房、冰箱、卫生间三件套），见 furniture_rooms.py
import furniture_rooms
furniture_rooms.build_all()
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_materials="EXPORT",
                          export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False, export_animations=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in sc.objects if o.type == "MESH")
print(f"[furniture] {OUT} {os.path.getsize(OUT) / 1e6:.2f} MB, {tris} tris", flush=True)
