# 烘焙第 2 步：Blender（Cycles）把导出的房子烘成光照贴图。Blender 5.2，无头运行：
#   blender -b --factory-startup -P tools/blender/bake.py -- --set opus55-m3 [--res 4096] [--samples 512] [--ref]
# 第 4 轮（人眼漫游，每个房间都要近看）：整套房子一张 4096 的图，按物体种类给像素密度（家具、窗帘高，天花板、楼板低），
#   看不见的面（天花板顶面、楼板上下面、墙顶）展 UV 之前删掉；窗户、阳台开口挂天光入口（portal）；灯罩、灯带换成自发光（少噪点）；
#   每个房间渲一张探针（probe-<i>.exr），离探针近的灯具藏起来
# 读  out/bake/<set>/scene.glb + meta.json   （node tools/bake-export.mjs 导出的）；public/plans/<plan>.json（门窗，挂天光入口用）
# 写  public/bake/<set>/lightmap.exr  光照贴图（半浮点、线性；漫反射的直射 + 反弹光，不含颜色：最终颜色 = 反照率 × 贴图）
#                       lm.glb        静态物体的几何体（世界坐标，TEXCOORD_1 = 光照贴图 UV），三维页面按名字换上
#                       probe-<i>.exr 每个房间中心 1.4 米高的全景（等距柱状投影），当反射 / 环境探针（页面按相机所在房间换）
#                       sky.exr       窗外的天（调过色、按世界方向转好），烘焙和页面背景用同一张
#                       bake-log.json 用时、分辨率、采样数、各类物体的像素密度
#                       reference.png（--ref）同一个场景在导出机位直接路径追踪的参考图（对照烘焙结果用）
# 步骤：导入 → 灯（暖色点光源放在灯泡位置，灯罩换成自发光 + 透光；厨卫吸顶灯换成面光源）→ 天空 → 天光入口 →
#       删看不见的面 → 静态物体展第二套 UV（smart project + 按种类的密度 + 装箱）→
#       烘一张"背面比例"图（每个像素看出去有多少是物体的背面：> 25% 说明它在墙里、地板下，是无效像素）→ 法线图 →
#       烘漫反射（直射 + 间接）→ 用有效像素往无效像素和空隙里扩（不留黑边）→ OIDN 降噪（带法线引导）→ 存 EXR → 导出 lm.glb → 渲探针
# 可调：--warm 1.0,0.8,0.6（灯色）--power floor=42,table=16,…（灯的功率）--shade 3（灯罩自发光）--led 450（灯带）--sky 0.55（天空亮度）
import bpy, bmesh, sys, os, json, math, time
import numpy as np
from mathutils import Vector

t_start = time.time()
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    k = "--" + name
    return argv[argv.index(k) + 1] if k in argv else default
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SET = arg("set", "opus55-m3")
IN = os.path.join(ROOT, "out", "bake", SET)
OUT = os.path.join(ROOT, "public", "bake", SET)
TMP = os.path.join(IN, "tmp")
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
RES = int(arg("res", 4096))
SAMPLES = int(arg("samples", 512))
MARGIN = float(arg("margin", 0.0025))  # UV 岛之间的空隙（占贴图边长的比例）
# 光照贴图的线性像素密度（相对值）：按物体种类（名字前缀，见 bake.js / 各组件的 userData.bake）；软装再按种类细分
DENS = {"floor": 1.0, "wall": 0.85, "ceil": 0.5, "slab": 0.2, "rail": 0.8, "furn": 1.2, "decor": 1.15, "vest": 0.5}
DECOR_DENS = {"curtain": 1.7, "bedding": 1.35, "rug": 0.9, "runner": 1.0}
SHADE_E = float(arg("shade", 3.0))     # 灯罩自发光强度（W/m²）
LED_E = float(arg("led", 450.0))       # 灯带自发光强度（W/m²；灯带很细，总功率几瓦）
REF = "--ref" in argv
meta = json.load(open(os.path.join(IN, "meta.json"), encoding="utf8"))
LOG = {"set": SET, "res": RES, "samples": SAMPLES}
def mark(k, t0):
    LOG[k] = round(time.time() - t0, 1); print(f"[bake] {k}: {LOG[k]} s", flush=True)

# three.js（y 向上）→ Blender（z 向上）
def B(p): return (p[0], -p[2], p[1])
def save_exr(img, path):  # 半浮点 + ZIP 压缩、只存 RGB（线性，不套视图变换）
    ims = bpy.context.scene.render.image_settings
    ims.file_format = "OPEN_EXR"; ims.color_depth = "16"; ims.exr_codec = "ZIP"; ims.color_mode = "RGB"
    img.save_render(path, scene=bpy.context.scene)

