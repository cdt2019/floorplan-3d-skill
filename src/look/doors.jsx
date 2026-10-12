// 第 5 轮（第一人称漫游）：门的姿态和开门动画。只在漫游成片（seq=final）和人眼烘焙视角（view=eye&baked，含 bake=export）里生效；
// 默认画面和其他 look=pro 视角照旧（Walls.jsx 拿到 null 就用原来的"门扇开 70°"）。
//
// 规则（只看户型数据）：
//   平开门：开进"私密"的那一侧（卧室、卫生间、书房……；外墙上的门开进屋里），合页在离房间墙角近的那一边（门扇开到头贴着墙），
//          合页可以指定：opening.hinge 或 tour.js 的 DOOR_OVERRIDES（按户型名 + 门的名字，不改户型数据）："a" | "b" = 墙的哪一头
//          （opus55 的卫生间门：合页放东边，门扇挡住马桶、露出洗手台）；
//          开启角度按 [90, 105, 115, 120, 80, 70, 60] 依次试，门扇（一条线段）离家具、墙至少 6 厘米
//   入户门（外墙上的门）：合页规则同上，先试 100°（门扇别挡厨房），开门进度跟着 store.doorE（0 关 → 1 开）
//   推拉门：store.slideB（阳台，> 2 米的四扇门：中间两扇往两边推，让出中间一半）、store.slideK（其他推拉门，两扇：一扇推到另一扇后面，
//          DOOR_OVERRIDES 的 slide: "a" | "b" 指定让出哪一半）
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box, Block, MAT } from "../build/kit.jsx";
import { TOUR, BAKED_VIEW } from "./look.js";
import { roomKind, FURN, toWorld } from "./decor.js";
import { useScene } from "../store.js";
import { DOOR_OVERRIDES } from "./tour.js";

const PLAN_ID = typeof location !== "undefined" ? new URLSearchParams(location.search).get("plan") : null;

export const DOORS_ON = TOUR || BAKED_VIEW; // seq=r4 照旧（第 4 轮的门、第 4 轮的烘焙）
const PRIVATE = new Set(["bedroom", "bath", "study", "kitchen", "other"]);
const rad = (d) => (d * Math.PI) / 180;

