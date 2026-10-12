// 第 4 轮：窗外 / 阳台的夜景（漫游的最后一个镜头站在阳台上看城市），三个可切换的方案，网址 &night=：
//   n1  程序生成的城市（第 2 版）：近 / 中 / 远三层楼（近处 60–250 米、中间 250–800 米、远处到 2.2 公里，正南方向一簇高楼当天际线），
//       楼有退台、塔冠、圆楼、屋顶设备；窗格按每栋楼自己的层高、开间算，亮灯不规则（整层亮 / 整层暗、暖白冷白混着），远了按像素大小换成平均色不闪；
//       越远越往地平线的雾色里混；地面是路网（主路、支路、路灯一排排、主路上车灯红白两道），远处地平线上一层闪烁的光点；天是烘焙用的蓝调天空
//   n2  Poly Haven 的上海外滩夜景 HDRI（CC0）当背景板：天际线转到正南、天空调成和屋里烘焙一样的蓝（tools/blender/night_plate.py）；
//       HDRI 是在江边地面拍的（下半张是步道和人），地平线以下换成江面（天际线的倒影）+ 楼前 140 米的江边步道（路灯、行道树）——江景房
//   n3  混合：n2 的天和远处天际线 + n1 的近处、中间两层楼和路网（走出阳台门时近处的楼有视差，远景是真的天际线）
//   默认 n2（第 5 轮起）
//   n0  第 3 轮的方块楼（对照用）
// 都只在进到屋里（store.sky > 0）时出现，见 inside.jsx 的 Exterior。调参：nightk= 天空 / 背景板亮度，cityk= 窗灯亮度
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useScene } from "../store.js";
import { BU, SKY, BAKE_URL, skyUrl } from "./bake.js";
import { TOUR } from "./look.js";

const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
// 第 5 轮：默认 n2（外滩江景，成片和所有窗户都用它）；第 4 轮的默认是 n3
export const NIGHT = ["n0", "n1", "n2", "n3"].includes(q.get("night")) ? q.get("night") : "n2";
// 漫游成片（第 6 轮）：外滩背景板暗一点（0.72 → 0.64），配合后期泛光收一点，灯光不糊成一片
const nightK = (m) => Number(q.get("nightk") ?? (["n2", "n3"].includes(m) ? (TOUR ? 0.64 : 0.72) : 1)), CITY_K = Number(q.get("cityk") ?? 1), HAZE_K = Number(q.get("hazek") ?? 0.4);
const GROUND_Y = -22;                 // 这套房在 7 楼：楼外地面在 22 米下面
const BANK_Z = 4.2 + 140;             // n2：楼南边 140 米是江边，再往南是江面
const CENTER = new THREE.Vector2(5, 4.2);
const BUND = "/assets/polyhaven/hdri/shanghai_bund/";
const BAND = [-4, 30];               // night_plate.py 裁出来的那一条的仰角范围（度）
const CHUNKS = { vt: "#include <common>\n#include <logdepthbuf_pars_vertex>", ft: "#include <common>\n#include <logdepthbuf_pars_fragment>", end: "#include <tonemapping_fragment>\n#include <colorspace_fragment>" };
const HASH = `
  float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }`;

