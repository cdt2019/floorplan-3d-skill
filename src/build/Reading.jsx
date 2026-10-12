// 读图：在图纸上把 AI 读到的东西一样样框出来——墙（实心色带）、门窗（框 + 编号）、房间（细框）。
// items 来自 AI 读图的结果（见 skill 的读图步骤）；这里先用户型数据画出同样的东西
import * as THREE from "three";
import { useMemo } from "react";
import { T } from "../theme.js";

const Y = 0.004;
// reveal 0~1：先标墙、再标门窗、最后标房间
export function Reading({ plan, reveal = 1 }) {
  const show = { walls: reveal > 0.02, openings: reveal > 0.36, rooms: reveal > 0.7 };
  const mats = useMemo(() => ({
    wall: new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0.55, depthWrite: false }),
    open: new THREE.MeshBasicMaterial({ color: "#2f7fd0", transparent: true, opacity: 0.35, depthWrite: false }),
    line: new THREE.LineBasicMaterial({ color: T.accent }),
    openLine: new THREE.LineBasicMaterial({ color: "#2f7fd0" }),
  }), []);
  return (
    <group>
      {show.walls && plan.walls.map((w) => {
        const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz);
        return (
          <mesh key={w.id} material={mats.wall} rotation={[-Math.PI / 2, 0, -Math.atan2(dz, dx)]} position={[(w.a[0] + w.b[0]) / 2, Y, (w.a[1] + w.b[1]) / 2]} renderOrder={3}>
            <planeGeometry args={[L + w.t, w.t + 0.06]} />
          </mesh>
        );
      })}
      {show.openings && plan.openings.map((o, i) => {
        const w = plan.walls.find((v) => v.id === o.wall);
        const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz);
        const x = w.a[0] + (dx / L) * o.at, z = w.a[1] + (dz / L) * o.at;
        return (
          <group key={i} position={[x, Y + 0.001, z]} rotation={[0, -Math.atan2(dz, dx), 0]}>
            <mesh material={mats.open} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}><planeGeometry args={[o.w, w.t + 0.3]} /></mesh>
            <lineSegments material={mats.openLine} renderOrder={5}><edgesGeometry args={[new THREE.BoxGeometry(o.w, 0.001, w.t + 0.3)]} /></lineSegments>
          </group>
        );
      })}
      {show.rooms && plan.rooms.map((r) => {
        const [x0, z0, x1, z1] = r.rect, inset = 0.25;
        return (
          <lineSegments key={r.name} material={mats.line} position={[(x0 + x1) / 2, Y, (z0 + z1) / 2]} renderOrder={5}>
            <edgesGeometry args={[new THREE.BoxGeometry(x1 - x0 - 2 * inset, 0.001, z1 - z0 - 2 * inset)]} />
          </lineSegments>
        );
      })}
    </group>
  );
}
