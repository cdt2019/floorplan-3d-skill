// 墙体生成：每面墙沿中线切成几段——洞口之间是整段墙，门窗洞口上面补过梁、窗下补窗台墙。
// 墙顶盖一层"剖切面"（图纸风涂墨色，像建筑平面图里被剖到的墙），门窗在洞口里按类型生成。
import { useMemo } from "react";
import { MAT, Block, Box } from "./kit.jsx";
import { T } from "../theme.js";
import { DOORS_ON, doorPoses, DoorLeaf, SlidePanels } from "../look/doors.jsx";

const EXT = 0.12; // 墙两端各多伸出一点，转角处补满

// cut：剖切高度。墙和门窗只保留到这个高度（像拆掉上半截的模型，看得到屋里）；不传就是满高
// walls / openings：分步搭建时可以只画墙、或只画门窗
// bake：给每段墙、门窗、栏板挂上烘焙用的名字（userData.bake，见 look/bake.js）；
// clipH：墙"长高"的动画（look=pro 推进客厅那段）——墙按满高建、由剖切面切到 clipH，顶上的剖切面盖板跟着 clipH 走，门窗按 clipH 重建
export function Walls({ plan, grow = 1, cut = plan.height, openings = true, walls = true, pop = 1, bake = false, clipH = null }) {
  const full = Math.min(cut, plan.height);
  const H = full * grow;
  // 第 5 轮：成片 / 人眼烘焙视角里门按规则开（见 look/doors.jsx）；其他情况 null，门照旧
  const poses = useMemo(() => (DOORS_ON ? doorPoses(plan) : null), [plan]);
  return (
    <group>
      {plan.walls.map((w) => <Wall key={w.id} wall={w} H={H} full={full} showWalls={walls} showOpenings={openings} pop={pop} openings={plan.openings.filter((o) => o.wall === w.id && o.sill < full).map((o) => ({ ...o, head: Math.min(o.head, full) }))} grow={grow} bake={bake} clipH={clipH} poses={poses} />)}
      {walls && plan.rails.map((r, i) => <Rail key={i} {...r} grow={grow} bake={bake && `rail:${i}`} />)}
    </group>
  );
}
const STATIC = (key) => (key ? { bake: key, bakeCls: "static" } : {});

function frameOf(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  return { L, ux: dx / L, uz: dz / L, rot: -Math.atan2(dz, dx) };
}

function Wall({ wall, openings, H, full, grow, showOpenings, showWalls, pop, bake, clipH, poses }) {
  const { L, ux, uz, rot } = frameOf(wall.a, wall.b);
  const t = wall.t;
  const ops = [...openings].sort((p, q) => p.at - q.at);
  // 沿墙方向切段：[u0, u1, y0, y1]
  const pieces = [];
  let u = -EXT;
  for (const o of ops) {
    const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
    if (o0 > u) pieces.push([u, o0, 0, full]);
    if (o.sill > 0) pieces.push([o0, o1, 0, o.sill]);
    if (o.head < full) pieces.push([o0, o1, o.head, full]);
    u = o1;
  }
  pieces.push([u, L + EXT, 0, full]);
  const at = (uc) => [wall.a[0] + ux * uc, wall.a[1] + uz * uc];
  return (
    <group>
      {showWalls && pieces.map(([u0, u1, y0, y1], i) => {
        const [x, z] = at((u0 + u1) / 2);
        const yy0 = Math.min(y0, full) * grow, yy1 = y1 * grow;
        if (yy1 - yy0 < 0.005) return null;
        const reachesTop = y1 >= full - 1e-6;
        // 长高动画：盖板在 clipH 处（这一段墙在 clipH 这个高度上存在才画）；长满以后回到墙顶
        const rising = clipH != null && clipH < full - 1e-4;
        const capY = rising ? (y0 < clipH && clipH <= y1 + 1e-6 ? clipH : null) : reachesTop ? yy1 : null;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, rot, 0]}>
            <group userData={STATIC(bake && `wall:${wall.id}:${i}`)}>
              <Block size={[u1 - u0, yy1 - yy0, t]} mat={MAT.wall} position={[0, (yy0 + yy1) / 2, 0]} ink={T.outline > 0 || T.edges} />
            </group>
            {capY != null && <Block size={[u1 - u0, 0.02, t + 0.004]} mat={MAT.wallTop} position={[0, capY + 0.01, 0]} />}
          </group>
        );
      })}
      {showOpenings && ops.filter((o) => clipH == null || o.sill < clipH).map((o) => (clipH == null ? o : { ...o, head: Math.min(o.head, clipH) })).map((o, i) => {
        const [x, z] = at(o.at);
        // pop 0~1：门窗从洞口里"长"出来（按位置错开一点）
        const k = Math.max(0, Math.min(1, pop * 1.6 - ((x + z) % 3) * 0.2));
        if (k <= 0) return null;
        return (
          <group key={"o" + i} position={[x, 0, z]} rotation={[0, rot, 0]} scale={[1, grow * (1 - Math.pow(1 - k, 3)), 1]} userData={bake ? { bake: `open:${wall.id}:${o.at}`, bakeCls: "dynamic" } : {}}>
            <Opening o={o} t={t} pose={poses?.[`${wall.id}:${o.at}`]} />
          </group>
        );
      })}
    </group>
  );
}