// ---------- 天：n1 用烘焙的蓝调天空（sky.exr）；n2 / n3 用外滩的两张（整张 2k + 地平线那条 8k），地平线以下淡进雾色 ----------
export const skyMaterial = () => new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, band: { value: null }, useBand: { value: 0 }, bandLo: { value: (BAND[0] * Math.PI) / 180 }, bandHi: { value: (BAND[1] * Math.PI) / 180 },
    haze: { value: new THREE.Color(0.1, 0.135, 0.2) }, cutLo: { value: -1.0 }, k: { value: 1 }, opacity: { value: 0 }, rot: { value: 0 }, water: { value: 0 },
    north: { value: null }, useNorth: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  // haze：背景板地平线以下（江边步道、人）换成的颜色（和地面远处一样）
  vertexShader: `${CHUNKS.vt}
    varying vec3 vDir;
    void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    uniform sampler2D map, band, north; uniform float useBand, bandLo, bandHi, cutLo, k, opacity, rot, water, useNorth; uniform vec3 haze, tint; varying vec3 vDir;
    vec3 plate(float u, float e) {
      if (e > bandLo && e < bandHi) return texture2D(band, vec2(u, (e - bandLo) / (bandHi - bandLo))).rgb;
      return texture2D(map, vec2(u, e * RECIPROCAL_PI + 0.5)).rgb;
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec3 d = normalize(vDir);
      float c = cos(rot), s = sin(rot);
      d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
      float u = atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5, e = asin(clamp(d.y, -1.0, 1.0));
      vec3 col = texture2D(map, vec2(u, e * RECIPROCAL_PI + 0.5)).rgb;
      if (useBand > 0.5 && e > bandLo && e < bandHi) {
        vec3 b = texture2D(band, vec2(u, (e - bandLo) / (bandHi - bandLo))).rgb;
        col = mix(col, b, smoothstep(bandHi, bandHi - 0.04, e) * smoothstep(bandLo, bandLo + 0.01, e));
      }
      // 第 5 轮（n2 当默认、所有窗户都看它）：外滩背景板是在江边地面拍的，北半边是身后步道上的行道树——从 7 楼北窗看出去像一棵大树贴着窗户。
      // 北半边地平线以上换成烘焙用的蓝调天空（sky.exr，同一套调色、同一个世界方向），东西两边渐变过去；地平线以下照旧（被地面挡住）
      if (useNorth > 0.5 && e > 0.0) {
        float wn = smoothstep(-0.05, -0.5, normalize(vDir).z);
        col = mix(col, texture2D(north, vec2(u, e * RECIPROCAL_PI + 0.5)).rgb, wn);
      }
      col = mix(haze, col, smoothstep(cutLo - 0.004, cutLo + 0.002, e));   // 背景板地平线以下（江边步道、人）淡进雾色
      if (water > 0.5 && e < 0.0) {
        // 江面：把地平线以上的天际线倒过来（越往近处倒影拉得越长、横向有一点波纹），按菲涅尔混进很暗的水色
        float de = -e; vec3 acc = vec3(0.0);
        for (int i = 0; i < 7; i++) {
          float t = (float(i) - 3.0) / 3.0;
          float es = de * 0.8 + 0.003 + t * (0.002 + de * 0.12);
          float uu = u + 0.0011 * sin(de * 650.0 + float(i) * 2.1) + 0.0005 * sin(u * 1300.0 + de * 90.0);
          acc += plate(uu, max(es, 0.001));
        }
        acc /= 7.0;
        float fres = mix(0.6, 0.1, smoothstep(0.0, 0.16, de));
        col = vec3(0.004, 0.007, 0.013) + acc * fres;
      }
      gl_FragColor = vec4(min(col, vec3(14.0)) * tint * k, opacity);   // 最亮的灯截到 14：再亮泛光会糊满整个画面
      ${CHUNKS.end}
    }`,
  transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
});

