// look=pro&pbr 的软装：把 decor.js 按户型规则算出来的清单画出来。
// 程序化的：地毯（Poly Haven 织物法线 + 画出来的包边）、抱枕、搭毯、被子、床尾巾、窗帘（带褶）、挂画（抽象画）、书、厨具、毛巾、镜子、阳台桌椅；
// CC0 模型：绿植（大 / 中 / 小三种）、陶瓷花瓶、相框、边几、休闲椅、藤编托盘（来源见 public/assets/CREDITS.md）。
// 颜色来自氛围预设的 decor 配色（look.js 的 m2a / m2b / m2c …），没有预设时用 DEF。
// 动画：store 里的 decor（0~1）推进时一件件错开出现——地毯从一边铺开、窗帘从地上升起来、其他的从上方落下。
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useScene } from "../store.js";
import { MOOD, TOUR } from "./look.js";
import { TL_TOUR } from "./tour.js";
import { tex, M, Hero } from "./pbr.jsx";
import { Fixture, FIXTURE_Y } from "./lamps.jsx";
import { canvasTex } from "../build/kit.jsx";

const url = (id) => `/assets/polyhaven/model/${id}/${id}_1k.gltf`;

// 没有氛围预设时的软装配色（暖木 + 陶土色）
const DEF = {
  rug: "#e6dccb", rugBorder: "#b9653d", rug2: "#eee5d8", runner: "#d3c3ad", mat: "#9b8a74",
  pillows: ["#c8663e", "#efe7da", "#8fa58a", "#d9b48a"], throw: "#c8663e", duvet: "#f4efe7", sheet: "#fbf8f2", bedRunner: "#8fa58a",
  curtain: "#ebe3d5", frame: "#3a3633", art: ["#3a3633", "#c8663e", "#d9cdb9", "#f3ede3"], books: ["#c8663e", "#e6dccb", "#8fa58a", "#efe8dc", "#3a3633"],
  kettle: "#efe9df", towel: "#f1ebe1", metal: "#2b2826", wood: "#b07a4c", bistro: "#3a3633",
};
const D = { ...DEF, ...(MOOD?.decor || {}) };

