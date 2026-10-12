// 舞台：纸色背景 + 网格地面、影棚环境光（程序生成，不下载 HDR）、投影
import * as THREE from "three";
import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { T } from "../theme.js";

function gridTexture() {
  const n = 512, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.fillStyle = T.ground; g.fillRect(0, 0, n, n);
  for (let i = 0; i <= 10 && T.grid; i++) {
    const p = Math.round((i * n) / 10) + 0.5;
    g.strokeStyle = i % 5 === 0 ? T.gridBold : T.gridLine;
    g.lineWidth = i % 5 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.moveTo(0, p); g.lineTo(n, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Stage({ center }) {
  const tex = useMemo(gridTexture, []);
  const scene = useThree((s) => s.scene);
  // 没有网格的风格：地面用纯色材质，上色时 finish.js 直接改它的颜色
  const groundMat = useMemo(() => (T.grid ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: T.ground, toneMapped: false })), [tex]);
  scene.userData.groundMat = T.grid ? null : groundMat;
  const size = 80;
  tex.repeat.set(size, size);
  return (
    <>
      <color attach="background" args={[T.paper]} />
      <fog attach="fog" args={[T.paper, 30, 70]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-10, 4, 6]} rotation-y={Math.PI / 2} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[10, 4, -4]} rotation-y={-Math.PI / 2} scale={[12, 5, 1]} />
      </Environment>
      <ambientLight intensity={0.3} />
      <directionalLight position={[center[0] - 6, 14, center[2] + 9]} target-position={center} intensity={1.7} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0003}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-camera-near={1} shadow-camera-far={40} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.161, center[2]]} material={groundMat}>
        <planeGeometry args={[size, size]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.159, center[2]]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial transparent opacity={0.18} color={T.ink} />
      </mesh>
      <ContactShadows position={[center[0], -0.158, center[2]]} scale={16} resolution={1024} blur={2.5} opacity={0.45} far={1.5} color={T.ink} frames={1} />
    </>
  );
}