// ---------- 楼：按路网的街区摆，每栋楼一组参数（种子、层高、开间、亮灯比例、冷暖倾向、立面深浅）----------
// 路网：主路每 160 米（宽 24 米）、支路每 80 米（宽 12 米），和这套房的墙对齐；这套房南边 50 米有一条支路（从阳台往下看得到路灯）
const GRID = { main: 160, minor: 80, wMain: 24, wMinor: 12, ox: CENTER.x + 20, oz: CENTER.y + 50 };
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 48271) % 2147483647) / 2147483647); }
function cityGeometry({ seed = 3, rMin = 60, rMax = 2200, cbd = true, capTo = 1000 } = {}) {
  const r = rng(seed), parts = [], towers = [];
  const add = (g, b) => {
    g = g.toNonIndexed();
    const n = g.attributes.position.count, pos = g.attributes.position, nor = g.attributes.normal;
    const uv = new Float32Array(n * 2), A = new Float32Array(n * 4), C = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor.getX(i), nz = nor.getZ(i);
      // 立面 UV（米）：沿立面的水平距离 + 离楼底的高度；圆楼用角度 × 半径
      const along = b.round ? Math.atan2(z - b.cz, x - b.cx) * b.R : Math.abs(nx) > 0.5 ? z : x;
      uv[2 * i] = along + (b.seed % 97) * 13.7; uv[2 * i + 1] = y - b.y0;   // 偏移别太大：几万米的 UV 在着色器里精度不够，窗格会花
      A.set([b.seed, b.floorH, b.bayW, b.lit], 4 * i); C.set([b.warm, b.tone, b.top, b.office], 4 * i);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setAttribute("aB", new THREE.BufferAttribute(A, 4)); g.setAttribute("aC", new THREE.BufferAttribute(C, 4));
    parts.push(g);
  };
  const blocks = [], { main, minor, wMinor, ox, oz } = GRID;
  // 街区：支路围出来的 80 × 80 米格子（主路那几格让出主路宽度），每格放 1–4 栋
  const N = Math.ceil(rMax / minor) + 1;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const x0 = ox + i * minor + wMinor / 2, z0 = oz + j * minor + wMinor / 2, s = minor - wMinor;
    const cx = x0 + s / 2, cz = z0 + s / 2, d = Math.hypot(cx - CENTER.x, cz - CENTER.y);
    if (d < rMin || d > rMax) continue;
    const mx = ((i * minor) % main + main) % main === 0, mz = ((j * minor) % main + main) % main === 0; // 这一格靠着主路：让出主路多出来的宽度
    blocks.push({ x0: x0 + (mx ? 6 : 0), z0: z0 + (mz ? 6 : 0), s: s - (mx ? 6 : 0) - (mz ? 6 : 0), d, a: Math.atan2(cx - CENTER.x, cz - CENTER.y) });
  }
  for (const bl of blocks) {
    // 越远楼越高越密；正南方向（a ≈ 0）远处是一簇商务区高楼
    const far = Math.min(1, (bl.d - rMin) / 1400), south = cbd ? Math.exp(-Math.pow(bl.a / 0.32, 2)) * Math.min(1, Math.max(0, (bl.d - 700) / 500)) : 0;
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      if (r() < 0.08) continue;                                   // 空地 / 公园
      const w = 14 + r() * (bl.s / (n > 2 ? 2.2 : 1.6) - 14), dd = 12 + r() * (bl.s / (n > 2 ? 2.2 : 1.5) - 12);
      const x = bl.x0 + w / 2 + r() * Math.max(0.1, bl.s - w), z = bl.z0 + dd / 2 + r() * Math.max(0.1, bl.s - dd);
      let H = 15 + r() * 30 + far * r() * 70;                     // 住宅 5–15 层为主
      // 阳台正前方（正南 ±35°、500 米以内）多是矮楼（2–6 层，比 7 楼的视线低）：视野打开，远处的天际线看得到；两边照样有高楼
      if (r() < 0.18 + far * 0.2) H += 30 + r() * 60;             // 高层
      if (south > 0.05 && r() < 0.15 + 0.4 * south) H = 80 + 250 * south * Math.pow(r(), 1.8) + r() * 30;   // 商务区塔楼：越靠中间越高，极高的少
      // 按这栋楼自己的方位算（不按街区中心）：南边 ±46° 扇区里，500 米以内多是矮楼；500 米到 capTo 楼顶压在地平线上 1° 左右以下，
      // 远处的天际线（n1 的商务区 / n3 的外滩背景板）露得出来；两边照样有高楼框住画面
      const ang = Math.atan2(x - CENTER.x, z - CENTER.y), dist = Math.hypot(x - CENTER.x, z - CENTER.y);
      if (Math.abs(ang) < 0.8) {
        if (dist < 500) H = r() < 0.85 ? 6 + r() * 14 : Math.min(H, 30);
        else if (dist < capTo) H = Math.min(H, 23.6 + dist * 0.02 + r() * 10);
      }
      const office = H > 100 || r() < 0.25;
      const b = { seed: Math.floor(r() * 997), floorH: office ? 3.8 + r() * 0.6 : 2.9 + r() * 0.3, bayW: office ? 1.5 + r() * 1.5 : 2.4 + r() * 2.2,
        lit: office ? 0.25 + r() * 0.5 : 0.12 + r() * 0.38, warm: office ? 0.2 + r() * 0.4 : 0.6 + r() * 0.4, tone: r(), top: GROUND_Y + H, office: office ? 1 : 0, y0: GROUND_Y, round: false, R: 0 };
      const round = H > 80 && r() < 0.16;
      if (round) {
        const R = Math.min(w, dd) / 2;
        b.round = true; b.R = R; b.cx = x; b.cz = z;
        add(new THREE.CylinderGeometry(R, R, H + 30, 20, 1).translate(0, GROUND_Y - 30 + (H + 30) / 2, 0).translate(x, 0, z), b);
      } else {
        const rot = (r() - 0.5) * 0.08;
        const main_ = new THREE.BoxGeometry(w, H + 30, dd).translate(0, GROUND_Y - 30 + (H + 30) / 2, 0);
        main_.rotateY(rot); main_.translate(x, 0, z); add(main_, b);
        if (r() < 0.45 && H > 30) {                                // 退台：上面再加一截小一点的
          const f = 0.62 + r() * 0.22, h2 = H * (0.12 + r() * 0.25);
          const g = new THREE.BoxGeometry(w * f, h2, dd * f).translate((r() - 0.5) * w * (1 - f) * 0.8, GROUND_Y + H + h2 / 2, (r() - 0.5) * dd * (1 - f) * 0.8);
          g.rotateY(rot); g.translate(x, 0, z); add(g, { ...b, top: GROUND_Y + H + h2 });
          H += h2;
        }
        if (H > 150 && r() < 0.3) {                                // 塔冠：细高的一截 + 天线
          const c = new THREE.BoxGeometry(w * 0.3, 8 + r() * 18, dd * 0.3).translate(0, GROUND_Y + H + 6, 0);
          c.rotateY(rot); c.translate(x, 0, z); add(c, { ...b, lit: 0.0, top: GROUND_Y + H + 20 });
          const sp = new THREE.CylinderGeometry(0.4, 0.8, 18 + r() * 25, 6).translate(0, GROUND_Y + H + 20, 0);
          sp.translate(x, 0, z); add(sp, { ...b, lit: 0.0, top: GROUND_Y + H + 45 });
        } else if (bl.d < 400 && r() < 0.7) {                      // 近处楼顶：水箱、空调外机、电梯机房
          for (let m = 0; m < 2 + Math.floor(r() * 3); m++) {
            const s = 2 + r() * 4, hh = 1.5 + r() * 3.5;
            const g = new THREE.BoxGeometry(s, hh, s * (0.6 + r())).translate((r() - 0.5) * w * 0.6, GROUND_Y + H + hh / 2, (r() - 0.5) * dd * 0.6);
            g.rotateY(rot); g.translate(x, 0, z); add(g, { ...b, lit: 0.0 });
          }
        }
      }
      b.H = H;
      if (H > 110) towers.push([x, GROUND_Y + H + 1, z]);       // 高楼顶上的红色航空灯（光点那层画）
    }
  }
  const g = mergeGeometries(parts);
  g.userData.towers = towers;
  return g;
}
const cityMaterial = () => new THREE.ShaderMaterial({
  uniforms: { haze: { value: new THREE.Color(0.1, 0.135, 0.2) }, sky: { value: new THREE.Color(0.05, 0.08, 0.15) }, k: { value: 1 }, litK: { value: CITY_K }, opacity: { value: 0 }, hazeD: { value: 2600 } },
  vertexShader: `${CHUNKS.vt}
    attribute vec4 aB, aC; varying vec4 vB, vC; varying vec2 vUv; varying vec3 vW; varying float vNy;
    void main() {
      vB = aB; vC = aC; vUv = uv; vNy = normal.y;
      vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    ${HASH}
    uniform vec3 haze, sky; uniform float k, litK, opacity, hazeD; varying vec4 vB, vC; varying vec2 vUv; varying vec3 vW; varying float vNy;
    void main() {
      #include <logdepthbuf_fragment>
      // 种子取整：插值出来的"常数"也有舍入误差，哈希会把它放大成满屏噪点
      float seed = floor(vB.x + 0.5), floorH = vB.y, bayW = vB.z, litFrac = vB.w, warmB = vC.x, tone = vC.y, office = floor(vC.w + 0.5);
      vec3 facade = mix(vec3(0.016, 0.018, 0.024), vec3(0.04, 0.038, 0.036), tone);   // 立面：深灰蓝 / 暖灰
      float up = clamp(vUv.y / 200.0, 0.0, 1.0);
      vec3 col;
      if (vNy > 0.5) col = facade * 0.6 + sky * 0.08;                                   // 楼顶
      else {
        vec2 cell = vec2(vUv.x / bayW, vUv.y / floorH), id = floor(cell), f = fract(cell);
        float win = step(0.1 + 0.08 * office, f.x) * step(f.x, 0.9 - 0.08 * office) * step(0.2 - 0.12 * office, f.y) * step(f.y, 0.86);
        float hW = h21(id + seed * 7.13), hF = h21(vec2(id.y, seed)), hC = h21(id * 1.7 + seed), hB = h21(id.yx + seed * 3.1);
        // 每层的亮灯概率不一样：有的整层亮（写字楼加班）、有的整层暗；底下两层是门厅 / 商铺
        float p = litFrac * mix(0.15, 1.9, hF) * (id.y < 1.0 ? 1.6 : 1.0);
        float lit = step(hW, p) * step(0.5, vUv.y / floorH);
        vec3 warm = vec3(1.0, 0.66, 0.36), neu = vec3(1.0, 0.86, 0.66), cool = vec3(0.72, 0.84, 1.0);
        vec3 wc = mix(mix(warm, neu, hC), cool, step(1.0 - 0.45 * (1.0 - warmB), hB));
        float br = (0.35 + 0.9 * h21(id + 91.7)) * (office > 0.5 ? 1.0 : 0.8);
        vec3 glass = mix(vec3(0.006, 0.008, 0.012), sky * 0.12, 0.3 + 0.7 * up);       // 不亮的窗：暗玻璃，往上带一点天色
        float inner = 0.7 + 0.55 * f.y;                                                 // 窗里上亮下暗（灯在天花板上）
        col = mix(facade, glass, win) + win * lit * wc * br * inner * 1.6 * litK;
        col += vec3(0.05, 0.03, 0.014) * exp(-vUv.y / 7.0) * (1.0 - win * 0.5);        // 底下两三层被路灯照暖
        // 远处窗格比一个像素还小：换成平均色（不然闪成一片摩尔纹）
        float fw = max(fwidth(cell.x), fwidth(cell.y));
        vec3 avg = mix(facade, glass, 0.55) + 0.55 * min(p, 1.0) * mix(warm, cool, 0.5 * (1.0 - warmB)) * 0.75 * 1.6 * litK * 0.45;
        col = mix(col, avg, smoothstep(0.6, 1.6, fw));
        // 高楼楼顶一圈灯带（冷白 / 暖白 / 少数彩色），天际线的轮廓靠它
        float hc2 = h11(seed * 3.1);
        float crown = step(vC.z - 2.4, vW.y) * step(vW.y, vC.z - 0.6) * step(78.0, vC.z) * step(0.35, hc2);
        col += crown * mix(vec3(0.85, 0.92, 1.0), hc2 > 0.85 ? vec3(0.4, 0.8, 1.0) : vec3(1.0, 0.78, 0.5), step(0.62, hc2)) * 1.4 * litK;
      }
      float d = distance(cameraPosition, vW);
      float fog = (1.0 - exp(-d / hazeD)) * mix(1.0, 0.7, clamp((vW.y + 22.0) / 260.0, 0.0, 1.0));
      col = mix(col, haze, clamp(fog, 0.0, 0.92));
      gl_FragColor = vec4(col * k, opacity);
      ${CHUNKS.end}
    }`,
  transparent: true, fog: false,
});

