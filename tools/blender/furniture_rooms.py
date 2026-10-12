# 第 4 轮（人眼漫游，每个房间都要扛得住 1–3 米近看）：沙发那套以外的家具，由 furniture.py 调用，进同一个 GLB。
#   床 bed15 / bed18：胡桃木床架 + 矮脚、竖条软包床头、床垫（白色床笠 + 包边），两边床头柜（抽屉 + 细拉手 + 下层开格）
#   床品 bedding15 / bedding18（软装规则的 bedding 那一件）：被子按"盖在床垫上、两侧和床尾垂下来"的形状算出来，
#       垂下来那段有竖褶、四个角往下坠；被头翻折、两个睡枕 + 两个靠枕 + 一个腰枕（前后两片鼓起来、四角捏尖）、床尾巾
#   衣柜 wardrobe：四扇平板门（3 毫米门缝，缝后面是深色衬板）、细长竖拉手、内凹踢脚
#   书桌 desk：胡桃木台面 + 抽屉 + 锥形方腿（椅子用餐椅那把）
#   厨房 kitchen：胡桃木地柜（抽屉组 / 门板 / 洗碗机面板 / 灶下抽屉，门缝 + 横拉手）、4 厘米石英台面（水槽开孔）、
#       台下不锈钢水槽 + 鹅颈龙头、黑玻璃灶台、窗户左边吊柜（柜底灯带）、右边烟机（罩 + 烟道到顶）、小块砖墙裙
#   冰箱 fridge：奶白色珐琅机身、上下两门（门缝后面深色密封条）、竖拉手、踢脚
#   淋浴 shower：低矮淋浴盘 + 线性地漏、三面墙砖（避开高窗）、玻璃移门（黑色细边框）、顶喷 + 立管 + 混水阀 + 手持花洒
#   马桶 toilet：放样出来的蛋形马桶 + 盖板、水箱 + 双按钮
#   洗手台 basin：悬挂胡桃木柜（两个抽屉）、石英台面、台上陶瓷盆 + 高龙头、镜柜（柜底灯带）
# 尺寸都对着 src/look/decor.js 的 FURN（软装要摆在台面、床头柜上）和户型（墙、窗的位置）。
import bpy, bmesh, math
from mathutils import Vector, Matrix
from fkit import *

WOOD, FURN, HEADB = mat("wood", (0.1, 0.06, 0.04)), mat("furn", (0.85, 0.82, 0.77)), mat("headboard", (0.6, 0.55, 0.48))
SHEET, DUVET, RUNNER = mat("sheet", (0.95, 0.94, 0.9)), mat("duvet", (0.92, 0.9, 0.86)), mat("runner", (0.07, 0.065, 0.06))
PA, PB, PC = mat("pillowA", (0.06, 0.055, 0.05)), mat("pillowB", (0.15, 0.08, 0.04)), mat("pillowC", (0.38, 0.18, 0.07))
STONE, TILE, TILE2 = mat("stone", (0.85, 0.82, 0.76)), mat("tile", (0.85, 0.82, 0.76)), mat("tile2", (0.6, 0.56, 0.5))
CER, STEEL, METAL, DARK = mat("ceramic", (0.9, 0.9, 0.88)), mat("steel", (0.6, 0.6, 0.6)), mat("metal", (0.02, 0.02, 0.02)), mat("dark", (0.03, 0.03, 0.03))
GBLACK, APPL, MIRROR = mat("glassblack", (0.01, 0.01, 0.01)), mat("appliance", (0.86, 0.84, 0.8)), mat("mirror", (0.9, 0.9, 0.9))
SGLASS, LED, FAB = mat("showerglass", (0.8, 0.85, 0.85)), mat("led", (1.0, 0.8, 0.6)), mat("fabric", (0.07, 0.065, 0.06))

def B(x, z3, y):  # three.js 局部坐标 (x, 高, z) → Blender (x, -z, 高)
    return (x, -z3, y)

# ---------- 床 ----------
def nightstand(P, name, x, yc):
    """yc：床头柜中心的 Blender y（床头那边是 +y）。宽 0.45、深 0.42、高 0.5（台面 0.5，台灯和书放在上面）"""
    w, d, h = 0.45, 0.42, 0.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"{name}_leg{sx}{sy}", 0.12, 0.013, 0.009, (x + sx * (w / 2 - 0.035), yc + sy * (d / 2 - 0.035), 0), WOOD, splay=(sy * 0.06, -sx * 0.06), parent=P)
    rbox2(f"{name}_bot", (x - w / 2, yc - d / 2, 0.12), (x + w / 2, yc + d / 2, 0.14), WOOD, parent=P)
    rbox2(f"{name}_top", (x - w / 2, yc - d / 2, 0.475), (x + w / 2, yc + d / 2, 0.5), WOOD, bevel=0.004, segs=2, parent=P)
    for sx in (-1, 1):
        rbox2(f"{name}_side{sx}", (x + sx * w / 2 - (0.02 if sx > 0 else 0), yc - d / 2, 0.14), (x + sx * w / 2 + (0 if sx > 0 else 0.02), yc + d / 2, 0.475), WOOD, parent=P)
    rbox2(f"{name}_back", (x - w / 2 + 0.02, yc + d / 2 - 0.012, 0.14), (x + w / 2 - 0.02, yc + d / 2, 0.475), WOOD, parent=P)
    rbox2(f"{name}_mid", (x - w / 2 + 0.02, yc - d / 2 + 0.01, 0.315), (x + w / 2 - 0.02, yc + d / 2 - 0.012, 0.33), WOOD, parent=P)
    fy = yc - d / 2   # 正面（-y）
    rbox2(f"{name}_drawer", (x - w / 2 + 0.023, fy - 0.004, 0.334), (x + w / 2 - 0.023, fy + 0.016, 0.471), WOOD, bevel=0.0025, segs=2, parent=P)
    bar_handle(f"{name}_pull", 0.12, (x, fy - 0.004, 0.41), METAL, axis="x", stand=0.02, r=0.0045, parent=P)

