// 视觉方案。网址加 ?style=a|b|c|d 切换（第 1 轮风格对比用）。
import { MOOD } from "./look/look.js";
// 每套都按三层明暗：浅色（墙、地）、中间色（家具、地板纹理）、深色（墙顶剖切面 / 门窗框），外加一个强调色。
const BASE = {
  font: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  serif: '"Noto Serif SC", "Source Han Serif SC", "SimSun", serif',
  mono: 'Consolas, "Cascadia Mono", monospace',
  outline: 0,       // 墨线粗细（世界单位），0 = 不描边
  edges: false,     // 家具只画棱线（蓝图风）
  env: 1,
  grid: true,
  glass: "#cfe3ee",
  plant: "#6f8f5e",
};

export const STYLES = {
  // A 图纸风（延续驮-01）：暖白纸 + 网格，墙顶剖切面涂墨色（建筑图纸的"剖到的墙涂黑"），白色家具细墨线，陶土橙
  a: {
    ...BASE, id: "a", name: "图纸剖切",
    paper: "#fbfaf6", ground: "#fbfaf6", gridLine: "#e6e1d4", gridBold: "#d3ccbb",
    ink: "#1c1b19", inkSoft: "#5f5d57", accent: "#e2602f", seal: "#c23a26",
    wall: "#f4f1ea", wallTop: "#2e2c28", frame: "#3a3732",
    wood: "#e6d6bd", woodLine: "#d5c2a3", tile: "#e9e7e1", tileLine: "#d8d5cd",
    furn: "#f7f5f0", furn2: "#d9d3c6", furnWood: "#c9ad86", fabric: "#e2602f",
    outline: 0.012, hud: "drawing",
  },
  // B 建筑白模：浅灰影棚，墙和家具全是白色哑光，只有木质家具一点暖色，靠阴影出层次（建筑系模型的感觉）
  b: {
    ...BASE, id: "b", name: "建筑白模",
    paper: "#ecebe8", ground: "#ecebe8", gridLine: "#e3e2de", gridBold: "#d8d7d2", grid: false,
    ink: "#1d1d1f", inkSoft: "#6b6b70", accent: "#d0743c", seal: "#1d1d1f",
    wall: "#fbfbfa", wallTop: "#fbfbfa", frame: "#cfcfcc",
    wood: "#f3f2ef", woodLine: "#ebe9e5", tile: "#f3f2ef", tileLine: "#e6e4df",
    furn: "#ffffff", furn2: "#ebeae6", furnWood: "#d8bf98", fabric: "#ebeae6",
    env: 1.1, hud: "clean",
  },
  // C 暖木效果图：像装修效果图，橡木地板、灰蓝瓷砖、鼠尾草绿沙发、亚麻床品、陶土色地毯
  c: {
    ...BASE, id: "c", name: "暖木效果图",
    paper: "#f3eee6", ground: "#f3eee6", gridLine: "#ebe4d8", gridBold: "#e2d9ca", grid: false,
    ink: "#2b2622", inkSoft: "#6e655c", accent: "#c8663e", seal: "#2b2622",
    wall: "#f6f1e9", wallTop: "#e8e0d3", frame: "#4a423b",
    wood: "#c99a66", woodLine: "#b4844f", tile: "#c9d0d1", tileLine: "#b5bdbe",
    furn: "#efe8dc", furn2: "#8fa58a", furnWood: "#8a6440", fabric: "#c8663e",
    env: 1.05, hud: "clean",
  },
  // D 蓝图：浅蓝灰纸 + 白网格，墙半透明带海军蓝棱线，家具只画线框，橙色强调
  d: {
    ...BASE, id: "d", name: "蓝图线框",
    paper: "#e6edf4", ground: "#e6edf4", gridLine: "#f6f9fc", gridBold: "#ffffff",
    ink: "#1d3557", inkSoft: "#4f6580", accent: "#f2734a", seal: "#1d3557",
    wall: "#fdfeff", wallTop: "#1d3557", frame: "#1d3557",
    wood: "#f3f7fb", woodLine: "#e2eaf2", tile: "#eef3f8", tileLine: "#dde6ef",
    furn: "#f8fbfe", furn2: "#dbe5ef", furnWood: "#c6d4e3", fabric: "#f2734a",
    edges: true, ghost: true, hud: "drawing",
  },
  // ---------- 参考 Plamo 的分步搭建图（10-11）：单色、正投影等轴测、全身细轮廓线、这一步新加的构件高亮 ----------
  // E1 单色钢蓝：最接近参考
  e1: {
    ...BASE, id: "e1", name: "单色钢蓝", grid: false, ortho: true, edges: true, edgeColor: "#2f4a62", edgeOpacity: 0.7,
    paper: "#f1f6fa", ground: "#f1f6fa", gridLine: "#e8eff5", gridBold: "#dfe8f0",
    ink: "#1f3448", inkSoft: "#5b7186", accent: "#2f7fd0", seal: "#1f3448", hl: "#8fb9df",
    wall: "#e3ecf3", wallTop: "#c4d6e5", frame: "#9fb8cc", glass: "#b9d4ea",
    wood: "#edf3f8", woodLine: "#dde7f0", tile: "#e8eff5", tileLine: "#d8e3ec",
    furn: "#bcd0e0", furn2: "#a8c0d4", furnWood: "#b2c8db", fabric: "#9ab6cd", plant: "#94b2cb", dark: "#6f8aa2", person: "#3f5a72", // 家具比墙深一档，不然完成图看着像空屋
    env: 0.9, hud: "diagram",
  },
  // E2 单色暖灰 + 橙色高亮：我们自己的版本，和驮-01 一个系列
  e2: {
    ...BASE, id: "e2", name: "单色暖灰 · 橙色高亮", grid: false, ortho: true, edges: true, edgeColor: "#3d3832", edgeOpacity: 0.7,
    paper: "#f7f5f1", ground: "#f7f5f1", gridLine: "#efebe4", gridBold: "#e6e1d8",
    ink: "#1c1b19", inkSoft: "#6a655c", accent: "#e2602f", seal: "#c23a26", hl: "#e98a5e",
    wall: "#eeeae3", wallTop: "#d6cfc3", frame: "#b9b1a4", glass: "#dfe6ea",
    wood: "#f1ede6", woodLine: "#e4ded4", tile: "#ece8e1", tileLine: "#dfd9cf",
    furn: "#d4cbbe", furn2: "#c3b8a8", furnWood: "#cbc0b0", fabric: "#b8ac9b", plant: "#aea38f", dark: "#7f776a", person: "#4a443c", // 家具比墙深一档
    env: 0.9, hud: "diagram",
  },
  // E3 完成那一步上色：C 的暖木效果图配色 + 正投影 + 细轮廓线（搭建过程用 E2）
  e3: { ...BASE, id: "e3", grid: false, ortho: true, edges: true, edgeColor: "#3d3832", edgeOpacity: 0.5, hud: "diagram" },
};
STYLES.e3 = { ...STYLES.c, ...STYLES.e3, name: "完成上色（暖木）" };

const pick = typeof location !== "undefined" ? new URLSearchParams(location.search).get("style") : null;
export const T = STYLES[pick] || STYLES.a;
// 画质实验 ?look=pro：透视、不描边、不画棱线（光影自己出层次）
if (typeof location !== "undefined" && /[?&]look=(pro|pt)(&|$)/.test(location.search)) Object.assign(T, { ortho: false, edges: false, outline: 0 });
// 氛围预设（?look=pro&mood=…）换完成那一步的配色
if (MOOD?.palette) Object.assign(STYLES.e3, MOOD.palette);