// 门窗：局部坐标里 x 沿墙、y 向上、z 垂直于墙
function Opening({ o, t, pose }) {
  const f = 0.05; // 框的截面
  const jamb = (x, h, y = h / 2) => <Block size={[f, h, t + 0.02]} mat={MAT.frame} position={[x, y, 0]} />;
  if (o.type === "door") {
    const h = o.head, w = o.w;
    return (
      <group>
        {jamb(-w / 2 + f / 2, h)}{jamb(w / 2 - f / 2, h)}
        <Block size={[w, f, t + 0.02]} mat={MAT.frame} position={[0, h - f / 2, 0]} />
        {/* 门扇开 70°，看得出开启方向（成片 / 人眼烘焙视角按 doors.jsx 的规则开） */}
        {pose ? <DoorLeaf w={w} h={h} t={t} f={f} pose={pose} /> : (
          <group position={[-w / 2 + f, 0, t / 2]} rotation={[0, -1.22, 0]}>
            <Box size={[w - 2 * f, h - f - 0.01, 0.04]} r={0.01} mat={MAT.furn} position={[(w - 2 * f) / 2, (h - f) / 2, 0]} />
          </group>
        )}
      </group>
    );
  }
  if (o.type === "slide") {
    const h = o.head, w = o.w, n = w > 2 ? 4 : 2, pw = w / n + 0.03;
    return (
      <group>
        {jamb(-w / 2 + f / 2, h)}{jamb(w / 2 - f / 2, h)}
        <Block size={[w, f, t + 0.02]} mat={MAT.frame} position={[0, h - f / 2, 0]} />
        {pose?.slide ? <SlidePanels w={w} h={h} f={f} kind={pose.slide} side={pose.side} /> : Array.from({ length: n }, (_, i) => (
          <group key={i} position={[-w / 2 + pw / 2 + i * (w - pw) / (n - 1), 0, (i % 2 ? 1 : -1) * 0.025]}>
            <Block size={[pw, h - f, 0.03]} mat={MAT.glass} position={[0, (h - f) / 2, 0]} />
            <Block size={[0.03, h - f, 0.035]} mat={MAT.frame} position={[-pw / 2 + 0.015, (h - f) / 2, 0]} />
          </group>
        ))}
      </group>
    );
  }
  // 窗
  const h = o.head - o.sill, w = o.w;
  return (
    <group position={[0, o.sill, 0]}>
      {jamb(-w / 2 + f / 2, h)}{jamb(w / 2 - f / 2, h)}
      <Block size={[w, f, t + 0.02]} mat={MAT.frame} position={[0, h - f / 2, 0]} />
      <Block size={[w, f, t + 0.02]} mat={MAT.frame} position={[0, f / 2, 0]} />
      <Block size={[w + 0.06, 0.03, t + 0.1]} mat={MAT.wall} position={[0, -0.015, 0]} />
      <Block size={[w - 2 * f, h - 2 * f, 0.02]} mat={MAT.glass} position={[0, h / 2, 0]} />
      {w > 1.2 && <Block size={[0.03, h - 2 * f, 0.03]} mat={MAT.frame} position={[0, h / 2, 0]} />}
    </group>
  );
}

// 阳台栏板：矮墙 + 金属扶手
function Rail({ a, b, grow, bake }) {
  const { L, ux, uz, rot } = frameOf(a, b);
  const x = a[0] + (ux * L) / 2, z = a[1] + (uz * L) / 2, h = 0.95 * grow;
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]} userData={STATIC(bake)}>
      <Block size={[L + 0.1, h, 0.1]} mat={MAT.wall} position={[0, h / 2, 0]} ink={T.outline > 0 || T.edges} />
      <Block size={[L + 0.1, 0.04, 0.12]} mat={MAT.frame} position={[0, h + 0.02, 0]} />
    </group>
  );
}
