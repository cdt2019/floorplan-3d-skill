# 素材来源

画质实验（`?look=pro&pbr`、`?look=pt`）用到的外部素材，全部来自 [Poly Haven](https://polyhaven.com)，协议 **CC0 1.0**（公有领域，可商用、不要求署名；这里照样记下作者）。

文件本身不进 git，`node tools/fetch-assets.mjs` 下载到 `public/assets/polyhaven/`。都用 1k 分辨率；贴图只取 diffuse、nor_gl（OpenGL 法线）、rough 三张。

| 用在哪 | 素材 | 作者 | 下载的文件 | 大小 |
|---|---|---|---|---|
| 天光 / 窗外的天（人眼视角） | [Kloppenheim 06 (Pure Sky)](https://polyhaven.com/a/kloppenheim_06_puresky) | Greg Zaal, Jarod Guest | `kloppenheim_06_puresky_1k.hdr` | 1.1 MB |
| 木地板 | [Laminate Floor 02](https://polyhaven.com/a/laminate_floor_02) | Dario Barresi, Charlotte Baglioni | `laminate_floor_02_{diff,nor_gl,rough}_1k.jpg` | 1.7 MB |
| 墙面（只用法线和粗糙度，颜色不变） | [White Plaster 02](https://polyhaven.com/a/white_plaster_02) | Rob Tuytel | `white_plaster_02_{diff,nor_gl,rough}_1k.jpg` | 1.4 MB |
| 沙发、床品、地毯的布纹（只用法线和粗糙度） | [Rough Linen](https://polyhaven.com/a/rough_linen) | colormass, Rico Cilliers | `rough_linen_{diff,nor_gl,rough}_1k.jpg` | 2.7 MB |
| 厨房、卫生间、阳台地砖 | [Marble 01](https://polyhaven.com/a/marble_01) | Rob Tuytel | `marble_01_{diff,nor_gl,rough}_1k.jpg` | 0.5 MB |
| 茶几（替换方块茶几） | [Modern Coffee Table 01](https://polyhaven.com/a/modern_coffee_table_01) | Amin | glTF 1k（.gltf + .bin + 3 张贴图） | 1.3 MB |
| 客厅绿植（替换球形绿植） | [Potted Plant 01](https://polyhaven.com/a/potted_plant_01) | Rico Cilliers | glTF 1k（.gltf + .bin + 6 张贴图） | 6.0 MB |
| 阳台绿植 | [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) | Rico Cilliers | glTF 1k（.gltf + .bin + 6 张贴图） | 2.5 MB |
| 软装：小绿植（厨房台面、马桶水箱） | [Potted Plant 04](https://polyhaven.com/a/potted_plant_04) | James Ray Cock | glTF 1k | 2.1 MB |
| 软装：花瓶（电视柜、餐桌、茶几） | [Ceramic Vase 01](https://polyhaven.com/a/ceramic_vase_01)、[02](https://polyhaven.com/a/ceramic_vase_02)、[04](https://polyhaven.com/a/ceramic_vase_04) | James Ray Cock | glTF 1k × 3 | 1.7 MB |
| 软装：电视柜上的相框 | [Standing Picture Frame 02](https://polyhaven.com/a/standing_picture_frame_02) | James Ray Cock | glTF 1k | 0.6 MB |
| 软装：沙发边几 | [Side Table 01](https://polyhaven.com/a/side_table_01) | James Ray Cock | glTF 1k | 0.5 MB |
| 软装：主卧阅读角休闲椅 | [Mid Century Lounge Chair](https://polyhaven.com/a/mid_century_lounge_chair) | Kuutti Siitonen | glTF 1k | 2.0 MB |
| 软装：茶几上的藤编托盘 | [Wicker Basket 01](https://polyhaven.com/a/wicker_basket_01) | Kuutti Siitonen | glTF 1k | 2.7 MB |
| 软装：客厅地毯的人字纹（只用法线和粗糙度） | [Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone) | colormass, Rico Cilliers | `poly_wool_herringbone_{diff,nor_gl,rough}_1k.jpg` | 2.8 MB |
| 软装：卧室地毯、入户地垫的卷毛（只用法线和粗糙度） | [Curly Teddy Natural](https://polyhaven.com/a/curly_teddy_natural) | colormass, Rico Cilliers | `curly_teddy_natural_{diff,nor_gl,rough}_1k.jpg` | 2.0 MB |
| 软装：搭毯、床尾巾、毛巾、长地垫的华夫格（只用法线和粗糙度） | [Waffle Pique Cotton](https://polyhaven.com/a/waffle_pique_cotton) | colormass, Rico Cilliers | `waffle_pique_cotton_{diff,nor_gl,rough}_1k.jpg` | 2.5 MB |

软装（第 2 轮，`look=pro&pbr` 下按 `src/look/decor.js` 的规则自动布置）新增上面 11 项，约 16.6 MB；抱枕、被子、窗帘、挂画、书、厨具、毛巾、镜子、阳台桌椅、灯具都是代码里拼的几何体。看过没选的：Throw Pillows 01（花纹太跳）、Hanging Picture Frame 01–03（印刷画 / 古典框，换成按配色画的抽象画）、Television 02（老式显像管）、Sofa 02 / 03（皮沙发 / 欧式）、ArmChair 01（欧式）、Dining Chair 02（皮面拉扣）、Modern Ceiling Lamp 01（灯罩要能跟着开灯发光，改用代码拼的穹顶吊灯）、Desk Lamp Arm 01（带骨骼）、Decorative Book Set 01（贴图上百张）。

第 3 轮（人眼高度 + 烘焙光照，`?view=eye&baked`、`seq=final` 的最后一段）新增 2 项：

| 用在哪 | 素材 | 作者 | 下载的文件 | 大小 |
|---|---|---|---|---|
| 窗外的蓝调天空（也用来在 Blender 里照亮屋里；`tools/blender/bake.py` 压掉月亮、压暗地平线、调成深蓝后存成 `public/bake/*/sky.exr`） | [Qwantani Moonrise (Pure Sky)](https://polyhaven.com/a/qwantani_moonrise_puresky) | Greg Zaal, Jarod Guest | `qwantani_moonrise_puresky_2k.hdr` | 4.9 MB |
| 胡桃木家具的木纹（只取明暗，颜色仍是配色里的 furnWood） | [Wood Table 001](https://polyhaven.com/a/wood_table_001) | Dimitrios Savva, Rico Cilliers | `wood_table_001_{diff,nor_gl,rough}_1k.jpg` | 0.5 MB |

沙发、茶几、电视柜、餐桌、餐椅是 `tools/blender/furniture.py` 脚本建的（`public/assets/hero/furniture.glb`，本仓库自己的，MIT）；抱枕、搭毯、窗帘、落地灯是代码里拼的；窗外的楼群和街灯是程序生成的。

第 4 轮（人眼漫游：每个房间、阳台夜景）新增 1 项：

| 用在哪 | 素材 | 作者 | 下载的文件 | 大小 |
|---|---|---|---|---|
| 阳台夜景的远景天际线（`&night=n2` 背景板、`&night=n3` 混合，默认 n3）；`tools/blender/night_plate.py` 把陆家嘴转到正南、天空调成和屋里烘焙一样的蓝，裁出地平线那一条（8k 宽）+ 缩一张 2k 整图 | [Shanghai Bund](https://polyhaven.com/a/shanghai_bund) | Greg Zaal | `shanghai_bund_8k.hdr` | 99.7 MB |

床（软包床头、床头柜）、床品（被子、枕头、床尾巾）、衣柜、书桌、整体厨房、冰箱、淋浴房、马桶、洗手台和镜柜是 `tools/blender/furniture_rooms.py` 脚本建的（同一个 `furniture.glb`，本仓库自己的，MIT）；墙裙砖、淋浴墙砖的贴图是代码里画的；入户门外的走廊、吸顶灯是代码里拼的；n1 / n3 的楼群、行道树、路网、路灯、车灯、远处光点是程序生成的。看过没选的：Rooftop Night（停车场屋顶）、Sunset JHB Central（屋顶视角但是日落、不是夜里）、Modern Buildings Night（近处一栋大楼占满画面）、Signal Hill Dawn（山上看城市，黎明）。

氛围预设（`&mood=`）没有新增素材：手办预设（m4）的书桌复用 Laminate Floor 02（放大到一张 26 米），底座、铅笔、台灯 / 落地灯 / 吊灯都是代码里拼的几何体。

合计约 134 MB（第 1 轮 17 MB + 软装 16.6 MB + 第 3 轮 5.4 MB + 第 4 轮 99.7 MB）。下载地址由 Poly Haven API（`https://api.polyhaven.com/files/<id>`）给出，形如
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/laminate_floor_02/laminate_floor_02_diff_1k.jpg`。

协议原文：<https://polyhaven.com/license>
