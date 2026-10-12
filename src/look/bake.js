// 烘焙光照（第 3 轮）：人眼高度的客厅用 Blender（Cycles）烘好的光照贴图，不再靠实时光。
//
// 流程（三步，都有脚本，见 README 的"烘焙光照"一节）：
//   1. 导出：node tools/bake-export.mjs —— 打开 ?look=pro&pbr&view=eye&bake=export，调 window.__bakeExport()，
//      把整套房子（满层高 + 天花板 + 家具 + 软装）按世界坐标导成 GLB，外加 meta.json（每个物体的名字、静态 / 动态、灯的位置、天空）
//   2. 烘焙：blender -b -P tools/blender/bake.py —— 给静态物体展第二套 UV（光照贴图），挂暖色点光源（灯罩透光）+ 蓝调天空 HDRI，
//      烘漫反射（直射 + 反弹，不含颜色），OIDN 降噪，修掉墙里 / 地板下的无效像素，存 EXR；再从客厅中间渲一张全景当反射 / 环境探针
//   3. 加载（这里）：按名字找到场景里对应的网格，换成带第二套 UV 的几何体，材质打补丁：
//      漫反射 = 反照率 × 光照贴图（实时的直射漫反射、环境漫反射按 uBake 淡出），高光照旧（点光源 + 探针），所以 PBR 质感还在
//
// 静态（烘光照贴图）：墙、地板、楼板、天花板、栏板、家具、地毯、窗帘、沙发抱枕、床品、边几、休闲椅、阳台桌椅；
// 动态（只当遮挡物参与烘焙，自己靠探针 + 实时灯照亮）：灯具、绿植、花瓶、书、摆件、挂画、门窗；玻璃不参与烘焙。
// 物体的名字来自组件挂的 userData.bake（墙 wall:N:0、家具 furn:3、软装 decor:12……）+ 组里第几个网格，导出和加载时按同样的规则数。
import * as THREE from "three";
import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { BAKED_VIEW, BAKE_EXPORT, PBR, SEQ, TOUR } from "./look.js";
import { MAT } from "../build/kit.jsx";
import { SHADE, BULB, LED } from "./lamps.jsx";
import { useScene } from "../store.js";

const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
// 成片时间线也加载烘焙结果（推进客厅那段用）；&nobake 关掉
export const BAKE_ON = BAKED_VIEW || (SEQ && PBR && !q.has("nobake"));
// 第 5 轮（漫游成片、人眼烘焙视角）：门按 doors.jsx 的规则开着烘的那套（<plan>-m5）；seq=r4 用第 4 轮那套（<plan>-m3，门开 70° 朝客厅）
export const BAKE_SET = q.get("bakeset") || `${q.get("plan") || "demo"}-${TOUR || BAKED_VIEW ? "m5" : "m3"}`;
export const BAKE_URL = `/bake/${BAKE_SET}/`;
// 窗外的天：Poly Haven 的蓝调纯天空（CC0），烘焙和背景用同一张、同一个方向和强度（Blender 那边从 meta.json 读）
export const SKY = {
  id: "qwantani_moonrise_puresky", res: "2k",
  rot: Number(q.get("skyrot") ?? 126),    // 绕竖轴转多少度（月亮转到北边、身后；阳台外是干净的蓝调渐变）
  strength: Number(q.get("skyk") ?? 1.0),  // 天空亮度倍数（烘焙和背景一起乘）
};
export const skyUrl = () => `/assets/polyhaven/hdri/${SKY.id}/${SKY.id}_${SKY.res}.hdr`;
// 探针（客厅中间、1.35 米高）和导出时的参考机位
export const PROBE = [3.0, 1.35, 6.3];
// 第 4 轮：每个房间一个探针（房间中心、1.4 米高），相机在哪个房间就用哪个房间的（反射、动态小物件的环境光）；
// 玻璃、镜子按所在房间的盒子做视差校正（BOXPROJ，inside.jsx 的 boxProjected 用）
export const roomProbes = (plan, h = 2.8) => plan.rooms.map((r, i) => {
  const [x0, z0, x1, z1] = r.rect;
  return { i, room: r.name, rect: r.rect, pos: [+((x0 + x1) / 2).toFixed(3), 1.4, +((z0 + z1) / 2).toFixed(3)], box: [x0 + 0.06, 0, z0 + 0.06, x1 - 0.06, h, z1 - 0.06], file: `probe-${i}.exr` };
});
export const BOXPROJ = { uBoxOn: { value: 0 }, uBoxMin: { value: new THREE.Vector3(0.12, 0, 3.66) }, uBoxMax: { value: new THREE.Vector3(5.94, 2.8, 8.4) }, uProbePos: { value: new THREE.Vector3(...PROBE) } };

