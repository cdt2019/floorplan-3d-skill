# 家具建模的工具箱（tools/blender/furniture.py 和 furniture_rooms.py 共用）。
# 局部坐标：地面中心为原点，正面朝 three.js 的 +z（= Blender 的 -y，常量 Y = -1）。
# 材质只留名字，页面上（src/look/pbr.jsx 的 HERO_MAT）换成同名的共享材质，跟着配色走。
import bpy, bmesh, math
from mathutils import Vector, Matrix

sc = bpy.context.scene
Y = -1  # three.js 的 +z（正面）= Blender 的 -y

MATS = {}
def mat(name, color=(0.5, 0.5, 0.5)):
    if name not in MATS:
        m = bpy.data.materials.new(name); m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
        MATS[name] = m
    return MATS[name]

def link(o, parent):
    sc.collection.objects.link(o)
    if parent: o.parent = parent
    return o
def empty(name):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); return e
def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers):
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=md.name)
def finish(o, m, smooth=True, mods=()):
    o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = smooth
    bpy.context.view_layer.objects.active = o
    for kind, kw in mods:
        md = o.modifiers.new(kind.lower(), kind)
        for k, v in kw.items(): setattr(md, k, v)
    apply_mods(o)
    return o
def mesh_from_bm(name, bm, parent):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me), parent)
def box_bm(sx, sy, sz, cx=0, cy=0, cz=0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=bm.verts)
    return bm
# 圆角盒：所有棱倒角（width），segments 段；weighted normal 让平面不发软
def rbox(name, size, loc, m, bevel=0.01, segs=3, parent=None, rot=None):
    o = mesh_from_bm(name, box_bm(*size), parent)
    o.location = loc
    if rot: o.rotation_euler = rot
    if bevel <= 1e-5: return finish(o, m, smooth=False)
    return finish(o, m, mods=[("BEVEL", dict(width=bevel, segments=segs, limit_method="ANGLE")), ("WEIGHTED_NORMAL", dict(keep_sharp=True))])
# 盒子按两个角给（Blender 坐标）：方便按图纸尺寸摆柜体、门板
def rbox2(name, a, b, m, bevel=0.002, segs=1, parent=None):
    size = [abs(b[i] - a[i]) for i in range(3)]
    loc = [(a[i] + b[i]) / 2 for i in range(3)]
    return rbox(name, size, loc, m, bevel=min(bevel, min(size) / 2 - 1e-4), segs=segs, parent=parent)
# 平面圆角板：先把 4 条竖棱倒成大圆角（corner），再给所有棱一个小倒角（edge）
def slab(name, w, d, t, loc, m, corner=0.06, edge=0.006, parent=None):
    bm = box_bm(w, d, t)
    vert_edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).normalized().z) > 0.99]
    bmesh.ops.bevel(bm, geom=vert_edges, offset=corner, segments=8, affect="EDGES", profile=0.5)
    o = mesh_from_bm(name, bm, parent); o.location = loc
    return finish(o, m, mods=[("BEVEL", dict(width=edge, segments=3, limit_method="ANGLE", angle_limit=math.radians(50))), ("WEIGHTED_NORMAL", dict(keep_sharp=True))])
# 软垫：圆角盒 → 细分 → 往外鼓（中间厚、边缘薄），四周腰线一圈包边（细圆管）
def cushion(name, size, loc, m, puff=0.22, piping=True, parent=None, rot=None, pipe_m=None):
    sx, sy, sz = size
    o = mesh_from_bm(name, box_bm(sx, sy, sz), parent)
    finish(o, m, mods=[("BEVEL", dict(width=min(sx, sy, sz) * 0.32, segments=3, limit_method="NONE")), ("SUBSURF", dict(levels=2, render_levels=2))])
    me = o.data
    t = min(range(3), key=lambda i: size[i])          # 厚度方向 = 最小的那一维
    ia, ib = [i for i in range(3) if i != t]
    for v in me.vertices:   # 鼓起来：厚度方向按离中心的距离加一点，腰线往外凸一点
        c = [v.co[i] / (size[i] / 2) for i in range(3)]
        k = max(0.0, 1 - max(abs(c[ia]), abs(c[ib])) ** 3)
        v.co[t] *= 1 + puff * k
        v.co[ia] *= 1 + 0.02 * (1 - abs(c[t])); v.co[ib] *= 1 + 0.02 * (1 - abs(c[t]))
    me.update()
    o.location = loc
    if rot: o.rotation_euler = rot
    if piping:   # 包边：沿腰线的圆角矩形曲线
        cu = bpy.data.curves.new(name + "_pipe", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.0055; cu.bevel_resolution = 2
        sp = cu.splines.new("POLY")
        r, hx, hy, pts = min(sx, sy) * 0.3, sx / 2 * 1.02 - min(sx, sy) * 0.3, sy / 2 * 1.02 - min(sx, sy) * 0.3, []
        for cx_, cy_, a0 in ((hx, hy, 0), (-hx, hy, 90), (-hx, -hy, 180), (hx, -hy, 270)):
            for i in range(7):
                a = math.radians(a0 + i * 15); pts.append((cx_ + r * math.cos(a), cy_ + r * math.sin(a), 0))
        sp.points.add(len(pts) - 1)
        for p, c in zip(sp.points, pts): p.co = (*c, 1)
        sp.use_cyclic_u = True
        po = link(bpy.data.objects.new(name + "_pipe", cu), parent)
        po.location = loc
        if t != 2:  # 竖着的垫子（靠垫）：包边转到正对厚度方向
            cu.splines.remove(sp); sp = cu.splines.new("POLY")
            ext = [size[i] / 2 * 1.02 for i in range(3)]; r = min(size[ia], size[ib]) * 0.3; pts = []
            for ca, cb, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
                for i in range(7):
                    ang = math.radians(a0 + i * 15); p_ = [0.0, 0.0, 0.0]
                    p_[ia] = ca * (ext[ia] - r) + r * math.cos(ang); p_[ib] = cb * (ext[ib] - r) + r * math.sin(ang); pts.append(p_)
            sp.points.add(len(pts) - 1)
            for p, c in zip(sp.points, pts): p.co = (*c, 1)
            sp.use_cyclic_u = True
        if rot: po.rotation_euler = rot
        bpy.context.view_layer.objects.active = po; bpy.ops.object.select_all(action="DESELECT"); po.select_set(True)
        bpy.ops.object.convert(target="MESH")
        po.data.materials.append(pipe_m or m)
    return o
# 锥形腿：圆的（16 边）或方的，顶粗底细；splay = 往外斜（弧度，绕 x、绕 y）
def leg(name, h, r_top, r_bot, loc, m, square=False, splay=(0, 0), parent=None):
    bm = bmesh.new()
    if square:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=r_bot * 1.414, radius2=r_top * 1.414, depth=h)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, "Z"))
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=r_bot, radius2=r_top, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    o = mesh_from_bm(name, bm, parent); o.location = loc; o.rotation_euler = (splay[0], splay[1], 0)
    return finish(o, m, smooth=not square, mods=[("BEVEL", dict(width=0.003, segments=2, limit_method="ANGLE"))] if square else [])

