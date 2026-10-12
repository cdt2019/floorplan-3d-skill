// look=pro 的舞台：天光（鸟瞰用程序生成的柔光箱，人眼视角用天空 HDRI）+ 一盏太阳（阴影相机贴合模型），
// 地面和背景同色、只接影子（影棚无缝背景纸）。
// 光照每帧按 lightAt(tod) 更新（mood 预设、tod 时间、录视频时一天过去都走这里）；太阳方向变了就重新贴合阴影相机。
// 手办预设（desk）：图纸下面垫一块底座，放在书桌上，旁边一支铅笔当比例参照。
import * as THREE from "three";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useProgress } from "@react-three/drei";
import { DESK, DYN, ENV_KIND, EYE, EYE_RT, PT, PLINTH_H, aspectNow, lightAt, plinthBox, sunDir } from "./look.js";
import { deskMaterial } from "./pbr.jsx";
import { useScene } from "../store.js";
import { BAKE, BAKE_EXP, bakeReady } from "./bake.js";

export const HDRI = "/assets/polyhaven/hdri/kloppenheim_06_puresky/kloppenheim_06_puresky_1k.hdr";

// 把阴影相机（正交）收紧到模型的包围盒：投影到太阳视角里取最小外框，阴影贴图的像素都用在模型上
function fitShadow(light, box, pad = 0.4, behind = 14) {
  const cam = light.shadow.camera;
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  cam.position.setFromMatrixPosition(light.matrixWorld);
  cam.lookAt(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld));
  cam.updateMatrixWorld();
  const inv = cam.matrixWorld.clone().invert();
  const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity), v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
    mn.min(v); mx.max(v);
  }
  Object.assign(cam, { left: mn.x - pad, right: mx.x + pad, bottom: mn.y - pad, top: mx.y + pad, near: Math.max(0.1, -mx.z - 1), far: -mn.z + behind });
  cam.updateProjectionMatrix();
}

// 截图用：贴图、模型、HDRI 都加载完，后期也挂上了，再多画 30 帧，置 window.__lookReady
function ReadyFlag() {
  const n = useRef(0);
  useFrame(() => {
    const p = useProgress.getState();
    if (p.active || p.loaded < p.total || !(window.__postReady || PT) || !bakeReady()) { n.current = 0; return; }
    if (++n.current === 30) window.__lookReady = true;
  });
  return null;
}

// 柔光箱三块板的相对亮度（颜色来自光照状态）
const LF = { top: 1.6, side: 0.6, ground: 0.4 };

