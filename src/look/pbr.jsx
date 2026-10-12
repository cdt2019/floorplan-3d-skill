// look=pro&pbr：换材质。Poly Haven 的 CC0 贴图（来源见 public/assets/CREDITS.md）+ 几件 CC0 模型换掉方块家具。
// 盒子的 UV 是每个面 0~1，长墙会把贴图拉长；这里改成按世界坐标投影（哪个轴朝外就用另外两个轴当 UV），贴图密度处处一样。
import * as THREE from "three";
import { Suspense, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { MAT } from "../build/kit.jsx";
import { PBR, MOOD } from "./look.js";
import { LED } from "./lamps.jsx";
import { BAKE_ON } from "./bake.js";
import { boxProjected } from "./inside.jsx";

const TEX = "/assets/polyhaven/tex/";
const MOD = "/assets/polyhaven/model/";
const loader = new THREE.TextureLoader();
const cache = {};
export function tex(id, kind) {
  const k = id + kind;
  if (!cache[k]) {
    const t = loader.load(`${TEX}${id}/${id}_${kind}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (kind === "diff") t.colorSpace = THREE.SRGBColorSpace;
    cache[k] = t;
  }
  return cache[k];
}

// 世界坐标投影 UV：size = 一张贴图对应多少米
function worldUV(mat, size) {
  mat.onBeforeCompile = (sh) => {
    // 氛围预设给木地板调色：贴图颜色往 lift 颜色混一部分（只会变暗的 color 相乘做不到"变浅"）
    if (mat.userData.lift) {
      sh.uniforms.uLift = mat.userData.lift;
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uLift.rgb, uLift.a);`).replace("void main() {", "uniform vec4 uLift;\nvoid main() {");
    }
    // 木纹：只取贴图的明暗（除以贴图平均亮度），颜色用材质自己的（跟着配色走）
    if (mat.userData.lumNorm) {
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        #ifdef USE_MAP
          diffuseColor.rgb = diffuse * clamp(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / ${mat.userData.lumNorm.toFixed(5)}, 0.0, 3.0);
        #endif`);
    }
    sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      {
        vec4 wpUV = modelMatrix * vec4(transformed, 1.0);
        vec3 wnUV = abs(normalize(mat3(modelMatrix) * objectNormal));
        vec2 tpUV = (wnUV.y > 0.5 ? wpUV.xz : (wnUV.x > wnUV.z ? wpUV.zy : wpUV.xy)) / ${size.toFixed(3)};
        #ifdef USE_MAP
          vMapUv = tpUV;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = tpUV;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = tpUV;
        #endif
      }`);
  };
  mat.customProgramCacheKey = () => "worldUV" + size + (mat.userData.lift ? "L" : "") + (mat.userData.lumNorm ? "N" : "");
  mat.userData.worldUV = size; // 路径追踪不跑着色器，PathTracer.jsx 按这个把 uv 烘进几何体
  mat.needsUpdate = true;
  return mat;
}
const surface = (id, size, { color = false, normal = 1, ...extra } = {}, mat = new THREE.MeshStandardMaterial()) => worldUV(Object.assign(mat, {
  map: color ? tex(id, "diff") : null, normalMap: tex(id, "nor_gl"), roughnessMap: tex(id, "rough"),
  normalScale: new THREE.Vector2(normal, normal), roughness: 1, ...extra,
}), size);

// 布艺单独一份材质（默认和 furn / furn2 共用，那样冰箱、台面也会变成布纹）；颜色每帧跟着原材质走（上色动画）
const LINKED = [];
if (PBR) {
  // 墙：乳胶漆 = 颜色不变，只加石膏的细微起伏和粗糙度
  surface("white_plaster_02", 1.0, { normal: 0.5 }, MAT.wall);
  // 沙发、床头软包、坐垫、床品、地毯：亚麻布纹
  for (const [name, from, normal] of [["sofa", "furn2", 1.2], ["cushion", "furn", 1.0], ["bedding", "furn", 0.8]]) {
    MAT[name] = surface("rough_linen", 0.35, { normal, color: false }, MAT[from].clone());
    LINKED.push([MAT[name], MAT[from]]);
  }
  surface("rough_linen", 0.25, { normal: 1.5 }, MAT.fabric);
  // 第 3 轮：胡桃木家具带木纹（人眼高度近看，纯色木头太假）；颜色仍是配色里的 furnWood
  MAT.furnWood.userData.lumNorm = 0.0189; // wood_table_001 漫反射贴图的平均亮度（线性）
  surface("wood_table_001", 0.9, { color: true, normal: 0.5, roughness: 0.55 }, MAT.furnWood);
  MAT.furnWood.roughnessMap = null;
}
// 人眼高度用的家具（Blender 脚本建的模型：tools/blender/furniture.py + furniture_rooms.py → public/assets/hero/furniture.glb）
// 网格按材质名换成共享材质，跟着配色和上色动画走
const HERO_URL = "/assets/hero/furniture.glb";
// 床品的颜色跟软装配色走（和 Decor.jsx 的 D 同一套：预设的 decor，没有就用这里的默认）
const DEC = { duvet: "#f4efe7", sheet: "#fbf8f2", bedRunner: "#45413e", pillows: ["#45413e", "#efe7da", "#a5744b", "#6e4c34"], ...(MOOD?.decor || {}) };
// 墙砖：canvas 画颜色（每块砖一点深浅变化 + 砖缝）和高度（砖面平、边上一圈倒角、缝凹下去）→ 法线；按世界坐标贴（size = 一张图多少米）
function tileMaps(key, { cols, rows, grout, base, groutColor, vary, cloud = 0, bevel = 0.08 }) {
  const N = 1024, c = document.createElement("canvas"), h = document.createElement("canvas");
  c.width = c.height = h.width = h.height = N;
  const g = c.getContext("2d"), gh = h.getContext("2d");
  g.fillStyle = groutColor; g.fillRect(0, 0, N, N);
  gh.fillStyle = "#000"; gh.fillRect(0, 0, N, N);
  let seed = key.length * 7919;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tw = N / cols, th = N / rows, gp = grout * N, C = new THREE.Color(base), T = new THREE.Color();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * tw + gp / 2, y = j * th + gp / 2, w = tw - gp, hh = th - gp;
    T.copy(C).offsetHSL((rnd() - 0.5) * 0.01, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * vary);
    g.fillStyle = "#" + T.getHexString(); g.fillRect(x, y, w, hh);
    if (cloud) for (let k = 0; k < 14; k++) { // 石纹感：几团很淡的明暗
      const r = (0.2 + rnd() * 0.5) * Math.min(w, hh), cx = x + rnd() * w, cy = y + rnd() * hh, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = (rnd() - 0.5) * cloud; gr.addColorStop(0, a > 0 ? `rgba(255,255,255,${a})` : `rgba(60,50,40,${-a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.save(); g.beginPath(); g.rect(x, y, w, hh); g.clip(); g.fillStyle = gr; g.fillRect(x, y, w, hh); g.restore();
    }
    const b = bevel * Math.min(w, hh) * 0.25;  // 倒角：从边往里亮度渐变
    for (let k = 0; k < 6; k++) { const t = (k + 1) / 6; gh.fillStyle = `rgb(${255 * t},${255 * t},${255 * t})`; gh.fillRect(x + b * k / 6, y + b * k / 6, w - 2 * b * k / 6, hh - 2 * b * k / 6); }
  }
  const src = gh.getImageData(0, 0, N, N).data, out = gh.createImageData(N, N), d = out.data, H = (x, y) => src[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, L = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    d[o] = (-dx / L * 0.5 + 0.5) * 255; d[o + 1] = (dy / L * 0.5 + 0.5) * 255; d[o + 2] = (1 / L * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  gh.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(c), nrm = new THREE.CanvasTexture(h);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap: nrm };
}
const once = (k, f) => (HERO_MAT[k] ??= f());
const linenOf = (color, normal = 0.8) => surface("rough_linen", 0.35, { normal }, new THREE.MeshStandardMaterial({ color }));
const HERO_MAT = PBR ? {
  sofa: () => MAT.sofa, cushion: () => MAT.cushion, wood: () => MAT.furnWood, fabric: () => MAT.fabric, dark: () => MAT.dark,
  screen: () => once("_screen", () => new THREE.MeshStandardMaterial({ color: "#060708", roughness: 0.06, metalness: 0.0 })),
  metal: () => once("_metal", () => new THREE.MeshStandardMaterial({ color: "#2b2724", roughness: 0.4, metalness: 0.7 })),
  // 第 4 轮：其他房间的家具
  furn: () => once("_lacq", () => { const m = MAT.furn.clone(); m.roughness = 0.42; LINKED.push([m, MAT.furn]); return m; }), // 奶油色烤漆门板（衣柜、吊柜）
  headboard: () => MAT.sofa,
  duvet: () => once("_duvet", () => linenOf(DEC.duvet, 0.7)), sheet: () => once("_sheet", () => linenOf(DEC.sheet, 0.6)),
  runner: () => once("_runner", () => surface("waffle_pique_cotton", 0.22, { normal: 0.9 }, new THREE.MeshStandardMaterial({ color: DEC.bedRunner }))),
  pillowA: () => once("_pa", () => linenOf(DEC.pillows[0], 1.0)), pillowB: () => once("_pb", () => linenOf(DEC.pillows[3], 1.0)), pillowC: () => once("_pc", () => linenOf(DEC.pillows[2], 1.0)),
  stone: () => once("_stone", () => { const m = surface("marble_01", 0.9, { color: true, normal: 0.25, roughness: 0.22 }, new THREE.MeshStandardMaterial({ color: "#f7f2ea" })); m.roughnessMap = null; return m; }),
  tile: () => once("_tile", () => worldUV(new THREE.MeshStandardMaterial({ ...tileMaps("tile", { cols: 4, rows: 8, grout: 0.0035, base: "#f2ede3", groutColor: "#d8d0c3", vary: 0.035, bevel: 0.12 }), roughness: 0.16, normalScale: new THREE.Vector2(0.8, 0.8) }), 0.6)),
  tile2: () => once("_tile2", () => worldUV(new THREE.MeshStandardMaterial({ ...tileMaps("tile2-bath", { cols: 2, rows: 4, grout: 0.0022, base: "#cfc5b7", groutColor: "#beb3a4", vary: 0.03, cloud: 0.08, bevel: 0.03 }), roughness: 0.5, normalScale: new THREE.Vector2(0.6, 0.6) }), 1.2)),
  ceramic: () => once("_ceramic", () => new THREE.MeshStandardMaterial({ color: "#f4f2ed", roughness: 0.1 })),
  steel: () => once("_steel", () => new THREE.MeshStandardMaterial({ color: "#c9c9c8", roughness: 0.3, metalness: 1 })),
  glassblack: () => once("_gblack", () => new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 0.16, envMapIntensity: 0.55 })), // 灶台黑玻璃：窗户的倒影别太抢
  appliance: () => once("_appl", () => new THREE.MeshStandardMaterial({ color: "#eee8de", roughness: 0.32 })),
  mirror: () => once("_mirror", () => { const m = new THREE.MeshStandardMaterial({ color: "#f2f4f4", roughness: 0.02, metalness: 1 }); return BAKE_ON ? boxProjected(m) : m; }), // 镜子按房间盒子做视差校正
  showerglass: () => once("_sglass", () => new THREE.MeshStandardMaterial({ color: "#dfe8e8", roughness: 0.02, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false })),
  led: () => LED,
} : null;
function HeroPiece({ name }) {
  const { scene } = useGLTF(HERO_URL);
  const obj = useMemo(() => {
    const o = scene.getObjectByName(name).clone(true);
    o.position.set(0, 0, 0);
    o.traverse((m) => {
      if (!m.isMesh) return;
      const key = (m.material?.name || "").replace(/[.]\d+$/, "");
      if (HERO_MAT[key]) m.material = HERO_MAT[key]();
      m.castShadow = m.receiveShadow = true;
    });
    return o;
  }, [scene, name]);
  return <primitive object={obj} />;
}
export const Hero = (props) => <Suspense fallback={null}><HeroPiece {...props} /></Suspense>;
export function PbrSync() {
  useFrame(() => { for (const [m, from] of LINKED) m.color.copy(from.color); });
  return null;
}

