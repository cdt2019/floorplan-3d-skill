// 示例户型：两室两厅一厨一卫 + 南阳台，约 90 ㎡。单位：米。
// 坐标：x 向东，z 向南（图纸上从上往下），原点在西北角外墙中线。
// 这份数据就是"图纸"：真实使用时，把户型图丢给 Claude，让它按同样的格式写出来（见 skill）。
export const PLAN = {
  name: "两室两厅 · 约 90 ㎡",
  height: 2.8,          // 层高
  walls: [
    // id, 起点、终点（墙中线），厚度。外墙 0.24，内墙 0.12
    { id: "N", a: [0, 0], b: [10, 0], t: 0.24 },
    { id: "E", a: [10, 0], b: [10, 8.4], t: 0.24 },
    { id: "S", a: [10, 8.4], b: [0, 8.4], t: 0.24 },
    { id: "W", a: [0, 8.4], b: [0, 0], t: 0.24 },
    { id: "M", a: [0, 3.6], b: [10, 3.6], t: 0.12 },   // 南北分隔
    { id: "K", a: [3, 0], b: [3, 3.6], t: 0.12 },      // 厨房 | 卫生间
    { id: "B", a: [5, 0], b: [5, 3.6], t: 0.12 },      // 卫生间 | 次卧
    { id: "L", a: [6, 3.6], b: [6, 8.4], t: 0.12 },    // 客厅 | 主卧
  ],
  // 洞口：在哪面墙上、中心离墙起点多远、宽、下沿和上沿高度
  openings: [
    { wall: "W", at: 3.9, w: 1.0, type: "door", sill: 0, head: 2.1, name: "入户门" },
    { wall: "M", at: 1.5, w: 1.5, type: "slide", sill: 0, head: 2.1, name: "厨房推拉门" },
    { wall: "M", at: 3.9, w: 0.8, type: "door", sill: 0, head: 2.1, name: "卫生间门" },
    { wall: "M", at: 5.55, w: 0.8, type: "door", sill: 0, head: 2.1, name: "次卧门" },
    { wall: "L", at: 0.9, w: 0.9, type: "door", sill: 0, head: 2.1, name: "主卧门" },
    { wall: "S", at: 7.0, w: 4.2, type: "slide", sill: 0, head: 2.4, name: "阳台推拉门" },
    { wall: "S", at: 2.0, w: 2.4, type: "window", sill: 0.5, head: 2.4, name: "主卧飘窗" },
    { wall: "N", at: 1.5, w: 1.4, type: "window", sill: 0.9, head: 2.1, name: "厨房窗" },
    { wall: "N", at: 4.0, w: 0.8, type: "window", sill: 1.4, head: 2.1, name: "卫生间窗" },
    { wall: "N", at: 7.5, w: 1.8, type: "window", sill: 0.9, head: 2.2, name: "次卧窗" },
  ],
  // 房间：矩形 [x0, z0, x1, z1]（墙中线），地面材质
  rooms: [
    { name: "客餐厅", rect: [0, 3.6, 6, 8.4], floor: "wood" },
    { name: "主卧", rect: [6, 3.6, 10, 8.4], floor: "wood" },
    { name: "次卧", rect: [5, 0, 10, 3.6], floor: "wood" },
    { name: "厨房", rect: [0, 0, 3, 3.6], floor: "tile" },
    { name: "卫生间", rect: [3, 0, 5, 3.6], floor: "tile" },
    { name: "阳台", rect: [0, 8.4, 6, 9.8], floor: "tile", outdoor: true },
  ],
  // 阳台栏板（矮墙 + 玻璃）
  rails: [
    { a: [0, 9.8], b: [6, 9.8] }, { a: [0, 8.4], b: [0, 9.8] }, { a: [6, 8.4], b: [6, 9.8] },
  ],
  // 家具：类型、中心 [x, z]、朝向（度；0 = 正面朝南，90 = 朝东，180 = 朝北，270 = 朝西）
  furniture: [
    { type: "sofa", at: [5.45, 6.4], rot: 270 },     // 靠东墙，面朝西边的电视
    { type: "coffee", at: [3.9, 6.4], rot: 270 },
    { type: "tv", at: [0.32, 6.4], rot: 90 },        // 电视柜靠西墙
    { type: "dining", at: [2.4, 4.75], rot: 0 },
    { type: "bed18", at: [8.8, 6.0], rot: 270 },      // 床头靠东墙
    { type: "wardrobe", at: [8.3, 3.97], rot: 0 },
    { type: "bed15", at: [8.9, 2.0], rot: 270 },
    { type: "desk", at: [7.5, 0.42], rot: 0 },        // 书桌在北窗下
    { type: "kitchen", at: [1.5, 0.42], rot: 0 },
    { type: "fridge", at: [0.42, 2.8], rot: 90 },
    { type: "shower", at: [4.0, 0.6], rot: 0 },
    { type: "toilet", at: [3.42, 2.1], rot: 90 },
    { type: "basin", at: [4.66, 2.3], rot: 270 },
    { type: "plant", at: [5.5, 9.3], rot: 0 },
    { type: "plant", at: [0.5, 8.0], rot: 0 },
  ],
};