# ---------- 第 4 轮新加的 ----------
# 圆管：沿一串点（Blender 坐标）走的管子，圆角过渡（bevel 曲线 → 网格）
def pipe(name, pts, radius, m, parent=None, res=3, smooth_pts=True):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = radius; cu.bevel_resolution = res
    cu.use_fill_caps = True
    if smooth_pts and len(pts) > 2:
        sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p; bp.handle_left_type = bp.handle_right_type = "AUTO"
        cu.resolution_u = 10
    else:
        sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
        for bp, p in zip(sp.points, pts): bp.co = (*p, 1)
    o = link(bpy.data.objects.new(name, cu), parent)
    bpy.context.view_layer.objects.active = o; bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
# 把手：细圆杆 + 两个短支脚；axis = "x" 横着 / "z" 竖着；loc 是杆中心（Blender 坐标），out = 往外伸的方向（Blender -y 是正面）
def bar_handle(name, length, loc, m, axis="z", out=(0, -1, 0), r=0.0055, stand=0.028, parent=None):
    o = Vector(out) * stand
    d = Vector((1, 0, 0)) if axis == "x" else Vector((0, 1, 0)) if axis == "y" else Vector((0, 0, 1))
    c = Vector(loc)
    pipe(name, [tuple(c + o - d * length / 2), tuple(c + o + d * length / 2)], r, m, parent, smooth_pts=False)
    for i, sgn in enumerate((-1, 1)):
        s = c + d * (sgn * (length / 2 - 0.014))
        pipe(f"{name}_s{i}", [tuple(s), tuple(s + o)], r * 0.8, m, parent, smooth_pts=False)
# 一件家具（空物体 P 下面）里同一种材质的网格合成一个（页面上少很多次绘制，烘焙时物体也少）
def merge_by_material(P):
    groups = {}
    for o in [c for c in P.children if c.type == "MESH"]:
        key = o.data.materials[0].name if o.data.materials else ""
        groups.setdefault(key, []).append(o)
    for key, objs in groups.items():
        if len(objs) < 2: continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        objs[0].name = f"{P.name}_{key}"
    return P
# 放样：一串截面环（每个环点数相同，按顺序首尾相接）连成管状网格；cap0 / cap1 封住第一个 / 最后一个环
def loft(name, rings, m, cap0=True, cap1=True, parent=None, smooth=True, mods=()):
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs[:-1], vs[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap0: bm.faces.new(list(reversed(vs[0])))
    if cap1: bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_from_bm(name, bm, parent)
    return finish(o, m, smooth=smooth, mods=mods)
# 超椭圆一圈点（中心 cx, cy，半轴 a, b，指数 n：2 = 椭圆，越大越方）
def sellipse(cx, cy, z, a, b, n=2.6, seg=40, skew=0.0):
    pts = []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        y = b * math.copysign(abs(s) ** (2 / n), s)
        x *= 1 + skew * (y / b if b else 0)   # 一头宽一头窄（蛋形）
        pts.append((cx + x, cy + y, z))
    return pts
# 布尔减（精确求解器），减完删掉刀具
def cut(o, cutter):
    md = o.modifiers.new("cut", "BOOLEAN"); md.operation = "DIFFERENCE"; md.object = cutter
    try: md.solver = "EXACT"
    except Exception: pass
    apply_mods(o)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return o
def cutter_box(size, loc, bevel=0.0, segs=3):
    o = mesh_from_bm("_cut", box_bm(*size), None); o.location = loc
    if bevel: finish(o, mat("_cut"), mods=[("BEVEL", dict(width=bevel, segments=segs, limit_method="NONE"))])
    return o
