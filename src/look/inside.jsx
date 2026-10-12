// 第 3 轮：进到房子里（seq=final 最后一段 / view=eye&baked）用到的几样东西：
//   RiseSync      墙长高：全局剖切面和墙材质自己的剖切面跟着 store.rise 往上推（墙按满高建，顶上的盖板见 Walls.jsx 的 clipH）
//   BakedCeiling  天花板（每个房间一块，底面正好在墙顶 = FULL_CUT，和墙不重叠，光照贴图在墙角不出黑边）；参与烘焙
//   Exterior      窗外：天 + 城市，跟着 store.sky 淡入（第 4 轮的三个夜景方案见 night.jsx；n0 = 第 3 轮的方块楼）
//   Vestibule     入户门外的一小段公共走廊
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAT } from "../build/kit.jsx";
import { Fixture } from "./lamps.jsx";
import { NIGHT, NightExterior } from "./night.jsx";
import { SEQ, TOUR, lightAt } from "./look.js";
import { T_MERGE } from "./tour.js";
import { useScene } from "../store.js";
import { BU, SKY, skyUrl, BAKE_URL, BAKE_ON, BOXPROJ } from "./bake.js";

export const FULL_CUT = 2.8; // 进到屋里时的墙高 = 天花板底面（烘焙也按这个导出）

// ---------- 墙长高 ----------
const WALL_CLIP = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
export function RiseSync({ cut }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!SEQ) return;
    // 一开始就挂上（常数很大 = 不切），中途不用重新编译着色器
    gl.localClippingEnabled = true;
    MAT.wall.clippingPlanes = [WALL_CLIP];
    MAT.wall.clipShadows = true;
    MAT.wall.needsUpdate = true;
  }, [gl]);
  useFrame(() => {
    const r = useScene.getState().rise, h = cut + (FULL_CUT - cut) * r, P = gl.clippingPlanes[0];
    if (P) P.constant = r >= 1 ? 100 : h + 0.03;
    WALL_CLIP.constant = r > 0 && r < 1 ? h + 0.02 : 1000; // 和原来一样：墙顶盖板 2 厘米，全局剖切面再高 1 厘米
  });
  return null;
}