// 共享 uniform：uBake 光照从实时（0）过渡到烘焙（1）；uBakeMap 光照贴图；uBakeScale 光照贴图整体亮度
export const BU = { uBake: { value: BAKED_VIEW ? 1 : 0 }, uBakeMap: { value: null }, uBakeScale: { value: Number(q.get("lmk") ?? 1) } };
// 进到屋里（烘焙光照）时的曝光
export const BAKE_EXP = Number(q.get("bexp") ?? 1.15);
export const BAKE = { ready: false, done: false, meta: null, probe: null, missing: [], applied: 0 };

// ---------- 场景里要烘焙的网格：按 userData.bake 分组，组内按遍历顺序编号 ----------
export function bakeMeshes(scene) {
  const out = [], count = new Map();
  const walk = (o, key, cls, vis) => {
    vis = vis && o.visible;
    if (o.userData?.bake) { key = o.userData.bake; cls = o.userData.bakeCls || "static"; }
    else if (o.userData?.bakeCls) cls = o.userData.bakeCls; // 组里个别网格改成动态（比如沙发上的抱枕：曲面又和靠垫穿插，光照贴图容易花）
    if (o.isMesh && key) {
      const n = count.get(key) || 0;
      count.set(key, n + 1);
      out.push({ mesh: o, id: `${key}/${n}`, cls, vis });
    }
    for (const c of o.children) walk(c, key, cls, vis);
  };
  walk(scene, null, null, true);
  return out;
}
const matOf = (m) => (Array.isArray(m.material) ? m.material[0] : m.material);
const isGlass = (m) => m === MAT.glass || m.transmission > 0 || (m.transparent && m.opacity < 0.5 && !(m.alphaTest > 0) && !m.map);