// ---------- 地面：路网 + 路灯 + 车灯 + 街区里零星的灯，越远越混进雾色 ----------
const groundMaterial = () => new THREE.ShaderMaterial({
  uniforms: { haze: { value: new THREE.Color(0.1, 0.135, 0.2) }, k: { value: 1 }, litK: { value: CITY_K }, opacity: { value: 0 }, center: { value: CENTER.clone() }, bankZ: { value: 1e6 },
    grid: { value: new THREE.Vector4(GRID.minor, GRID.main, GRID.wMinor, GRID.wMain) }, org: { value: new THREE.Vector2(GRID.ox, GRID.oz) } },
  vertexShader: `${CHUNKS.vt}
    varying vec2 vXZ;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    ${HASH}
    uniform vec3 haze; uniform float k, litK, opacity, bankZ; uniform vec2 center, org; uniform vec4 grid; varying vec2 vXZ;
    // 一个点光（按屏幕像素算半径：远处也是一个小点，不会被透视压成长条）+ 地上的一圈光晕（按米算）
    vec3 lamp(vec2 p, vec2 at, vec3 c, float px, float pool, vec2 fw) {
      vec2 dd = p - at;
      float r = length(dd / max(fw, vec2(0.0005)));
      return c * ((1.0 - smoothstep(px * 0.6, px * 1.4, r)) * 2.2 + pool * exp(-dot(dd, dd) / 18.0));
    }
    void main() {
      #include <logdepthbuf_fragment>
      if (vXZ.y > bankZ) discard;                                       // n2：江边（再往南是江面，天的那个球画）
      vec2 p = vXZ - org, fw = fwidth(vXZ);
      float d = length(vXZ - center), hz = smoothstep(150.0, 2100.0, d);
      float minor = grid.x, main = grid.y, wm = grid.z * 0.5, wM = grid.w * 0.5;
      // 到最近的支路 / 主路中线的距离（x 向、z 向两组）
      vec2 m = abs(mod(p + minor * 0.5, minor) - minor * 0.5), M = abs(mod(p + main * 0.5, main) - main * 0.5);
      float onMinor = max(step(m.x, wm), step(m.y, wm)), onMain = max(step(M.x, wM), step(M.y, wM));
      // 路面比街区略亮；人行道（路边 3 米）再亮一点点
      float side = max(step(m.x, wm + 3.0) - step(m.x, wm), step(m.y, wm + 3.0) - step(m.y, wm)) * (1.0 - onMain);
      vec3 col = mix(vec3(0.01, 0.011, 0.014), vec3(0.018, 0.019, 0.022), max(onMinor, onMain)) + side * 0.006;
      vec3 L = vec3(0.0);
      // 街区里零星的灯（院子、店招、停车场）：一格 18 米，三成的格子里有一个小光点
      vec2 cell = floor(p / 18.0), hc = h22(cell), hp = h22(cell + 17.0);
      if (onMinor < 0.5 && onMain < 0.5) L += lamp(p, (cell + 0.15 + 0.7 * hp) * 18.0, mix(vec3(1.0, 0.66, 0.35), vec3(0.8, 0.88, 1.0), step(0.65, hc.y)), 1.0, 0.0, fw) * step(0.7, hc.x) * 0.7;
      vec3 sodium = vec3(1.0, 0.58, 0.24), led = vec3(0.92, 0.95, 1.0);
      // 路灯：沿路两侧每 32 米一盏（每段路错开一点）
      for (int ax = 0; ax < 2; ax++) {
        vec2 q = ax == 0 ? p : p.yx;                 // q.x 沿路，q.y 横过路
        float rc = floor((q.y + minor * 0.5) / minor) * minor, isMain = step(abs(mod(rc + main * 0.5, main) - main * 0.5), 1.0);
        float w = mix(wm, wM, isMain), sp = 32.0, off = h11(rc * 0.37 + float(ax)) * sp;
        float k0 = floor((q.x - off) / sp + 0.5) * sp + off;
        for (int sd = -1; sd <= 1; sd += 2) {
          vec2 at = vec2(k0, rc + float(sd) * (w - 1.5));
          vec2 pt = ax == 0 ? at : at.yx;
          L += lamp(p, pt, mix(sodium, led, isMain), 1.3, 0.05, fw) * step(0.12, h21(vec2(k0, rc + float(sd))));
        }
        // 主路上的车：一条道白色车头灯、一条道红色尾灯，每 14 米一格随机有车
        if (isMain > 0.5) {
          float c0 = floor(q.x / 14.0) * 14.0 + 7.0, hv = h21(vec2(c0, rc));
          for (int ln = -1; ln <= 1; ln += 2) {
            vec2 at = vec2(c0 + (hv - 0.5) * 8.0, rc + float(ln) * 4.0);
            vec2 pt = ax == 0 ? at : at.yx;
            L += lamp(p, pt, ln < 0 ? vec3(1.0, 0.95, 0.85) : vec3(1.0, 0.12, 0.08), 1.0, 0.0, fw) * step(0.45, h21(vec2(c0 + float(ln), rc))) * 0.9;
          }
        }
      }
      // 江边步道：沿岸一排暖色路灯（每 16 米）+ 岸边一道浅色的石头栏杆
      if (bankZ < 1e5) {
        float bz = bankZ - 3.0, k0 = floor(vXZ.x / 16.0 + 0.5) * 16.0;
        L += lamp(vXZ, vec2(k0, bz), vec3(1.0, 0.72, 0.42), 1.4, 0.08, fw) * 1.3;
        col += vec3(0.03, 0.028, 0.026) * step(bankZ - 1.2, vXZ.y);
      }
      col += L * litK * (1.0 - hz * 0.75);
      col = mix(col, haze, hz * 0.95);
      gl_FragColor = vec4(col * k, opacity);
      ${CHUNKS.end}
    }`,
  transparent: true, fog: false,
});

