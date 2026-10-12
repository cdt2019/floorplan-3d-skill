# Claude Code 命令行读图（Opus 5.5 + floorplan-3d skill）

2026-10-11 录制。文件夹里只放了 `plan.png` 和 `.claude/skills/floorplan-3d/`。用 Claude Code 2.1.296（Opus 5.5，medium effort，accept edits 模式）启动后，只说了一句：
"用 floorplan-3d skill 读一下 plan.png 这张户型图，存成 plan.json"。

- 用时 2 分 1 秒。
- 它先按 skill 用尺寸标注定比例尺（120 px/m，三段分尺寸逐一核对），再写了一个 Python 量图脚本量墙、门窗和家具，最后写出 `plan.json`，并附一张汇总表，列出哪些是估计的。
- 全程没有弹审批框：量图脚本写在 Claude Code 自己的临时目录里运行。

对照原始数据：
- ✅ 墙 8 段的位置和厚度全对。
- ✅ 门窗 10 樘的类型、位置、宽度全对，包括厨房推拉门和卫生间小窗。
- ✅ 6 个房间的范围和面积全对，阳台栏板也对。
- ✅ 家具 15 件都在，位置偏差在 0.25 m 以内。
- ⚠️ 马桶和洗手台对调了位置。图上只画了矩形，它在 notes 里写明了"朝向按常规估计"。
- ⚠️ 主卧飘窗读成普通窗。图上没画窗台高度，读不出来。
- ⚠️ 层高写成 2.9 m。图上没标层高，这是它估的。

终端录像打码后放在 `public/casts/read-opus55.cast`：邮箱、账号名、电脑用户名都换成了星号，原始录像不入库。
视频里的 3D 模型就是从这份 `plan.json` 长出来的（`?plan=opus55`）。