# ---------- OIDN 之后再修一遍：暗处、细长的岛上 OIDN 没有足够的上下文，会留下零星亮点和几个像素大的斑 ----------
# 1. 亮点：比周围 3×3 的中位数亮 1.8 倍以上的像素压回中位数；2. 双边滤波（5×5，空间 σ 1.6 像素，迭代 2 遍，按对数亮度差加权 σ 0.5：
#    差一倍以上的边——接触阴影、灯光边缘——基本不动）；只在有效像素之间做（岛之间的空隙 10 像素，滤波不会串岛）。--ss --sr --iters 可调
SM_S, SM_R, SM_IT = float(arg("ss", 1.6)), float(arg("sr", 0.5)), int(arg("iters", 2))
def smooth_lightmap(rgb, valid, sigma_s=SM_S, sigma_r=SM_R, fire=1.8, iters=SM_IT):
    L = np.log(np.maximum(0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2], 1e-5)).astype(np.float32)
    sh = lambda a, dy, dx: np.roll(np.roll(a, dy, 0), dx, 1)
    stack = np.stack([np.where(sh(valid, dy, dx), sh(L, dy, dx), L) for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    med = np.median(stack, axis=0); del stack
    hot = valid & (L - med > math.log(fire))
    rgb = rgb.copy(); rgb[hot] *= np.exp(med - L)[hot][:, None]; L = np.where(hot, med, L)
    out = rgb
    for _ in range(iters):   # 迭代几遍：等效半径更大，又不会跨过岛之间 10 像素的空隙
        acc = np.zeros_like(out); wsum = np.zeros(L.shape, np.float32)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                w = math.exp(-(dx * dx + dy * dy) / (2 * sigma_s ** 2)) * np.exp(-((sh(L, dy, dx) - L) ** 2) / (2 * sigma_r ** 2)) * sh(valid, dy, dx)
                acc += sh(out, dy, dx) * w[..., None]; wsum += w
        out = np.where(valid[..., None], acc / np.maximum(wsum, 1e-6)[..., None], out)
        L = np.log(np.maximum(0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2], 1e-5)).astype(np.float32)
    return out, int(hot.sum())
if "--refilter" in argv:   # 只重做这一步：读上次 OIDN 的结果（tmp/lightmap_oidn.exr，没有就用 lightmap.exr）和有效像素图，滤波、扩边、存
    import time as _t
    t0 = _t.time()
    src = os.path.join(TMP, "lightmap_oidn.exr")
    if not os.path.exists(src):
        import shutil; shutil.copy(os.path.join(OUT, "lightmap.exr"), src)
    im = bpy.data.images.load(src); W0, H0 = im.size
    a = np.empty(W0 * H0 * 4, np.float32); im.pixels.foreach_get(a); rgb0 = a.reshape(H0, W0, 4)[..., :3].copy(); del a
    vm = bpy.data.images.load(os.path.join(TMP, "validity.png"))
    v = np.empty(W0 * H0 * 4, np.float32); vm.pixels.foreach_get(v); valid0 = v.reshape(H0, W0, 4)[..., 1] > 0.5; del v
    RES = W0
    out0, nhot = smooth_lightmap(rgb0, valid0)
    meta_out = json.load(open(os.path.join(OUT, "bake-log.json"), encoding="utf8"))
    sc0 = bpy.context.scene
    fin = bpy.data.images.new("lightmap", W0, H0, float_buffer=True, alpha=False)
    p_ = np.ones((H0, W0, 4), np.float32); p_[..., :3] = out0; fin.pixels.foreach_set(p_.ravel())
    ims = sc0.render.image_settings; ims.file_format = "OPEN_EXR"; ims.color_depth = "16"; ims.exr_codec = "ZIP"; ims.color_mode = "RGB"
    fin.save_render(os.path.join(OUT, "lightmap.exr"), scene=sc0)
    meta_out["refilter"] = {"fireflies": nhot, "s": round(_t.time() - t0, 1)}
    json.dump(meta_out, open(os.path.join(OUT, "bake-log.json"), "w"), indent=1, ensure_ascii=False)
    print("[bake] refilter done", meta_out["refilter"], flush=True); sys.exit(0)

# ---------- 场景 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
dev = arg("device", "GPU")
for kind in ((arg("api"),) if arg("api") else ("CUDA", "OPTIX")):  # OptiX 在 GTX 1050 Ti（无 RT 核）上烘焙出来是空的，默认用 CUDA
    try:
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices): break
    except Exception: pass
for d in prefs.devices: d.use = d.type == prefs.compute_device_type
sc.cycles.device = dev
LOG["device"] = f"{dev} {prefs.compute_device_type}"
print("[bake] device", LOG["device"], [d.name for d in prefs.devices if d.use], flush=True)
sc.cycles.use_denoising = False

