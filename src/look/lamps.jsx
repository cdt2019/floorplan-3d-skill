// 灯具（带 mood / tod 时才加）：床头台灯、书桌台灯、沙发边落地灯、餐桌吊灯，厨房和卫生间各一盏看不见灯具的顶灯。
// 灯罩和灯泡是自发光材质，亮度跟着光照状态里的 lamps（0~1）；会开灯的预设（m3、tod、录视频的 day / seq）每盏灯里再挂一个暖色点光源
// （不投影，省性能）。窗户玻璃跟着 glow 透出暖光。灯具跟家具一起在第 5 步落定后出现。
// 带软装（look=pro&pbr）时：灯的位置不再按家具写死，而是来自软装规则（decor.js 里 kind = "lamp" 的条目），
// 灯具本身由 Decor.jsx 跟着软装一件件落下来，这里只管点光源和发光强度。
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScene } from "../store.js";
import { MAT } from "../build/kit.jsx";
import { LAMP_LIGHTS, lightAt } from "./look.js";
import { BAKE } from "./bake.js";

export const SHADE = new THREE.MeshStandardMaterial({ color: "#f1e4cf", roughness: 0.85, emissive: "#ffbf78", emissiveIntensity: 0, side: THREE.DoubleSide });
export const BULB = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#ffd9a8", emissiveIntensity: 0 });
export const METAL = new THREE.MeshStandardMaterial({ color: "#2b2724", roughness: 0.45, metalness: 0.6 });
// 第 4 轮：家具里的灯带（厨房吊柜底、烟机灯、镜柜底），跟着屋里开灯一起亮；烘焙时换成面光源（bake.py 认材质名 LED）
export const LED = new THREE.MeshStandardMaterial({ color: "#fff6ea", roughness: 0.5, emissive: "#ffd6a6", emissiveIntensity: 0 });
const CERAMIC = new THREE.MeshStandardMaterial({ color: "#ece6dc", roughness: 0.4 });
const WARM = "#ffb36b";
const GLOW = new THREE.Color("#ffb870");

// 点光源离墙、离桌面太近时，平方反比衰减会在表面上烫出一个很亮的硬光斑。
// 给衰减加一个 0.25 米的"灯泡半径"：1 / (d² + r²) 代替 1 / d²，远处几乎不变，贴近的地方柔和下来（只在开灯的画面里改，默认画面不受影响）
if (LAMP_LIGHTS) {
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
    "float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );",
    "float distanceFalloff = 1.0 / pow( lightDistance * lightDistance + 0.06, decayExponent * 0.5 );");
}

// 每种家具上的灯：[样式, 局部坐标]（家具局部坐标，正面朝 +z）—— 没有软装时用
const ANCHORS = {
  bed15: [["table", [-1.07, 0.5, -0.85]], ["table", [1.07, 0.5, -0.85]]],
  bed18: [["table", [-1.22, 0.5, -0.85]], ["table", [1.22, 0.5, -0.85]]],
  desk: [["desk", [0.42, 0.76, -0.14]]],
  sofa: [["floor", [1.42, 0, -0.22]]],
  dining: [["pendant", [0, 0, 0]]],
};
// 点光源：相对灯具的位置、强度（坎德拉）、照多远
const LIGHT = {
  table: [[0, 0.33, 0], 1.4, 3.2], desk: [[0.05, 0.34, 0.08], 1.0, 2.6], floor: [[0, 1.28, 0], 4.5, 5], pendant: [[0, 1.2, 0], 4.5, 5], ceil: [[0, 1.42, 0], 2.2, 3.6],
  lantern: [[0, 0.16, 0], 0.7, 2.2],
};
const CEIL_H = 2.8; // 满层高时的天花板（= inside.jsx 的 FULL_CUT；这里不引那个文件，免得循环引用）
// 软装规则给的吊灯 y 是灯罩高度，灯具原点在地上：整体往下挪 1.25 米
export const FIXTURE_Y = { pendant: -1.25 };