// ---------- 进到屋里的玻璃：不再是半透明的灰片，而是"看得穿、带一点反光"的玻璃 ----------
// 加法混合：输出 = 反射（环境探针 + 灯的高光，不乘透明度）+ 背后 × (1 − α)；玻璃本身的漫反射颜色压到黑（不然像蒙了一层雾）
const GLASS0 = { color: MAT.glass.color.clone(), env: MAT.glass.envMapIntensity, opacity: MAT.glass.opacity };
const BLACK = new THREE.Color(0, 0, 0);
// 盒投影（视差校正）：探针是在房间中间拍的，直接按方向查会把近处的东西在玻璃里放得很大；
// 改成先算反射线打到房间这个盒子的哪一点，再从探针位置看向那一点去查（第 4 轮：盒子和探针跟着相机所在的房间换，见 bake.js 的 pickProbe）
export { BOXPROJ };
export function boxProjected(mat) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey?.() || "";
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, BOXPROJ);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
      varying vec3 vBoxWorld;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
      vBoxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vBoxWorld;
      uniform float uBoxOn; uniform vec3 uBoxMin, uBoxMax, uProbePos;`)
      .replace("#include <envmap_physical_pars_fragment>", THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );",
        `reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
        if ( uBoxOn > 0.5 ) {
          vec3 rr = max( ( uBoxMax - vBoxWorld ) / reflectVec, ( uBoxMin - vBoxWorld ) / reflectVec );
          vec3 hitP = vBoxWorld + reflectVec * min( min( rr.x, rr.y ), rr.z );
          reflectVec = normalize( hitP - uProbePos );
        }`));
  };
  mat.customProgramCacheKey = () => key + "|box";
  mat.needsUpdate = true;
  return mat;
}
if (BAKE_ON) boxProjected(MAT.glass);
export function InsideSync() {
  useFrame(() => {
    const k = useScene.getState().inside, g = MAT.glass;
    const on = k > 0.5;
    if (on && g.blending !== THREE.CustomBlending) Object.assign(g, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation });
    if (!on && g.blending === THREE.CustomBlending) g.blending = THREE.NormalBlending;
    BOXPROJ.uBoxOn.value = on ? 1 : 0;
    if (on) { g.color.copy(GLASS0.color).lerp(BLACK, 0.92); g.envMapIntensity = 1.4; g.opacity = 0.08; }
    else if (g.envMapIntensity !== GLASS0.env) { g.color.copy(GLASS0.color); g.envMapIntensity = GLASS0.env; }
  });
  return null;
}

// ---------- 天花板 ----------
const CEIL = new THREE.MeshStandardMaterial({ color: "#f5f2ec", roughness: 0.92 });
export function BakedCeiling({ plan, h }) {
  return (
    <group>
      {plan.rooms.map(({ name, rect: [x0, z0, x1, z1] }) => (
        <mesh key={name} position={[(x0 + x1) / 2, h + 0.03, (z0 + z1) / 2]} material={CEIL} castShadow receiveShadow userData={{ bake: `ceil:${name}`, bakeCls: "static" }}>
          <boxGeometry args={[x1 - x0 + 0.24, 0.06, z1 - z0 + 0.24]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- 入户门外的一小段公共走廊（人眼漫游从门外进来；没有它，门洞里看出去是天）----------
// 外墙上的门（一侧没有房间）外面：沿墙 4 米长、1.8 米深，瓷砖地、白墙、天花板、对面一扇邻居家的门、顶上一盏吸顶灯；参与烘焙
const VEST_FLOOR = new THREE.MeshStandardMaterial({ color: "#d9d3c9", roughness: 0.6 });
// 第 5 轮的漫游成片里鸟瞰时就出现（store.vest 0 → 1 从地上长出来）；第 6 轮从屋顶降进来、不从门外进，store.vest 一直是 0（不出现）。天花板和吸顶灯跟着 store.ceil。
// 只改可见性、不增减网格，烘焙按名字对得上
export function Vestibule({ plan }) {
  const root = useRef(), tops = useRef([]), far = useRef([]), nb = useRef([]), lamp = useRef();
  useFrame(() => {
    const S = useScene.getState(), k = S.vest;
    if (root.current) { root.current.visible = k > 0.001; root.current.scale.y = Math.max(0.001, 1 - Math.pow(1 - k, 3)); }
    for (const o of tops.current) if (o) o.visible = !!S.ceil;
    // 漫游成片：走廊对面那堵墙（门正对着的）一直保持剖切高度，镜头从门外上空扎下来时它不挡；进门以后它在身后，看不到
    const low = TOUR && (S.tourT ?? 0) < T_MERGE + 0.5;
    for (const o of far.current) if (o) { o.scale.y = low ? 1.59 / (FULL_CUT + 0.12) : 1; o.position.y = low ? 0.735 : FULL_CUT / 2; }
    for (const o of nb.current) if (o) o.visible = !low; // 对面邻居家的门跟着那堵墙一起收起来（不然门框浮在矮墙上面）
    // 走廊的灯：鸟瞰（实时光）的夜里也亮着，和屋里一样暖；换成烘焙光照以后静态物体不吃实时漫反射
    if (lamp.current) lamp.current.intensity = TOUR ? 2.2 * lightAt(S.tod).lamps * (1 - S.bake) : 0; // 烘焙接管以后关掉（点光源不投影，会穿墙照进屋）
  });
  const doors = useMemo(() => {
    const at = (x, z) => plan.rooms.find((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]);
    const out = [];
    for (const w of plan.walls) for (const o of plan.openings.filter((o) => o.wall === w.id && o.type === "door")) {
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      const cx = w.a[0] + ux * o.at, cz = w.a[1] + uz * o.at;
      const s = !at(cx + nx * 0.4, cz + nz * 0.4) ? 1 : !at(cx - nx * 0.4, cz - nz * 0.4) ? -1 : 0;
      if (s) out.push({ cx, cz, t: w.t, rot: Math.atan2(nx * s, nz * s), w: o.w });
    }
    return out;
  }, [plan]);
  return <group ref={root}>{doors.map((d, i) => {
    const z0 = d.t / 2, D = 1.8, L = 4, H = FULL_CUT;
    return (
      <group key={i} position={[d.cx, 0, d.cz]} rotation={[0, d.rot, 0]}>
        <group userData={{ bake: `vest:${i}`, bakeCls: "static" }}>
          <mesh material={VEST_FLOOR} position={[0, 0.001, z0 + D / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[L, D]} /></mesh>
          <mesh ref={(o) => (far.current[i] = o)} material={MAT.wall} position={[0, H / 2, z0 + D + 0.1]} receiveShadow castShadow><boxGeometry args={[L + 0.4, H + 0.12, 0.2]} /></mesh>
          {[-1, 1].map((s) => <mesh key={s} material={MAT.wall} position={[s * (L / 2 + 0.1), H / 2, z0 + D / 2]} receiveShadow castShadow><boxGeometry args={[0.2, H + 0.12, D]} /></mesh>)}
          <mesh ref={(o) => (tops.current[2 * i] = o)} material={CEIL} position={[0, H + 0.03, z0 + D / 2]} receiveShadow castShadow><boxGeometry args={[L + 0.4, 0.06, D + 0.2]} /></mesh>
          {/* 对面邻居家的门：胡桃木门板 + 深色门框 + 拉手 */}
          <mesh ref={(o) => (nb.current[3 * i] = o)} material={MAT.frame} position={[0.9, 1.07, z0 + D - 0.01]}><boxGeometry args={[1.06, 2.14, 0.02]} /></mesh>
          <mesh ref={(o) => (nb.current[3 * i + 1] = o)} material={MAT.furnWood} position={[0.9, 1.04, z0 + D - 0.03]}><boxGeometry args={[0.94, 2.06, 0.03]} /></mesh>
          <mesh ref={(o) => (nb.current[3 * i + 2] = o)} material={MAT.dark} position={[0.55, 1.0, z0 + D - 0.06]}><boxGeometry args={[0.03, 0.22, 0.02]} /></mesh>
        </group>
        <group ref={(o) => (tops.current[2 * i + 1] = o)} position={[0, 0, z0 + D / 2]} userData={{ bake: `vestlamp:${i}`, bakeCls: "dynamic", lamp: "ceil" }}><Fixture kind="ceil" /></group>
        {TOUR && i === 0 && <pointLight ref={lamp} position={[0, FULL_CUT - 0.45, z0 + D / 2]} color="#ffb36b" intensity={0} distance={4.5} decay={2} />}
      </group>
    );
  })}</group>;
}

// ---------- 窗外 ----------
const CHUNKS = { vt: "#include <common>\n#include <logdepthbuf_pars_vertex>", ft: "#include <common>\n#include <logdepthbuf_pars_fragment>", end: "#include <tonemapping_fragment>\n#include <colorspace_fragment>" };
// 天空：跟着相机走的大球，按方向算等距柱状投影的 UV（和 three.js 的背景、Blender 的世界贴图同一个约定），绕竖轴转 SKY.rot 度
const skyMat = () => new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, k: { value: 1 }, opacity: { value: 0 }, rot: { value: (SKY.rot * Math.PI) / 180 } },
  vertexShader: `${CHUNKS.vt}
    varying vec3 vDir;
    void main() {
      vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    uniform sampler2D map; uniform float k, opacity, rot; varying vec3 vDir;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 d = normalize(vDir);
      float c = cos(rot), s = sin(rot);
      d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
      vec2 uv = vec2(atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
      gl_FragColor = vec4(min(texture2D(map, uv).rgb, vec3(24.0)) * k, opacity);
      ${CHUNKS.end}
    }`,
  transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
});

// 楼群：一圈方块楼（离客厅 120–340 米，楼底在 22 米下面——假设这套房在 7 楼），立面贴一张随机亮灯的窗格图；
// 越远越往地平线的雾色里混（haze），楼顶不画窗
function windowsTexture() {
  const N = 32, C = 16, c = document.createElement("canvas");
  c.width = c.height = N * C;
  const g = c.getContext("2d");
  g.fillStyle = "#12161f"; g.fillRect(0, 0, N * C, N * C);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = rnd();
    g.fillStyle = r < 0.1 ? "#ffcf8f" : r < 0.13 ? "#fff1d8" : r < 0.16 ? "#cfe0ff" : r < 0.5 ? "#232b3a" : "#1a202c";
    g.fillRect(x * C + 4, y * C + 3, C - 8, C - 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function skylineGeometry(center) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const parts = [], CELL = 3.3, ATLAS = 32;
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2, R = 520 + Math.pow(rnd(), 0.8) * 900;
    const w = 18 + rnd() * 40, d = 16 + rnd() * 34, tower = rnd() < 0.1, h = tower ? 90 + rnd() * 80 : 18 + rnd() * 55, base = -22;
    const g = new THREE.BoxGeometry(w, h + 40, d).toNonIndexed(); // 往地下多伸 40 米，楼底不会露出来
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, ou = Math.floor(rnd() * ATLAS), ov = Math.floor(rnd() * ATLAS);
    const haze = new Float32Array(p.count).fill(Math.min(0.9, 0.25 + (R - 520) / 1100));
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), ny = n.getY(k);
      if (Math.abs(ny) > 0.5) uv.setXY(k, 0.001, 0.001); // 楼顶、楼底：窗格图的边框（暗）
      else uv.setXY(k, (ou + (Math.abs(n.getX(k)) > 0.5 ? z : x) / CELL) / ATLAS, (ov + (y + (h + 40) / 2) / CELL) / ATLAS);
    }
    g.rotateY(rnd() * Math.PI);
    g.translate(center[0] + Math.cos(a) * R, base - 40 + (h + 40) / 2, center[2] + Math.sin(a) * R);
    g.setAttribute("haze", new THREE.BufferAttribute(haze, 1));
    parts.push(g);
  }
  return mergeGeometries(parts);
}
const cityMat = (map) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map }, hazeColor: { value: new THREE.Color(0.1, 0.135, 0.2) }, k: { value: 1 }, opacity: { value: 0 } },
  vertexShader: `${CHUNKS.vt}
    attribute float haze; varying float vHaze; varying vec2 vUv;
    void main() {
      vHaze = haze; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    uniform sampler2D map; uniform vec3 hazeColor; uniform float k, opacity; varying float vHaze; varying vec2 vUv;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 c = texture2D(map, vUv).rgb * 0.9;
      gl_FragColor = vec4(mix(c, hazeColor, vHaze) * k, opacity);
      ${CHUNKS.end}
    }`,
  transparent: true, fog: false,
});

// 地面：楼群脚下一大块暗色的地，越远越混进地平线的雾色
const groundMat = () => new THREE.ShaderMaterial({
  uniforms: { near: { value: new THREE.Color(0.03, 0.036, 0.052) }, far: { value: new THREE.Color(0.1, 0.135, 0.2) }, k: { value: 1 }, opacity: { value: 0 }, center: { value: new THREE.Vector2(3, 6) } },
  vertexShader: `${CHUNKS.vt}
    varying vec2 vXZ;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    uniform vec3 near, far; uniform float k, opacity; uniform vec2 center; varying vec2 vXZ;
    void main() {
      #include <logdepthbuf_fragment>
      float d = length(vXZ - center), hz = smoothstep(120.0, 1300.0, d);
      // 街灯：每 22 米一格，格子里随机一个点亮一盏（暖色为主，少数冷白），远了混进雾里
      vec2 cell = floor(vXZ / 34.0), f = vXZ / 34.0 - cell;
      vec2 h = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
      vec2 dd = (f - (0.2 + 0.6 * h)) * 34.0;
      float r = length(dd / max(fwidth(vXZ), vec2(0.001)));           // 按屏幕像素算的半径：远处也是一个小点，不会被透视压成长条
      float lamp = (1.0 - smoothstep(0.6, 1.4, r)) * step(0.82, h.x) * (1.0 - hz * 0.9);
      vec3 lc = h.y > 0.85 ? vec3(0.8, 0.9, 1.0) : vec3(1.0, 0.62, 0.3);
      gl_FragColor = vec4((mix(near, far, hz) + lc * lamp * 1.6) * k, opacity);
      ${CHUNKS.end}
    }`,
  transparent: true, fog: false,
});

// 第 4 轮：夜景换成 night.jsx 的三个方案（&night=n1|n2|n3，默认 n3）；n0 = 下面这套第 3 轮的方块楼
export const Exterior = (props) => (NIGHT === "n0" ? <BoxCityExterior {...props} /> : <NightExterior {...props} />);
function BoxCityExterior() {
  const sky = useRef(), city = useRef(), ground = useRef();
  const camera = useThree((s) => s.camera);
  const mats = useMemo(() => ({ sky: skyMat(), city: cityMat(windowsTexture()), ground: groundMat() }), []);
  const cityGeo = useMemo(() => skylineGeometry([3, 0, 6]), []);
  useEffect(() => {
    const use = (t, rot) => { t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; mats.sky.uniforms.map.value = t; mats.sky.uniforms.rot.value = rot; };
    // 优先用烘焙时调好色、转好方向的那张（和照亮屋里的天完全一样）；没有就用原始 HDRI
    new EXRLoader().load(BAKE_URL + "sky.exr", (t) => use(t, 0), undefined, () =>
      new HDRLoader().load(skyUrl(), (t) => use(t, (SKY.rot * Math.PI) / 180), undefined, () => console.warn("[exterior] 没找到天空 HDRI：node tools/fetch-assets.mjs")));
  }, [mats]);
  useFrame(() => {
    const a = useScene.getState().sky, on = a > 0.001 && !!mats.sky.uniforms.map.value;
    sky.current.visible = city.current.visible = ground.current.visible = on;
    // 远处的城市在 500–1400 米：进到屋里时把相机的远裁剪面放远（鸟瞰时保持原来的 400 米）
    const far = on ? 3000 : 400;
    if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
    if (!on) return;
    sky.current.position.copy(camera.position);
    mats.sky.uniforms.opacity.value = mats.city.uniforms.opacity.value = mats.ground.uniforms.opacity.value = a;
    mats.ground.uniforms.k.value = BU.uBakeScale.value;
    mats.sky.uniforms.k.value = SKY.strength * BU.uBakeScale.value;
    mats.city.uniforms.k.value = BU.uBakeScale.value;
  });
  return (
    <group>
      <mesh ref={sky} material={mats.sky} renderOrder={-100} frustumCulled={false}><sphereGeometry args={[2400, 48, 24]} /></mesh>
      <mesh ref={ground} material={mats.ground} renderOrder={-95} rotation={[-Math.PI / 2, 0, 0]} position={[3, -22, 6]} frustumCulled={false}><circleGeometry args={[2300, 64]} /></mesh>
      <mesh ref={city} geometry={cityGeo} material={mats.city} renderOrder={-90} frustumCulled={false} />
    </group>
  );
}
