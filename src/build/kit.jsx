// 构件工具箱：共享材质、带墨线的盒子、贴图（地板、瓷砖、文字）。所有颜色从 theme.js 取。
import * as THREE from "three";
import { createContext, useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T } from "../theme.js";
import { PRO } from "../look/look.js";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, envMapIntensity: T.env, ...extra });

export const MAT = {
  wall: std(T.wall, { roughness: 0.85 }),
  wallTop: std(T.wallTop, { roughness: 0.9 }),
  frame: std(T.frame, { roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({ color: T.glass, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.35, envMapIntensity: 1.2 }),
  furn: std(T.furn, { roughness: 0.75 }),
  furn2: std(T.furn2, { roughness: 0.9 }),
  furnWood: std(T.furnWood, { roughness: 0.6 }),
  fabric: std(T.fabric, { roughness: 0.95 }),
  plant: std(T.plant, { roughness: 0.8 }),
  dark: std(T.dark || "#2a2a2c", { roughness: 0.4 }),
  hl: std(T.hl || T.accent, { roughness: 0.6 }),       // 分步搭建时，这一步新加的构件
  person: std(T.person || "#3a3a3c", { roughness: 0.9 }),
};
// 画质实验：玻璃更通透（墨线风格里要半透明的灰才看得出来）
if (PRO) Object.assign(MAT.glass, { opacity: 0.14, roughness: 0.02 });
// 蓝图风：家具半透明，只靠棱线
if (T.ghost) for (const k of ["furn", "furn2", "furnWood", "fabric"]) { MAT[k].transparent = true; MAT[k].opacity = 0.55; }

// 高亮：包在 <HL.Provider value> 里的构件都换成高亮材质（玻璃除外）
export const HL = createContext(false);
const useMat = (mat) => (useContext(HL) && mat !== MAT.glass ? MAT.hl : mat);

// 墨线：几何体准备好后，加一个沿法线撑开的背面外壳（同 vibe-mech）；蓝图风再加棱线
const INK = new THREE.MeshBasicMaterial({ color: T.ink, side: THREE.BackSide });
INK.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n transformed += normal * ${T.outline.toFixed(4)};`);
};
export const EDGE = new THREE.LineBasicMaterial({ color: T.edgeColor || T.ink, transparent: true, opacity: T.edgeOpacity ?? 0.85 });
export function Ink({ edges = T.edges }) {
  const ref = useRef();
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const parent = ref.current?.parent;
    if (!parent?.geometry?.attributes?.position) return;
    if (T.outline > 0) ref.current.add(Object.assign(new THREE.Mesh(toCreasedNormals(parent.geometry, Math.PI), INK), { raycast() {} }));
    if (edges) ref.current.add(Object.assign(new THREE.LineSegments(new THREE.EdgesGeometry(parent.geometry, 20), EDGE), { raycast() {} }));
    done.current = true;
  });
  return <group ref={ref} />;
}

export function Box({ size, r = 0.02, mat = MAT.furn, ink = true, ...p }) {
  const m = useMat(mat);
  return (
    <RoundedBox args={size} radius={Math.min(r, ...size.map((s) => s / 2 - 1e-3))} smoothness={3} material={m} castShadow={!(PRO && m === MAT.glass)} receiveShadow {...p}>
      {ink && <Ink />}
    </RoundedBox>
  );
}

// 方块（不倒角，墙体用：棱角分明、几何体便宜）
export function Block({ size, mat, ink = T.edges, ...p }) {
  const m = useMat(mat);
  return (
    <mesh material={m} castShadow={!(PRO && m === MAT.glass)} receiveShadow {...p}>
      <boxGeometry args={size} />
      {ink && <Ink edges={T.edges} />}
    </mesh>
  );
}

// ---------- 贴图 ----------
const cache = new Map();
export function canvasTex(key, w, h, draw, repeat) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  cache.set(key, t);
  return t;
}
// 木地板：一张贴图 = 1 米见方，横向 8 条板，板缝 + 一点深浅变化
export const woodTex = (P = T) => canvasTex("wood-" + P.wood, 512, 512, (g, w, h) => {
  g.fillStyle = P.wood; g.fillRect(0, 0, w, h);
  const n = 8, bh = h / n;
  for (let i = 0; i < n; i++) {
    const off = (i * 197) % w;
    g.fillStyle = i % 3 === 0 ? P.woodLine + "55" : i % 3 === 1 ? "#ffffff18" : "#00000008";
    g.fillRect(0, i * bh, w, bh);
    g.fillStyle = P.woodLine; g.fillRect(0, i * bh, w, 2); g.fillRect(off, i * bh, 2, bh);
  }
}, true);
// 瓷砖：一张贴图 = 0.6 米见方的一块砖
export const tileTex = (P = T) => canvasTex("tile-" + P.tile, 256, 256, (g, w, h) => {
  g.fillStyle = P.tile; g.fillRect(0, 0, w, h);
  g.fillStyle = P.tileLine; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
}, true);

// 人形比例尺：1.7 米高的简单剪影
export function Person({ rot = 0, ...p }) {
  return (
    <group rotation={[0, rot, 0]} {...p}>
      <mesh material={MAT.person} position={[0, 0.72, 0]} castShadow><capsuleGeometry args={[0.17, 0.95, 4, 12]} /></mesh>
      <mesh material={MAT.person} position={[0, 1.56, 0]} castShadow><sphereGeometry args={[0.12, 16, 12]} /></mesh>
    </group>
  );
}
