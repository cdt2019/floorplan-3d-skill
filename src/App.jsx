import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { sourceFor } from "./plan/load.js";
import { T, STYLES } from "./theme.js";
import { useScene } from "./store.js";
import { Stage } from "./scene/Stage.jsx";
import { Walls } from "./build/Walls.jsx";
import { Floors } from "./build/Floors.jsx";
import { Furniture } from "./build/Furniture.jsx";
import { HL, Person } from "./build/kit.jsx";
import { Drawing } from "./build/Drawing.jsx";
import { Reading } from "./build/Reading.jsx";
import { applyFinish } from "./build/finish.js";
import { Hud } from "./hud/Hud.jsx";
import { TermPanel } from "./term/TermPanel.jsx";
import { PRO, PT, PBR, EYE, EYE_RT, BAKED_VIEW, LAMPS, DECOR, SEQ, TOUR, proCamera, fitPoints } from "./look/look.js";
import { sheetBounds } from "./plan/drawPlan.js";
import { ProStage, Ceiling } from "./look/ProStage.jsx";
import { PbrSync } from "./look/pbr.jsx";
import { Lamps } from "./look/lamps.jsx";
import { planDecor } from "./look/decor.js";
import { Decor } from "./look/Decor.jsx";
import { BakeSync } from "./look/bake.js";
import { Exterior, BakedCeiling, Vestibule, RiseSync, InsideSync, FULL_CUT } from "./look/inside.jsx";
import { DECOR_EXTRA } from "./look/tour.js";
// 画质实验（?look=pro / pt）：后期和路径追踪按需加载，默认画面不多下载
const ProPost = lazy(() => import("./look/ProPost.jsx").then((m) => ({ default: m.ProPost })));
const PathTracer = lazy(() => import("./look/PathTracer.jsx").then((m) => ({ default: m.PathTracer })));

const q = new URLSearchParams(location.search);
const CENTER = [5, 0, 4.9];
const TOP = q.get("view") === "top";
// 正投影等轴测（参考建筑分析图）或透视鸟瞰
const ORTHO = T.ortho;
// 镜头看向的点往右偏一点，楼落在画面左中，给右边的面板让位置
const VIEW_TARGET = TOP ? (ORTHO ? [CENTER[0] + 0.6, 0, CENTER[2] + 0.8] : CENTER) : [CENTER[0] + 1.6, 0, CENTER[2] - 0.4];
const CAM = TOP ? (ORTHO ? { position: [CENTER[0] + 0.6, 40, CENTER[2] + 0.8 + 0.001], zoom: 36 } : { position: [CENTER[0], 27, CENTER[2] + 0.001], fov: 30 })
  : ORTHO ? { position: [VIEW_TARGET[0] + 20, 24, VIEW_TARGET[2] + 20], zoom: 52 }
  : { position: [CENTER[0] + 12.1, 18, CENTER[2] + 14.6], fov: 30 };
// 剖切高度：3/4 视角默认 1.5 米，看得到屋里；?cut=2.8 看满高
const CUT = Number(q.get("cut") || (TOP || EYE ? 2.8 : 1.5));
// look=pro 的透视相机：带 mood 时按画面比例把模型（手办预设是底座）装进画面
let PROCAM = null;
const proCam = (bounds, plan) => (PROCAM ??= proCamera(CENTER, fitPoints(plan, bounds, CUT), bounds));

// 每帧应用上色进度（第 6 步）
function Finisher() {
  const scene = useThree((s) => s.scene);
  useFrame(() => { const s = useScene.getState(); applyFinish(SEQ ? 1 : s.stage >= 6 ? s.finish : 0, PRO ? null : scene); }); // look=pro 背景归 ProStage 管；成片时间线一开始就是上色后的配色
  return null;
}
// 把相机和控制器交给录视频的导演脚本
function Expose() {
  const { camera, controls } = useThree();
  const { scene, gl } = useThree();
  useEffect(() => { if (controls) window.__three = { camera, controls, center: CENTER, scene, gl }; }, [camera, controls, scene, gl]);
  return null;
}

