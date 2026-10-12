# 逐帧检查录出来的视频稳不稳：ffmpeg 解成 320 宽的灰度帧，相邻两帧做相位相关，得到整幅画面的平移（像素 / 帧，转头 → 水平平移、俯仰 → 竖直平移），
# 再看这条曲线顺不顺：二阶差分（这一帧的平移和前后两帧平均值的差）大的地方 = 一顿一顿；还查重复帧（画面完全没动）和亮度跳变（光照、探针切换闪一下）。
# 用法：python tools/judder.py 视频.mp4 [--from 秒] [--png 输出图]
import subprocess, sys
import numpy as np

video = sys.argv[1]
T0 = float(sys.argv[sys.argv.index("--from") + 1]) if "--from" in sys.argv else 0.0
PNG = sys.argv[sys.argv.index("--png") + 1] if "--png" in sys.argv else None
probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip().split(",")
w0, h0 = int(probe[0]), int(probe[1]); num, den = map(int, probe[2].split("/")); fps = num / den
W = 320; H = int(round(h0 * W / w0 / 2) * 2)
raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(T0), "-i", video, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
win = np.outer(np.hanning(H), np.hanning(W)).astype(np.float32)


def shift(a, b):
    A = np.fft.fft2((a - a.mean()) * win); B = np.fft.fft2((b - b.mean()) * win)
    R = A * np.conj(B); R /= np.abs(R) + 1e-6
    r = np.fft.ifft2(R).real
    y, x = np.unravel_index(np.argmax(r), r.shape)
    # 亚像素：抛物线插值
    def sub(v, i, n):
        l, c, rr = v[(i - 1) % n], v[i], v[(i + 1) % n]
        d = l - 2 * c + rr
        return i + (0.5 * (l - rr) / d if abs(d) > 1e-9 else 0)
    sy = sub(r[:, x], y, H); sx = sub(r[y, :], x, W)
    if sy > H / 2: sy -= H
    if sx > W / 2: sx -= W
    return sx, sy, r.max()


dx, dy, conf, diff, lum = [], [], [], [], []
for i in range(1, len(F)):
    sx, sy, c = shift(F[i], F[i - 1])
    dx.append(sx); dy.append(sy); conf.append(c)
    diff.append(float(np.abs(F[i] - F[i - 1]).mean())); lum.append(float(F[i].mean()))
dx, dy, conf, diff, lum = map(np.array, (dx, dy, conf, diff, lum))
t = T0 + np.arange(1, len(F)) / fps
# 二阶差分：平移曲线的"抖"
res = np.abs(dx[1:-1] - (dx[:-2] + dx[2:]) / 2) + np.abs(dy[1:-1] - (dy[:-2] + dy[2:]) / 2)
good = conf[1:-1] > 0.08                      # 相关性太低（画面大变、太暗）的帧不算
r = res[good]
print(f"{video}: {len(F)} 帧，{fps:g} 帧/秒，从 {T0:g} 秒起")
print(f"  画面平移（像素/帧，320 宽）：水平最大 {np.abs(dx).max():.2f}、竖直最大 {np.abs(dy).max():.2f}")
print(f"  逐帧抖动（平移的二阶差分）：中位 {np.median(r):.3f}，95% {np.percentile(r, 95):.3f}，最大 {r.max():.3f} 像素")
bad = [(t[1:-1][good][k], r[k]) for k in np.argsort(-r)[:8]]
print("  抖动最大的几帧：" + "，".join(f"{tt:.2f}s {v:.2f}" for tt, v in sorted(bad)))
dup = t[diff < 0.02]
print(f"  完全没动的帧：{len(dup)}" + (f"（{', '.join(f'{x:.2f}' for x in dup[:10])}…）" if len(dup) else ""))
jl = np.abs(np.diff(lum))
print(f"  平均亮度逐帧变化：最大 {jl.max():.2f}（{t[1:][np.argmax(jl)]:.2f}s），> 2 的帧 {int((jl > 2).sum())} 个")
if PNG:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei"]
    fig, axs = plt.subplots(3, 1, figsize=(16, 9), sharex=True)
    axs[0].plot(t, dx, lw=0.8, label="水平平移"); axs[0].plot(t, dy, lw=0.8, label="竖直平移"); axs[0].legend(); axs[0].set_ylabel("像素/帧")
    axs[1].plot(t[1:-1], res, lw=0.6, color="#c0392b"); axs[1].set_ylabel("逐帧抖动（像素）")
    axs[2].plot(t, lum, lw=0.8, color="#555"); axs[2].set_ylabel("平均亮度"); axs[2].set_xlabel("秒")
    fig.suptitle(f"逐帧稳定性：{video}")
    fig.savefig(PNG, bbox_inches="tight", dpi=100)
    print("  saved", PNG)
