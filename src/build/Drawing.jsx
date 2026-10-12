// 图纸：把 drawPlan 画出来的户型图当贴图，平铺在地上，和三维模型的坐标一一对齐。墙从图纸上的墙线里长出来
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { drawPlan, sheetBounds } from "../plan/drawPlan.js";
import { Block } from "./kit.jsx";
import { PRO, SEQ, BAKED_VIEW, noPointLights } from "../look/look.js";
import { useFade } from "../look/ProStage.jsx";

export function Drawing({ plan, ppm = 110 }) {
  const { tex, B } = useMemo(() => {
    const B = sheetBounds(plan);
    const c = document.createElement("canvas");
    c.width = Math.round((B.x1 - B.x0) * ppm); c.height = Math.round((B.z1 - B.z0) * ppm);
    drawPlan(c.getContext("2d"), plan, ppm);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
    return { tex, B };
  }, [plan, ppm]);
  const w = B.x1 - B.x0, d = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  // look=pro：纸板顶面和图纸只差 1 毫米，相机退远（竖版开场）时会 z-fighting、图纸上出现一条条空白；用 polygonOffset 把纸板往后推一点
  const paper = useMemo(() => (PRO ? noPointLights(new THREE.MeshStandardMaterial({ color: "#e6e3de", roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 })) : new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 })), []);
  // look=pro：纸受光，反照率压到 0.8 左右（纯白在太阳下会过曝、被色调映射染成橘色）
  // 第 5 轮：图纸本身不再 polygonOffset（只推纸板）——小分辨率下偏移量按像素算会超过纸面和底座顶面之间的 2 厘米，整张图纸掉到底座后面看不见
  const sheet = useMemo(() => (PRO ? noPointLights(new THREE.MeshStandardMaterial({ map: tex, color: "#e6e3de", roughness: 0.95 })) : null), [tex]);
  const ref = useRef();
  if (SEQ || BAKED_VIEW) useFade(ref); // eslint-disable-line react-hooks/rules-of-hooks -- 网址决定的常量；人眼漫游时图纸收起来（不然从阳台往下看得到）
  return (
    <group ref={ref}>
      {/* 一张有厚度的纸，底下有影子，像摊在桌上的图纸 */}
      <Block size={[w, 0.02, d]} mat={paper} position={[cx, -0.01, cz]} ink={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        {/* 不受灯光影响，墨线保持纯黑；look=pro 让纸受光（接影子，夜里跟着暗下来） */}
        {PRO ? <primitive object={sheet} attach="material" /> : <meshBasicMaterial map={tex} toneMapped={false} />}
      </mesh>
    </group>
  );
}