def bed(bw, name):
    P = empty(name)
    # 床架：床尾 Blender y = -1.05，床头板正面 0.92；侧板 / 床尾板 4 厘米厚，顶 0.32；矮脚缩进 6 厘米
    y0, y1, fw = -1.05, 0.95, bw + 0.08
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"{name}_leg{sx}{sy}", 0.12, 0.022, 0.016, (sx * (fw / 2 - 0.07), (y0 + 0.07) if sy < 0 else (y1 - 0.07), 0), WOOD, square=True, parent=P)
    for sx in (-1, 1):
        rbox2(f"{name}_rail{sx}", (sx * fw / 2 - (0.04 if sx > 0 else 0), y0 + 0.04, 0.12), (sx * fw / 2 + (0 if sx > 0 else 0.04), y1, 0.32), WOOD, bevel=0.005, segs=2, parent=P)
    rbox2(f"{name}_foot", (-fw / 2, y0, 0.12), (fw / 2, y0 + 0.04, 0.32), WOOD, bevel=0.005, segs=2, parent=P)
    rbox2(f"{name}_deck", (-fw / 2 + 0.04, y0 + 0.04, 0.24), (fw / 2 - 0.04, y1, 0.27), WOOD, parent=P)
    # 床垫：白色床笠，四周一圈包边
    cushion(f"{name}_mattress", (bw, 1.95, 0.25), (0, (y0 + 0.045 + 0.92) / 2, 0.27 + 0.125), SHEET, puff=0.05, parent=P)
    # 床头：胡桃木背板 + 竖条软包（每条鼓起来）
    rbox2(f"{name}_hb_back", (-fw / 2 - 0.02, 0.99, 0.12), (fw / 2 + 0.02, 1.05, 1.02), WOOD, bevel=0.006, segs=2, parent=P)
    n = max(6, round((fw + 0.02) / 0.19)); cw = (fw + 0.02) / n
    for i in range(n):
        x = -(fw + 0.02) / 2 + cw * (i + 0.5)
        cushion(f"{name}_hb{i}", (cw - 0.003, 0.075, 0.72), (x, 0.955, 0.3 + 0.36), HEADB, puff=0.4, piping=False, parent=P)
    for s in (-1, 1):
        nightstand(P, f"{name}_ns{s}", s * (bw / 2 + 0.32), 0.83)
    return merge_by_material(P)

# ---------- 床品：被子（盖住床垫、两侧和床尾垂下来）、被头翻折、枕头、床尾巾 ----------
def drape_fn(W, foot_y, top, r, seed):
    """返回 P(u, v)：参数平面（u 横向、v 纵向，单位米，按布料展开的长度算）→ 盖在床垫上的布面上的点。
    床垫顶面矩形 |x| <= W/2、y >= foot_y；出了矩形的部分沿边缘圆角（半径 r）翻下去，再竖直垂下；四个角沿径向坠下去。
    垂下来那段加竖褶（沿床沿一圈的周长坐标 p 上叠几个正弦），顶面有很浅的起伏。"""
    rnd = [((seed * 9301 + k * 49297) % 233280) / 233280 for k in range(12)]
    ph = [x * 2 * math.pi for x in rnd]
    Rc = 0.22
    def perim(u, v, dx, dy, sx):
        if dy == 0: return (v - foot_y) * sx if sx > 0 else -math.pi * Rc - W - (v - foot_y)
        if dx == 0: return -math.pi / 2 * Rc - (W / 2 - u)
        th = math.atan2(dy, dx)
        if sx > 0: return -th * Rc
        return -math.pi / 2 * Rc - W - (math.pi / 2 - th) * Rc
    def g(p):
        return (0.55 * math.sin(2 * math.pi * p / 0.23 + ph[0]) + 0.3 * math.sin(2 * math.pi * p / 0.137 + ph[1])
                + 0.35 * math.sin(2 * math.pi * p / 0.41 + ph[2]))
    def P(u, v):
        sx = 1 if u >= 0 else -1
        dx = max(0.0, abs(u) - W / 2); dy = max(0.0, foot_y - v)
        if dx == 0 and dy == 0:
            # 顶面：中间略鼓（被芯蓬松），很浅的斜向起伏
            k = (1 - (2 * u / W) ** 2)
            z = top + 0.006 * k + 0.0035 * math.sin(u * 6.1 + v * 2.3 + ph[3]) * math.sin(v * 4.7 - u * 1.9 + ph[4])
            return Vector((u, v, z)), 0.0
        if dy == 0: base, d, s = Vector((sx * W / 2, v, 0)), Vector((sx, 0, 0)), dx
        elif dx == 0: base, d, s = Vector((u, foot_y, 0)), Vector((0, -1, 0)), dy
        else:
            s = math.hypot(dx, dy); d = Vector((sx * dx / s, -dy / s, 0)); base = Vector((sx * W / 2, foot_y, 0))
            s *= 1 - 0.75 * (1 - max(abs(d.x), abs(d.y)))   # 角上的布不要坠成尖角：方形参数域往圆角上收，只比两边低几厘米
        if s < math.pi * r / 2: h, drop = r * math.sin(s / r), r * (1 - math.cos(s / r))
        else: h, drop = r, r + (s - math.pi * r / 2)
        corner = 1.0 if (dx > 0 and dy > 0) else 0.0
        a = 0.021 * min(1.0, max(0.0, (drop - 0.6 * r) / 0.17)) ** 1.3 * (1 + 0.7 * corner)
        h += a * g(perim(u, v, dx, dy, sx))
        p = base + d * h
        return Vector((p.x, p.y, max(0.03, top - drop))), drop
    return P