// ---------- 导出（bake=export 页面上调用） ----------
const WORLD_UV = new THREE.Vector3(), WORLD_N = new THREE.Vector3();
function worldUV(g, size) { // 和 pbr.jsx 的 worldUV 着色器同一条规则：朝哪个轴就用另外两个轴当 UV
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    WORLD_UV.fromBufferAttribute(p, i); WORLD_N.fromBufferAttribute(n, i);
    const ax = Math.abs(WORLD_N.x), ay = Math.abs(WORLD_N.y), az = Math.abs(WORLD_N.z);
    const [u, v] = ay > 0.5 ? [WORLD_UV.x, WORLD_UV.z] : ax > az ? [WORLD_UV.z, WORLD_UV.y] : [WORLD_UV.x, WORLD_UV.y];
    uv[2 * i] = u / size; uv[2 * i + 1] = v / size;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export async function exportBake() {
  const { scene, camera, controls } = window.__three, plan = window.__plan, decor = window.__decor || [];
  scene.updateMatrixWorld(true);
  const list = bakeMeshes(scene), root = new THREE.Group(), mats = new Map(), meshes = [];
  const box = new THREE.Box3(), c = new THREE.Vector3();
  for (const { mesh, id, cls, vis } of list) {
    const m = matOf(mesh);
    if (!vis || !m || isGlass(m) || !mesh.geometry?.attributes.position) continue;
    const kind = m === SHADE ? "SHADE" : m === BULB ? "BULB" : cls;
    const g0 = mesh.geometry, g = new THREE.BufferGeometry();
    g.setAttribute("position", g0.attributes.position.clone());
    if (g0.attributes.normal) g.setAttribute("normal", g0.attributes.normal.clone()); else g.computeVertexNormals();
    if (g0.attributes.uv) g.setAttribute("uv", g0.attributes.uv.clone());
    if (g0.index) g.setIndex(g0.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    if (mesh.matrixWorld.determinant() < 0) { // 镜像变换会把三角形绕向翻过来
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    }
    if (m.userData?.worldUV) worldUV(g, m.userData.worldUV);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    // 导出用的材质：只留反照率（颜色 + 颜色贴图）、粗糙度、透明 / 镂空、双面；灯罩、灯泡单独命名，Blender 里换成透光材质 / 删掉
    if (!mats.has(m)) {
      const e = new THREE.MeshStandardMaterial({ color: m.color || new THREE.Color(1, 1, 1), roughness: m.roughness ?? 1, metalness: m.metalness ?? 0, side: m.side });
      if (m.map?.image && !m.userData?.lumNorm) e.map = m.map; // 木纹（只取明暗）不导出贴图，反照率就是配色
      if (m.alphaTest > 0) e.alphaTest = m.alphaTest;
      if (m.alphaTest > 0 || (m.transparent && m.opacity < 0.99)) { e.transparent = m.alphaTest > 0 ? false : true; e.opacity = m.opacity; }
      e.name = kind === "SHADE" || kind === "BULB" ? kind : m === LED ? `LED${mats.size}` : `mat${mats.size}`; // 灯带：Blender 里换成自发光
      mats.set(m, e);
    }
    const name = `m${String(meshes.length).padStart(4, "0")}`;
    const o = new THREE.Mesh(g, mats.get(m));
    o.name = name;
    root.add(o);
    box.setFromBufferAttribute(g.attributes.position).getCenter(c);
    // dk：软装的种类（Blender 渲探针时把离探针近的灯具藏起来，不然吊灯在玻璃里的倒影大得离谱）
    const di = /^decor:(\d+)$/.exec(id.split("/")[0]), dk = di ? decor[Number(di[1])]?.kind : undefined;
    meshes.push({ name, id, cls: kind, dk, c: c.toArray().map((x) => +x.toFixed(3)), v: g0.attributes.position.count, m: mesh.matrixWorld.elements.map((x) => +x.toFixed(6)) });
  }
  // 灯：软装规则里 kind = lamp 的每一条，灯泡（或灯笼的灯罩）的世界坐标；厨房、卫生间的顶灯贴着天花板
  const lamps = [];
  decor.forEach((d, i) => {
    if (d.kind !== "lamp") return;
    const hit = list.filter((e) => e.id.startsWith(`decor:${i}/`));
    const bulb = hit.find((e) => matOf(e.mesh) === BULB) || hit.find((e) => matOf(e.mesh) === SHADE);
    const p = bulb ? bulb.mesh.getWorldPosition(new THREE.Vector3()).toArray() : [d.x, plan.height - 0.12, d.z];
    lamps.push({ style: d.style, room: d.room, pos: p.map((v) => +v.toFixed(4)) });
  });
  // 不在软装清单里的灯（入户门外走廊的吸顶灯）：组上挂 userData.lamp
  scene.traverse((o) => {
    if (!o.userData?.lamp || !o.visible) return;
    let bulb = null;
    o.traverse((m) => { if (m.isMesh && matOf(m) === BULB) bulb = m; });
    lamps.push({ style: o.userData.lamp, room: o.userData.bake, pos: (bulb || o).getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(4)) });
  });
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 512, onlyVisible: false });
  let bin = "";
  const u8 = new Uint8Array(glb);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  const meta = {
    plan: q.get("plan"), set: BAKE_SET, height: plan.height, cut: Number(q.get("cut") || 2.8), created: new Date().toISOString(),
    meshes, lamps, sky: SKY, probe: PROBE, probes: roomProbes(plan),
    camera: { pos: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov, aspect: camera.aspect },
  };
  return { glb: btoa(bin), meta: JSON.stringify(meta), bytes: u8.length, n: meshes.length, static: meshes.filter((x) => x.cls === "static").length };
}
if (BAKE_EXPORT && typeof window !== "undefined") window.__bakeExport = exportBake;