export function ProStage({ center, bounds, sheet }) {
  const sun = useRef();
  const lf = { top: useRef(), side: useRef(), ground: useRef() };
  const envBg = useRef(), groundMat = useRef(), shadowMat = useRef();
  const { gl, scene } = useThree();
  const L0 = useMemo(() => lightAt(useScene.getState().tod), []);
  // 阴影相机要框住的范围：模型；手办预设再加上底座和桌上的铅笔
  const box = useMemo(() => {
    const [x0, z0, x1, z1] = bounds;
    const b = new THREE.Box3(new THREE.Vector3(x0 - 0.4, -0.2, z0 - 0.4), new THREE.Vector3(x1 + 0.4, 3.0, z1 + 0.4));
    if (DESK) b.union(plinthBox(sheet).expandByVector(new THREE.Vector3(7, 0, 4)));
    return b;
  }, [bounds, sheet]);
  useLayoutEffect(() => {
    sun.current.target.position.set(center[0], 0, center[2]);
    scene.add(sun.current.target);
    return () => scene.remove(sun.current?.target);
  }, [scene, center]);
  const lastDir = useRef("");
  useFrame(() => {
    const S = useScene.getState(), L = lightAt(S.tod), bk = BAKE.ready ? S.bake : 0; // bk：光照过渡到烘焙（进到屋里）
    gl.toneMappingExposure = L.exp + (BAKE_EXP - L.exp) * bk;
    const d = sunDir(L.sunEl, L.sunAz), s = sun.current, D = 30;
    s.position.set(center[0] + d[0] * D, d[1] * D, center[2] + d[2] * D);
    s.color.set(L.sunColor);
    s.intensity = L.sunI * (1 - bk);
    s.shadow.radius = PT ? 1 : L.shadowR;
    const key = d.map((v) => v.toFixed(4)).join();
    if (key !== lastDir.current) { lastDir.current = key; fitShadow(s, box); }
    scene.environmentIntensity = L.env;
    if (ENV_KIND !== "sky") {
      for (const k of ["top", "side", "ground"]) lf[k].current?.material.color.set(L["env" + k[0].toUpperCase() + k.slice(1)]).multiplyScalar(LF[k]);
      envBg.current?.set(L.envBg);
    }
    if (scene.background?.isColor) scene.background.set(L.bg);
    scene.fog?.color.set(L.bg);
    groundMat.current?.color.set(L.bg);
    if (shadowMat.current) shadowMat.current.opacity = L.shadowOp;
  });
  return (
    <>
      <ReadyFlag />
      <color attach="background" args={[L0.bg]} />
      {!EYE && <fog attach="fog" args={[L0.bg, DESK ? 60 : 38, DESK ? 130 : 80]} />}
      {/* 天光：Poly Haven 的傍晚天空 HDRI，只当环境光；人眼视角透过窗户能看到天 */}
      {ENV_KIND === "sky"
        ? <Environment files={HDRI} environmentIntensity={L0.env} environmentRotation={[0, 0.6, 0]} background={EYE_RT} backgroundBlurriness={0} backgroundIntensity={0.7} backgroundRotation={[0, 0.6, 0]} />
        : (
          // 柔光箱：顶上一大块、侧面一块补光、地面一点反光（像在摄影棚里拍建筑模型）；颜色跟着光照状态，一天过去时每帧重画
          <Environment resolution={256} frames={DYN ? Infinity : 1} environmentIntensity={L0.env}>
            <color ref={envBg} attach="background" args={[L0.envBg]} />
            <Lightformer ref={lf.top} form="rect" intensity={LF.top} color={L0.envTop} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
            <Lightformer ref={lf.side} form="rect" intensity={LF.side} color={L0.envSide} position={[14, 5, -6]} rotation-y={-Math.PI / 2} scale={[16, 6, 1]} />
            <Lightformer ref={lf.ground} form="rect" intensity={LF.ground} color={L0.envGround} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[30, 30, 1]} />
          </Environment>
        )}
      {EYE_RT && <hemisphereLight args={["#fff1e0", "#b08a66", 0.35]} />}
      <directionalLight ref={sun} color={L0.sunColor} intensity={L0.sunI}
        castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0002} shadow-normalBias={0.025} shadow-radius={PT ? 1 : L0.shadowR} />
      {/* 地面：和背景同色、不受光（像影棚的无缝背景纸），只接影子；人眼视角不要地面，窗外只有天 */}
      {!EYE && !DESK && <>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.166, center[2]]}>
          <planeGeometry args={[160, 160]} />
          <meshBasicMaterial ref={groundMat} color={L0.bg} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.164, center[2]]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <shadowMaterial ref={shadowMat} transparent opacity={L0.shadowOp} color="#3a2e24" />
        </mesh>
      </>}
      {DESK && <Desk sheet={sheet} />}
    </>
  );
}