def drape_mesh(name, P, u0, u1, v0, v1, m, thick, offset=0.0, res=0.022, parent=None, keep=None):
    nu, nv = max(2, round((u1 - u0) / res)), max(2, round((v1 - v0) / res))
    bm = bmesh.new()
    grid = []
    e = 1e-3
    for j in range(nv + 1):
        row = []
        v = v0 + (v1 - v0) * j / nv
        for i in range(nu + 1):
            u = u0 + (u1 - u0) * i / nu
            p, _ = P(u, v)
            if offset:
                du = P(u + e, v)[0] - P(u - e, v)[0]; dv = P(u, v + e)[0] - P(u, v - e)[0]
                nrm = du.cross(dv)
                if nrm.length > 1e-9: p = p + nrm.normalized() * offset
            row.append(bm.verts.new(p) if (keep is None or keep(u, v)) else None)
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            if all(q): bm.faces.new(q)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    o = mesh_from_bm(name, bm, parent)
    return finish(o, m, mods=[("SOLIDIFY", dict(thickness=thick, offset=-1, use_rim=True, use_even_offset=True))])

def pillow(name, w, h, t, m, loc, tilt, yaw=0.0, parent=None, seed=0):
    """枕头：w 宽、h 高（站着时的高度）、t 厚；前后两片鼓起来的面缝在一起，四角捏尖。tilt：往后（床头）仰的角度（弧度）"""
    bm = bmesh.new(); N = 26
    rows = {}
    for side in (1, -1):
        for j in range(N + 1):
            for i in range(N + 1):
                u, v = 2 * i / N - 1, 2 * j / N - 1
                f = max(0.0, 1 - abs(u) ** 2.6) ** 0.55 * max(0.0, 1 - abs(v) ** 2.6) ** 0.55
                wr = 0.004 * math.sin(u * 8.0 + v * 3.5 + seed) * f
                pinch = 1 - 0.07 * abs(u * v) ** 3
                x = u * w / 2 * (1 + 0.04 * (1 - f)) * pinch
                z = v * h / 2 * (1 + 0.04 * (1 - f)) * pinch
                y = side * (t / 2 * f + wr)
                edge = i in (0, N) or j in (0, N)
                key = (i, j) if edge else (i, j, side)
                if key not in rows: rows[key] = bm.verts.new((x, y, z))
        for j in range(N):
            for i in range(N):
                q = [rows[(a, b)] if (a in (0, N) or b in (0, N)) else rows[(a, b, side)] for a, b in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
                bm.faces.new(q if side < 0 else list(reversed(q)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_from_bm(name, bm, parent)
    finish(o, m)
    o.rotation_euler = (-tilt, 0, yaw)
    o.location = loc
    return o

def bedding(bw, name):
    P = empty(name)
    W, foot_y, top, r = bw + 0.02, -1.03, 0.585, 0.06
    hs = 0.24  # 两侧和床尾垂下来的长度（底边停在床架侧板上沿上面一点）
    D = drape_fn(W, foot_y, top, r, seed=int(bw * 10))
    Ls = math.pi * r / 2 + (hs - r)
    head = 0.5
    # 被子：从床尾垂边到 head（离床头板 0.42 米，枕头放在后面）
    drape_mesh(f"{name}_duvet", D, -W / 2 - Ls, W / 2 + Ls, foot_y - Ls, head, DUVET, 0.05, parent=P)
    # 被头翻折：被子在 head 处往回折 0.3 米，露出被套反面（颜色同床单）
    drape_mesh(f"{name}_cuff", D, -W / 2 - Ls + 0.02, W / 2 + Ls - 0.02, head - 0.3, head + 0.015, SHEET, 0.032, offset=0.034, parent=P)
    # 床尾巾：横搭在床尾，两侧垂下 0.16 米（贴着被子表面，往外偏 1 厘米）
    Lr = math.pi * r / 2 + (0.17 - r)
    drape_mesh(f"{name}_runner", D, -W / 2 - Lr, W / 2 + Lr, foot_y + 0.14, foot_y + 0.56, RUNNER, 0.01, offset=0.012, res=0.02, parent=P)
    # 枕头：两个睡枕（仰在床头板上）、两个靠枕、一个腰枕（站得更直）
    pw = bw / 2 - 0.1
    for i, s in enumerate((-1, 1)):
        pillow(f"{name}_sleep{i}", pw, 0.46, 0.16, SHEET, (s * (bw / 4 - 0.005), 0.74, 0.585 + 0.1), math.radians(62), yaw=s * 0.02, parent=P, seed=i)
    for i, (s, m_) in enumerate(((-1, PA), (1, PB))):
        pillow(f"{name}_deco{i}", 0.46, 0.46, 0.15, m_, (s * (bw / 4 - 0.04), 0.58, 0.62 + 0.19), math.radians(24), yaw=-s * 0.06, parent=P, seed=3 + i)
    pillow(f"{name}_lumbar", 0.5, 0.29, 0.12, PC, (0.0, 0.43, 0.63 + 0.125), math.radians(20), parent=P, seed=7)
    return merge_by_material(P)

# ---------- 衣柜 2.4 × 0.6，高 2.36 ----------
def wardrobe():
    P = empty("wardrobe")
    W, Dp, H = 2.4, 0.6, 2.36
    back, front = 0.3, -0.28
    rbox2("wd_plinth", (-W / 2 + 0.03, front + 0.05, 0), (W / 2 - 0.03, back, 0.08), DARK, parent=P)
    rbox2("wd_body", (-W / 2, front, 0.08), (W / 2, back, H), FURN, bevel=0.003, segs=2, parent=P)
    rbox2("wd_shadow", (-W / 2 + 0.003, front - 0.0012, 0.081), (W / 2 - 0.003, front - 0.0008, H - 0.001), DARK, bevel=0.0, parent=P)
    n, g = 4, 0.003
    dw = (W - (n + 1) * g) / n
    for i in range(n):
        x0 = -W / 2 + g + i * (dw + g)
        rbox2(f"wd_door{i}", (x0, front - 0.021, 0.08 + g), (x0 + dw, front - 0.0015, H - g), FURN, bevel=0.0015, segs=2, parent=P)
        hx = x0 + dw - 0.045 if i % 2 == 0 else x0 + 0.045
        bar_handle(f"wd_pull{i}", 0.36, (hx, front - 0.021, 1.08), METAL, axis="z", stand=0.022, r=0.006, parent=P)
    return merge_by_material(P)

# ---------- 书桌：台面 1.2 × 0.6，顶 0.762（软装的台灯、书、电脑、杯子放在上面）----------
def desk():
    P = empty("desk")
    slab("desk_top", 1.2, 0.6, 0.028, (0, 0, 0.748), WOOD, corner=0.02, edge=0.005, parent=P)
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(f"desk_leg{sx}{sy}", 0.734, 0.02, 0.013, (sx * 0.54, sy * 0.24, 0), WOOD, square=True, parent=P)
    # 台面下的牙板 + 中间一个扁抽屉
    for sy in (-1, 1): rbox2(f"desk_apron{sy}", (-0.52, sy * 0.24 - 0.01, 0.66), (0.52, sy * 0.24 + 0.01, 0.734), WOOD, parent=P)
    for sx in (-1, 1): rbox2(f"desk_apron_s{sx}", (sx * 0.54 - 0.01, -0.22, 0.66), (sx * 0.54 + 0.01, 0.22, 0.734), WOOD, parent=P)
    rbox2("desk_drawer", (-0.3, -0.262, 0.664), (0.3, -0.244, 0.73), WOOD, bevel=0.002, segs=2, parent=P)
    bar_handle("desk_pull", 0.14, (0, -0.262, 0.697), METAL, axis="x", stand=0.016, r=0.004, parent=P)
    return merge_by_material(P)

# ---------- 整体厨房：地柜 2.6 × 0.6，台面顶 0.92；窗户在局部 x -0.62 … 0.78（户型：北墙 0.8–2.2 米）----------
def kitchen():
    P = empty("kitchen")
    L, back, front = 2.6, 0.3, -0.28          # 地柜正面（门板背面）在 y = -0.28，门板 2 厘米厚，正面 -0.30
    x0, x1 = -L / 2, L / 2
    rbox2("k_plinth", (x0, front + 0.05, 0), (x1, back, 0.1), DARK, parent=P)
    rbox2("k_carcass", (x0, front, 0.1), (x1, back, 0.665), WOOD, parent=P)                 # 柜体（水槽下面空出来）
    rbox2("k_shadow", (x0 + 0.002, front - 0.0012, 0.101), (x1 - 0.002, front - 0.0006, 0.879), DARK, bevel=0.0, parent=P)
    g, zt, zb = 0.0015, 0.879, 0.101   # 门缝一半、门板顶、底
    def front_panel(nm, a, b, z0, z1, handle=True, hl=0.18):
        rbox2(nm, (a + g, front - 0.02, z0 + g), (b - g, front - 0.0012, z1 - g), WOOD, bevel=0.0015, segs=2, parent=P)
        if handle: bar_handle(nm + "_pull", min(hl, (b - a) * 0.6), ((a + b) / 2, front - 0.02, z1 - 0.045), METAL, axis="x", stand=0.022, r=0.0055, parent=P)
    # 左起：抽屉组 / 单门 / 水槽两门 / 洗碗机面板 / 灶下两个深抽屉
    zs = [zb, 0.36, 0.64, zt]
    for k in range(3): front_panel(f"k_dr{k}", -1.3, -0.85, zs[k], zs[k + 1], hl=0.16)
    front_panel("k_door0", -0.85, -0.3, zb, zt)
    front_panel("k_sinkL", -0.3, 0.0, zb, zt, hl=0.14); front_panel("k_sinkR", 0.0, 0.3, zb, zt, hl=0.14)
    front_panel("k_dw", 0.3, 0.78, zb, zt, hl=0.3)
    front_panel("k_cook0", 0.78, 1.3, 0.56, zt, hl=0.28); front_panel("k_cook1", 0.78, 1.3, zb, 0.56, hl=0.28)
    # 台面：4 厘米石英，前沿出挑 1.5 厘米；水槽开孔（圆角）
    top = rbox2("k_top", (x0 - 0.005, front - 0.035, 0.88), (x1 + 0.005, back, 0.92), STONE, bevel=0.003, segs=2, parent=P)
    cut(top, cutter_box((0.44, 0.36, 0.1), (0.0, 0.01, 0.9), bevel=0.04, segs=4))
    # 台下水槽：不锈钢盆（只有壳）+ 下水口
    bm = box_bm(0.452, 0.372, 0.2, 0, 0.01, 0.78)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.5], context="FACES")
    sink = mesh_from_bm("k_sink", bm, P)
    finish(sink, STEEL, mods=[("BEVEL", dict(width=0.035, segments=5, limit_method="ANGLE")), ("SOLIDIFY", dict(thickness=0.0015, offset=1)), ("WEIGHTED_NORMAL", dict(keep_sharp=True))])
    for f in sink.data.polygons: f.use_smooth = True
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.04, radius2=0.04, depth=0.004)
    o = mesh_from_bm("k_drain", bm, P); o.location = (0, 0.06, 0.683); finish(o, METAL)
    # 鹅颈龙头（哑光黑）+ 侧把手
    fx, fy = 0.0, 0.245
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.026, radius2=0.024, depth=0.06)
    o = mesh_from_bm("k_tap_base", bm, P); o.location = (fx, fy, 0.95); finish(o, METAL)
    pipe("k_tap", [(fx, fy, 0.97), (fx, fy, 1.2), (fx, fy - 0.03, 1.32), (fx, fy - 0.13, 1.33), (fx, fy - 0.2, 1.28), (fx, fy - 0.21, 1.19)], 0.0115, METAL, parent=P, res=4)
    pipe("k_tap_lever", [(fx + 0.024, fy, 1.0), (fx + 0.05, fy + 0.01, 1.04), (fx + 0.06, fy + 0.025, 1.08)], 0.0045, METAL, parent=P)
    # 灶台：黑玻璃 + 四个灶圈
    cx = 1.04
    rbox2("k_hob", (cx - 0.25, -0.25, 0.92), (cx + 0.25, 0.23, 0.926), GBLACK, bevel=0.002, segs=2, parent=P)
    for i, (dx, dy, rr) in enumerate(((-0.12, -0.11, 0.085), (0.12, -0.11, 0.07), (-0.12, 0.11, 0.07), (0.12, 0.11, 0.085))):
        bpy.ops.mesh.primitive_torus_add(major_radius=rr, minor_radius=0.0016, major_segments=48, minor_segments=4, location=(cx + dx, dy - 0.01, 0.9262))
        t = bpy.context.active_object; t.name = f"k_ring{i}"; t.parent = P; t.data.materials.append(STEEL)
    # 墙裙砖（小方砖贴图）：窗户左边从台面到吊柜底，右边从台面到烟机罩底
    rbox2("k_tileL", (x0, back - 0.008, 0.92), (-0.625, back, 1.5), TILE, bevel=0.0, parent=P)
    rbox2("k_tileR", (0.785, back - 0.008, 0.92), (x1, back, 1.62), TILE, bevel=0.0, parent=P)
    # 吊柜：窗户左边，奶油色平板门，柜底一条暖色灯带
    rbox2("k_wall_body", (x0, -0.04, 1.5), (-0.625, back, 2.32), FURN, bevel=0.002, segs=1, parent=P)
    rbox2("k_wall_door", (x0 + g, -0.06, 1.5 + g), (-0.625 - g, -0.041, 2.32 - g), FURN, bevel=0.0015, segs=2, parent=P)
    bar_handle("k_wall_pull", 0.16, ((x0 - 0.625) / 2, -0.06, 1.545), METAL, axis="x", stand=0.02, r=0.005, parent=P)
    rbox2("k_led", (x0 + 0.03, -0.02, 1.492), (-0.655, -0.005, 1.5), LED, bevel=0.0, parent=P)
    # 烟机：罩（下沿 1.62）+ 斜顶 + 烟道到天花板（2.8）；罩底深色滤网 + 两盏小灯
    hw, hy0 = 0.5, -0.19
    rbox2("k_hood", (cx - hw / 2, hy0, 1.62), (cx + hw / 2, back, 1.71), APPL, bevel=0.004, segs=2, parent=P)
    loft("k_hood_taper", [[(cx - hw / 2, hy0, 1.71), (cx + hw / 2, hy0, 1.71), (cx + hw / 2, back, 1.71), (cx - hw / 2, back, 1.71)],
                          [(cx - 0.13, 0.06, 1.86), (cx + 0.13, 0.06, 1.86), (cx + 0.13, back, 1.86), (cx - 0.13, back, 1.86)]], APPL, smooth=False, parent=P)
    rbox2("k_chimney", (cx - 0.13, 0.06, 1.86), (cx + 0.13, back, 2.8), APPL, bevel=0.002, segs=1, parent=P)
    rbox2("k_hood_grille", (cx - hw / 2 + 0.02, hy0 + 0.02, 1.618), (cx + hw / 2 - 0.02, back - 0.02, 1.621), DARK, bevel=0.0, parent=P)
    for dx in (-0.14, 0.14):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.022, radius2=0.022, depth=0.003)
        o = mesh_from_bm("k_hood_lamp", bm, P); o.location = (cx + dx, hy0 + 0.06, 1.6165); finish(o, LED)
    return merge_by_material(P)

