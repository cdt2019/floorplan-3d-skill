// 家具库：全部用圆角盒子拼，局部坐标里正面朝 +z（南），rot 绕竖轴转。尺寸按常见家具（米）。
import { MAT, Box } from "./kit.jsx";
import { MODEL_LIB } from "../look/pbr.jsx";
import { DECOR } from "../look/look.js"; // look=pro&pbr 的软装：沙发前的地毯、床上的枕头和搭毯、洗手台的镜子换成 Decor.jsx 里的

const LIB = {
  sofa: () => (
    <group>
      <Box size={[2.3, 0.42, 0.9]} mat={MAT.sofa || MAT.furn2} position={[0, 0.21, 0]} r={0.05} />
      <Box size={[2.3, 0.45, 0.2]} mat={MAT.sofa || MAT.furn2} position={[0, 0.62, -0.35]} r={0.06} />
      <Box size={[0.18, 0.62, 0.9]} mat={MAT.sofa || MAT.furn2} position={[-1.06, 0.31, 0]} r={0.05} />
      <Box size={[0.18, 0.62, 0.9]} mat={MAT.sofa || MAT.furn2} position={[1.06, 0.31, 0]} r={0.05} />
      {[-0.5, 0.5].map((x) => <Box key={x} size={[0.95, 0.12, 0.62]} mat={MAT.cushion || MAT.furn} position={[x, 0.47, 0.08]} r={0.05} />)}
      {!DECOR && <Box size={[1.8, 0.012, 1.4]} mat={MAT.fabric} position={[0, 0.006, 1.25]} r={0.005} ink={false} />}
    </group>
  ),
  coffee: () => (
    <group>
      <Box size={[1.1, 0.06, 0.6]} mat={MAT.furnWood} position={[0, 0.38, 0]} r={0.02} />
      {[[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]].map(([x, z], i) => <Box key={i} size={[0.04, 0.36, 0.04]} mat={MAT.furnWood} position={[x, 0.18, z]} r={0.01} ink={false} />)}
    </group>
  ),
  tv: () => (
    <group>
      <Box size={[1.9, 0.45, 0.4]} mat={MAT.furnWood} position={[0, 0.225, 0]} r={0.02} />
      <Box size={[1.45, 0.82, 0.05]} mat={MAT.dark} position={[0, 0.45 + 0.5, -0.12]} r={0.015} />
    </group>
  ),
  dining: () => (
    <group>
      <Box size={[1.4, 0.05, 0.8]} mat={MAT.furnWood} position={[0, 0.74, 0]} r={0.02} />
      <Box size={[1.2, 0.7, 0.08]} mat={MAT.furnWood} position={[0, 0.36, 0]} r={0.02} ink={false} />
      {[[-0.4, -0.62, 0], [0.4, -0.62, 0], [-0.4, 0.62, Math.PI], [0.4, 0.62, Math.PI]].map(([x, z, r], i) => <Chair key={i} position={[x, 0, z]} rotation={[0, r, 0]} />)}
    </group>
  ),
  bed18: () => <Bed w={1.8} />,
  bed15: () => <Bed w={1.5} />,
  wardrobe: () => (
    <group>
      <Box size={[2.4, 2.2, 0.6]} mat={MAT.furn} position={[0, 1.1, 0]} r={0.02} />
      {[-0.4, 0.4].map((x) => <Box key={x} size={[0.01, 2.0, 0.01]} mat={MAT.furn2} position={[x, 1.1, 0.305]} r={0.003} ink={false} />)}
    </group>
  ),
  desk: () => (
    <group>
      <Box size={[1.2, 0.04, 0.6]} mat={MAT.furnWood} position={[0, 0.74, 0]} r={0.015} />
      <Box size={[0.04, 0.72, 0.56]} mat={MAT.furn} position={[-0.56, 0.36, 0]} r={0.01} ink={false} />
      <Box size={[0.04, 0.72, 0.56]} mat={MAT.furn} position={[0.56, 0.36, 0]} r={0.01} ink={false} />
      <Chair position={[0, 0, 0.55]} rotation={[0, Math.PI, 0]} />
    </group>
  ),
  kitchen: () => (
    <group>
      <Box size={[2.6, 0.86, 0.6]} mat={MAT.furn} position={[0, 0.43, 0]} r={0.015} />
      <Box size={[2.62, 0.04, 0.62]} mat={MAT.furn2} position={[0, 0.88, 0]} r={0.01} />
      <Box size={[0.6, 0.02, 0.4]} mat={MAT.dark} position={[0.7, 0.905, 0]} r={0.01} ink={false} />
      <Box size={[0.5, 0.03, 0.38]} mat={MAT.dark} position={[-0.6, 0.91, 0]} r={0.02} ink={false} />
    </group>
  ),
  fridge: () => <Box size={[0.7, 1.8, 0.68]} mat={MAT.furn2} position={[0, 0.9, 0]} r={0.03} />,
  shower: () => (
    <group>
      <Box size={[1.84, 0.06, 1.0]} mat={MAT.furn} position={[0, 0.03, 0]} r={0.02} />
      <Box size={[1.84, 1.9, 0.02]} mat={MAT.glass} position={[0, 1.0, 0.5]} r={0.005} ink={false} />
    </group>
  ),
  toilet: () => (
    <group>
      <Box size={[0.38, 0.4, 0.55]} mat={MAT.furn} position={[0, 0.2, 0.05]} r={0.12} />
      <Box size={[0.4, 0.35, 0.16]} mat={MAT.furn} position={[0, 0.55, -0.2]} r={0.04} />
    </group>
  ),
  basin: () => (
    <group>
      <Box size={[0.7, 0.8, 0.46]} mat={MAT.furnWood} position={[0, 0.4, 0]} r={0.02} />
      <Box size={[0.5, 0.06, 0.36]} mat={MAT.furn} position={[0, 0.83, 0.02]} r={0.03} />
      {!DECOR && <Box size={[0.6, 0.8, 0.02]} mat={MAT.glass} position={[0, 1.5, -0.22]} r={0.01} ink={false} />}
    </group>
  ),
  plant: () => (
    <group>
      <Box size={[0.36, 0.4, 0.36]} mat={MAT.furn2} position={[0, 0.2, 0]} r={0.06} />
      <mesh position={[0, 0.78, 0]} material={MAT.plant} castShadow><icosahedronGeometry args={[0.4, 1]} /></mesh>
    </group>
  ),
};

