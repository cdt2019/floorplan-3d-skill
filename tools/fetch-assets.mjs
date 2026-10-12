// 下载画质实验（?look=pro&pbr）用的 Poly Haven CC0 素材到 public/assets/polyhaven/（文件不进 git，来源和协议见 public/assets/CREDITS.md）
// 用法：node tools/fetch-assets.mjs
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { root, log } from "./browser.mjs";

const ASSETS = [
  ["hdri", "kloppenheim_06_puresky"],
  ["tex", "laminate_floor_02"], ["tex", "white_plaster_02"], ["tex", "rough_linen"], ["tex", "marble_01"],
  ["model", "modern_coffee_table_01"], ["model", "potted_plant_01"], ["model", "potted_plant_02"],
  // 软装（look=pro&pbr 的 decor 规则，见 src/look/decor.js）：小绿植、陶瓷花瓶、相框、边几、休闲椅、藤编篮；地毯 / 毯子 / 毛巾的织物纹理
  ["model", "potted_plant_04"], ["model", "ceramic_vase_01"], ["model", "ceramic_vase_02"], ["model", "ceramic_vase_04"],
  ["model", "standing_picture_frame_02"], ["model", "side_table_01"], ["model", "mid_century_lounge_chair"], ["model", "wicker_basket_01"],
  ["tex", "poly_wool_herringbone"], ["tex", "curly_teddy_natural"], ["tex", "waffle_pique_cotton"],
  // 第 3 轮（人眼高度 + 烘焙光照，见 src/look/bake.js）：窗外的蓝调天空（烘焙时也用它照亮屋里）用 2k；胡桃木家具的木纹
  ["hdri", "qwantani_moonrise_puresky", "2k"], ["tex", "wood_table_001"],
  // 第 4 轮（阳台夜景 &night=n2 / n3）：上海外滩夜景 HDRI 当远景天际线，8k（tools/blender/night_plate.py 裁出地平线那一条、调成蓝调）
  ["hdri", "shanghai_bund", "8k"],
];
const H = { "user-agent": "floorplan-3d-skill asset fetch (CC0, see CREDITS.md)" };
const get = async (url) => { const r = await fetch(url, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };

for (const [kind, id, RES = "1k"] of ASSETS) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const list = [];
  if (kind === "hdri") list.push([`${id}_${RES}.hdr`, files.hdri[RES].hdr.url]);
  if (kind === "tex") for (const k of ["Diffuse", "nor_gl", "Rough"]) { const u = files[k][RES].jpg.url; list.push([u.split("/").pop(), u]); }
  if (kind === "model") {
    const g = files.gltf[RES].gltf;
    list.push([g.url.split("/").pop(), g.url]);
    for (const [p, f] of Object.entries(g.include)) list.push([p, f.url]);
  }
  for (const [rel, url] of list) {
    const out = join(root, "public/assets/polyhaven", kind, id, rel);
    if (existsSync(out)) continue;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(await (await get(url)).arrayBuffer()));
    log(`${kind}/${id}/${rel}`);
  }
}
log("素材齐了");
