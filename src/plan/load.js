// 加载户型数据。网址带 ?plan=名字 时读 public/plans/名字.json（AI 读图的结果），否则用示例户型。
// 读图结果可能缺字段（门窗高度、地面材质……），这里按 schema 的默认值补齐。
import { PLAN as DEMO } from "./demo-plan.js";

const SILL = { door: [0, 2.1], slide: [0, 2.4], window: [0.9, 2.1] };
const WET = /厨|卫|浴|阳台|洗|厕/;

export function normalize(p) {
  const plan = { name: "户型", height: 2.8, walls: [], openings: [], rooms: [], rails: [], furniture: [], ...p };
  plan.openings = plan.openings.map((o) => {
    const [s, h] = SILL[o.type] || SILL.window;
    return { sill: s, head: h, ...o };
  });
  plan.rooms = plan.rooms.map((r) => ({ floor: WET.test(r.name) ? "tile" : "wood", outdoor: /阳台|露台/.test(r.name), ...r }));
  return plan;
}

export async function loadPlan() {
  const name = new URLSearchParams(location.search).get("plan");
  if (!name) return DEMO;
  const res = await fetch(`/plans/${name}.json`);
  if (!res.ok) throw new Error(`找不到 /plans/${name}.json`);
  return normalize(await res.json());
}

// 场景里铺的那张图纸：默认按读出来的数据重画（读你自己的户型图时就是它）；
// ?src=demo 铺示例户型的原图——演示视频里 AI 读的 plan.png 就是它画的，3D 照样用 ?plan= 的数据长
export const sourceFor = (plan) => (new URLSearchParams(location.search).get("src") === "demo" ? DEMO : plan);