t0 = time.time()
bpy.ops.import_scene.gltf(filepath=os.path.join(IN, "scene.glb"), merge_vertices=False, import_shading="NORMALS")
for o in list(sc.objects):
    if o.type != "MESH": bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = sc.objects[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mark("import", t0)

M = {e["name"]: e for e in meta["meshes"]}
objs = [o for o in sc.objects if o.type == "MESH" and o.name in M]
def mats_of(o): return [s.material for s in o.material_slots if s.material]
# 灯泡删掉（换成点光源 / 面光源）；灯罩：漫反射 + 一点透光 + 自发光（灯罩本身当面光源采样，墙上被灯罩照亮的那圈不再一片噪点）；灯带：自发光
for o in list(objs):
    if any(m.name.startswith("BULB") for m in mats_of(o)):
        objs.remove(o); bpy.data.objects.remove(o, do_unlink=True)
def emissive(m, color, strength, base=(0.86, 0.8, 0.7), translucent=0.0):
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse"); dif.inputs["Color"].default_value = (*base, 1)
    sh = dif
    if translucent:
        tr = nt.nodes.new("ShaderNodeBsdfTranslucent"); tr.inputs["Color"].default_value = (1.0, 0.9, 0.76, 1)
        mix = nt.nodes.new("ShaderNodeMixShader"); mix.inputs[0].default_value = translucent
        nt.links.new(dif.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2]); sh = mix
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (*color, 1); em.inputs["Strength"].default_value = strength
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(sh.outputs[0], add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1]); nt.links.new(add.outputs[0], out.inputs["Surface"])
for m in bpy.data.materials:
    if m.name.startswith("SHADE"): emissive(m, (1.0, 0.84, 0.64), SHADE_E, translucent=0.35)
    elif m.name.startswith("LED"): emissive(m, (1.0, 0.86, 0.7), LED_E, base=(0.9, 0.88, 0.85))
statics = [o for o in objs if M[o.name]["cls"] == "static"]
# 静态物体烘焙时一律当非金属、不透光（不含颜色的漫反射烘焙要除以漫反射反照率，金属的是 0）
for m in {m for o in statics for m in mats_of(o)}:
    if not m.node_tree: continue
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            for k_, v_ in (("Metallic", 0.0), ("Transmission Weight", 0.0)):
                if k_ in n.inputs and not n.inputs[k_].is_linked: n.inputs[k_].default_value = v_
            if "Metallic" in n.inputs and n.inputs["Metallic"].is_linked: m.node_tree.links.remove(n.inputs["Metallic"].links[0]); n.inputs["Metallic"].default_value = 0.0
print(f"[bake] {len(objs)} objects, {len(statics)} static", flush=True)
LOG["objects"] = len(objs); LOG["static"] = len(statics)

# 看不见的面删掉，不占光照贴图（页面整个换成 lm.glb 里的几何体，顶点数变了没关系）：
# 天花板顶面、楼板上下面（上面被地板盖住）、墙顶（被天花板盖住）、墙和栏板的底面、栏板顶（被扶手盖住）
t0 = time.time()
CUT = meta["cut"]
pruned = 0
for o in statics:
    kind = M[o.name]["id"].split(":")[0]
    if kind not in ("ceil", "slab", "wall", "rail"): continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    kill = []
    for f in bm.faces:
        n, c = f.normal, f.calc_center_median()
        if ((kind == "ceil" and n.z > 0.5) or (kind == "slab" and abs(n.z) > 0.5) or (kind in ("wall", "rail") and n.z < -0.5 and c.z < 0.02)
                or (kind == "wall" and n.z > 0.5 and c.z > CUT - 0.02) or (kind == "rail" and n.z > 0.5 and c.z < 0.97)):
            kill.append(f)
    pruned += len(kill)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(o.data); bm.free()
LOG["pruned_faces"] = pruned
mark("prune", t0)

# ---------- 灯 ----------
# 第 4 轮：灯色往中性收一点（之前 2400K 左右，屋里一片橘色、白墙发黄发灰）——相当于相机白平衡定在 3000K，屋里暖白、窗外深蓝
WARM = tuple(float(x) for x in arg("warm", "1.0,0.8,0.6").split(","))
POWER = {"floor": 42, "pendant": 40, "table": 16, "desk": 11, "lantern": 3.5, "ceil": 34}
for kv in (arg("power", "") or "").split(","):
    if "=" in kv: k_, v_ = kv.split("="); POWER[k_] = float(v_)
lights = []
for L in meta["lamps"]:
    st = L["style"]
    if st == "ceil":   # 吸顶灯：灯罩（页面上是灯泡材质，已删掉）原地换成朝下的圆形面光源
        ld = bpy.data.lights.new("ceil", "AREA"); ld.shape = "DISK"; ld.size = 0.29; ld.energy = POWER["ceil"]
        ob = bpy.data.objects.new("ceil", ld); ob.location = (L["pos"][0], -L["pos"][2], min(L["pos"][1], meta["cut"]) - 0.008)
    else:
        ld = bpy.data.lights.new(st, "POINT"); ld.energy = POWER.get(st, 15); ld.shadow_soft_size = 0.035
        ob = bpy.data.objects.new(st, ld); ob.location = B(L["pos"])
    ld.color = WARM
    sc.collection.objects.link(ob); lights.append(ob)