// 手办预设：底座（深色哑光）+ 书桌（大尺度木纹：1:100 的模型旁边，桌面木纹就该这么大）+ 一支铅笔
// 推进客厅时书桌、底座、铅笔淡出（store.desk 1 → 0），模型变成"真的房子"
export function useFade(ref) {
  useFrame(() => {
    const g = ref.current, a = useScene.getState().desk;
    if (!g) return;
    g.visible = a > 0.002;
    g.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (a < 0.999 && !m.transparent) { m.transparent = true; m.needsUpdate = true; }
      m.opacity = a;
      // 只在淡出时关掉投影，别把原本不投影的打开（图纸那张贴图平面一投影就自己挡自己，整张纸发黑——第 4 轮开场看不到图纸就是这个）
      o.userData.cast0 ??= o.castShadow;
      o.castShadow = o.userData.cast0 && a > 0.5;
    });
  });
}
function Desk({ sheet }) {
  const ref = useRef();
  useFade(ref);
  const pb = useMemo(() => plinthBox(sheet), [sheet]);
  const c = pb.getCenter(new THREE.Vector3()), s = pb.getSize(new THREE.Vector3());
  const top = -0.02 - PLINTH_H;
  const desk = useMemo(() => deskMaterial(), []);
  const plinth = useMemo(() => new THREE.MeshStandardMaterial({ color: "#36312c", roughness: 0.62 }), []);
  return (
    <group ref={ref}>
      <mesh material={plinth} position={c.toArray()} castShadow receiveShadow>
        <boxGeometry args={s.toArray()} />
      </mesh>
      <mesh material={desk} rotation={[-Math.PI / 2, 0, 0]} position={[c.x, top, c.z]} receiveShadow>
        <planeGeometry args={[220, 220]} />
      </mesh>
      {/* 横版铅笔放在底座右边；竖版画面窄，放到底座下方（南边），开场的俯视里才看得到 */}
      {aspectNow() < 1
        ? <Pencil position={[c.x + 1.5, top, pb.max.z + 2.4]} rotation={[0, 0.16, 0]} />
        : <Pencil position={[pb.max.x + 3.2, top, c.z + 1.5]} rotation={[0, Math.PI / 2 + 0.18, 0]} />}
    </group>
  );
}

// 铅笔（真实 7 毫米粗、17.5 厘米长，按 1:100 放大）：六棱黄杆 + 削好的木头尖 + 铅芯 + 金属箍 + 橡皮
function Pencil(p) {
  const r = 0.36, L = 14.2;
  const m = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: "#e9a92a", roughness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ color: "#e2c194", roughness: 0.8 }),
    lead: new THREE.MeshStandardMaterial({ color: "#2a2a2c", roughness: 0.35, metalness: 0.3 }),
    ferrule: new THREE.MeshStandardMaterial({ color: "#c9c4b8", roughness: 0.3, metalness: 0.9 }),
    eraser: new THREE.MeshStandardMaterial({ color: "#e68a86", roughness: 0.9 }),
  }), []);
  // 沿 x 轴放倒；六棱柱让一个面贴着桌面
  return (
    <group {...p}>
      <group position={[0, r * Math.cos(Math.PI / 6), 0]} rotation={[0, 0, Math.PI / 2]}>
        <group rotation={[0, Math.PI / 6, 0]}>
          <mesh material={m.body} castShadow receiveShadow><cylinderGeometry args={[r, r, L, 6]} /></mesh>
          <mesh material={m.wood} position={[0, -L / 2 - 0.9, 0]} castShadow><cylinderGeometry args={[r, 0.09, 1.8, 6]} /></mesh>
          <mesh material={m.lead} position={[0, -L / 2 - 2.0, 0]} castShadow><cylinderGeometry args={[0.09, 0.01, 0.4, 12]} /></mesh>
          <mesh material={m.ferrule} position={[0, L / 2 + 0.5, 0]} castShadow><cylinderGeometry args={[r * 1.02, r * 1.02, 1.0, 24]} /></mesh>
          <mesh material={m.eraser} position={[0, L / 2 + 1.35, 0]} castShadow><cylinderGeometry args={[r * 0.98, r * 0.98, 0.7, 24]} /></mesh>
        </group>
      </group>
    </group>
  );
}

// 人眼视角加天花板（每个房间一块板，阳台也有——上一层的阳台底板），太阳只能从窗户进来
export function Ceiling({ plan, h }) {
  const mat = useRef(new THREE.MeshStandardMaterial({ color: "#f4f1ec", roughness: 0.9 })).current;
  return (
    <group>
      {plan.rooms.map(({ name, rect: [x0, z0, x1, z1] }) => (
        <mesh key={name} position={[(x0 + x1) / 2, h - 0.03, (z0 + z1) / 2]} material={mat} castShadow receiveShadow>
          <boxGeometry args={[x1 - x0 + 0.24, 0.06, z1 - z0 + 0.24]} />
        </mesh>
      ))}
    </group>
  );
}
