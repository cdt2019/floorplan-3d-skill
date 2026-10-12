// 楼板和房间地面：底下一块整体楼板（像建筑模型的底座），每个房间按材质铺地板 / 瓷砖，地上写房间名和面积
import * as THREE from "three";
import { useMemo } from "react";
import { MAT, Block, woodTex, tileTex, canvasTex } from "./kit.jsx";
import { T } from "../theme.js";
import { PBR } from "../look/look.js";
import { pbrFloorMaterial } from "../look/pbr.jsx";

// palette：地板贴图用哪套颜色；opacity：上色时淡入
export function Floors({ plan, labels = true, palette, opacity = 1 }) {
  // 楼板按房间逐块铺（每块向外多出半墙厚），不按外包矩形，不然凹进去的地方会多出一块空地台
  const E = 0.12;
  return (
    <group>
      {opacity > 0.99 && plan.rooms.map(({ name, rect: [x0, z0, x1, z1] }) => (
        <group key={name} userData={{ bake: `slab:${name}`, bakeCls: "static" }}>
          <Block size={[x1 - x0 + 2 * E, 0.16, z1 - z0 + 2 * E]} mat={MAT.wall} position={[(x0 + x1) / 2, -0.08, (z0 + z1) / 2]} />
        </group>
      ))}
      {plan.rooms.map((r) => <Room key={r.name} room={r} labels={labels} palette={palette} opacity={opacity} />)}
    </group>
  );
}

function Room({ room, labels, palette, opacity }) {
  const [x0, z0, x1, z1] = room.rect;
  const w = x1 - x0, d = z1 - z0;
  const mat = useMemo(() => {
    if (PBR) return pbrFloorMaterial(room.floor); // look=pro&pbr：Poly Haven 木地板 / 瓷砖
    const base = room.floor === "wood" ? woodTex(palette) : tileTex(palette);
    const t = base.clone();
    t.needsUpdate = true;
    const unit = room.floor === "wood" ? 1 : 0.6;
    t.repeat.set(w / unit, d / unit);
    return new THREE.MeshStandardMaterial({ map: t, roughness: room.floor === "wood" ? 0.55 : 0.35, envMapIntensity: T.env, transparent: true });
  }, [room, w, d, palette]);
  mat.opacity = opacity;
  const area = (w * d).toFixed(1);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0.002, (z0 + z1) / 2]} material={mat} receiveShadow userData={{ bake: `floor:${room.name}`, bakeCls: "static" }}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {labels && <Label text={room.name} sub={`${area} ㎡`} x={(x0 + x1) / 2} z={(z0 + z1) / 2 + (room.name === "客餐厅" ? 0.2 : 0)} />}
    </group>
  );
}

// 地面文字：canvas 画好贴在地上，系统字体就能写中文
function Label({ text, sub, x, z }) {
  const tex = canvasTex("label-" + text + sub, 512, 192, (g, w, h) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = T.ink; g.font = `800 ${h * 0.42}px ${T.font}`; g.fillText(text, w / 2, h * 0.36);
    g.fillStyle = T.accent; g.font = `700 ${h * 0.24}px ${T.mono}`; g.fillText(sub, w / 2, h * 0.8);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, z]} renderOrder={2}>
      <planeGeometry args={[1.6, 0.6]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