# ---------- 天空：Poly Haven 的蓝调纯天空，压掉月亮的高光、压暗地平线那圈亮带、往深蓝调，按世界方向转好，存 sky.exr ----------
t0 = time.time()
S = meta["sky"]
src = bpy.data.images.load(os.path.join(ROOT, "public", "assets", "polyhaven", "hdri", S["id"], f'{S["id"]}_{S["res"]}.hdr'))
W_, H_ = src.size
px = np.empty(W_ * H_ * 4, np.float32); src.pixels.foreach_get(px); px = px.reshape(H_, W_, 4)  # 第 0 行在最下面
# 方向约定（和 three.js 的等距柱状投影一致）：u = atan2(z, x) / 2π + 0.5（three 坐标），v = 0.5 + 仰角 / π
# 页面上 SKY.rot 度 = 把天空绕竖轴转多少；这里直接把列平移好，两边都不用再转
shift = int(round(-S["rot"] / 360 * W_))
px = np.roll(px, shift, axis=1)
el = (np.arange(H_) + 0.5) / H_ * math.pi - math.pi / 2           # 每一行的仰角（弧度），第 0 行 = -90°
rgb = np.minimum(px[..., :3], 24.0)                                 # 月亮：只留一个亮点，不再当光源
k = 0.30 + 0.70 * np.clip(np.abs(el) / 0.55, 0, 1) ** 1.2           # 地平线附近压到 30%
rgb = rgb * k[:, None, None] * np.array([0.62, 0.80, 1.18], np.float32) * float(S.get("strength", 1.0)) * float(arg("sky", 0.55))
px[..., :3] = rgb
sky = bpy.data.images.new("sky", W_, H_, float_buffer=True, alpha=False)
sky.pixels.foreach_set(px.ravel())
save_exr(sky, os.path.join(OUT, "sky.exr"))
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
wn = world.node_tree; bg = wn.nodes["Background"]
envt = wn.nodes.new("ShaderNodeTexEnvironment"); envt.image = sky
wn.links.new(envt.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 1.0
mark("sky", t0)

# ---------- 天光入口（portal）：外墙上的窗、阳台的三面开口。Cycles 采样天空时优先往这些口子里打，屋里被天光照亮的部分噪点少很多 ----------
PLAN = json.load(open(os.path.join(ROOT, "public", "plans", f'{meta.get("plan") or "opus55"}.json'), encoding="utf8"))
def room_at(x, z): return next((r for r in PLAN["rooms"] if r["rect"][0] < x < r["rect"][2] and r["rect"][1] < z < r["rect"][3]), None)
def portal(name, cx, cz, y0, y1, w, nx, nz):
    """(cx, cz) 开口中心（three 坐标），开口宽 w、从 y0 到 y1；(nx, nz) 指向屋里"""
    ld = bpy.data.lights.new(name, "AREA"); ld.shape = "RECTANGLE"; ld.size = w; ld.size_y = y1 - y0
    try: ld.cycles.is_portal = True
    except Exception: ld.is_portal = True
    ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
    ob.location = (cx, -cz, (y0 + y1) / 2)
    ob.rotation_euler = Vector((nx, -nz, 0)).to_track_quat("-Z", "Y").to_euler()   # 面光源朝自己的 -Z 发光：-Z 指向屋里，Y 朝上
    return ob
portals = []
WALLS = {w["id"]: w for w in PLAN["walls"]}
for o in PLAN["openings"]:
    if o["type"] not in ("window", "slide"): continue
    w = WALLS[o["wall"]]; dx, dz = w["b"][0] - w["a"][0], w["b"][1] - w["a"][1]; L_ = math.hypot(dx, dz); ux, uz = dx / L_, dz / L_; nx, nz = -uz, ux
    cx, cz = w["a"][0] + ux * o["at"], w["a"][1] + uz * o["at"]
    a_, b_ = room_at(cx + nx * 0.4, cz + nz * 0.4), room_at(cx - nx * 0.4, cz - nz * 0.4)
    ina, inb = a_ is not None and not a_.get("outdoor"), b_ is not None and not b_.get("outdoor")
    if ina == inb: continue                       # 两边都是屋里（或都不是）：不是外窗
    s_ = 1 if ina else -1
    portals.append(portal(f"portal_{o['name']}", cx - nx * s_ * (w["t"] / 2 + 0.02), cz - nz * s_ * (w["t"] / 2 + 0.02), o["sill"], o["head"], o["w"], nx * s_, nz * s_))
for r in PLAN["rooms"]:                           # 阳台：栏板扶手以上到天花板，三面开口
    if not r.get("outdoor"): continue
    x0, z0, x1, z1 = r["rect"]
    for (ax, az, bx, bz) in ((x0, z1, x1, z1), (x0, z0, x0, z1), (x1, z0, x1, z1)):
        if not any(min(abs(ra["a"][0] - ax) + abs(ra["a"][1] - az) + abs(ra["b"][0] - bx) + abs(ra["b"][1] - bz),
                       abs(ra["a"][0] - bx) + abs(ra["a"][1] - bz) + abs(ra["b"][0] - ax) + abs(ra["b"][1] - az)) < 0.05 for ra in PLAN.get("rails", [])): continue
        cx, cz = (ax + bx) / 2, (az + bz) / 2
        nx, nz = ((x0 + x1) / 2 - cx), ((z0 + z1) / 2 - cz); L_ = math.hypot(nx, nz); nx, nz = nx / L_, nz / L_
        portals.append(portal("portal_balcony", cx - nx * 0.1, cz - nz * 0.1, 1.0, meta["cut"], math.hypot(bx - ax, bz - az), nx, nz))
LOG["portals"] = len(portals)
print(f"[bake] {len(portals)} portals", flush=True)

# ---------- 光照贴图 UV ----------
t0 = time.time()
bpy.ops.object.select_all(action="DESELECT")
for o in statics:
    me = o.data
    if "LM" not in me.uv_layers:
        if len(me.uv_layers) == 0: me.uv_layers.new(name="UVMap")
        me.uv_layers.new(name="LM")
    me.uv_layers[0].active_render = True          # 着色（反照率贴图）照旧用第一套
    me.uv_layers.active = me.uv_layers["LM"]      # 展开、烘焙用第二套
    o.select_set(True)
bpy.context.view_layer.objects.active = statics[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
# glTF 的顶点在法线 / UV 接缝处是拆开的（圆角盒甚至每个三角形各自独立）：先按位置焊起来，岛才连得成片；再去掉零面积的三角形（展 UV 时会算出天文数字）
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.dissolve_degenerate(threshold=0.00001)
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(float(arg("angle", 60))), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale()
bpy.ops.object.mode_set(mode="OBJECT")
# 还有算坏的（非有限、离谱大的坐标）就单独给那个物体重新展一次
for o in statics:
    d = o.data.uv_layers["LM"].data; a = np.empty(len(d) * 2, np.float32); d.foreach_get("uv", a)
    if not np.isfinite(a).all() or np.abs(a).max() > 50:
        print("[bake] bad uv, re-unwrap", o.name, M[o.name]["id"], flush=True)
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.lightmap_pack(PREF_MARGIN_DIV=0.3); bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
for o in statics: o.select_set(True)
bpy.context.view_layer.objects.active = statics[0]
mark("uv_unwrap", t0)
t0 = time.time()
UVS = {}
def dens(e):
    kind = e["id"].split(":")[0]
    return DECOR_DENS.get(e.get("dk"), DENS.get(kind, 1.0)) if kind == "decor" else DENS.get(kind, 1.0)
for o in statics:   # 按物体种类的像素密度（见 DENS）
    uv = o.data.uv_layers["LM"].data
    a = np.empty(len(uv) * 2, np.float32); uv.foreach_get("uv", a)
    UVS[o.name] = a * dens(M[o.name])
# 先整体挪进 0–1（装箱会装进离岛最近的那个 UDIM 格子，不挪的话可能跑到 v = 6 那一格去）
lo_ = min(a.min() for a in UVS.values()); hi_ = max(a.max() for a in UVS.values())
for o in statics: o.data.uv_layers["LM"].data.foreach_set("uv", (UVS[o.name] - lo_) / (hi_ - lo_) * 0.98 + 0.01)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, margin_method="FRACTION", margin=MARGIN, shape_method=arg("shape", "AABB"), scale=True)
bpy.ops.object.mode_set(mode="OBJECT")
_a = np.concatenate([(lambda d: (lambda b: (d.foreach_get("uv", b), b)[1])(np.empty(len(d) * 2, np.float32)))(o.data.uv_layers["LM"].data) for o in statics])
LOG["uv_range"] = [round(float(_a.min()), 4), round(float(_a.max()), 4)]
print("[bake] LM uv range", LOG["uv_range"], flush=True)
# 像素密度：每类物体的 3D 面积 vs 占了多少光照贴图像素 → 每米多少像素
def texel_density():
    out = {}
    for o in statics:
        me = o.data; uvl = me.uv_layers["LM"].data; a3 = a2 = 0.0
        for p in me.polygons:
            a3 += p.area
            vs = [uvl[li].uv for li in p.loop_indices]
            a2 += abs(sum(vs[i].x * vs[(i + 1) % len(vs)].y - vs[(i + 1) % len(vs)].x * vs[i].y for i in range(len(vs)))) / 2
        k_ = M[o.name].get("dk") or M[o.name]["id"].split(":")[0]
        t = out.setdefault(k_, [0.0, 0.0]); t[0] += a3; t[1] += a2
    return {k_: {"m2": round(v[0], 1), "px_per_m": round(math.sqrt(v[1] * RES * RES / max(v[0], 1e-6)), 1)} for k_, v in out.items()}
LOG["texel_density"] = texel_density()
print("[bake] texel density", json.dumps(LOG["texel_density"], ensure_ascii=False), flush=True)
mark("uv_pack", t0)

# ---------- 合并成一个物体再烘（Cycles 的烘焙是一个物体一个物体来的，每个都要重新同步场景、建 BVH，两百多个物体光开销就要几分钟）----------
t0 = time.time()
bpy.ops.object.select_all(action="DESELECT")
for o in statics: o.select_set(True)
bpy.context.view_layer.objects.active = statics[0]
bpy.ops.object.duplicate(linked=False)
dups = list(bpy.context.selected_objects)
bpy.context.view_layer.objects.active = dups[0]
bpy.ops.object.join()
JOIN = bpy.context.view_layer.objects.active
JOIN.name = "BAKE_JOIN"
JOIN.data.uv_layers.active = JOIN.data.uv_layers["LM"]; JOIN.data.uv_layers[0].active_render = True
for o in statics: o.hide_render = True   # 烘焙时只用合并后的那一份（原件留着导出）
mark("join", t0)

# ---------- 烘焙目标 ----------
def new_img(name):
    im = bpy.data.images.new(name, RES, RES, float_buffer=True, alpha=True)
    im.colorspace_settings.name = "Non-Color"
    im.pixels.foreach_set(np.zeros(RES * RES * 4, np.float32))
    return im
img_lm, img_mask, img_nrm = new_img("LM"), new_img("MASK"), new_img("NRM")
def target(mat, im):
    nt = mat.node_tree
    n = nt.nodes.get("BAKE_TARGET") or nt.nodes.new("ShaderNodeTexImage")
    n.name = "BAKE_TARGET"; n.image = im; nt.nodes.active = n; n.select = True
RENDER = [o for o in objs if o not in statics] + [JOIN]   # 参与渲染的：动态物体 + 合并后的静态
orig = {o.name: [s.material for s in o.material_slots] for o in RENDER}
for m in mats_of(JOIN): target(m, img_lm)
# 背面比例：所有物体换成"背面发光 1、正面不发光"的材质，只烘直射（打到谁算谁）
mask = bpy.data.materials.new("MASK"); mask.use_nodes = True
nt = mask.node_tree; nt.nodes.clear()
mo = nt.nodes.new("ShaderNodeOutputMaterial"); geo = nt.nodes.new("ShaderNodeNewGeometry")
em = nt.nodes.new("ShaderNodeEmission"); add = nt.nodes.new("ShaderNodeAddShader"); dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
dif.inputs["Color"].default_value = (1, 1, 1, 1)  # 白：漫反射烘焙不含颜色时要除以反照率，黑的会变 0
nt.links.new(geo.outputs["Backfacing"], em.inputs["Strength"]); nt.links.new(em.outputs[0], add.inputs[0]); nt.links.new(dif.outputs[0], add.inputs[1])
nt.links.new(add.outputs[0], mo.inputs["Surface"])
mask.cycles.emission_sampling = "NONE"
def set_all(mat):
    for o in RENDER:
        for s in o.material_slots: s.material = mat
def restore():
    for o in RENDER:
        for s, m in zip(o.material_slots, orig[o.name]): s.material = m
def select_statics():
    bpy.ops.object.select_all(action="DESELECT")
    JOIN.select_set(True)
    bpy.context.view_layer.objects.active = JOIN
bk = sc.render.bake
bk.margin = 0; bk.use_clear = True; bk.target = "IMAGE_TEXTURES"
def pixels(im):
    a = np.empty(RES * RES * 4, np.float32); im.pixels.foreach_get(a); return a.reshape(RES, RES, 4)

t0 = time.time()
set_all(mask); target(mask, img_mask)
for L in lights + portals: L.hide_render = True
bg.inputs["Strength"].default_value = 0.0
sc.cycles.samples = 48; sc.cycles.max_bounces = 1; sc.cycles.diffuse_bounces = 1
bk.use_pass_direct = True; bk.use_pass_indirect = False; bk.use_pass_color = False
select_statics()
bpy.ops.object.bake(type="DIFFUSE")
MASKP = pixels(img_mask)
print("[bake] mask stats: alpha>0.5 %.4f, r max %.3f, r mean(cov) %.4f" % ((MASKP[..., 3] > 0.5).mean(), MASKP[..., 0].max(), MASKP[..., 0][MASKP[..., 3] > 0.5].mean() if (MASKP[..., 3] > 0.5).any() else -1), flush=True)
mark("bake_mask", t0)
t0 = time.time()
target(mask, img_nrm)
bk.normal_space = "OBJECT"
sc.cycles.samples = 4
bpy.ops.object.bake(type="NORMAL")
NRM = pixels(img_nrm)
mark("bake_normal", t0)

t0 = time.time()
restore()
for L in lights + portals: L.hide_render = False
bg.inputs["Strength"].default_value = 1.0
sc.cycles.samples = SAMPLES
sc.cycles.max_bounces = 8; sc.cycles.diffuse_bounces = 5; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 4; sc.cycles.transparent_max_bounces = 8
sc.cycles.sample_clamp_indirect = 8.0; sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
select_statics()
bpy.ops.object.bake(type="DIFFUSE")
LM = pixels(img_lm)
print("[bake] lightmap stats: alpha>0.5 %.4f, rgb max %.3f mean %s" % ((LM[..., 3] > 0.5).mean(), LM[..., :3].max(), LM[..., :3].reshape(-1, 3).mean(0)), flush=True)
mark("bake_lightmap", t0)

# ---------- 修无效像素、扩边、降噪 ----------
t0 = time.time()
cov = MASKP[..., 3] > 0.5
bf = MASKP[..., 0]
valid = cov & (bf < 0.25)
del MASKP
LOG["coverage"] = round(float(cov.mean()), 4); LOG["invalid_in_charts"] = round(float((cov & ~valid).sum() / max(1, cov.sum())), 4)
def dilate(a, ok, iters):
    a = a.copy(); ok = ok.copy()
    for _ in range(iters):
        if ok.all(): break
        acc = np.zeros_like(a); cnt = np.zeros(ok.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            okr = np.roll(np.roll(ok, dy, 0), dx, 1)
            acc += np.roll(np.roll(a, dy, 0), dx, 1) * okr[..., None]; cnt += okr
        new = (~ok) & (cnt > 0)
        a[new] = acc[new] / cnt[new][:, None]
        ok = ok | new
    return a
rgb = dilate(LM[..., :3], valid, 24)
del LM
nrm = dilate(NRM[..., :3] * 2 - 1, cov, 24)
del NRM
mark("dilate", t0)
t0 = time.time()
def to_img(name, a3):
    im = bpy.data.images.new(name, RES, RES, float_buffer=True, alpha=True)
    im.colorspace_settings.name = "Non-Color"
    p = np.ones((RES, RES, 4), np.float32); p[..., :3] = a3; im.pixels.foreach_set(p.ravel()); return im
im_n, im_c = to_img("dn_nrm", nrm), to_img("dn_col", rgb)
del nrm
ng = bpy.data.node_groups.new("dn", "CompositorNodeTree")
sc.compositing_node_group = ng
ni = ng.nodes.new("CompositorNodeImage"); ni.image = im_c
nn = ng.nodes.new("CompositorNodeImage"); nn.image = im_n
dn = ng.nodes.new("CompositorNodeDenoise")
for k_, v_ in (("use_hdr", True), ("prefilter", "ACCURATE"), ("quality", "HIGH")):
    try: setattr(dn, k_, v_)
    except Exception: pass
for k_, v_ in (("HDR", True),):
    if k_ in dn.inputs: dn.inputs[k_].default_value = v_
go = ng.nodes.new("NodeGroupOutput"); ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
ng.links.new(ni.outputs["Image"], dn.inputs["Image"]); ng.links.new(nn.outputs["Image"], dn.inputs["Normal"]); ng.links.new(dn.outputs["Image"], go.inputs[0])
sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = "Standard"
cam_d = bpy.data.cameras.new("dncam"); cam_o = bpy.data.objects.new("dncam", cam_d); sc.collection.objects.link(cam_o); sc.camera = cam_o
cam_o.location = (0, 0, 500)
for o in sc.objects: o.hide_render = o.type != "CAMERA"
sc.world = None
sc.cycles.samples = 1
bpy.ops.render.render()
tmp = os.path.join(TMP, "_dn.exr")
bpy.data.images["Render Result"].save_render(tmp)
den = bpy.data.images.load(tmp); d = np.empty(RES * RES * 4, np.float32); den.pixels.foreach_get(d)
den_rgb = d.reshape(RES, RES, 4)[..., :3]
sc.compositing_node_group = None
for o in sc.objects: o.hide_render = False
for o in statics: o.hide_render = True
sc.world = world
# 降噪后：留一份 OIDN 的原样（--refilter 用），再修亮点 + 双边滤波，最后从有效像素往外扩一次（降噪会把岛外的空隙抹花）
import shutil; shutil.copy(tmp, os.path.join(TMP, "lightmap_oidn.exr"))
den_rgb, LOG["fireflies"] = smooth_lightmap(np.maximum(den_rgb, 0), valid)
out_rgb = dilate(den_rgb, valid, 24)
del den_rgb, d
LOG["lightmap_mean"] = [round(float(x), 4) for x in out_rgb[valid].mean(0)]
mark("denoise", t0)
fin = bpy.data.images.new("lightmap", RES, RES, float_buffer=True, alpha=False)
p = np.ones((RES, RES, 4), np.float32); p[..., :3] = out_rgb; fin.pixels.foreach_set(p.ravel())
save_exr(fin, os.path.join(OUT, "lightmap.exr"))
del p
# 调试：岛 / 无效像素可视化
dbg = np.zeros((RES, RES, 4), np.float32); dbg[..., 3] = 1
dbg[..., 1] = valid; dbg[..., 0] = cov & ~valid
dimg = bpy.data.images.new("dbg", RES, RES, float_buffer=False, alpha=True); dimg.pixels.foreach_set(dbg.ravel())
dimg.filepath_raw = os.path.join(TMP, "validity.png"); dimg.file_format = "PNG"; dimg.save()
del dbg

# ---------- 导出静态几何体（带第二套 UV） ----------
t0 = time.time()
bpy.data.objects.remove(JOIN, do_unlink=True)
for o in statics: o.hide_render = False
bpy.ops.object.select_all(action="DESELECT")
for o in statics: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "lm.glb"), export_format="GLB", use_selection=True, export_texcoords=True, export_normals=True,
                          export_materials="NONE", export_yup=True, export_apply=False, export_extras=False, export_cameras=False, export_lights=False, export_animations=False)