# ---------- 冰箱 0.7 × 0.68，高 1.85（正面 -y）----------
def fridge():
    P = empty("fridge")
    W, back, front = 0.68, 0.34, -0.305
    rbox2("fr_plinth", (-W / 2 + 0.02, front + 0.03, 0), (W / 2 - 0.02, back - 0.02, 0.06), DARK, parent=P)
    rbox2("fr_body", (-W / 2, front, 0.06), (W / 2, back - 0.01, 1.85), APPL, bevel=0.012, segs=3, parent=P)
    rbox2("fr_gasket", (-W / 2 + 0.01, front - 0.004, 0.07), (W / 2 - 0.01, front + 0.002, 1.84), DARK, bevel=0.0, parent=P)
    rbox2("fr_door_top", (-W / 2, front - 0.035, 0.72), (W / 2, front - 0.004, 1.85), APPL, bevel=0.01, segs=4, parent=P)
    rbox2("fr_door_bot", (-W / 2, front - 0.035, 0.07), (W / 2, front - 0.004, 0.71), APPL, bevel=0.01, segs=4, parent=P)
    bar_handle("fr_pull_top", 0.42, (W / 2 - 0.05, front - 0.035, 1.12), METAL, axis="z", stand=0.03, r=0.0075, parent=P)
    bar_handle("fr_pull_bot", 0.28, (W / 2 - 0.05, front - 0.035, 0.5), METAL, axis="z", stand=0.03, r=0.0075, parent=P)
    return merge_by_material(P)