// ---------- 行道树：近处 450 米以内的支路两边，每 9–12 米一棵（低多边形的树冠，从上往下看是一团团暗绿，底下被路灯照暖）----------
function treeGeometry({ seed = 5, rMax = 450, bankZ = 1e6 } = {}) {
  const r = rng(seed), parts = [], { minor, wMinor, ox, oz } = GRID, N = Math.ceil(rMax / minor) + 1;
  const base = new THREE.IcosahedronGeometry(1, 1);
  for (let ax = 0; ax < 2; ax++) for (let j = -N; j <= N; j++) for (const sd of [-1, 1]) {
    const isMain = ((j * minor) % GRID.main + GRID.main) % GRID.main === 0;
    const line = (ax === 0 ? oz : ox) + j * minor + sd * ((isMain ? GRID.wMain : wMinor) / 2 + 1.6);
    for (let t = -rMax; t < rMax; t += 9 + r() * 3) {
      const along = (ax === 0 ? CENTER.x : CENTER.y) + t;
      const x = ax === 0 ? along : line, z = ax === 0 ? line : along;
      const d = Math.hypot(x - CENTER.x, z - CENTER.y);
      if (d > rMax || d < 40 || z > bankZ - 7 || r() < 0.15) continue;
      const m = ((along - (ax === 0 ? ox : oz)) % minor + minor) % minor;
      if (m < wMinor / 2 + 4 || m > minor - wMinor / 2 - 4) continue;    // 路口不种
      const R = 2.0 + r() * 1.4;
      for (let c = 0; c < 3; c++) {      // 一棵树三团树冠，大小、位置错开一点，不像一个个气球
        const rr = R * (0.6 + r() * 0.4);
        parts.push(base.clone().scale(rr, rr * (0.75 + r() * 0.3), rr).rotateY(r() * 3).translate(x + (r() - 0.5) * R, GROUND_Y + 3.4 + R * 0.6 + (r() - 0.3) * R * 0.6, z + (r() - 0.5) * R));
      }
    }
  }
  return mergeGeometries(parts);
}
const treeMaterial = () => new THREE.ShaderMaterial({
  uniforms: { haze: { value: new THREE.Color(0.1, 0.135, 0.2) }, k: { value: 1 }, opacity: { value: 0 } },
  vertexShader: `${CHUNKS.vt}
    varying vec3 vW; varying float vNy;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vNy = normalize(normal).y; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    uniform vec3 haze; uniform float k, opacity; varying vec3 vW; varying float vNy;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 col = vec3(0.004, 0.006, 0.005) + vec3(0.035, 0.02, 0.008) * (1.0 - smoothstep(-0.8, 0.1, vNy)) + vec3(0.003, 0.005, 0.008) * max(vNy, 0.0);
      float fog = 1.0 - exp(-max(distance(cameraPosition, vW) - 100.0, 0.0) / 3000.0);
      gl_FragColor = vec4(mix(col, haze, fog) * k, opacity);
      ${CHUNKS.end}
    }`,
  transparent: true, fog: false,
});