mark("export_glb", t0)

def finish_log():
    LOG["total"] = round(time.time() - t_start, 1)
    meta["bake"] = {k_: LOG[k_] for k_ in ("res", "samples", "device", "coverage", "invalid_in_charts", "lightmap_mean", "texel_density") if k_ in LOG}
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w", encoding="utf8"), ensure_ascii=False)
    LOG["files"] = {f: os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)}
    json.dump(LOG, open(os.path.join(OUT, "bake-log.json"), "w"), indent=1, ensure_ascii=False)
if "--noprobe" in argv:
    finish_log(); print("[bake] done (no probe)", flush=True); sys.exit(0)

# ---------- 探针：每个房间中心一张全景（离探针 2 米以内的灯具藏起来：吊灯离客厅探针太近，在玻璃里的倒影会大得离谱）----------
def camera(name, loc):
    cd = bpy.data.cameras.new(name); co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co); co.location = loc; return co
t0 = time.time()
sc.cycles.use_denoising = True
sc.cycles.samples = int(arg("probe_samples", 128))
pc = camera("probe", (0, 0, 0))
pc.data.type = "PANO"
try: pc.data.panorama_type = "EQUIRECTANGULAR"
except Exception: pc.data.cycles.panorama_type = "EQUIRECTANGULAR"
pc.rotation_euler = (math.pi / 2, 0, -math.pi / 2)   # 看向 +x、上方 +z：和等距柱状投影的约定一致（图中心 = +x）
sc.camera = pc
sc.render.resolution_x, sc.render.resolution_y = 1024, 512
sc.render.film_transparent = False
lamp_objs = [o for o in sc.objects if o.type == "MESH" and o.name in M and M[o.name].get("dk") == "lamp"]
for P_ in meta.get("probes") or [{"pos": meta["probe"], "file": "probe.exr"}]:
    pp = Vector(P_["pos"])
    for o in lamp_objs: o.hide_render = (Vector(M[o.name].get("c", [0, 0, 0])) - pp).length < 2.3
    pc.location = B(P_["pos"])
    bpy.ops.render.render()
    save_exr(bpy.data.images["Render Result"], os.path.join(OUT, P_["file"]))
    print("[bake] probe", P_.get("room"), flush=True)
for o in lamp_objs: o.hide_render = False
mark("probe", t0)

# ---------- 参考图（直接路径追踪，同一个机位） ----------
if REF:
    t0 = time.time()
    C = meta["camera"]
    rc = camera("ref", B(C["pos"]))
    rc.rotation_euler = (Vector(B(C["target"])) - Vector(B(C["pos"]))).to_track_quat("-Z", "Y").to_euler()
    rc.data.sensor_fit = "VERTICAL"; rc.data.angle_y = math.radians(C["fov"])
    sc.camera = rc
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.cycles.samples = int(arg("ref_samples", 256))
    try: sc.view_settings.view_transform = "Khronos PBR Neutral"
    except Exception: sc.view_settings.view_transform = "AgX"
    sc.view_settings.exposure = math.log2(float(arg("exp", 1.0)))
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "8"
    sc.render.filepath = os.path.join(OUT, "reference.png")
    bpy.ops.render.render(write_still=True)
    mark("reference", t0)

finish_log()
print("[bake] done", json.dumps({k_: v_ for k_, v_ in LOG.items() if k_ != "texel_density"}), flush=True)
