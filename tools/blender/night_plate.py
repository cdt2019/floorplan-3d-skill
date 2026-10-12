# 阳台夜景（&night=n2 / n3）的远景：Poly Haven 的上海外滩夜景 HDRI（CC0，Greg Zaal）→ 两张贴图
#   blender -b --factory-startup -P tools/blender/night_plate.py [-- --set opus55-m5]
# 读  public/assets/polyhaven/hdri/shanghai_bund/shanghai_bund_8k.hdr（node tools/fetch-assets.mjs 下载）
#     public/bake/<set>/sky.exr（烘焙用的蓝调天空，取它的颜色当调色目标）
# 写  public/assets/polyhaven/hdri/shanghai_bund/bund_sky_2k.exr   整张（2048 × 1024），天空部分调成和屋里烘焙的天同一种蓝
#     public/assets/polyhaven/hdri/shanghai_bund/bund_band_8k.exr  地平线附近那一条（仰角 BAND_LO … BAND_HI，8192 宽），天际线要清楚
# 处理：把陆家嘴天际线转到正南（阳台外，three.js 的 +z）；天空（暗的像素）按 sky.exr 同一仰角带的平均颜色调色，
#       灯（亮的像素）只按亮度缩放、颜色不动；最亮的点截到 60（不然泛光糊成一片）
import bpy, sys, os, math, json
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    k = "--" + name
    return argv[argv.index(k) + 1] if k in argv else default
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIR = os.path.join(ROOT, "public", "assets", "polyhaven", "hdri", "shanghai_bund")
SKY = os.path.join(ROOT, "public", "bake", arg("set", "opus55-m5"), "sky.exr")
BAND_LO, BAND_HI = float(arg("lo", -4.0)), float(arg("hi", 30.0))   # 仰角（度）
GAIN = float(arg("gain", 0.8))                                      # 整体亮度再乘一点（页面上还能用 nightk= 调）
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def load(path):
    im = bpy.data.images.load(path)
    W, H = im.size
    a = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(H, W, 4)   # 第 0 行在最下面
def save(a, path):
    H, W = a.shape[:2]
    im = bpy.data.images.new("o", W, H, float_buffer=True, alpha=False)
    p = np.ones((H, W, 4), np.float32); p[..., :3] = a[..., :3]
    im.pixels.foreach_set(p.ravel())
    ims = sc.render.image_settings
    ims.file_format = "OPEN_EXR"; ims.color_depth = "16"; ims.exr_codec = "ZIP"; ims.color_mode = "RGB"
    im.save_render(path, scene=sc)
    bpy.data.images.remove(im)
    print("[plate] 写出", path, W, H, f"{os.path.getsize(path) / 1e6:.1f} MB", flush=True)
lum = lambda c: 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]

px = load(os.path.join(DIR, "shanghai_bund_8k.hdr"))
H, W = px.shape[:2]
el = ((np.arange(H) + 0.5) / H - 0.5) * 180.0          # 每一行的仰角（度）
rows = lambda lo, hi: (el >= lo) & (el < hi)
# 天际线在哪一列：仰角 2°–12° 里亮像素最多的那一段（只在图的 30%–85% 里找，两边是外滩这一侧近处的老楼）
band = lum(px[rows(2, 12)])
score = np.convolve((band > 2.0).sum(0).astype(np.float32), np.ones(W // 16) / (W // 16), mode="same")
c0, c1 = int(W * 0.3), int(W * 0.85)
u_sky = (c0 + int(np.argmax(score[c0:c1]))) / W
# 转到正南：three.js 的等距柱状投影 u = atan2(z, x) / 2π + 0.5，正南 (0, 0, 1) 在 u = 0.75
shift = int(round((0.75 - u_sky + float(arg("du", 0.0))) * W))
px = np.roll(px, shift, axis=1)
print(f"[plate] 天际线中心在 u = {u_sky:.3f}，平移 {shift} 列", flush=True)

# 调色目标：烘焙用的天（sky.exr，已经转好方向）在仰角 6°–25° 的平均颜色
sky = load(SKY)
el_s = ((np.arange(sky.shape[0]) + 0.5) / sky.shape[0] - 0.5) * 180.0
tgt = sky[(el_s >= 6) & (el_s < 25)][..., :3].reshape(-1, 3).mean(0)
src_band = px[rows(6, 25)][..., :3].reshape(-1, 3)
L = lum(src_band); med = np.median(L)
src = src_band[L < med * 2.5].mean(0)                 # 只算天空（去掉楼和灯）
g = tgt / np.maximum(src, 1e-6) * GAIN                # 天空：逐通道（换颜色）
gl = float(lum(tgt) / max(lum(src), 1e-6)) * GAIN     # 灯：只按亮度
print("[plate] 目标天色", tgt, "原天色", src, "通道增益", g, "亮度增益", gl, flush=True)
rgb = px[..., :3]
Lp = lum(rgb)[..., None]
w = np.clip((Lp / (med * 1.0 + 1e-6) - 2.0) / 6.0, 0, 1)   # 0 = 天空，1 = 灯
rgb = rgb * (g[None, None, :] * (1 - w) + gl * w)
# 地平线附近的天被城市灯光照得很亮（拍摄地就在江边）：只压天空像素（灯不动），0° 压到 45%，20° 以上不压；整体再乘 GAIN
f = 0.45 + 0.55 * np.clip(el / 20.0, 0, 1) ** 0.8
rgb = rgb * (f[:, None, None] * (1 - w) + w)
rgb = np.minimum(rgb, 60.0)
px[..., :3] = rgb

# 地平线那一条（8k 宽，仰角 BAND_LO…BAND_HI）
save(px[rows(BAND_LO, BAND_HI)], os.path.join(DIR, "bund_band_8k.exr"))
# 整张缩到 2048 × 1024（4 × 4 取平均）
small = px[..., :3].reshape(H // 4, 4, W // 4, 4, 3).mean((1, 3))
save(small, os.path.join(DIR, "bund_sky_2k.exr"))
json.dump({"band": [BAND_LO, BAND_HI], "u_sky": u_sky, "shift": shift, "gain": g.tolist(), "gain_lights": gl},
          open(os.path.join(DIR, "plate.json"), "w"), indent=1)
