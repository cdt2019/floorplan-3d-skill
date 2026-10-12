// look=pro 的后期：AO → 泛光 → 移轴（鸟瞰）/ 景深（人眼）→ 色调映射（默认 Khronos PBR Neutral，?tm=agx|aces 可换）→ 调色 → 暗角 → SMAA
// 带 mood 时：移轴改成经典的水平焦带（上下虚、中间实，横竖两遍模糊），强度、泛光、暗角、AO、饱和度、对比度按预设
// 成片时间线（seq=final）：泛光和暗角跟着屋里开灯（光照状态的 lamps）从白天那套过渡到 m3 那套
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, N8AO, Bloom, TiltShift2, DepthOfField, ToneMapping, Vignette, SMAA, HueSaturation, BrightnessContrast } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { EYE_RT as EYE, BAKED_VIEW, MOOD, MOODS, SEQ, TOUR, lightAt } from "./look.js"; // 人眼景深那套只给第 1 轮的实时人眼视角；烘焙视角走 mood（m3）那套
import { useScene } from "../store.js";

const q = new URLSearchParams(location.search);
const TM = { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL }[q.get("tm") || "neutral"];
const P = { tilt: 0.1, taper: 0.6, bloom: EYE ? 0.3 : 0.25, bloomTh: 0.95, vig: 0.45, ao: EYE ? 2.2 : 2.6, sat: 0, contrast: 0, ...(MOOD?.post || {}) };
for (const k of Object.keys(P)) if (q.has("p" + k)) P[k] = Number(q.get("p" + k)); // 调参：ptilt= ptaper= pbloom= pvig= pao= psat= pcontrast=
const PN = SEQ ? { ...P, ...MOODS.m3.post } : null; // 成片的夜里
// 进到屋里（人眼高度，烘焙光照）：不要移轴（那是微缩模型的感觉），AO 减弱（烘焙里已经有接触阴影），泛光、暗角收一点
// 漫游成片（第 6 轮）：外滩的灯光泛光收一点（强度 0.42 → 0.26、阈值 0.92 → 0.96），光晕不糊成一片
const PI = { tilt: 0, ao: 1.1, aoR: 0.45, bloom: TOUR ? 0.26 : 0.42, bloomTh: TOUR ? 0.96 : 0.92, vig: 0.34 };
for (const k of Object.keys(PI)) if (q.has("i" + k)) PI[k] = Number(q.get("i" + k)); // 调参：iao= ibloom= ivig= …

// 成片：每帧按开灯程度插值泛光强度 / 阈值、暗角；推进客厅时（store.inside）再过渡到人眼那套
function SeqPost({ bloom, vig, tilt, ao }) {
  useFrame(() => {
    const S = useScene.getState(), k = SEQ ? lightAt(S.tod).lamps : 1, a = S.inside, N = PN || { ...P };
    const mix = (x, y, u) => x + (y - x) * u, lit = (key) => mix(mix(P[key], N[key], k), PI[key], a);
    if (bloom.current) { bloom.current.intensity = lit("bloom"); bloom.current.luminanceMaterial.threshold = lit("bloomTh"); }
    if (vig.current) vig.current.darkness = lit("vig");
    for (const t of tilt) if (t.current) t.current.blur = lit("tilt");
    if (ao.current) { ao.current.configuration.intensity = lit("ao"); ao.current.configuration.aoRadius = mix(0.9, PI.aoR, a); }
  });
  return null;
}

export function ProPost() {
  const bloom = useRef(), vig = useRef(), tilt = [useRef(), useRef()], ao = useRef();
  useEffect(() => { window.__postReady = true; }, []);
  return (
    <>
      {(SEQ || BAKED_VIEW) && <SeqPost bloom={bloom} vig={vig} tilt={tilt} ao={ao} />}
      <EffectComposer multisampling={0} stencilBuffer={false}>
        <N8AO ref={ao} aoRadius={EYE ? 0.7 : 0.9} distanceFalloff={1} intensity={P.ao} quality="high" halfRes={false} />
        <Bloom ref={bloom} mipmapBlur luminanceThreshold={P.bloomTh} luminanceSmoothing={0.25} intensity={P.bloom} />
        {EYE
          ? <DepthOfField focusDistance={0.02} focalLength={0.06} bokehScale={1.5} />
          : MOOD
            ? <>
              {/* 焦带：过画面中心（相机看向模型中心）的水平线；横、竖各模糊一遍，不出单方向的拖影 */}
              <TiltShift2 ref={tilt[0]} blur={P.tilt} taper={P.taper} start={[0, 0.5]} end={[1, 0.5]} samples={12} direction={[1, 0]} />
              <TiltShift2 ref={tilt[1]} blur={P.tilt} taper={P.taper} start={[0, 0.5]} end={[1, 0.5]} samples={12} direction={[0, 1]} />
            </>
            : <TiltShift2 blur={0.1} taper={0.6} start={[0.5, 0.05]} end={[0.5, 0.95]} samples={10} />}
        <ToneMapping mode={TM} />
        {MOOD && <HueSaturation saturation={P.sat} />}
        {MOOD && <BrightnessContrast contrast={P.contrast} />}
        <Vignette ref={vig} offset={0.32} darkness={P.vig} />
        <SMAA />
      </EffectComposer>
    </>
  );
}
