---
name: floorplan-3d
description: 把一张户型图（平面图、CAD 截图、楼盘户型图）读成结构化数据 plan.json，再在 floorplan-3d-skill 仓库里长成 3D、按规则摆软装、（可选）用 Blender 烘焙光照、规划稳定的第一人称漫游并逐帧录成视频。Use when the user gives a floor plan image and wants it read / measured / converted to 3D, asks "这个户型长什么样", wants a realistic 3D model or walkthrough video of an apartment, or works on the look / decor / bake / tour / recording code in this repo.
---

# floorplan-3d：户型图变 3D

一句话：**先读图，再长房子；再住进去走一圈。** 一切都从一份 `plan.json` 生成（格式见 `references/plan-schema.md`）。

按顺序做，每一步给用户看过、点头了再往下：

1. 读图 → `plan.json`
2. 自检、和原图对照
3. 在 3D 里看
4. 真实感 + 软装
5. （可选）Blender 家具 + 烘焙光照
6. 规划漫游路线
7. 录制：先顺滑预览，再出正式版

## 1. 读图 → plan.json

**每一步都以图上的标注为准，标注没有的才量。**

1. **定比例尺。** 找尺寸标注（总尺寸、分段尺寸，一般是毫米）。用两段已知长度算出"多少像素 = 1 米"，互相核对，差得多就再找一段。
2. **定轴网。** 轴号 + 分段尺寸算出每根轴线的坐标。原点放在最左上两根轴线的交点，x 向右、z 向下。
3. **读墙。** 墙中线放在轴线上。涂黑（或填充）的粗线是墙。墙厚有标注用标注，没有按线宽量、取常见值（外墙 0.24 / 0.2，内墙 0.12 / 0.1）。阳台的细线栏板写进 `rails`。
4. **读门窗。** 平开门 = 门扇直线 + 开启弧线；推拉门 = 两条错开、互相搭接的扇；窗 = 墙上 3–4 条平行细线。
   门窗位置图上大多没标：找到洞口两端，用比例尺换算出中心离墙起点多远（`at`）和宽度（`w`），取整到 0.05 米。
5. **读房间。** 名字、面积照抄；范围按墙中线写成矩形，用"矩形面积 ≈ 标注面积"核对。
6. **读家具（可选）。** 图上画了轮廓才放，按 schema 的类型表；没画不放。

**能运行代码时**用 Python（PIL）按像素量门窗，比目测准；量之前先用比例尺核对一段已知尺寸。脚本**先写成文件**再 `python measure.py`，不要用 `python -c "..."` 写多行脚本（引号里换行会触发安全确认，用户得一条条点）。

## 2. 自检、对照

- 过一遍 schema 末尾的自检清单。用一张短表告诉用户读到了什么（轴网、墙几段、门窗各几樘、每间面积），**明确列出哪些是估计的**。
- 存成 `public/plans/<名字>.json`，打开 `?plan=<名字>&sheet`（按数据重画的户型图）和原图并排看，哪里不一样就是读错了，回第 1 步改。
- **`plan.json` 是读图的原始结果，之后不再改它。** 为了漫游好看做的调整（门往哪边开、推拉门开哪半边、补几幅画）写进 `src/look/tour.js`。

## 3. 在 3D 里看

从这一步起要用仓库里的代码（不在仓库里就先 `git clone https://github.com/cdt2019/floorplan-3d-skill`）：

```bash
npm install && node tools/fetch-assets.mjs && npm run dev     # http://localhost:5182
```

`?plan=<名字>` 看模型；`&stage=1..6` 分步（图纸 → 读图 → 墙 → 门窗 → 家具 → 完成）；`&view=top` 俯视；`&cut=1.5` 剖切高度。
截图检查用 `node tools/peek.mjs --q "<网址参数>" --out out/look/tmp/x.png`（无头 Edge，等页面就绪再拍）。

## 4. 真实感 + 软装