// ---------- 加载 + 套用 ----------
// 材质补丁：漫反射换成 反照率 × 光照贴图（按 uBake 和实时的混合），高光不动
function patch(sh) {
  Object.assign(sh.uniforms, BU);
  sh.vertexShader = sh.vertexShader
    .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec2 vBakeUv;")
    .replace("#include <uv_vertex>", "#include <uv_vertex>\nvBakeUv = vec2( uv1.x, 1.0 - uv1.y );"); // glTF 的 v 从上往下数，EXR 贴图从下往上
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <uv_pars_fragment>", "#include <uv_pars_fragment>\nvarying vec2 vBakeUv;\nuniform sampler2D uBakeMap;\nuniform float uBake;\nuniform float uBakeScale;")
    .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      {
        vec3 bakeL = texture2D( uBakeMap, vBakeUv ).rgb * uBakeScale;
        reflectedLight.directDiffuse *= ( 1.0 - uBake );
        reflectedLight.indirectDiffuse = mix( reflectedLight.indirectDiffuse, material.diffuseContribution * bakeL, uBake );
      }`);
}
// 烘焙用的材质是原材质的克隆（同一份材质也给动态物体用，它们没有第二套 UV）；颜色、透明度、剖切面每帧从原材质同步
const CLONES = new Map();
function bakedMat(m) {
  if (Array.isArray(m)) return m.map(bakedMat);
  if (CLONES.has(m)) return CLONES.get(m);
  const c = m.clone(), prev = m.onBeforeCompile, key = m.customProgramCacheKey?.() || "";
  c.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); patch(sh); };
  c.customProgramCacheKey = () => key + "|baked";
  c.clippingPlanes = m.clippingPlanes;
  c.userData = { ...m.userData, bakedFrom: m };
  CLONES.set(m, c);
  return c;
}
function syncClones() {
  for (const [m, c] of CLONES) {
    c.color?.copy(m.color);
    c.opacity = m.opacity; c.transparent = m.transparent; c.visible = m.visible;
    if (m.emissive) { c.emissive.copy(m.emissive); c.emissiveIntensity = m.emissiveIntensity; }
    c.clippingPlanes = m.clippingPlanes; c.clipShadows = m.clipShadows;
    if (c.map !== m.map) { c.map = m.map; c.needsUpdate = true; }
  }
}

let loading = null;
async function loadBake(gl) {
  const meta = await fetch(BAKE_URL + "meta.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!meta) { console.warn(`[bake] 没找到 ${BAKE_URL}meta.json：先跑 tools/bake-export.mjs 和 tools/blender/bake.py，现在用实时光`); return null; }
  const exr = (f) => new EXRLoader().loadAsync(BAKE_URL + f);
  const rooms = meta.probes?.length ? meta.probes : null;
  const [gltf, lm, ...probes] = await Promise.all([
    new GLTFLoader().loadAsync(BAKE_URL + "lm.glb"),
    exr("lightmap.exr"),
    ...(rooms ? rooms.map((r) => exr(r.file).catch(() => null)) : [exr("probe.exr")]),
  ]);
  for (const t of [lm]) { t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true; }
  BU.uBakeMap.value = lm;
  const pm = new THREE.PMREMGenerator(gl);
  const env = (t) => { if (!t) return null; t.mapping = THREE.EquirectangularReflectionMapping; return pm.fromEquirectangular(t).texture; };
  if (rooms) BAKE.probes = rooms.map((r, i) => ({ ...r, tex: env(probes[i]) })).filter((r) => r.tex);
  BAKE.probe = BAKE.probes?.[0]?.tex || env(probes[0]);
  pm.dispose();
  gltf.scene.updateMatrixWorld(true);
  const geos = new Map();
  gltf.scene.traverse((o) => { if (o.isMesh) geos.set(o.name, o.geometry.clone().applyMatrix4(o.matrixWorld)); });
  const byId = new Map(meta.meshes.filter((e) => e.cls === "static").map((e) => [e.id, e]));
  Object.assign(BAKE, { meta, geos, byId, ready: true });
  console.log(`[bake] ${BAKE_SET}：${byId.size} 个静态物体，光照贴图 ${lm.image.width}×${lm.image.height}`);
  return BAKE;
}

// 把场景里还没换过的静态网格换成烘焙版（几何体从导出时的世界坐标转回本地坐标）；组件重新挂载出来的新网格下一帧会补上
const APPLIED = new WeakSet(), INV = new THREE.Matrix4();
function applyBake(scene) {
  let n = 0;
  for (const { mesh, id, cls } of bakeMeshes(scene)) {
    if (cls !== "static" || APPLIED.has(mesh)) continue;
    APPLIED.add(mesh);
    const e = BAKE.byId.get(id), g = e && BAKE.geos.get(e.name);
    if (!e || !g || e.v !== mesh.geometry.attributes.position.count) { if (!isGlass(matOf(mesh))) BAKE.missing.push(id); continue; }
    mesh.geometry = g.clone().applyMatrix4(INV.fromArray(e.m).invert());
    mesh.material = bakedMat(mesh.material);
    n++;
  }
  BAKE.applied += n;
  return n;
}

// 相机在哪个房间就用那个房间的探针（不在任何房间里——比如还在鸟瞰、在门外走廊——就用客厅的），盒投影的盒子换成这个房间。
// 第 5 轮：走过门口不再一下子跳——每个房间按相机离房间边界的有符号距离给权重（进屋 0.45 米以上 = 1，正好在门口两边各一半），
// 取最大的两个，用一个全屏小 pass 把两张探针（同尺寸的 PMREM 图集）按权重混成一张当 scene.environment；玻璃的盒投影参数也按权重插值
const BLEND = { rt: null, mat: null, scene: null, cam: null, a: null, b: null, k: -1 };
function blendProbes(gl, A, B, k) {
  if (!BLEND.rt) {
    const { width, height } = A.tex.image;
    BLEND.rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    BLEND.rt.texture.mapping = THREE.CubeUVReflectionMapping;
    BLEND.rt.texture.colorSpace = A.tex.colorSpace;
    BLEND.mat = new THREE.ShaderMaterial({
      uniforms: { a: { value: null }, b: { value: null }, k: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: "uniform sampler2D a, b; uniform float k; varying vec2 vUv; void main() { gl_FragColor = mix(texture2D(a, vUv), texture2D(b, vUv), k); }",
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    BLEND.scene = new THREE.Scene();
    BLEND.scene.add(Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), BLEND.mat), { frustumCulled: false }));
    BLEND.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  if (BLEND.a !== A || BLEND.b !== B || Math.abs(BLEND.k - k) > 1e-4) {
    Object.assign(BLEND, { a: A, b: B, k });
    BLEND.mat.uniforms.a.value = A.tex; BLEND.mat.uniforms.b.value = B.tex; BLEND.mat.uniforms.k.value = k;
    const prev = gl.getRenderTarget(), clip = gl.clippingPlanes;
    gl.clippingPlanes = [];
    gl.setRenderTarget(BLEND.rt); gl.render(BLEND.scene, BLEND.cam); gl.setRenderTarget(prev);
    gl.clippingPlanes = clip;
  }
  return BLEND.rt.texture;
}
const sm = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
function pickProbe(p, gl) {
  if (!BAKE.probes?.length) return;
  const living = BAKE.probes.find((r) => /客|厅|living/i.test(r.room)) || BAKE.probes[0];
  const ws = BAKE.probes.map((r) => ({ r, w: sm((Math.min(p.x - r.rect[0], r.rect[2] - p.x, p.z - r.rect[1], r.rect[3] - p.z) + 0.45) / 0.9) })).sort((a, b) => b.w - a.w);
  let A = ws[0].r, B = ws[1]?.r || A, k = ws[0].w + (ws[1]?.w || 0) > 1e-3 ? (ws[1]?.w || 0) / (ws[0].w + (ws[1]?.w || 0)) : 0;
  if (ws[0].w < 1e-3) { A = B = living; k = 0; }
  if (k < 1e-3) B = A;
  BAKE.cur = A; BAKE.probe = blendProbes(gl, A, B, k);
  const L = (i) => A.box[i] + (B.box[i] - A.box[i]) * k;
  BOXPROJ.uBoxMin.value.set(L(0), L(1), L(2)); BOXPROJ.uBoxMax.value.set(L(3), L(4), L(5));
  BOXPROJ.uProbePos.value.set(...A.pos.map((v, i) => v + (B.pos[i] - v) * k));
}
// 挂在 Canvas 里：加载烘焙结果，每隔几帧把新出现的静态网格换掉；uBake 跟着 store.bake；探针在 uBake 过半时接管环境光
export function BakeSync() {
  const { gl, scene } = useThree();
  useEffect(() => {
    if (!BAKE_ON || BAKE_EXPORT) return;
    loading ??= loadBake(gl).catch((e) => console.error("[bake] 加载失败", e)).finally(() => (BAKE.done = true));
    window.__bake = BAKE;
  }, [gl]);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (!BAKE.ready) return;
    const k = useScene.getState().bake;
    BU.uBake.value = k;
    applyBake(scene); // 每帧查一遍新挂载的静态网格（遍历一千来个物体，不到 1 毫秒）
    syncClones();
    pickProbe(camera.position, gl);
    if (k >= 0.5 && scene.environment !== BAKE.probe) { if (!BAKE.inside) BAKE.prevEnv = scene.environment; BAKE.inside = true; scene.environment = BAKE.probe; }
    else if (k < 0.5 && BAKE.inside) { BAKE.inside = false; scene.environment = BAKE.prevEnv; }
    if (k >= 0.5) scene.environmentIntensity = BU.uBakeScale.value; // 探针和光照贴图同一个单位（都是 Blender 里的辐射亮度）
  });
  return null;
}
// 截图 / 录像等烘焙就绪：没开烘焙、或者加载试过了（成功或没找到文件）就算就绪
export const bakeReady = () => !BAKE_ON || BAKE_EXPORT || BAKE.done;