// 线段到轴对齐矩形的最近距离（采样，够用）
function segBoxDist(p, q, b) {
  let best = Infinity;
  for (let i = 0; i <= 16; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 16, z = p[1] + ((q[1] - p[1]) * i) / 16;
    const dx = Math.max(b[0] - x, 0, x - b[2]), dz = Math.max(b[1] - z, 0, z - b[3]);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

// 每扇门的姿态：key = `${wall}:${at}` → { hs, ss, angle, exterior } 或 { slide: "B" | "K" }
// hs：合页在洞口局部 x 的哪一边（+1 / −1）；ss：门扇开向局部 z 的哪一边；angle：开到头的角度（弧度）
export function doorPoses(plan) {
  if (!DOORS_ON) return null;
  const rooms = plan.rooms.map((r) => ({ ...r, kind: roomKind(r) }));
  const roomAt = (x, z) => rooms.find((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]) || null;
  const boxes = plan.furniture.map((f) => {
    const S = FURN[f.type] || { w: 0.5, d: 0.5 }, [cx, cz] = toWorld(f, 0, S.oz || 0), r = rad(f.rot || 0);
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), hw = (S.w * c + S.d * s) / 2, hd = (S.w * s + S.d * c) / 2;
    return [cx - hw, cz - hd, cx + hw, cz + hd];
  });
  // 墙也当障碍（线段两边各厚 t/2）
  const wallBoxes = plan.walls.map((w) => [Math.min(w.a[0], w.b[0]) - w.t / 2, Math.min(w.a[1], w.b[1]) - w.t / 2, Math.max(w.a[0], w.b[0]) + w.t / 2, Math.max(w.a[1], w.b[1]) + w.t / 2]);
  const out = {};
  for (const w of plan.walls) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const rot = -Math.atan2(dz, dx), c = Math.cos(rot), s = Math.sin(rot);
    // 局部 → 世界（和 Walls.jsx 里洞口的 group 一样：局部 x 沿墙，局部 z 垂直于墙）
    const toW = (cx, cz, lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    for (const o of plan.openings.filter((o) => o.wall === w.id)) {
      const key = `${w.id}:${o.at}`, cx = w.a[0] + ux * o.at, cz = w.a[1] + uz * o.at;
      if (o.type === "slide") { out[key] = { slide: o.w > 2 ? "B" : "K", side: DOOR_OVERRIDES[PLAN_ID]?.[o.name]?.slide }; continue; }
      if (o.type !== "door") continue;
      const side = (sg) => roomAt(...toW(cx, cz, 0, sg * (w.t / 2 + 0.3)));
      const rp = side(1), rn = side(-1), exterior = !rp || !rn;
      // 开向：外墙门开进屋里；室内门开进私密的那一间（两边都私密 / 都公共时开进小的那间）
      const area = (r) => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
      const ss = exterior ? (rp ? 1 : -1) : PRIVATE.has(rp.kind) !== PRIVATE.has(rn.kind) ? (PRIVATE.has(rp.kind) ? 1 : -1) : area(rp) < area(rn) ? 1 : -1;
      const room = ss > 0 ? rp : rn;
      // 合页：离这间房的墙角近的那一边；opening.hinge 可以指定（a = 靠墙的 a 端，即局部 −x）
      let hs;
      const hinge = o.hinge ?? DOOR_OVERRIDES[PLAN_ID]?.[o.name]?.hinge; // 户型数据里写了就用，否则看 tour.js 的覆盖项
      if (hinge) hs = hinge === "a" ? -1 : 1;
      else {
        const along = (x, z) => (x - w.a[0]) * ux + (z - w.a[1]) * uz;
        const [u0, u1] = [room.rect[0], room.rect[2]].flatMap((x) => [room.rect[1], room.rect[3]].map((z) => along(x, z))).reduce(([lo, hi], u) => [Math.min(lo, u), Math.max(hi, u)], [Infinity, -Infinity]);
        hs = o.at - o.w / 2 - u0 <= u1 - (o.at + o.w / 2) ? -1 : 1;
      }
      const f = 0.05, Lf = o.w - 2 * f, piv = toW(cx, cz, hs * (o.w / 2 - f), ss * w.t / 2);
      const ovAngle = DOOR_OVERRIDES[PLAN_ID]?.[o.name]?.angle;
      const tries = ovAngle ? [ovAngle] : exterior ? [100, 90, 80, 70] : [90, 105, 115, 120, 80, 70, 60];
      let angle = rad(tries[tries.length - 1]);
      for (const a of tries) {
        const th = ss * hs * rad(a), lx = -hs * Lf * Math.cos(th), lz = hs * Lf * Math.sin(th);
        const tip = toW(cx, cz, hs * (o.w / 2 - f) + lx, ss * w.t / 2 + lz);
        // 门扇这条线段（去掉合页那头 8 厘米）离家具、别的墙都要 ≥ 6 厘米
        const p0 = [piv[0] + (tip[0] - piv[0]) * 0.1, piv[1] + (tip[1] - piv[1]) * 0.1];
        const ok = boxes.every((b) => segBoxDist(p0, tip, b) >= 0.06) && wallBoxes.every((b, i) => plan.walls[i] === w || segBoxDist(p0, tip, b) >= 0.04);
        if (ok) { angle = rad(a); break; }
      }
      out[key] = { hs, ss, angle, exterior };
    }
  }
  return out;
}

// 平开门的门扇：合页在 (hs·(w/2 − f), 0, ss·t/2)，关着时门扇沿洞口；开门绕合页转 ss·hs·角度
export function DoorLeaf({ w, h, t, f, pose }) {
  const g = useRef();
  const set = (k) => { if (g.current) g.current.rotation.y = pose.ss * pose.hs * pose.angle * k; };
  useFrame(() => set(pose.exterior ? useScene.getState().doorE : 1));
  const L = w - 2 * f;
  return (
    <group ref={g} position={[pose.hs * (w / 2 - f), 0, pose.ss * t / 2]} rotation={[0, pose.exterior ? 0 : pose.ss * pose.hs * pose.angle, 0]}>
      {/* 胡桃木门扇（和深色门框、走廊对面邻居家的门一套）：转身时门扇常在画面里，奶白的一大块板太空 */}
      <Box size={[L, h - f - 0.01, 0.04]} r={0.01} mat={MAT.furnWood} position={[-pose.hs * L / 2, (h - f) / 2, -pose.ss * 0.02]} />
      {/* 拉手：门扇自由端、1 米高，屋里屋外各一个 */}
      {[-1, 1].map((sd) => <Block key={sd} size={[0.03, 0.2, 0.025]} mat={MAT.dark} position={[-pose.hs * (L - 0.08), 1.0, -pose.ss * 0.02 + sd * 0.035]} />)}
    </group>
  );
}

// 推拉门的门扇：n 扇、两条轨道交错；open 0 → 1 时按规则推开
// side（两扇门才有用）："a" = 墙 a 端那扇推到另一扇上面（让出 a 端那一半，opus55 的厨房：东半边门口正对着餐椅）；默认 b 端那扇推过去
export function SlidePanels({ w, h, f, kind, side }) {
  const n = w > 2 ? 4 : 2, pw = w / n + 0.03, step = (w - pw) / (n - 1);
  const refs = useRef([]);
  // 每扇推开时的位移：四扇门中间两扇各推到外侧那扇上面；两扇门东边那扇推到西边那扇上面（side = "a" 时反过来）
  const shift = (i) => (n === 4 ? (i === 1 ? -step : i === 2 ? step : 0) : side === "a" ? (i === 0 ? step : 0) : i === 1 ? -step : 0);
  useFrame(() => {
    const k = useScene.getState()[kind === "B" ? "slideB" : "slideK"];
    refs.current.forEach((r, i) => { if (r) r.position.x = -w / 2 + pw / 2 + i * step + shift(i) * k; });
  });
  return Array.from({ length: n }, (_, i) => (
    <group key={i} ref={(r) => (refs.current[i] = r)} position={[-w / 2 + pw / 2 + i * step, 0, (i % 2 ? 1 : -1) * 0.025]}>
      <Block size={[pw, h - f, 0.03]} mat={MAT.glass} position={[0, (h - f) / 2, 0]} />
      <Block size={[0.03, h - f, 0.035]} mat={MAT.frame} position={[-pw / 2 + 0.015, (h - f) / 2, 0]} />
      <Block size={[0.03, h - f, 0.035]} mat={MAT.frame} position={[pw / 2 - 0.015, (h - f) / 2, 0]} />
    </group>
  ));
}