const FLOOR_BASE = new THREE.LatheGeometry([[0, 0], [0.155, 0], [0.165, 0.006], [0.166, 0.016], [0.158, 0.024], [0.03, 0.03], [0.014, 0.05], [0, 0.05]].map(([x, y]) => new THREE.Vector2(x, y)), 48);
export function Fixture({ kind }) {
  if (kind === "table") return (
    <group>
      <mesh material={CERAMIC} position={[0, 0.08, 0]} castShadow><sphereGeometry args={[0.075, 20, 14]} /></mesh>
      <mesh material={METAL} position={[0, 0.18, 0]}><cylinderGeometry args={[0.008, 0.008, 0.12, 8]} /></mesh>
      <mesh material={SHADE} position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.1, 0.14, 0.18, 28, 1, true]} /></mesh>
      <mesh material={BULB} position={[0, 0.28, 0]}><sphereGeometry args={[0.035, 12, 8]} /></mesh>
    </group>
  );
  if (kind === "desk") return (
    <group>
      <mesh material={METAL} position={[0, 0.01, 0]}><cylinderGeometry args={[0.07, 0.08, 0.02, 16]} /></mesh>
      <mesh material={METAL} position={[0, 0.2, 0]} rotation={[0.35, 0, 0]} castShadow><cylinderGeometry args={[0.01, 0.01, 0.4, 8]} /></mesh>
      <mesh material={SHADE} position={[0, 0.38, 0.08]} rotation={[0.5, 0, 0]} castShadow><cylinderGeometry args={[0.03, 0.08, 0.12, 20, 1, true]} /></mesh>
      <mesh material={BULB} position={[0, 0.36, 0.09]}><sphereGeometry args={[0.025, 10, 8]} /></mesh>
    </group>
  );
  // 落地灯（第 3 轮细化）：车削出来的配重底座、细灯杆、亚麻鼓形灯罩（上下各一圈细边）
  if (kind === "floor") return (
    <group>
      <mesh material={METAL} geometry={FLOOR_BASE} castShadow receiveShadow />
      <mesh material={METAL} position={[0, 0.66, 0]} castShadow><cylinderGeometry args={[0.0085, 0.011, 1.28, 12]} /></mesh>
      <mesh material={METAL} position={[0, 1.2, 0]}><cylinderGeometry args={[0.02, 0.02, 0.05, 12]} /></mesh>
      <mesh material={SHADE} position={[0, 1.32, 0]} castShadow><cylinderGeometry args={[0.17, 0.215, 0.28, 48, 1, true]} /></mesh>
      {[[1.46, 0.17], [1.18, 0.215]].map(([y, r]) => <mesh key={y} material={SHADE} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r, 0.004, 6, 48]} /></mesh>)}
      <mesh material={BULB} position={[0, 1.28, 0]}><sphereGeometry args={[0.045, 12, 8]} /></mesh>
    </group>
  );
  if (kind === "pendant") return (
    <group>
      {/* 吊线一直通到天花板上面（鸟瞰时被剖切面切掉，满层高时接到天花板） */}
      <mesh material={METAL} position={[0, 2.39, 0]}><cylinderGeometry args={[0.003, 0.003, 2.0, 6]} /></mesh>
      {/* 扁圆的穹顶灯罩（北欧风常见的那种） */}
      <mesh material={SHADE} position={[0, 1.24, 0]} scale={[1, 0.62, 1]} castShadow><sphereGeometry args={[0.24, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <mesh material={BULB} position={[0, 1.25, 0]}><sphereGeometry args={[0.05, 12, 8]} /></mesh>
    </group>
  );
  // 第 4 轮：厨房、卫生间的吸顶灯（人眼高度抬头看得到）：白色扁圆灯体 + 发光的灯罩（用灯泡材质：烘焙时删掉、在原地换成面光源）。
  // 贴在满层高的天花板下面；鸟瞰剖切时被剖切面切掉，墙长到顶才露出来
  if (kind === "ceil") return (
    <group position={[0, CEIL_H, 0]}>
      <mesh material={CERAMIC} position={[0, -0.016, 0]}><cylinderGeometry args={[0.17, 0.16, 0.032, 40]} /></mesh>
      <mesh material={BULB} position={[0, -0.033, 0]}><cylinderGeometry args={[0.145, 0.145, 0.004, 40]} /></mesh>
    </group>
  );
  if (kind === "lantern") return (
    <group>
      <mesh material={METAL} position={[0, 0.012, 0]}><boxGeometry args={[0.17, 0.024, 0.17]} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => <mesh key={i} material={METAL} position={[x * 0.075, 0.15, z * 0.075]}><boxGeometry args={[0.012, 0.27, 0.012]} /></mesh>)}
      <mesh material={SHADE} position={[0, 0.15, 0]}><cylinderGeometry args={[0.055, 0.055, 0.2, 16]} /></mesh>
      <mesh material={METAL} position={[0, 0.31, 0]} castShadow><coneGeometry args={[0.11, 0.07, 4, 1]} /></mesh>
    </group>
  );
  return null;
}