// 地面：木地板（laminate_floor_02，一张 = 1.7 米）、瓷砖（marble_01，一张 = 1.5 米）
const FLOOR = {};
export function pbrFloorMaterial(kind) {
  if (!FLOOR[kind]) {
    FLOOR[kind] = kind === "wood"
      ? surface("laminate_floor_02", 1.7, { color: true, normal: 1, transparent: true })
      : surface("marble_01", 1.5, { color: true, normal: 1, transparent: true });
    // 氛围预设：木地板 tint 相乘（变暖、变深），lift 往某个颜色混（变浅）
    const f = MOOD?.floor;
    if (kind === "wood" && f?.tint) FLOOR[kind].color.set(f.tint);
    if (kind === "wood" && f?.lift) {
      const c = new THREE.Color(f.lift[0]);
      FLOOR[kind].userData.lift = { value: new THREE.Vector4(c.r, c.g, c.b, f.lift[1]) };
    }
  }
  return FLOOR[kind];
}

// ---------- 模型：茶几、绿植换成 Poly Haven 的 CC0 模型 ----------
export function Gltf({ url, rot = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    // 底面中心对到原点（家具的局部坐标约定）
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
    o.position.set(-c.x, -box.min.y, -c.z);
    const g = new THREE.Group();
    g.add(o);
    g.rotation.y = rot;
    g.scale.setScalar(scale);
    return g;
  }, [scene, rot, scale]);
  return <primitive object={obj} />;
}
export const M = (props) => <Suspense fallback={null}><Gltf {...props} /></Suspense>;
const CHAIRS = [[-0.4, -0.62, 0], [0.4, -0.62, 0], [-0.4, 0.62, Math.PI], [0.4, 0.62, Math.PI]];
export const MODEL_LIB = PBR ? {
  // 沙发、茶几、电视柜、餐桌椅：Blender 建模的那套（尺寸和 decor.js 的 FURN 一致）
  sofa: () => <Hero name="sofa" />,
  coffee: () => <Hero name="coffee" />,
  tv: () => <Hero name="tv" />,
  dining: () => <group><Hero name="dining" />{CHAIRS.map(([x, z, r], i) => <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}><Hero name="chair" /></group>)}</group>,
  // 第 4 轮：其他房间（床品是软装规则的 bedding 那一件，见 Decor.jsx；书桌的椅子用餐椅那把）
  bed15: () => <Hero name="bed15" />,
  bed18: () => <Hero name="bed18" />,
  wardrobe: () => <Hero name="wardrobe" />,
  desk: () => <group><Hero name="desk" /><group position={[0.06, 0, 0.5]} rotation={[0, Math.PI - 0.12, 0]}><Hero name="chair" /></group></group>,
  kitchen: () => <Hero name="kitchen" />,
  fridge: () => <Hero name="fridge" />,
  shower: () => <Hero name="shower" />,
  toilet: () => <Hero name="toilet" />,
  basin: () => <Hero name="basin" />,
  // 客厅角落一棵高的，阳台一盆矮的
  plant: ({ f }) => (f.at[1] > 8.4
    ? <M url={`${MOD}potted_plant_02/potted_plant_02_1k.gltf`} />
    : <M url={`${MOD}potted_plant_01/potted_plant_01_1k.gltf`} />),
} : null;

// 手办预设的书桌：同一张木地板贴图放大到一张 26 米（1:100 的模型旁边，桌面木纹就该这么大），调成浅橡木色；没开 pbr 就是纯色
export function deskMaterial() {
  if (!PBR) return new THREE.MeshStandardMaterial({ color: "#c9a57c", roughness: 0.6 });
  return surface("laminate_floor_02", 26, { color: true, normal: 0.5 }, new THREE.MeshStandardMaterial({ color: "#eadccb", roughness: 1 }));
}