// plan：用来长 3D 的数据（AI 读图的结果，或示例户型）；图纸见 sourceFor
export default function App({ plan: PLAN }) {
  const { stage, grow, reveal, pop, finish, floor, rise, ceil } = useScene();
  const bounds = [Math.min(...PLAN.rooms.map((r) => r.rect[0])), Math.min(...PLAN.rooms.map((r) => r.rect[1])), Math.max(...PLAN.rooms.map((r) => r.rect[2])), Math.max(...PLAN.rooms.map((r) => r.rect[3]))];
  const hl = (n) => !SEQ && stage === n; // 成片时间线不用橙色高亮
  // 软装（look=pro&pbr）：按户型数据算一次布置清单（规则见 look/decor.js）
  // 成片时间线：最后墙会长到满高，软装按满高算一套（挂画、窗帘、吊灯的位置），墙长高之前按剖切高度那套摆（decorLow）
  // 漫游成片（seq=final）：清单最后接上 tour.js 的补充软装（次卧南墙的画），序号在烘焙那些后面，对应关系不乱
  const extra = TOUR ? DECOR_EXTRA[q.get("plan")] : null;
  const decor = useMemo(() => (DECOR ? [...planDecor(PLAN, { cut: SEQ ? FULL_CUT : CUT }), ...(extra?.(false) || [])] : null), [PLAN]);
  const decorLow = useMemo(() => (DECOR && SEQ ? [...planDecor(PLAN, { cut: CUT }), ...(extra?.(true) || [])] : null), [PLAN]);
  if (typeof window !== "undefined") window.__decor = decor;
  const fullWalls = SEQ && rise > 0; // 推进客厅：换成满高的墙（剖切面往上推），和烘焙时导出的几何体一致
  const procam = PRO ? proCam(bounds, PLAN) : null;
  const cam = PRO ? { position: procam.position, fov: procam.fov } : CAM;
  return (
    <>
      <Canvas flat={!PRO} shadows={{ type: THREE.PCFShadowMap }} orthographic={ORTHO} dpr={[1, 2]} camera={{ ...cam, near: 0.1, far: PRO ? 400 : 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => { gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT + 0.03)]; }}>
        {PRO ? <ProStage center={CENTER} bounds={bounds} sheet={sheetBounds(sourceFor(PLAN))} /> : <Stage center={CENTER} />}
        {LAMPS && <Lamps plan={PLAN} decor={decor} low={decorLow} />}
        {PRO && EYE_RT && CUT >= PLAN.height - 0.15 && <Ceiling plan={PLAN} h={CUT} />}
        {PRO && (SEQ || BAKED_VIEW) && <>
          {ceil && <BakedCeiling plan={PLAN} h={FULL_CUT} />}
          {(ceil || TOUR) && <Vestibule plan={PLAN} />}
          <Exterior />
          <RiseSync cut={CUT} />
          <InsideSync />
          <BakeSync />
        </>}
        {PBR && <PbrSync />}
        <Finisher />
        <Expose />
        {/* 图纸一直铺在地上；完成那一步地板淡入、盖住图纸 */}
        <Drawing plan={sourceFor(PLAN)} />
        {stage === 2 && <Reading plan={PLAN} reveal={reveal} />}
        {(SEQ ? floor > 0.02 : stage >= 6 && finish > 0.001) && <Floors plan={PLAN} labels={false} palette={STYLES.e3} opacity={SEQ ? floor : finish} />}
        {fullWalls
          ? <Walls plan={PLAN} cut={FULL_CUT} bake clipH={rise < 1 ? CUT + (FULL_CUT - CUT) * rise : null} />
          : <>
            {stage >= 3 && <HL.Provider value={hl(3)}><Walls plan={PLAN} cut={CUT} grow={stage === 3 ? grow : 1} openings={false} bake={BAKED_VIEW} /></HL.Provider>}
            {stage >= 4 && <HL.Provider value={hl(4)}><Walls plan={PLAN} cut={CUT} openings walls={false} pop={stage === 4 ? pop : 1} bake={BAKED_VIEW} /></HL.Provider>}
          </>}
        {stage >= 5 && <HL.Provider value={hl(5)}><Furniture plan={PLAN} show={stage === 5 ? pop : 1} /></HL.Provider>}
        {DECOR && stage >= 5 && <Decor items={decor} low={decorLow} />}
        {stage >= 6 && finish > 0.6 && !PBR && <>
          <Person position={[2.6, 0, 6.0]} rot={0.8} />
          <Person position={[7.6, 0, 1.8]} rot={-0.6} />
        </>}
        <OrbitControls target={PRO ? procam.target : VIEW_TARGET} makeDefault />
        {PRO && !PT && <Suspense fallback={null}><ProPost /></Suspense>}
        {PT && <Suspense fallback={null}><PathTracer /></Suspense>}
      </Canvas>
      {!q.has("clean") && <Hud plan={PLAN} stage={stage} />}
      {q.has("cast") && <TermPanel src={`/casts/${q.get("cast")}.cast`} />}
    </>
  );
}