const Y = new THREE.Vector3(0, 1, 0);
// low（成片时间线）：剖切高度那套软装清单——墙长高之前吊灯在低一点的位置（见 Decor.jsx 的 lowOf）
export function Lamps({ plan, decor, low }) {
  // 灯的世界坐标：软装模式直接用规则给的位置；否则按家具的位置、朝向把局部坐标转过去
  const items = useMemo(() => {
    if (decor) return decor.map((d, i) => [d, low?.[i]]).filter(([d]) => d.kind === "lamp")
      .map(([d, lo]) => ({ kind: d.style, rot: d.rot, at: [d.x, d.y + (FIXTURE_Y[d.style] || 0), d.z], dy: lo && low !== decor ? lo.y - d.y : 0, focus: /客|餐|厅|阳台/.test(d.room || "") }));
    const out = [];
    for (const f of plan.furniture) {
      for (const [kind, local] of ANCHORS[f.type] || []) {
        const rot = (f.rot * Math.PI) / 180, v = new THREE.Vector3(...local).applyAxisAngle(Y, rot);
        out.push({ kind, rot, at: [f.at[0] + v.x, v.y, f.at[1] + v.z] });
      }
    }
    // 厨房、卫生间：顶灯（不画灯具）
    for (const r of plan.rooms) if (/厨|卫|浴/.test(r.name)) out.push({ kind: "ceil", rot: 0, at: [(r.rect[0] + r.rect[2]) / 2, 0, (r.rect[1] + r.rect[3]) / 2] });
    return out;
  }, [plan, decor, low]);
  const on = useScene((s) => (decor ? s.stage >= 5 && s.decor > 0.6 : s.stage >= 6 || (s.stage === 5 && s.pop > 0.98)));
  const lights = useRef([]), groups = useRef([]);
  useFrame(() => {
    const S = useScene.getState(), L = lightAt(S.tod), k = on ? L.lamps : 0;
    items.forEach((it, i) => { if (it.dy && groups.current[i]) groups.current[i].position.y = it.at[1] + it.dy * (1 - S.rise); });
    SHADE.emissiveIntensity = 2.2 * k;
    BULB.emissiveIntensity = 14 * k;
    LED.emissiveIntensity = 3.5 * k;
    // 换成烘焙光照以后：点光源只给高光和动态小物件用；它不投影，别的房间的灯会穿墙照过来，所以只留客餐厅、阳台的
    const bk = BAKE.ready ? S.bake : 0;
    lights.current.forEach((l, i) => { if (l) l.intensity = LIGHT[items[i].kind][1] * k * (items[i].focus === false ? 1 - bk : 1); });
    // 窗户透光：玻璃加暖色自发光、不那么透明（鸟瞰时从外面看）；进到屋里（store.inside）就不发光了，换成反光的玻璃（inside.jsx）
    const g = L.glow * (1 - S.inside);
    MAT.glass.emissive.copy(GLOW);
    MAT.glass.emissiveIntensity = 0.75 * g;
    MAT.glass.opacity = 0.14 + 0.3 * g;
  });
  return (
    <group>
      {items.map((it, i) => {
        const [lp, , dist] = LIGHT[it.kind];
        return (
          <group key={i} ref={(g) => (groups.current[i] = g)} position={it.at} rotation={[0, it.rot, 0]}>
            {!decor && <group visible={on}><Fixture kind={it.kind} /></group>}
            {LAMP_LIGHTS && <pointLight ref={(l) => (lights.current[i] = l)} position={lp} color={WARM} intensity={0} distance={dist} decay={2} />}
          </group>
        );
      })}
    </group>
  );
}
