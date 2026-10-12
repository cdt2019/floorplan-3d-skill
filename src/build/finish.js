// 上色：第 6 步把所有共享材质的颜色从当前风格（单色分析图）渐变到 e3（暖木效果图），背景和地面也跟着变。
// 共享材质只有十几份，每帧改颜色很便宜；不用换场景、不会跳变。
import * as THREE from "three";
import { MAT, EDGE } from "./kit.jsx";
import { STYLES, T } from "../theme.js";

const TO = STYLES.e3;
const KEYS = { wall: "wall", wallTop: "wallTop", frame: "frame", furn: "furn", furn2: "furn2", furnWood: "furnWood", fabric: "fabric", plant: "plant", dark: "dark", person: "person", glass: "glass" };
const from = {}, to = {};
for (const [m, k] of Object.entries(KEYS)) {
  if (!MAT[m]) continue;
  from[m] = MAT[m].color.clone();
  to[m] = new THREE.Color(TO[k] || T[k] || MAT[m].color.getStyle());
}
export const PAPER = { from: new THREE.Color(T.paper), to: new THREE.Color(TO.paper) };
const tmp = new THREE.Color();
let last = -1;

export function applyFinish(k, scene) {
  if (Math.abs(k - last) < 1e-4) return;
  last = k;
  for (const m of Object.keys(from)) MAT[m].color.copy(from[m]).lerp(to[m], k);
  EDGE.opacity = (T.edgeOpacity ?? 0.85) + ((TO.edgeOpacity ?? 0.5) - (T.edgeOpacity ?? 0.85)) * k;
  if (scene) {
    tmp.copy(PAPER.from).lerp(PAPER.to, k);
    if (scene.background?.isColor) scene.background.copy(tmp);
    if (scene.fog) scene.fog.color.copy(tmp);
    scene.userData.groundMat?.color.copy(tmp);
  }
}