# ---------- 淋浴 1.84 × 1.0（背面贴北墙 y = +0.5，左右贴卫生间两侧墙 x = ±0.94；高窗在 x -0.4 … 0.4、高 1.4 … 2.1）----------
def shower():
    P = empty("shower")
    hw, back, front = 0.94, 0.5, -0.5
    rbox2("sh_tray", (-hw, front + 0.03, 0), (hw, back, 0.035), CER, bevel=0.004, segs=2, parent=P)
    rbox2("sh_drain", (-0.35, back - 0.09, 0.035), (0.35, back - 0.05, 0.0365), METAL, bevel=0.0, parent=P)
    t = 0.01
    rbox2("sh_tb0", (-hw, back - t, 0.035), (hw, back, 1.4), TILE2, bevel=0.0, parent=P)
    rbox2("sh_tb1", (-hw, back - t, 1.4), (-0.4, back, 2.1), TILE2, bevel=0.0, parent=P)
    rbox2("sh_tb2", (0.4, back - t, 1.4), (hw, back, 2.1), TILE2, bevel=0.0, parent=P)
    rbox2("sh_tb3", (-hw, back - t, 2.1), (hw, back, 2.8), TILE2, bevel=0.0, parent=P)
    for sx in (-1, 1):
        a, b = (sx * hw - (t if sx > 0 else 0), front + 0.03, 0.035), (sx * hw + (0 if sx > 0 else t), back - t, 2.8)
        rbox2(f"sh_ts{sx}", (min(a[0], b[0]), a[1], a[2]), (max(a[0], b[0]), b[1], b[2]), TILE2, bevel=0.0, parent=P)
    # 玻璃：右边一扇固定、左边一扇移门（在前面一点），黑色细边框
    gy = front + 0.05
    rbox2("sh_glass_fix", (-0.02, gy - 0.004, 0.04), (hw - 0.025, gy + 0.004, 1.98), SGLASS, bevel=0.001, segs=1, parent=P)
    rbox2("sh_glass_door", (-hw + 0.03, gy - 0.032, 0.05), (0.05, gy - 0.024, 1.97), SGLASS, bevel=0.001, segs=1, parent=P)
    rbox2("sh_rail", (-hw + t, gy - 0.04, 1.98), (hw - t, gy + 0.012, 2.005), METAL, bevel=0.002, segs=1, parent=P)
    for sx in (-1, 1):
        rbox2(f"sh_post{sx}", (sx * (hw - t) - 0.012, gy - 0.012, 0.035), (sx * (hw - t) + 0.012, gy + 0.012, 1.98), METAL, bevel=0.002, segs=1, parent=P)
    rbox2("sh_guide", (-0.02, gy - 0.04, 0.035), (hw - t, gy - 0.016, 0.05), METAL, bevel=0.001, segs=1, parent=P)
    bar_handle("sh_pull", 0.32, (0.01, gy - 0.032, 1.05), METAL, axis="z", out=(0, -1, 0), stand=0.03, r=0.007, parent=P)
    # 花洒：立管（在窗户右边）、顶喷（方形）、混水阀、手持花洒
    sxp, wy = 0.62, back - t
    pipe("sh_riser", [(sxp, wy - 0.035, 1.12), (sxp, wy - 0.035, 2.02)], 0.011, METAL, parent=P, smooth_pts=False)
    pipe("sh_arm", [(sxp, wy - 0.035, 2.02), (sxp, wy - 0.07, 2.06), (sxp, wy - 0.26, 2.06)], 0.009, METAL, parent=P)
    rbox2("sh_head", (sxp - 0.125, wy - 0.38, 2.045), (sxp + 0.125, wy - 0.13, 2.058), METAL, bevel=0.004, segs=2, parent=P)
    rbox2("sh_mixer", (sxp - 0.09, wy - 0.05, 1.08), (sxp + 0.09, wy, 1.14), METAL, bevel=0.008, segs=3, parent=P)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.028, radius2=0.026, depth=0.03)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    o = mesh_from_bm("sh_knob", bm, P); o.location = (sxp + 0.05, wy - 0.065, 1.11); finish(o, METAL)
    pipe("sh_hand", [(sxp - 0.05, wy - 0.06, 1.25), (sxp - 0.05, wy - 0.07, 1.45)], 0.014, METAL, parent=P, smooth_pts=False)
    pipe("sh_hose", [(sxp - 0.05, wy - 0.06, 1.25), (sxp - 0.07, wy - 0.07, 1.16), (sxp - 0.05, wy - 0.06, 1.1)], 0.005, METAL, parent=P)
    return merge_by_material(P)