function Chair(p) {
  return (
    <group {...p}>
      <Box size={[0.44, 0.05, 0.44]} mat={MAT.furn} position={[0, 0.45, 0]} r={0.02} />
      <Box size={[0.44, 0.42, 0.05]} mat={MAT.furn} position={[0, 0.68, -0.2]} r={0.02} />
      <Box size={[0.36, 0.43, 0.36]} mat={MAT.furn} position={[0, 0.215, 0]} r={0.02} ink={false} />
    </group>
  );
}

function Bed({ w }) {
  // 床头在 -z（背面），床尾朝 +z
  return (
    <group>
      <Box size={[w + 0.08, 0.3, 2.1]} mat={MAT.furnWood} position={[0, 0.15, 0]} r={0.03} />
      <Box size={[w, 0.22, 2.0]} mat={MAT.bedding || MAT.furn} position={[0, 0.41, 0.02]} r={0.06} />
      <Box size={[w + 0.12, 1.0, 0.1]} mat={MAT.sofa || MAT.furn2} position={[0, 0.5, -1.05]} r={0.04} />
      {!DECOR && [-w / 4, w / 4].map((x) => <Box key={x} size={[w / 2 - 0.12, 0.12, 0.38]} mat={MAT.bedding || MAT.furn} position={[x, 0.58, -0.75]} r={0.05} />)}
      {!DECOR && <Box size={[w + 0.02, 0.06, 0.7]} mat={MAT.fabric} position={[0, 0.54, 0.55]} r={0.03} />}
      {[-1, 1].map((s) => <Box key={s} size={[0.45, 0.5, 0.4]} mat={MAT.furnWood} position={[s * (w / 2 + 0.32), 0.25, -0.85]} r={0.02} />)}
    </group>
  );
}

// 厨卫固定设施（橱柜、冰箱、淋浴、马桶、洗手台）和活动家具分开，分步搭建时先装前者
export const FIXTURES = ["kitchen", "fridge", "shower", "toilet", "basin"];

export function Furniture({ plan, show = 1, only }) {
  return (
    <group>
      {plan.furniture.filter((f) => !only || only(f)).map((f, i, all) => {
        const Make = MODEL_LIB?.[f.type] || LIB[f.type]; // look=pro&pbr：部分家具换成 CC0 模型
        if (!Make) return null;
        // show 0~1：家具一件接一件落下来（每件用 40% 的时间，前后错开）
        const k = Math.max(0, Math.min(1, (show * (all.length + 1.5) - i) / 2.5));
        const e = 1 - Math.pow(1 - k, 3);
        return (
          <group key={i} position={[f.at[0], (1 - e) * 1.2, f.at[1]]} rotation={[0, (f.rot * Math.PI) / 180, 0]} scale={0.6 + 0.4 * e} visible={k > 0.001}
            userData={{ bake: `furn:${plan.furniture.indexOf(f)}`, bakeCls: f.type === "plant" ? "dynamic" : "static" }}>
            <Make f={f} />
          </group>
        );
      })}
    </group>
  );
}