- 网址：`?style=e2&stage=6&finish=1&plan=<名字>&clean&look=pro&pbr&mood=m2a`（白天）/ `mood=m3`（蓝调开灯）。
- 软装（`src/look/decor.js`）**只看户型数据**算位置：房间类型（名字或 `type`）、家具、墙、门窗。避开门的开启区和推拉门通道，挂画只挂在家具正后方没有门窗的墙段，吊灯、挂画算在剖切高度以下。加新规则改 `decor.js`，**不写死坐标**，换一份户型照样能用。
- 夜里的光源就是软装里的灯（`kind: "lamp"`）。
- 细节（氛围预设、调参、各模块管什么）见 `references/look-and-bake.md`。

## 5. （可选）Blender 家具 + 烘焙光照

人眼高度靠实时光照会发灰、像游戏，要把间接光烘成光照贴图。Blender 5.2，无头运行：

```bash
node tools/bake-export.mjs --plan <名字> --set <名字>-m5                                   # 页面导出整套房子（要先 npm run dev）
blender -b --factory-startup -P tools/blender/bake.py -- --set <名字>-m5 --res 2048 --samples 256   # 先小图试，满意再 4096 / 512
blender -b --factory-startup -P tools/blender/night_plate.py -- --set <名字>-m5                     # 阳台外滩背景板（可选）
```

- 家具已经在 `public/assets/hero/furniture.glb`；改了 `tools/blender/furniture*.py` 才重建。
- GTX 1050 Ti 上 4096² / 512 采样整套 30–50 分钟。跑之前告诉用户要多久；长任务开个显卡温度看守（见下面的坑）。
- 烘完用 `view=eye&baked` 和 `node tools/room-shots.mjs` 逐个房间看（这个脚本的机位是给 opus55 写的，新户型先改 `ROOMS`）。
- 没烘焙时页面照样能用：人眼高度退回实时光，窗外退回程序城市。

## 6. 规划漫游路线

路线写在 `src/look/tour.js` 的 `ROUTE`（现在是给 opus55 写的；新户型写一条新的，按户型名分开，`DOOR_OVERRIDES`、`DECOR_EXTRA` 也按户型名）。镜头要像房产 VR 带看那样**稳**：

- 眼高 1.6 米，**没有步伐起伏、不侧倾**，俯仰基本固定（约 −6°），只在看低处（马桶）时低一下头。
- 走路约 1 米/秒（≤ 1.06），过门 0.55 米/秒；加减速平滑（≤ 0.75 米/秒²，拐弯横向 ≤ 1.1 米/秒²）。
- 转头 ≤ 35°/秒，俯仰 ≤ 7°/秒。超了规划器会自动放慢那一段。
- **每个房间只扫一遍**：进门 → 一个方向匀速扫过看点 → 一直转到正对门口 → 走出去。不来回摇、不倒退、不在原地转完再走。
- 主次分明：大房间、重点房间（卧室）扫得慢（约 28°/秒），在床、窗边 `linger` 放慢；厨房、卫生间紧凑（37°/秒，`pre` / `post` 让扫和走路叠一点）。
- 竖版水平视角只有约 54°，同一处的朝向单独给 `yv`。

检查（不开浏览器）：`node tools/tour-path.mjs && python tools/tour-path.py` 出路线图（按速度着色、各房间用时、离墙多近、近处的墙占画面多少）；任意时刻的小静帧：`node tools/seq-stills.mjs --small --t 20,35 --name tour`。字段说明和更多规则见 `references/tour.md`。

## 7. 录制

```bash
node tools/record.mjs --smooth --q "style=e2&plan=<名字>&clean&look=pro&pbr&seq=final"     # 30 帧、960×540 顺滑预览
python tools/judder.py out/floorplan-16x9-smooth.mp4 --from 14.2                            # 逐帧查抖动、重复帧、亮度跳变
node tools/record.mjs --q "…同上…" && node tools/record.mjs --v --q "…同上…"                 # 用户点头后：1920×1080 和 1080×1920
```

