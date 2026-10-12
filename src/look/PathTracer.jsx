// look=pt：路径追踪（three-gpu-pathtracer）。场景、灯光、材质和 look=pro&pbr 完全一样，只换渲染器：
// 等贴图和模型加载完，把场景交给路径追踪器，之后每帧累积一个采样。进度写在 window.__pt（samples、每个采样的毫秒数）。
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { EXPOSURE } from "./look.js";

const q = new URLSearchParams(location.search);

// 光栅化时世界坐标 UV 是在着色器里算的（pbr.jsx 的 worldUV），路径追踪器只认几何体自己的 uv，所以先按同样规则把 uv 写进几何体
function bakeWorldUV(scene) {
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  scene.traverse((o) => {
    const size = o.isMesh && o.material?.userData?.worldUV;
    if (!size || !o.geometry.attributes.uv) return;
    const g = (o.geometry = o.geometry.clone());
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ay > 0.5) uv.setXY(i, v.x / size, v.z / size);
      else if (ax > az) uv.setXY(i, v.z / size, v.y / size);
      else uv.setXY(i, v.x / size, v.y / size);
    }
    uv.needsUpdate = true;
  });
}

export function PathTracer() {
  const { gl, scene, camera } = useThree();
  const pt = useRef(null);
  const stat = useRef({ samples: 0, t0: 0 });
  useEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = EXPOSURE;
    // 路径追踪不支持全局剖切面（编译时还会因为没有相机报错）；墙本来就只建到剖切高度，去掉不影响
    gl.clippingPlanes = [];
    const tracer = new WebGLPathTracer(gl);
    Object.assign(tracer, { bounces: Number(q.get("bounces") || 5), transmissiveBounces: 4, filterGlossyFactor: 0.5, minSamples: 1, renderDelay: 0, fadeDuration: 0, dynamicLowRes: false, rasterizeScene: true });
    // 分块渲染：GTX 1050 Ti 上整帧（tiles=1）或 2×2 一次画完要 1 秒以上，会触发 Windows 的显卡超时重置（TDR），页面直接崩；4×4 稳
    const tiles = Number(q.get("tiles") || 4);
    tracer.tiles.set(tiles, tiles);
    window.__pt = { samples: 0, status: "loading" };
    // 等贴图、模型、HDRI 全部加载完再建 BVH（没加载完的贴图会被当成黑图打包进去：地板变成黑镜子）
    let id, t0 = performance.now();
    const ready = () => { const p = useProgress.getState(); return !p.active && p.loaded === p.total && performance.now() - t0 > Number(q.get("ptwait") || 4000); };
    const build = () => {
      const t = performance.now();
      bakeWorldUV(scene);
      try { tracer.setScene(scene, camera); } catch (e) { window.__pt = { samples: 0, status: "error: " + e.message }; return; }
      window.__pt = { samples: 0, status: "tracing", buildMs: Math.round(performance.now() - t) };
      stat.current = { samples: 0, t0: performance.now() };
      pt.current = tracer;
    };
    const poll = () => { if (ready()) id = setTimeout(build, 1000); else id = setTimeout(poll, 300); };
    poll();
    return () => clearTimeout(id);
  }, [gl, scene, camera]);
  // 优先级 1：接管渲染。路径追踪器没准备好时照常光栅化
  useFrame(() => {
    const tracer = pt.current;
    if (!tracer) { gl.render(scene, camera); return; }
    tracer.renderSample();
    const s = tracer.samples, now = performance.now(), st = stat.current;
    // 第一个采样出来之前主要是编译着色器；之后的平均耗时才是每个采样的成本
    if (s >= 1 && !st.t1) { st.t1 = now; st.s1 = s; }
    window.__pt = { ...window.__pt, samples: +s.toFixed(2), seconds: +((now - st.t0) / 1000).toFixed(1), firstSampleS: st.t1 ? +((st.t1 - st.t0) / 1000).toFixed(1) : null,
      msPerSample: st.t1 && s > st.s1 ? Math.round((now - st.t1) / (s - st.s1)) : null };
  }, 1);
  return null;
}