// ---------- 远处的光点：地平线附近一层（暖色为主、少数白 / 红 / 绿），带一点柔边（像焦外的小光斑）；高楼顶上的红色航空灯 ----------
function glitterGeometry({ seed = 9, n = 5000, rMin = 700, rMax = 2200, towers = [] } = {}) {
  const r = rng(seed), pos = [], col = [], size = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = rMin + Math.pow(r(), 0.7) * (rMax - rMin);
    pos.push(CENTER.x + Math.sin(a) * d, GROUND_Y + 0.5 + r() * r() * 30, CENTER.y + Math.cos(a) * d);
    const t = r(), c = t < 0.66 ? [1.0, 0.62 + r() * 0.15, 0.3] : t < 0.9 ? [0.85, 0.9, 1.0] : t < 0.96 ? [1.0, 0.2, 0.15] : [0.4, 1.0, 0.6];
    const b = 0.4 + r() * 1.2; col.push(c[0] * b, c[1] * b, c[2] * b); size.push(1.2 + r() * 2.6);
  }
  for (const [x, y, z] of towers) { pos.push(x, y, z); col.push(2.0, 0.15, 0.1); size.push(2.6); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
  return g;
}
const glitterMaterial = () => new THREE.ShaderMaterial({
  uniforms: { haze: { value: new THREE.Color(0.1, 0.135, 0.2) }, k: { value: 1 }, litK: { value: CITY_K }, opacity: { value: 0 }, dpr: { value: 1 } },
  vertexShader: `${CHUNKS.vt}
    attribute vec3 color; attribute float size; uniform float dpr; varying vec3 vC; varying float vF;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vC = color; vF = 1.0 - exp(-length(mv.xyz) / 2600.0);
      gl_PointSize = size * dpr; gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${CHUNKS.ft}
    uniform vec3 haze; uniform float k, litK, opacity; varying vec3 vC; varying float vF;
    void main() {
      #include <logdepthbuf_fragment>
      float r = length(gl_PointCoord - 0.5) * 2.0, a = 1.0 - smoothstep(0.35, 1.0, r);
      gl_FragColor = vec4(vC * litK * (1.0 - 0.6 * vF) * k * a * opacity, 1.0);
      ${CHUNKS.end}
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

// 外滩背景板的地平线颜色（江面那一圈的平均）：雾色用它，楼和地面才融得进去
function horizonColor(tex, lo, hi) {
  const { data, width, height } = tex.image, half = data instanceof Uint16Array, get = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const c = [0, 0, 0]; let n = 0;
  for (let y = 0; y < height; y++) {
    const e = BAND[0] + ((y + 0.5) / height) * (BAND[1] - BAND[0]);
    if (e < lo || e > hi) continue;
    for (let x = Math.floor(width * 0.55); x < width * 0.95; x += 4) { const i = (y * width + x) * 4; for (let ch = 0; ch < 3; ch++) c[ch] += get(i + ch); n++; }
  }
  return new THREE.Color(c[0] / n, c[1] / n, c[2] / n);
}

// ---------- 组件：天 + 楼 + 地面 + 光点；Exterior（inside.jsx）在 n0 以外都用它 ----------
export function NightExterior() {
  const sky = useRef(), city = useRef(), ground = useRef(), glitter = useRef(), trees = useRef();
  const { camera, gl } = useThree();
  // 外滩背景板（n2 / n3）是 Blender 跑 night_plate.py 做出来的；没做过（没装 Blender 的新克隆）就退回 n1 程序城市，窗外不会空着
  const [mode, setMode] = useState(NIGHT);
  const plate = mode === "n2" || mode === "n3";
  const mats = useMemo(() => ({ sky: skyMaterial(), city: cityMaterial(), ground: groundMaterial(), glitter: glitterMaterial(), trees: treeMaterial() }), []);
  const cityGeo = useMemo(() => (mode === "n1" ? cityGeometry({ seed: 3, rMin: 60, rMax: 2200, cbd: true, capTo: 1000 }) : mode === "n3" ? cityGeometry({ seed: 3, rMin: 60, rMax: 820, cbd: false, capTo: 9999 }) : null), [mode]);
  const treeGeo = useMemo(() => treeGeometry({ bankZ: mode === "n2" ? BANK_Z : 1e6 }), [mode]);
  const glitterGeo = useMemo(() => (mode === "n1" ? glitterGeometry({ n: 6000, towers: cityGeo.userData.towers }) : mode === "n3" ? glitterGeometry({ n: 1800, rMin: 500, rMax: 1200, towers: cityGeo.userData.towers }) : null), [cityGeo, mode]);
  useEffect(() => {
    const ld = (f) => new EXRLoader().loadAsync(f).then((t) => { t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; return t; });
    if (plate) {
      Promise.all([ld(BUND + "bund_sky_2k.exr"), ld(BUND + "bund_band_8k.exr")]).then(([full, band]) => {
        const S = mats.sky.uniforms;
        S.map.value = full; S.band.value = band; S.useBand.value = 1; S.cutLo.value = (-0.35 * Math.PI) / 180;
        if (mode === "n2") { S.water.value = 1; mats.ground.uniforms.bankZ.value = BANK_Z; }   // n2：江景（对岸是外滩背景板的天际线）
        if (mode === "n2") ld(BAKE_URL + "sky.exr").then((t) => { S.north.value = t; S.useNorth.value = 1; }).catch(() => {}); // n2：北半边换成蓝调天空（见着色器）
        // 雾色：取天际线上方（仰角 7°–13°）的天色——江面那圈被城市灯光照得很亮，拿它当雾色楼会发白；地面远处和背景板地平线以下用同一个
        const h = horizonColor(band, 7, 13).multiplyScalar(HAZE_K);
        S.haze.value.copy(h);
        for (const m of [mats.city, mats.ground, mats.glitter, mats.trees]) m.uniforms.haze.value.copy(h);
        mats.city.uniforms.sky.value.copy(h).multiplyScalar(0.8);
      }).catch(() => { console.warn("[night] 没找到外滩背景板（要 Blender 跑 tools/blender/night_plate.py），改用程序城市 n1"); setMode("n1"); });
    } else {
      // 天：优先用烘焙时调过色、转好方向的 sky.exr；没烘焙过就用原始 HDRI（fetch-assets 下载的），按 SKY.rot 转
      ld(BAKE_URL + "sky.exr").then((t) => { mats.sky.uniforms.map.value = t; }).catch(() =>
        new HDRLoader().loadAsync(skyUrl()).then((t) => {
          t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping;
          mats.sky.uniforms.map.value = t; mats.sky.uniforms.rot.value = (SKY.rot * Math.PI) / 180;
          mats.sky.uniforms.tint.value.set(0.62, 0.8, 1.18).multiplyScalar(0.55 * 0.5); // 大致照 bake.py 给 sky.exr 的调色：往深蓝调、压暗
        }).catch(() => console.warn("[night] 没找到天空：先跑 node tools/fetch-assets.mjs")));
    }
    mats.glitter.uniforms.dpr.value = gl.getPixelRatio();
  }, [mats, plate, mode, gl]);
  useFrame(() => {
    const a = useScene.getState().sky, on = a > 0.001 && !!mats.sky.uniforms.map.value;
    for (const r of [sky, city, ground, glitter, trees]) if (r.current) r.current.visible = on;
    const far = on ? 3000 : 400;
    if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
    if (!on) return;
    sky.current.position.copy(camera.position);
    const s = BU.uBakeScale.value;
    for (const m of Object.values(mats)) { m.uniforms.opacity.value = a; m.uniforms.k.value = s; }
    mats.sky.uniforms.k.value = SKY.strength * s * nightK(mode);
  });
  return (
    <group>
      <mesh ref={sky} material={mats.sky} renderOrder={-100} frustumCulled={false}><sphereGeometry args={[2400, 64, 32]} /></mesh>
      <mesh ref={ground} material={mats.ground} renderOrder={-95} rotation={[-Math.PI / 2, 0, 0]} position={[CENTER.x, GROUND_Y, CENTER.y]} frustumCulled={false}><circleGeometry args={[2300, 96]} /></mesh>
      {cityGeo && <mesh ref={city} geometry={cityGeo} material={mats.city} renderOrder={-90} frustumCulled={false} />}
      <mesh ref={trees} geometry={treeGeo} material={mats.trees} renderOrder={-91} frustumCulled={false} />
      {glitterGeo && <points ref={glitter} geometry={glitterGeo} material={mats.glitter} renderOrder={-89} frustumCulled={false} />}
    </group>
  );
}