# ---------- 马桶：水箱顶 0.725（软装在上面放一盆小绿植），背面贴墙 y = +0.34 ----------
def toilet():
    P = empty("toilet")
    rings = []
    for z, a, b, cy, n in ((0.0, 0.115, 0.17, 0.08, 2.4), (0.06, 0.12, 0.19, 0.07, 2.4), (0.18, 0.15, 0.24, 0.03, 2.3), (0.3, 0.175, 0.28, 0.0, 2.2), (0.37, 0.182, 0.29, 0.0, 2.2), (0.385, 0.178, 0.286, 0.0, 2.2)):
        rings.append(sellipse(0, cy, z, a, b, n=n, seg=40, skew=0.1))
    loft("wc_bowl", rings, CER, cap0=True, cap1=True, parent=P, mods=[("SUBSURF", dict(levels=1, render_levels=1))])
    # 座圈 + 盖板（盖着，干净）
    seat = [sellipse(0, -0.045, z, a, b, n=2.25, seg=40, skew=0.1) for z, a, b in ((0.386, 0.176, 0.24), (0.4, 0.18, 0.245), (0.41, 0.176, 0.24))]
    loft("wc_seat", seat, CER, parent=P, mods=[("SUBSURF", dict(levels=1, render_levels=1))])
    lid = [sellipse(0, -0.05, z, a, b, n=2.25, seg=40, skew=0.1) for z, a, b in ((0.411, 0.172, 0.236), (0.425, 0.17, 0.233), (0.437, 0.155, 0.215), (0.441, 0.1, 0.15))]
    loft("wc_lid", lid, CER, parent=P, mods=[("SUBSURF", dict(levels=1, render_levels=1))])
    rbox2("wc_hinge", (-0.08, 0.17, 0.4), (0.08, 0.2, 0.425), CER, bevel=0.008, segs=3, parent=P)
    # 水箱 + 盖 + 双按钮
    rbox2("wc_tank", (-0.19, 0.17, 0.39), (0.19, 0.33, 0.705), CER, bevel=0.025, segs=4, parent=P)
    rbox2("wc_tank_lid", (-0.195, 0.165, 0.703), (0.195, 0.335, 0.725), CER, bevel=0.008, segs=3, parent=P)
    for i, dx in enumerate((0.075, 0.115)):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.016, radius2=0.016, depth=0.006)
        o = mesh_from_bm(f"wc_btn{i}", bm, P); o.location = (dx, 0.25, 0.727); finish(o, STEEL)
    return merge_by_material(P)