// ---------- 材质（按颜色缓存） ----------
const cache = new Map();
const once = (k, make) => (cache.has(k) ? cache.get(k) : (cache.set(k, make()), cache.get(k)));
const std = (color, rough = 0.6, metal = 0) => once(`std${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
// 织物：只用 Poly Haven 贴图的法线和粗糙度，颜色是自己的；rep = 一个面上铺几次
const cloth = (color, id, rep = 1, normal = 1, side = THREE.FrontSide) => once(`cloth${color}${id}${rep}${normal}${side}`, () => {
  const n = tex(id, "nor_gl").clone(), r = tex(id, "rough").clone();
  for (const t of [n, r]) t.repeat.set(rep, rep); // 克隆和原贴图共用图片（Source），原贴图加载完两边一起更新
  return new THREE.MeshStandardMaterial({ color, roughness: 1, normalMap: n, roughnessMap: r, normalScale: new THREE.Vector2(normal, normal), side });
});
const linen = (c, rep = 1) => cloth(c, "rough_linen", rep, 0.9);
const waffle = (c, rep = 2) => cloth(c, "waffle_pique_cotton", rep, 0.8);
const CERAMIC = std("#f2eee8", 0.35);
const GLASSY = once("glassy", () => new THREE.MeshStandardMaterial({ color: "#dfe6e4", roughness: 0.15, metalness: 0, transparent: true, opacity: 0.55 }));
const STEEL = std("#c9c9cc", 0.35, 0.6);

// 盒子（drei 的圆角盒，带投影）
const B = ({ s, r = 0.01, m, ...p }) => <RoundedBox args={s} radius={Math.min(r, ...s.map((v) => v / 2 - 1e-3))} smoothness={3} material={m} castShadow receiveShadow {...p} />;

// ---------- 地毯 ----------
// 颜色贴图画在 canvas 上（底色 + 包边 / 两头条纹），法线来自织物贴图（客厅人字纹、卧室和地垫卷毛、长地垫和浴室垫华夫格）
const RUG = { herring: ["poly_wool_herringbone", 0.55, 0.012, 1.2], teddy: ["curly_teddy_natural", 0.4, 0.02, 1.0], waffle: ["waffle_pique_cotton", 0.22, 0.01, 1.0] };
function Rug({ w, d, style, role }) {
  const [id, tile, h, nscale] = RUG[style] || RUG.herring;
  const base = D[role] || D.rug, edge = D.rugBorder;
  const mat = useMemo(() => {
    const H = Math.max(64, Math.round((512 * d) / w));
    const map = canvasTex(`rug-${style}-${role}-${base}-${edge}-${w.toFixed(2)}-${d.toFixed(2)}`, 512, H, (g, W, Hh) => {
      g.fillStyle = base; g.fillRect(0, 0, W, Hh);
      const px = W / w; // 每米多少像素
      if (role === "rug") { // 客厅：深色包边 + 内圈细线
        const i = 0.1 * px, b = 0.07 * px;
        g.strokeStyle = edge; g.lineWidth = b; g.strokeRect(i + b / 2, i + b / 2, W - 2 * i - b, Hh - 2 * i - b);
        g.lineWidth = 0.015 * px; g.strokeRect(i + b + 0.06 * px, i + b + 0.06 * px, W - 2 * (i + b + 0.06 * px), Hh - 2 * (i + b + 0.06 * px));
      } else if (role === "runner" || role === "towel") { // 两头各两道条纹
        g.fillStyle = edge + "aa";
        for (const x of [0.08, 0.13]) { g.fillRect(x * px, 0, 0.025 * px, Hh); g.fillRect(W - (x + 0.025) * px, 0, 0.025 * px, Hh); }
      } else if (role === "mat") { // 地垫：浅色包边
        g.strokeStyle = "#ffffff55"; g.lineWidth = 0.05 * px; g.strokeRect(0.05 * px, 0.05 * px, W - 0.1 * px, Hh - 0.1 * px);
      } else { // 卧室：四周稍深一点，像长绒毯的边
        const grd = g.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.3, W / 2, Hh / 2, Math.max(W, Hh) * 0.7);
        grd.addColorStop(0, "#ffffff00"); grd.addColorStop(1, "#00000018");
        g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
      }
    });
    const n = tex(id, "nor_gl").clone(), r = tex(id, "rough").clone();
    for (const t of [n, r]) t.repeat.set(w / tile, d / tile);
    return new THREE.MeshStandardMaterial({ map, normalMap: n, roughnessMap: r, roughness: 1, normalScale: new THREE.Vector2(nscale, nscale) });
  }, [w, d, style, role, base, edge, id, tile, nscale]);
  return <mesh material={mat} position={[0, h / 2 + 0.003, 0]} receiveShadow><boxGeometry args={[w, h, d]} /></mesh>;
}

// ---------- 抱枕：前后两片鼓起来的面在腰线处缝在一起，四个角捏尖（第 3 轮：人眼高度近看，圆角盒太假） ----------
const PILLOW_GEO = new Map();
function pillowGeo(w, h, t) {
  const key = `${w.toFixed(3)}-${h.toFixed(3)}-${t}`;
  if (PILLOW_GEO.has(key)) return PILLOW_GEO.get(key);
  const half = (s) => {
    const g = new THREE.PlaneGeometry(w, h, 28, 28), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), u = (2 * x) / w, v = (2 * y) / h;
      const f = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.6)), 0.55) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(v), 2.6)), 0.55);
      const wr = 0.004 * Math.sin(u * 9.0 + v * 4.0) * f;                 // 一点点褶
      const pinch = 1 - 0.06 * Math.pow(Math.abs(u * v), 3);               // 四角往里收一点、尖出去
      p.setXYZ(i, x * (1 + 0.04 * (1 - f)) * pinch, y * (1 + 0.04 * (1 - f)) * pinch, s * ((t / 2) * f + wr));
    }
    if (s < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; }
    return g;
  };
  const g = mergeGeometries([half(1), half(-1)]);
  g.computeVertexNormals();
  PILLOW_GEO.set(key, g);
  return g;
}
const Pillow = ({ w, h, t = 0.16, m, ...p }) => <mesh geometry={pillowGeo(w, h, t)} material={m} castShadow receiveShadow userData={{ bakeCls: "dynamic" }} {...p} />;

// 搭毯：一条有厚度的布，从坐垫上斜搭过扶手、顺着扶手外侧垂下来，垂下来那段有几道竖褶
const THROW_GEO = {};
function throwGeo() {
  if (THROW_GEO.g) return THROW_GEO.g;
  // 截面路径（局部 x 横过扶手、y 向上）：坐垫上 → 扶手顶 → 外侧垂下
  const path = [[-0.36, 0.545], [-0.2, 0.57], [-0.1, 0.615], [-0.04, 0.637], [0.04, 0.641], [0.1, 0.628], [0.125, 0.585], [0.132, 0.5], [0.138, 0.38], [0.146, 0.26], [0.152, 0.16]];
  const W = 0.54, NZ = 30, T = 0.012, P = [];
  for (let i = 0; i < path.length; i++) {
    const [x0, y0] = path[Math.max(0, i - 1)], [x1, y1] = path[Math.min(path.length - 1, i + 1)];
    const tx = x1 - x0, ty = y1 - y0, L = Math.hypot(tx, ty);
    P.push({ x: path[i][0], y: path[i][1], nx: -ty / L, ny: tx / L, hang: Math.max(0, (0.6 - path[i][1]) / 0.44) });
  }
  const pos = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i < P.length; i++) for (let k = 0; k <= NZ; k++) {
      const z = (k / NZ - 0.5) * W, fold = 0.018 * P[i].hang * Math.sin((k / NZ) * Math.PI * 5);
      const off = side > 0 ? T / 2 : -T / 2;
      pos.push(P[i].x + P[i].nx * off + fold, P[i].y + P[i].ny * off, z);
    }
    for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < NZ; k++) {
      const a = base + i * (NZ + 1) + k, b = a + NZ + 1;
      if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[2 * i] = pos[3 * i + 2] * 2; uv[2 * i + 1] = (pos[3 * i] + pos[3 * i + 1]) * 2; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return (THROW_GEO.g = g);
}

// ---------- 沙发：四个抱枕靠在靠背上（大小、颜色错开）+ 一条搭毯从扶手上垂下来 ----------
function SofaSet({ w }) {
  const P = [[-w / 2 + 0.34, 0.46, 0.46, 0, 0.07], [-w / 2 + 0.75, 0.42, 0.42, 1, -0.05], [w / 2 - 0.86, 0.52, 0.3, 2, 0.04], [w / 2 - 0.42, 0.46, 0.46, 3, -0.08]];
  const t = waffle(D.throw, 1.5);
  return (
    <group>
      {P.map(([x, pw, ph, c, yaw], i) => (
        <Pillow key={i} w={pw} h={ph} t={0.15} m={linen(D.pillows[c % D.pillows.length])} position={[x, 0.53 + ph * 0.46, -0.14]} rotation={[-0.3, yaw, 0]} />
      ))}
      <mesh geometry={throwGeo()} material={t} position={[w / 2 - 0.09, 0, 0.12]} castShadow receiveShadow />
    </group>
  );
}

// ---------- 床：被子（盖住床垫两侧）、翻过来的被头、两个睡枕、两个靠垫 + 一个腰枕、床尾巾 ----------
// 第 4 轮：换成 Blender 建的那套（被子按盖在床垫上的形状算、垂边带褶，见 tools/blender/furniture_rooms.py 的 bedding）；
// 床的宽度没有对应的模型时才用下面这套圆角盒
const HERO_BEDDING = { 1.5: "bedding15", 1.8: "bedding18" };
function Bedding({ w }) {
  const hero = HERO_BEDDING[Math.round(w * 10) / 10];
  if (hero) return <Hero name={hero} />;
  const duvet = linen(D.duvet, 2), sheet = linen(D.sheet, 1.5), run = waffle(D.bedRunner, 3);
  return (
    <group>
      <B s={[w + 0.1, 0.16, 1.5]} r={0.06} m={duvet} position={[0, 0.5, 0.27]} />
      <B s={[w + 0.1, 0.06, 0.28]} r={0.03} m={sheet} position={[0, 0.6, -0.42]} />
      {[-1, 1].map((s) => <B key={s} s={[w / 2 - 0.1, 0.14, 0.42]} r={0.06} m={sheet} position={[s * (w / 4 - 0.01), 0.6, -0.78]} rotation={[-0.15, 0, 0]} />)}
      {[-1, 1].map((s) => <B key={"c" + s} s={[0.42, 0.42, 0.13]} r={0.06} m={linen(D.pillows[s > 0 ? 0 : 3])} position={[s * (w / 4 - 0.05), 0.76, -0.56]} rotation={[-0.38, s * 0.06, 0]} />)}
      <B s={[0.5, 0.26, 0.11]} r={0.05} m={linen(D.pillows[2])} position={[0, 0.7, -0.42]} rotation={[-0.32, 0, 0]} />
      <B s={[w + 0.16, 0.035, 0.42]} r={0.012} m={run} position={[0, 0.6, 0.72]} />
      {[-1, 1].map((s) => <B key={"r" + s} s={[0.03, 0.17, 0.42]} r={0.012} m={run} position={[s * (w / 2 + 0.065), 0.52, 0.72]} />)}
    </group>
  );
}

// ---------- 窗帘：竖向褶皱（每道褶深浅不一样，底下稍微散开），有厚度（正反两面，烘焙时各算各的光），顶上一根细杆 ----------
function Curtain({ w, h }) {
  const geo = useMemo(() => {
    const folds = Math.max(3, Math.round(w / 0.085)), NX = folds * 8, NY = 18, T = 0.006;
    const amp = Array.from({ length: folds + 2 }, (_, k) => 0.022 + 0.012 * Math.abs(Math.sin(k * 12.9898 + w * 7.1)));
    const zAt = (u, v) => { // u 0~1 横向，v 0~1 从下往上
      const f = u * folds, k = Math.floor(f), fr = f - k;
      const a = amp[k] * (1 - fr) + amp[k + 1] * fr;
      return a * (1 + 0.25 * (1 - v) ** 3) * Math.sin(f * Math.PI * 2 + 0.6) + 0.004 * Math.sin(v * 7 + u * 3);
    };
    const pos = [], idx = [], uv = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NY, flare = 1 + 0.04 * (1 - v) ** 2;
        pos.push((u - 0.5) * w * flare, v * h, zAt(u, v) + (side > 0 ? 0 : -T)); uv.push(u * w * 2, v * h * 2);
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = base + j * (NX + 1) + i, b = a + NX + 1;
        if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [w, h]);
  return (
    <group>
      <mesh geometry={geo} material={cloth(D.curtain, "rough_linen", 1, 0.8)} castShadow receiveShadow />
      <mesh material={std(D.metal, 0.4, 0.5)} position={[0, h + 0.015, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.009, 0.009, w + 0.12, 10]} /></mesh>
    </group>
  );
}

// ---------- 挂画：深色细框 + 白卡纸 + 抽象画（拱门和太阳、线条、色块、远山），配色跟软装走 ----------
const PRINTS = [
  (g, W, H, [ink, acc, sand, paper]) => { g.fillStyle = paper; g.fillRect(0, 0, W, H); g.fillStyle = sand; g.beginPath(); g.moveTo(W * 0.14, H); g.lineTo(W * 0.14, H * 0.48); g.arc(W * 0.36, H * 0.48, W * 0.22, Math.PI, 0); g.lineTo(W * 0.58, H); g.fill(); g.fillStyle = acc; g.beginPath(); g.arc(W * 0.7, H * 0.32, W * 0.13, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; g.fillRect(W * 0.08, H * 0.86, W * 0.84, H * 0.018); },
  (g, W, H, [ink, acc, sand, paper]) => { g.fillStyle = paper; g.fillRect(0, 0, W, H); g.strokeStyle = ink; g.lineWidth = W * 0.012; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(W * 0.5, H * 0.95, W * (0.15 + i * 0.09), Math.PI, 0); g.stroke(); } g.fillStyle = acc; g.beginPath(); g.arc(W * 0.5, H * 0.95, W * 0.11, Math.PI, 0); g.fill(); },
  (g, W, H, [ink, acc, sand, paper]) => { g.fillStyle = sand; g.fillRect(0, 0, W, H); g.fillStyle = acc; g.beginPath(); g.ellipse(W * 0.45, H * 0.55, W * 0.28, H * 0.2, -0.5, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; g.beginPath(); g.arc(W * 0.68, H * 0.28, W * 0.06, 0, Math.PI * 2); g.fill(); },
  (g, W, H, [ink, acc, sand, paper]) => { g.fillStyle = paper; g.fillRect(0, 0, W, H); g.fillStyle = sand; g.beginPath(); g.moveTo(0, H); g.bezierCurveTo(W * 0.25, H * 0.35, W * 0.45, H * 0.4, W * 0.62, H * 0.62); g.bezierCurveTo(W * 0.75, H * 0.45, W * 0.9, H * 0.5, W, H * 0.6); g.lineTo(W, H); g.fill(); g.fillStyle = acc; g.beginPath(); g.arc(W * 0.72, H * 0.3, H * 0.16, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; g.fillRect(0, H * 0.9, W, H * 0.1); },
];
function Art({ frames }) {
  const frame = std(D.frame, 0.5), paper = std("#f6f3ee", 0.9);
  return (
    <group>
      {frames.map((f, i) => {
        const map = canvasTex(`print${f.print}-${D.art.join()}-${(f.w / f.h).toFixed(2)}`, 384, Math.round((384 * (f.h - 0.1)) / (f.w - 0.1)), (g, W, H) => PRINTS[f.print % PRINTS.length](g, W, H, D.art));
        return (
          <group key={i} position={[f.dx, f.dy || 0, 0]}>
            <mesh material={frame} position={[0, 0, 0.0125]} castShadow receiveShadow><boxGeometry args={[f.w, f.h, 0.025]} /></mesh>
            <mesh material={paper} position={[0, 0, 0.0256]}><planeGeometry args={[f.w - 0.035, f.h - 0.035]} /></mesh>
            <mesh position={[0, 0, 0.0262]}><planeGeometry args={[f.w - 0.1, f.h - 0.1]} /><meshStandardMaterial map={map} roughness={0.9} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

// ---------- 小件 ----------
function Books({ n = 2, small, turn = 0, seed = 0 }) {
  let y = 0;
  return (
    <group rotation={[0, turn, 0]}>
      {Array.from({ length: n }, (_, k) => {
        const w = (small ? 0.15 : 0.21) + 0.025 * ((k * 7 + seed) % 3) / 2, d = w * 0.72, t = 0.026 + 0.01 * ((k + seed) % 2);
        const b = <B key={k} s={[w, t, d]} r={0.003} m={std(D.books[(k + seed) % D.books.length], 0.7)} position={[0.01 * (k % 2 ? 1 : -1), y + t / 2, 0]} rotation={[0, 0.1 * (k % 2 ? 1 : -1), 0]} />;
        y += t;
        return b;
      })}
    </group>
  );
}
// 干枝（橄榄枝）：7 根细枝从瓶口散开，每根几片叶子；合成一个几何体
const STEM_GEO = {};
function stems(h) {
  if (STEM_GEO[h]) return STEM_GEO[h];
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, tilt = 0.18 + 0.12 * (i % 3), L = 0.3 + 0.06 * ((i * 5) % 3);
    const m = new THREE.Matrix4().makeTranslation(0, h * 0.9, 0).multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).normalize(), tilt));
    parts.push(new THREE.CylinderGeometry(0.003, 0.004, L, 4).translate(0, L / 2, 0).applyMatrix4(m));
    for (let j = 1; j <= 4; j++) {
      const leaf = new THREE.SphereGeometry(0.022, 6, 4).scale(1, 0.25, 0.5).rotateZ(j % 2 ? 0.6 : -0.6).translate((j % 2 ? 1 : -1) * 0.012, L * (0.35 + j * 0.15), 0);
      parts.push(leaf.applyMatrix4(m));
    }
  }
  return (STEM_GEO[h] = mergeGeometries(parts.map((g) => g.toNonIndexed())));
}
const VASE_H = { 1: 0.4, 2: 0.31, 4: 0.34 };
function Vase({ model = 1, scale = 0.75, stems: withStems }) {
  return (
    <group scale={scale}>
      <M url={url(`ceramic_vase_0${model}`)} />
      {withStems && <mesh geometry={stems(VASE_H[model])} material={std("#7f8c6a", 0.8)} castShadow />}
    </group>
  );
}
const PLANT = { big: ["potted_plant_01", 1], mid: ["potted_plant_02", 0.95], small: ["potted_plant_04", 1] };
const Plant = ({ size = "mid", scale = 1 }) => { const [id, s] = PLANT[size]; return <M url={url(id)} scale={s * scale} />; };

function Bowl() {
  const fruit = [["#e08a3c", 0.045, -0.03, 0.02], ["#e8c547", 0.042, 0.04, -0.02], ["#9bb54a", 0.043, 0.0, 0.05], ["#e08a3c", 0.04, -0.045, -0.04]];
  return (
    <group>
      <mesh material={std(D.wood, 0.55)} position={[0, 0.07, 0]} scale={[1, 0.6, 1]} rotation={[Math.PI, 0, 0]} castShadow receiveShadow><sphereGeometry args={[0.13, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      {fruit.map(([c, r, x, z], i) => <mesh key={i} material={std(c, 0.5)} position={[x, 0.07 + r * 0.6, z]} castShadow><sphereGeometry args={[r, 14, 10]} /></mesh>)}
    </group>
  );
}
function Kettle() {
  const m = std(D.kettle, 0.45);
  return (
    <group>
      <mesh material={std("#2b2826", 0.5)} position={[0, 0.008, 0]}><cylinderGeometry args={[0.085, 0.085, 0.016, 24]} /></mesh>
      <mesh material={m} position={[0, 0.11, 0]} castShadow><cylinderGeometry args={[0.068, 0.082, 0.19, 24]} /></mesh>
      <mesh material={m} position={[0, 0.21, 0]}><cylinderGeometry args={[0.045, 0.066, 0.02, 24]} /></mesh>
      <mesh material={std("#2b2826", 0.5)} position={[0, 0.232, 0]}><sphereGeometry args={[0.016, 10, 8]} /></mesh>
      <mesh material={std("#2b2826", 0.5)} position={[-0.07, 0.13, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.055, 0.011, 8, 16, Math.PI]} /></mesh>
      <mesh material={m} position={[0.085, 0.16, 0]} rotation={[0, 0, -0.9]}><coneGeometry args={[0.018, 0.08, 10]} /></mesh>
    </group>
  );
}
const Board = () => (
  <group rotation={[0, 0.15, 0]}>
    <B s={[0.38, 0.022, 0.25]} r={0.01} m={std(D.wood, 0.6)} position={[0, 0.011, 0]} />
    <mesh material={std("#e8c547", 0.5)} position={[0.08, 0.04, 0.03]} castShadow><sphereGeometry args={[0.035, 12, 8]} /></mesh>
  </group>
);
const Jars = () => (
  <group>
    {[[-0.07, 0.045, 0.16], [0.02, 0.04, 0.12], [0.1, 0.034, 0.09]].map(([x, r, h], i) => (
      <group key={i} position={[x, 0, 0.02 * (i % 2)]}>
        <mesh material={i === 1 ? GLASSY : std(["#efe9df", "#d8cdbd", "#e6dfd3"][i], 0.4)} position={[0, h / 2, 0]} castShadow><cylinderGeometry args={[r, r, h, 20]} /></mesh>
        <mesh material={std(D.wood, 0.6)} position={[0, h + 0.01, 0]}><cylinderGeometry args={[r * 0.96, r * 0.96, 0.02, 20]} /></mesh>
      </group>
    ))}
  </group>
);
const Plate = () => (
  <group>
    <mesh material={CERAMIC} position={[0, 0.008, 0]} receiveShadow castShadow><cylinderGeometry args={[0.115, 0.1, 0.016, 28]} /></mesh>
    <mesh material={linen(D.pillows[0])} position={[0.15, 0.004, 0]}><boxGeometry args={[0.06, 0.008, 0.18]} /></mesh>
  </group>
);
const TableRunner = ({ w, d }) => <B s={[w, 0.006, d]} r={0.002} m={linen(D.runner, 3)} position={[0, 0.003, 0]} />;
function Laptop() {
  return (
    <group rotation={[0, 0.12, 0]}>
      <B s={[0.32, 0.014, 0.22]} r={0.006} m={STEEL} position={[0, 0.007, 0]} />
      <group position={[0, 0.014, -0.11]} rotation={[-0.32, 0, 0]}>
        <B s={[0.32, 0.21, 0.008]} r={0.004} m={STEEL} position={[0, 0.105, 0]} />
        <mesh material={std("#1d1f22", 0.25)} position={[0, 0.105, 0.0045]}><planeGeometry args={[0.29, 0.18]} /></mesh>
      </group>
    </group>
  );
}
const Mug = () => (
  <group>
    <mesh material={std(D.pillows[0], 0.4)} position={[0, 0.045, 0]} castShadow><cylinderGeometry args={[0.04, 0.036, 0.09, 18]} /></mesh>
    <mesh material={std(D.pillows[0], 0.4)} position={[0.045, 0.05, 0]}><torusGeometry args={[0.022, 0.006, 6, 12]} /></mesh>
  </group>
);
const Bottles = () => (
  <group>
    <mesh material={std("#b8875a", 0.25)} position={[0, 0.07, 0]} castShadow><cylinderGeometry args={[0.028, 0.028, 0.14, 16]} /></mesh>
    <mesh material={std("#2b2826", 0.4)} position={[0, 0.155, 0]}><cylinderGeometry args={[0.008, 0.01, 0.03, 8]} /></mesh>
    <mesh material={CERAMIC} position={[0.06, 0.05, 0.02]} castShadow><cylinderGeometry args={[0.024, 0.024, 0.1, 16]} /></mesh>
  </group>
);
// 毛巾：墙上一根短杆，毛巾对折挂着（前后两片）
function Towel() {
  const m = waffle(D.towel, 2);
  return (
    <group>
      <mesh material={std(D.metal, 0.4, 0.5)} position={[0, 0.3, 0.02]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.008, 0.008, 0.46, 8]} /></mesh>
      <B s={[0.36, 0.56, 0.02]} r={0.008} m={m} position={[0, 0.03, 0.012]} />
      <B s={[0.36, 0.42, 0.02]} r={0.008} m={m} position={[0, 0.1, 0.035]} />
    </group>
  );
}
// 阳台：小圆桌 + 一把椅子（并排放在窄的那一边）
function Bistro() {
  const m = std(D.bistro, 0.55), wood = std(D.wood, 0.6);
  return (
    <group>
      <group position={[0.24, 0, 0.02]}>
        <mesh material={wood} position={[0, 0.52, 0]} castShadow receiveShadow><cylinderGeometry args={[0.22, 0.22, 0.025, 28]} /></mesh>
        <mesh material={m} position={[0, 0.26, 0]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.5, 8]} /></mesh>
        <mesh material={m} position={[0, 0.008, 0]}><cylinderGeometry args={[0.15, 0.15, 0.016, 20]} /></mesh>
        <mesh material={CERAMIC} position={[0.05, 0.57, 0.03]} castShadow><cylinderGeometry args={[0.035, 0.032, 0.07, 14]} /></mesh>
      </group>
      <group position={[-0.24, 0, -0.04]}>
        <B s={[0.42, 0.035, 0.42]} r={0.01} m={wood} position={[0, 0.45, 0]} />
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => <B key={i} s={[0.025, 0.45, 0.025]} r={0.005} m={m} position={[x * 0.18, 0.225, z * 0.18]} />)}
        <B s={[0.42, 0.3, 0.025]} r={0.008} m={m} position={[0, 0.78, -0.2]} />
        <B s={[0.36, 0.08, 0.3]} r={0.03} m={linen(D.pillows[0])} position={[0, 0.505, 0.02]} />
      </group>
    </group>
  );
}

// 模型朝向修正（Poly Haven 模型的"正面"不一定朝 +z）
const Frame = () => <M url={url("standing_picture_frame_02")} rot={-Math.PI / 2} scale={0.9} />;
const Tray = () => <M url={url("wicker_basket_01")} />;
const SideTable = () => <M url={url("side_table_01")} />;
const Lounge = () => <M url={url("mid_century_lounge_chair")} scale={0.82} />;

function Item({ it }) {
  switch (it.kind) {
    case "rug": return <Rug w={it.w} d={it.d} style={it.style} role={it.role} />;
    case "sofaSet": return <SofaSet w={it.w} />;
    case "bedding": return <Bedding w={it.w} />;
    case "lamp": return <Fixture kind={it.style} />;
    case "curtain": return <Curtain w={it.w} h={it.h} />;
    case "art": return <Art frames={it.frames} />;
    case "books": return <Books n={it.n} small={it.small} turn={it.turn} seed={it.i} />;
    case "vase": return <Vase model={it.model} scale={it.scale} stems={it.stems} />;
    case "plant": return <Plant size={it.size} scale={it.scale} />;
    case "succulent": return <Plant size="small" scale={0.9} />;
    case "frame": return <Frame />;
    case "tray": return <Tray />;
    case "sideTable": return <SideTable />;
    case "lounge": return <Lounge />;
    case "runner": return <TableRunner w={it.w} d={it.d} />;
    case "plate": return <Plate />;
    case "bowl": return <Bowl />;
    case "kettle": return <Kettle />;
    case "board": return <Board />;
    case "jars": return <Jars />;
    case "laptop": return <Laptop />;
    case "mug": return <Mug />;
    case "bottles": return <Bottles />;
    case "towel": return <Towel />;
    case "mirror": return null; // 第 4 轮：洗手台模型自带镜柜（规则照样算这一件，毛巾的位置要用到）
    case "bistro": return <Bistro />;
    default: return null;
  }
}

// 一件件出现：第 i 件在 decor 进度走到 i/(n+6) 时开始，用 6 件的时间完成
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 烘焙时当成静态物体的软装（光照贴图）：大件、贴地的；其余（灯具、摆件、绿植、挂画……）是动态的，靠环境探针 + 实时灯
export const STATIC_DECOR = new Set(["rug", "sofaSet", "bedding", "curtain", "sideTable", "lounge", "runner", "bistro"]);
// 墙长高（store.rise 0 → 1）时，挂画、窗帘、吊灯、镜子从剖切高度那套位置换到满高那套：low = 同一条规则按剖切高度算出来的那一件
// 返回从满高那件变回 low 要的偏移和缩放（满高的几何体缩到 low 的尺寸，长高时再放回来）
function lowOf(it, lo) {
  const T = { dy: 0, sx: 1, sy: 1, sz: 1 };
  if (!lo || lo.kind !== it.kind) return T;
  T.dy = lo.y - it.y;
  if (it.kind === "curtain") T.sy = lo.h / it.h;
  if (it.kind === "mirror") T.sx = T.sy = lo.r / it.r;
  if (it.kind === "art") {
    const span = (fs) => Math.max(...fs.map((f) => Math.abs(f.dx) + f.w / 2));
    T.sx = span(lo.frames) / span(it.frames); T.sy = lo.frames[0].h / it.frames[0].h;
  }
  return T;
}
// 漫游成片（seq=final）：按房间成组落下——房间之间隔 0.32 秒、组内 0.6 秒落完、每件 0.45 秒，整段 2.6 秒（第 4 轮是一件接一件，太慢）
// 房间顺序：客餐厅 → 主卧 → 次卧 → 厨房 → 卫生间 → 阳台；组内按布置顺序（地毯先、窗帘后）
const ROOM_ORDER = [/客|厅|living/i, /主卧|master/i, /卧|bed/i, /厨|kitchen/i, /卫|浴|bath/i, /阳台|balcony/i];
export function tourStarts(items) {
  const rank = (r) => { const k = ROOM_ORDER.findIndex((rx) => rx.test(r || "")); return k < 0 ? ROOM_ORDER.length : k; };
  const by = new Map();
  items.forEach((it, i) => { const k = rank(it.room); if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
  const start = new Array(items.length).fill(0), keys = [...by.keys()].sort((a, b) => a - b);
  keys.forEach((k, gi) => { const g = by.get(k); g.forEach((i, j) => (start[i] = gi * 0.32 + (g.length > 1 ? (0.6 * j) / (g.length - 1) : 0))); });
  return start;
}
const TOUR_DUR = TL_TOUR.decor[1] - TL_TOUR.decor[0];
function Drop({ i, n, kind, y, low, start, children, ...p }) {
  const g = useRef();
  useFrame(() => {
    const s = useScene.getState(), o = g.current;
    if (!o) return;
    const d = s.stage >= 5 ? s.decor : 0;
    const k = start != null ? clamp01((d * TOUR_DUR - start) / 0.45) : clamp01((d * (n + 6) - i) / 6), e = 1 - Math.pow(1 - k, 3);
    const r = low ? s.rise : 1, bx = low ? low.sx + (1 - low.sx) * r : 1, by = low ? low.sy + (1 - low.sy) * r : 1, yy = low ? y + low.dy * (1 - r) : y;
    o.visible = k > 0.001;
    if (kind === "rug") { o.scale.set(Math.max(0.001, e), 1, 1); o.position.y = yy; }           // 地毯从一边铺开
    else if (kind === "curtain") { o.scale.set(bx, Math.max(0.001, e) * by, 1); o.position.y = yy; }  // 窗帘升起来
    else { o.position.y = yy + (1 - e) * 0.7; o.scale.set(bx, by, 1).multiplyScalar(0.75 + 0.25 * e); } // 其他的从上面落下来
  });
  return <group ref={g} position={[p.x, y, p.z]} rotation={[0, p.rot || 0, 0]} userData={p.userData}>{children}</group>;
}

// items：软装清单；low（可选，成片时间线用）：同一套规则按剖切高度算的清单，墙长高之前按它摆
export function Decor({ items, low }) {
  const starts = useMemo(() => (TOUR ? tourStarts(items) : null), [items]);
  return (
    <group>
      {items.map((it, i) => (
        <Drop key={i} i={i} n={items.length} start={starts?.[i]} kind={it.kind} x={it.x} z={it.z} rot={it.rot} y={it.y + (it.kind === "lamp" ? FIXTURE_Y[it.style] || 0 : 0)}
          low={low && low !== items ? lowOf(it, low[i]) : null} userData={{ bake: `decor:${i}`, bakeCls: STATIC_DECOR.has(it.kind) ? "static" : "dynamic" }}>
          <Item it={it} />
        </Drop>
      ))}
    </group>
  );
}