- **先给用户看顺滑预览，点头了再录正式版。** `--preview`（10 帧）只用来看构图，它会把转身放大成一顿一顿的。
- 虚拟时钟逐帧录，渲染多慢都是匀速；1050 Ti 上 80 秒的 1080p 约 6 分钟。
- 录 Claude Code 读图的真实终端：`node tools/term-rec.mjs --manual --cwd <只放户型图和 skill 的文件夹> --prompt-file prompt.txt --out out/read.cast --done plan.json`，在用户自己的终端里跑，审批框由用户点。录完先打码：`node tools/cast-redact.mjs out/read.cast public/casts/read.cast --also <电脑用户名>`（欢迎框里有邮箱，路径里有用户名），原始录像不入库。

## 踩过的坑

**读图**
- 推拉门认成平开门；小窗（卫生间窗、高窗）漏掉；门窗宽度凭感觉估，偏差 0.5 米以上。一定先定比例尺再换算（对比记录见 `examples/`）。
- 真实户型图（水印、翻拍、手绘）比程序画的难得多，读完一定用 `?sheet` 对照。

**渲染**
- `<Canvas flat>` 等于关了色调映射，画面发灰发平。真实感路径不能 `flat`，后期里用 Neutral / AgX 色调映射。
- three 0.186 删了 `PCFSoftShadowMap`（自动退回 PCF 并警告）：直接用 `PCFShadowMap`，软硬用 `shadow.radius` 调。
- 设了 `scene.environmentIntensity` 就会盖掉每个材质的 `envMapIntensity`：想单独调某个材质的反射，改材质本身或探针，别指望 `envMapIntensity`。
- 点光源不投影，会穿墙照进隔壁：烘焙接管后关掉实时点光源；纸面这类物体不吃点光源。
- 每个房间一张探针，一跨门就跳：门口按到房间边界的距离交叉淡化两张探针（`bake.js` 的 `pickProbe`）。
- 吊灯离探针太近，在玻璃里的倒影大得离谱：渲探针时藏起 2.3 米以内的灯具。

**烘焙**
- OptiX 在 Pascal（GTX 10 系）上烘出来是空的，用 CUDA。
- 先把静态物体合并成一个再烘：Cycles 一个物体一个物体烘，每个都要重新同步场景、建 BVH，两百多个物体光开销就几分钟。
- 墙里、地板下的像素是无效的（看出去大半是背面）：先烘一张背面比例图找出来，用有效像素往外扩，不然墙角一圈黑边。OIDN 之后在暗处还会留亮点，再压一遍。
- 长时间烘焙看着显卡温度：轮询 `nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader`，91°C 暂停 Blender 进程、86°C 继续（仓库里没带这个脚本，按需临时开一个）。
- 门扇只当遮挡物、不烘光照贴图，小改动（合页换边、开的角度）不用重烘；门从关着变成开着要重烘。

**漫游**
- 不改 `plan.json`；门的开向、推拉门开哪半边、补的画都写在 `tour.js`。
- 扫向门口时别落在一整面白墙上：在那段墙上补小画（`DECOR_EXTRA`）。白冰箱、衣柜近了会塞满画面，停的位置离开 1.2 米以上。
- 门洞窄，进出卧室时门框占半个画面 1–1.5 秒躲不开：正对着门走进去，别斜着。

**录制**
- Vite 监听到无头浏览器配置文件夹的变化会热重载，录到一半页面刷新：`vite.config.js` 里忽略 `.profiles/`、`out/`、`public/bake/`、`public/assets/`。
- 页面里的 `setTimeout` 被虚拟时钟接管了，截图前用 `MessageChannel` 等一帧画完。
- 双显卡笔记本无头 Edge 默认走核显：`EDGE_ARGS="--force_high_performance_gpu"`。