# ---------- 洗手台：悬挂柜 0.7 × 0.46、台面顶 0.86、台上盆、镜柜（背面贴墙 y = +0.23）----------
def basin():
    P = empty("basin")
    W, back, front = 0.7, 0.23, -0.22
    rbox2("bs_body", (-W / 2, front, 0.42), (W / 2, back, 0.83), WOOD, bevel=0.003, segs=2, parent=P)
    rbox2("bs_shadow", (-W / 2 + 0.002, front - 0.0012, 0.421), (W / 2 - 0.002, front - 0.0006, 0.829), DARK, bevel=0.0, parent=P)
    g = 0.0015
    for i, (z0, z1) in enumerate(((0.42, 0.61), (0.61, 0.83))):
        rbox2(f"bs_dr{i}", (-W / 2 + g, front - 0.02, z0 + g), (W / 2 - g, front - 0.0012, z1 - g), WOOD, bevel=0.0015, segs=2, parent=P)
        bar_handle(f"bs_pull{i}", 0.2, (0, front - 0.02, z1 - 0.045), METAL, axis="x", stand=0.02, r=0.005, parent=P)
    rbox2("bs_top", (-W / 2 - 0.01, front - 0.03, 0.83), (W / 2 + 0.01, back, 0.86), STONE, bevel=0.003, segs=2, parent=P)
    # 台上盆：外壁 → 盆沿 → 内壁 → 盆底（一次放样，细分一级）
    cx, cy = -0.04, -0.02
    rings = [sellipse(cx, cy, 0.86, 0.215, 0.145, n=3.0), sellipse(cx, cy, 0.95, 0.245, 0.168, n=3.2), sellipse(cx, cy, 0.985, 0.25, 0.172, n=3.2),
             sellipse(cx, cy, 0.99, 0.243, 0.165, n=3.2), sellipse(cx, cy, 0.985, 0.236, 0.158, n=3.2), sellipse(cx, cy, 0.92, 0.215, 0.14, n=3.0),
             sellipse(cx, cy, 0.885, 0.18, 0.11, n=2.8)]
    loft("bs_bowl", rings, CER, cap0=True, cap1=True, parent=P, mods=[("SUBSURF", dict(levels=1, render_levels=1))])
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.022, radius2=0.022, depth=0.004)
    o = mesh_from_bm("bs_drain", bm, P); o.location = (cx, cy, 0.885); finish(o, METAL)
    # 高龙头（盆后面）
    fx, fy = cx, 0.185
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.022, radius2=0.02, depth=0.04)
    o = mesh_from_bm("bs_tap_base", bm, P); o.location = (fx, fy, 0.88); finish(o, METAL)
    pipe("bs_tap", [(fx, fy, 0.89), (fx, fy, 1.1), (fx, fy - 0.025, 1.15), (fx, fy - 0.1, 1.155), (fx, fy - 0.135, 1.12)], 0.011, METAL, parent=P, res=4)
    pipe("bs_tap_lever", [(fx, fy + 0.0, 1.07), (fx, fy + 0.03, 1.1), (fx, fy + 0.04, 1.13)], 0.0045, METAL, parent=P)
    # 镜柜：胡桃木柜体 + 镜面门（细黑边）+ 柜底灯带
    mw, z0, z1, d = 0.64, 1.22, 1.9, 0.13
    rbox2("bs_mc_body", (-mw / 2, back - d, z0), (mw / 2, back, z1), WOOD, bevel=0.003, segs=2, parent=P)
    rbox2("bs_mc_edge", (-mw / 2 + 0.003, back - d - 0.012, z0 + 0.003), (mw / 2 - 0.003, back - d - 0.001, z1 - 0.003), METAL, bevel=0.002, segs=1, parent=P)
    rbox2("bs_mirror", (-mw / 2 + 0.01, back - d - 0.0135, z0 + 0.01), (mw / 2 - 0.01, back - d - 0.0115, z1 - 0.01), MIRROR, bevel=0.0, parent=P)
    rbox2("bs_led", (-mw / 2 + 0.04, back - d + 0.01, z0 - 0.008), (mw / 2 - 0.04, back - d + 0.03, z0), LED, bevel=0.0, parent=P)
    return merge_by_material(P)

def build_all():
    for bw, n in ((1.5, "bed15"), (1.8, "bed18")):
        bed(bw, n)
        bedding(bw, "bedding" + n[3:])
    for f in (wardrobe, desk, kitchen, fridge, shower, toilet, basin):
        f()
