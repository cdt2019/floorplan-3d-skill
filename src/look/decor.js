// 软装规则（skill 的一部分）：只看户型数据——房间（名字或 type）、家具清单、墙、门窗——按规则算出每件软装放在哪，
// 不写死坐标，换一份户型照样能用。只在 look=pro&pbr 下启用（见 look.js 的 DECOR），所有氛围预设共用一套。
//
// 输出一张清单：[{ kind, room, x, z, y, rot, ...参数, phase }]
//   x / z：世界坐标（米，x 向东、z 向南）；y：离地高度；rot：绕竖轴转的弧度（局部 +z 是正面，和家具库一样）
//   phase：布置顺序（地毯 → 床品抱枕 → 灯和小家具 → 桌面摆件 → 绿植 → 挂画 → 窗帘），Decor.jsx 按它错开落下，像一件件把家布置起来
//   kind = "lamp" 的条目同时是夜里的光源（lamps.jsx 按它挂暖光、灯罩发光）
//
// 规则怎么避让：
//   1. 家具按 FURN 的尺寸算占地框；门按门宽在墙两侧各留一个扇形区（取方框），推拉门两侧各留 0.75 米通道；窗不占地
//   2. 落地的软装（落地灯、边几、休闲椅、绿植、阳台桌椅）放之前查：在房间内框里、不压家具、不压门的开启区、不压已放的软装
//   3. 地毯可以压在家具下面（沙发前腿、床的下 2/3），但碰到不属于这一组的家具就从那一侧往回缩；缩到 0.8 米以下就不放
//   4. 挂画 / 镜子 / 毛巾只挂在家具正后方 0.6 米内的墙上，而且那一段墙上没有门窗、整幅画都落在同一个房间里
//   5. 墙在剖切高度（cut）以上会被切掉，挂画、吊灯都算在 cut 以下
// 约定：家具朝向是 90° 的倍数（plan.json 的 schema 就是这样），房间是矩形。

// ---------- 房间类型：room.type 优先，否则看名字 ----------
const KINDS = [
  ["balcony", /阳台|露台|balcony|terrace/i],
  ["bath", /卫|浴|厕|洗手|bath|wc|toilet|shower/i],
  ["kitchen", /厨|kitchen/i],
  ["bedroom", /卧|bedroom/i],
  ["study", /书房|study|office/i],
  ["living", /客|起居|living|lounge/i],
  ["dining", /餐|dining/i],
  ["entry", /玄关|门厅|entry|foyer|hall/i],
  ["living", /厅/],
];
export function roomKind(r) {
  if (r.type) return r.type;
  for (const [k, rx] of KINDS) if (rx.test(r.name)) return k;
  return "other";
}
const HABITABLE = new Set(["living", "dining", "bedroom", "study"]); // 挂窗帘、放绿植的房间

// ---------- 家具尺寸（和 src/build/Furniture.jsx 的家具库一致；w 沿局部 x，d 沿局部 z，oz = 占地框中心沿 z 的偏移） ----------
export const FURN = {
  sofa: { w: 2.3, d: 0.9, seat: 0.53, back: 0.85 },
  coffee: { w: 1.2, d: 0.6, top: 0.39 },                 // look=pro&pbr 换成的 CC0 茶几：1.2 × 0.6，台面 0.39
  tv: { w: 1.9, d: 0.4, top: 0.45, screen: 1.45 },
  dining: { w: 1.4, d: 1.7, top: 0.765, table: [1.4, 0.8], chairs: [[-0.4, -0.62], [0.4, -0.62], [-0.4, 0.62], [0.4, 0.62]] },
  bed18: { w: 2.89, d: 2.1, bed: 1.8, head: 1.0 },       // 宽度含两侧床头柜
  bed15: { w: 2.59, d: 2.1, bed: 1.5, head: 1.0 },
  wardrobe: { w: 2.4, d: 0.6 },
  desk: { w: 1.2, d: 1.1, oz: 0.24, top: 0.762 },        // 含椅子
  // 台面 0.92（4 厘米石英）；free = 台面上避开水槽（局部 x -0.3…0.3，窗户正下方）和灶台（0.79…1.29）的空段，见 tools/blender/furniture_rooms.py
  kitchen: { w: 2.6, d: 0.6, top: 0.92, free: [[-1.27, -0.86], [-0.8, -0.32], [0.32, 0.76]] },
  fridge: { w: 0.7, d: 0.68 },
  shower: { w: 1.84, d: 1.0 },
  toilet: { w: 0.42, d: 0.72, oz: -0.05, tank: 0.725 },
  basin: { w: 0.7, d: 0.46, top: 0.86 },
  plant: { w: 0.6, d: 0.6 },
};

// ---------- 几何小工具 ----------
const rad = (deg) => ((deg || 0) * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 家具局部坐标 → 世界坐标（和 three.js 绕 y 轴旋转一致：局部 +z 朝南时 rot = 0）
export function toWorld(f, lx, lz) {
  const r = rad(f.rot), c = Math.cos(r), s = Math.sin(r);
  return [f.at[0] + lx * c + lz * s, f.at[1] - lx * s + lz * c];
}
const dirOf = (f, lx, lz) => { const r = rad(f.rot), c = Math.cos(r), s = Math.sin(r); return [lx * c + lz * s, -lx * s + lz * c]; };
// 矩形（中心、沿局部 x 的长 w、沿局部 z 的深 d、朝向 rot）→ 世界坐标外包框 [x0, z0, x1, z1]
const aabb = (cx, cz, w, d, rot = 0) => {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
  return [cx - hw, cz - hd, cx + hw, cz + hd];
};
const overlap = (a, b, tol = 0) => a[0] < b[2] - tol && b[0] < a[2] - tol && a[1] < b[3] - tol && b[1] < a[3] - tol;
const shrink = (r, m) => [r[0] + m, r[1] + m, r[2] - m, r[3] - m];
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
// 朝向：让局部 +z 指向 (vx, vz)
const facing = (vx, vz) => Math.atan2(vx, vz);
const snap = (a, step = Math.PI / 4) => Math.round(a / step) * step;

// ---------- 上下文：房间、家具占地、墙、门的开启区 ----------
function context(plan, cut) {
  const rooms = plan.rooms.map((r) => ({ ...r, kind: roomKind(r), inner: shrink(r.rect, 0.12) }));
  const roomAt = (x, z) => rooms.find((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]) || null;
  const furn = plan.furniture.map((f) => {
    const S = FURN[f.type] || { w: 0.5, d: 0.5 };
    const [cx, cz] = toWorld(f, 0, S.oz || 0);
    return { ...f, S, box: aabb(cx, cz, S.w, S.d, rad(f.rot)), room: roomAt(f.at[0], f.at[1]) };
  });
  const walls = plan.walls.map((w) => {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz);
    return { ...w, L, ux: dx / L, uz: dz / L, nx: -dz / L, nz: dx / L, ang: -Math.atan2(dz, dx), ops: plan.openings.filter((o) => o.wall === w.id) };
  });
  // 门：门宽 × 门宽的开启区（墙两侧都留，不管往哪边开）；推拉门：两侧各 0.75 米通道
  const zones = [];
  for (const w of walls) for (const o of w.ops) {
    const depth = o.type === "door" ? o.w + 0.05 : o.type === "slide" ? 0.75 : 0;
    if (!depth) continue;
    const cx = w.a[0] + w.ux * o.at, cz = w.a[1] + w.uz * o.at;
    zones.push(aabb(cx, cz, o.w, 2 * depth, w.ang));
  }
  // blocked：落地软装要避开的框（家具 + 门的开启区 + 已放的落地软装）；solids：只记已放的落地软装（窗帘只避它和家具，不避自己那扇推拉门的通道）
  const ctx = { plan, cut, rooms, roomAt, furn, walls, zones, blocked: [...furn.map((f) => f.box), ...zones], solids: [], out: [] };
  return ctx;
}

// 落地软装能不能放：在房间内框里、不压家具 / 门的开启区 / 已放的软装
function free(ctx, box, room, tol = 0.02) {
  if (room) {
    const r = room.inner;
    if (box[0] < r[0] - tol || box[1] < r[1] - tol || box[2] > r[2] + tol || box[3] > r[3] + tol) return false;
  }
  return !ctx.blocked.some((b) => overlap(b, box, tol));
}
// 记一件软装；solid = 落地、占地（之后的软装要避开它）
function put(ctx, item, solidBox) {
  ctx.out.push(item);
  if (solidBox) { ctx.blocked.push(solidBox); ctx.solids.push(solidBox); }
  return item;
}

// 从 (x, z) 沿 (dx, dz) 找最近的一面墙（只认大致垂直撞上去的墙）；返回墙、沿墙的位置 u、墙面离起点的距离
function wallHit(ctx, x, z, dx, dz, maxD) {
  let best = null;
  for (const w of ctx.walls) {
    const den = dx * w.nx + dz * w.nz;
    if (Math.abs(den) < 0.9) continue;
    const t = ((w.a[0] - x) * w.nx + (w.a[1] - z) * w.nz) / den;
    if (t <= 0 || t > maxD) continue;
    const u = (x + dx * t - w.a[0]) * w.ux + (z + dz * t - w.a[1]) * w.uz;
    if (u < -0.01 || u > w.L + 0.01) continue;
    const face = t - w.t / 2;
    if (!best || face < best.face) best = { w, u, face, x: x + dx * face, z: z + dz * face };
  }
  return best;
}
// 墙上 [u0, u1] 这一段能不能挂东西：没有门窗，两端都还在同一个房间里
function spanClear(ctx, hit, u0, u1, room, dx, dz) {
  const { w } = hit;
  if (u0 < 0.05 || u1 > w.L - 0.05) return false;
  if (w.ops.some((o) => u0 - 0.08 < o.at + o.w / 2 && o.at - o.w / 2 < u1 + 0.08)) return false;
  for (const u of [u0, u1]) {
    const px = w.a[0] + w.ux * u - dx * (w.t / 2 + 0.2), pz = w.a[1] + w.uz * u - dz * (w.t / 2 + 0.2);
    if (ctx.roomAt(px, pz) !== room) return false;
  }
  return true;
}
// 家具正后方的墙：靠墙放的家具（沙发、床、电视柜、洗手台、书桌）往背后找
function wallBehind(ctx, f, maxGap = 0.6) {
  const [dx, dz] = dirOf(f, 0, -1);
  const hit = wallHit(ctx, f.at[0], f.at[1], dx, dz, f.S.d / 2 + maxGap + 0.3);
  return hit && hit.face - f.S.d / 2 <= maxGap ? { ...hit, dx, dz } : null;
}
// 挂墙上的东西的位置和朝向：贴墙面、正面朝屋里
function onWall(hit, u, off = 0.02) {
  const { w, dx, dz } = hit;
  const x = w.a[0] + w.ux * u - dx * (w.t / 2 + off), z = w.a[1] + w.uz * u - dz * (w.t / 2 + off);
  return { x, z, rot: facing(-dx, -dz) };
}

// 地毯：先裁到房间内框（离墙 0.15），再碰到不属于这一组的家具就从那一侧往回缩
function fitRug(ctx, room, box, keep) {
  const r = room.inner, m = 0.15;
  let b = [Math.max(box[0], r[0] + m), Math.max(box[1], r[1] + m), Math.min(box[2], r[2] - m), Math.min(box[3], r[3] - m)];
  for (const f of ctx.furn) {
    if (keep.includes(f) || !overlap(f.box, b, 0.02)) continue;
    const opts = [[0, f.box[2] + 0.05], [2, f.box[0] - 0.05], [1, f.box[3] + 0.05], [3, f.box[1] - 0.05]]
      .map(([k, v]) => { const n = [...b]; n[k] = v; return n; })
      .filter((n) => n[2] - n[0] >= 0.8 && n[3] - n[1] >= 0.8);
    if (!opts.length) return null;
    b = opts.sort((p, q) => area(q) - area(p))[0];
  }
  return b[2] - b[0] >= 0.8 && b[3] - b[1] >= 0.8 ? b : null;
}
const rugItem = (room, b, style, extra = {}) => ({ kind: "rug", room: room.name, x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2, y: 0, rot: 0, w: b[2] - b[0], d: b[3] - b[1], style, phase: 0, ...extra });

// 在家具局部坐标里放一件桌面 / 台面摆件
const onTop = (f, lx, lz, y, kind, extra = {}) => {
  const [x, z] = toWorld(f, lx, lz);
  return { kind, room: f.room?.name, x, z, y, rot: rad(f.rot), ...extra };
};
// 落地软装在家具旁边的几个候选位置里挑第一个空着的
function besideFree(ctx, f, cands, size, kind, extra = {}) {
  for (const [lx, lz] of cands) {
    const [x, z] = toWorld(f, lx, lz), box = aabb(x, z, size, size);
    if (free(ctx, box, f.room)) return put(ctx, { kind, room: f.room?.name, x, z, y: 0, rot: rad(f.rot), ...extra }, box);
  }
  return null;
}

// ---------- 各区域的规则 ----------
// 客厅（有沙发就算）：抱枕 + 搭毯、沙发前的大地毯（压住茶几）、沙发一头落地灯、另一头边几 + 台灯、沙发背后的墙上一组画、
// 电视柜上花瓶 + 书 + 相框、茶几上托盘 + 书
function living(ctx) {
  for (const f of ctx.furn.filter((f) => f.type === "sofa" && f.room)) {
    const S = f.S, room = f.room;
    put(ctx, { kind: "sofaSet", room: room.name, x: f.at[0], z: f.at[1], y: 0, rot: rad(f.rot), w: S.w, phase: 1 });
    // 地毯：从沙发前腿下面（局部 z = 0.15）铺到茶几外 0.7 米；宽 = 沙发宽 + 0.6
    const front = ctx.furn.filter((c) => c.type === "coffee" && c.room === room).map((c) => {
      const lx = (c.at[0] - f.at[0]) * Math.cos(rad(f.rot)) - (c.at[1] - f.at[1]) * Math.sin(rad(f.rot));
      const lz = (c.at[0] - f.at[0]) * Math.sin(rad(f.rot)) + (c.at[1] - f.at[1]) * Math.cos(rad(f.rot));
      return { c, lx, lz };
    }).find((o) => o.lz > 0 && o.lz < 3 && Math.abs(o.lx) < 1.2);
    const z1 = Math.min(0.15 + 2.3, (front ? front.lz + 0.3 : 1.2) + 0.75), z0 = 0.15, len = Math.min(3.0, S.w + 0.6);
    const [rx, rz] = toWorld(f, front ? front.lx * 0.5 : 0, (z0 + z1) / 2);
    const rb = fitRug(ctx, room, aabb(rx, rz, len, z1 - z0, rad(f.rot)), [f, front?.c].filter(Boolean));
    if (rb) put(ctx, rugItem(room, rb, "herring", { role: "rug" }));
    // 沙发两头：一头落地灯，另一头边几 + 台灯（哪头空着放哪头；边几放不下就算了）
    let side = null;
    for (const e of [1, -1]) {
      const lamp = besideFree(ctx, f, [[e * (S.w / 2 + 0.3), -0.12]], 0.42, "lamp", { style: "floor", phase: 2 });
      if (!lamp) continue;
      side = besideFree(ctx, f, [[-e * (S.w / 2 + 0.32), -0.07]], 0.5, "sideTable", { phase: 1.5 });
      break;
    }
    if (!ctx.out.some((o) => o.style === "floor" && o.room === room.name)) side = besideFree(ctx, f, [[S.w / 2 + 0.32, -0.07], [-(S.w / 2 + 0.32), -0.07]], 0.5, "sideTable", { phase: 1.5 });
    if (side) {
      put(ctx, { kind: "lamp", style: "table", room: room.name, x: side.x, z: side.z, y: 0.55, rot: side.rot, phase: 2 });
      put(ctx, { kind: "books", room: room.name, x: side.x + 0.12 * Math.cos(side.rot), z: side.z - 0.12 * Math.sin(side.rot), y: 0.55, rot: side.rot + 0.3, n: 2, phase: 3 });
    }
    // 沙发背后的墙：中间一幅大的 + 两边各一幅小的；墙段不够就只挂中间那幅
    const hit = wallBehind(ctx, f);
    if (hit) {
      const top = Math.min(ctx.cut - 0.08, 1.75), bottom = S.back + 0.12, h = clamp(top - bottom, 0.3, 0.7);
      const y = bottom + h / 2;
      const sets = [
        [{ dx: 0, w: h * 1.25, h, print: 0 }, { dx: -(h * 0.625 + 0.08 + h * 0.36), w: h * 0.72, h: h * 0.82, print: 1 }, { dx: h * 0.625 + 0.08 + h * 0.36, w: h * 0.72, h: h * 0.82, print: 2 }],
        [{ dx: 0, w: h * 1.25, h, print: 0 }],
      ];
      for (const frames of sets) {
        const span = Math.max(...frames.map((q) => Math.abs(q.dx) + q.w / 2));
        if (!spanClear(ctx, hit, hit.u - span, hit.u + span, room, hit.dx, hit.dz)) continue;
        put(ctx, { kind: "art", room: room.name, ...onWall(hit, hit.u), y, frames, phase: 5 });
        break;
      }
    }
  }
  // 电视柜：左边花瓶插干枝，右边一摞书 + 相框
  for (const f of ctx.furn.filter((f) => f.type === "tv")) {
    const x = f.S.screen / 2 + (f.S.w - f.S.screen) / 4;
    put(ctx, onTop(f, -x, 0.04, f.S.top, "vase", { model: 1, stems: true, phase: 3 }));
    put(ctx, onTop(f, x, 0.06, f.S.top, "books", { n: 3, phase: 3 }));
    put(ctx, onTop(f, x + 0.02, -0.06, f.S.top + 0.1, "frame", { phase: 3.2 }));
  }
  // 茶几：藤编托盘（里面一个小花瓶）+ 一摞书
  for (const f of ctx.furn.filter((f) => f.type === "coffee")) {
    put(ctx, onTop(f, 0.27, 0, f.S.top, "tray", { phase: 3 }));
    put(ctx, onTop(f, 0.3, 0.02, f.S.top + 0.02, "vase", { model: 4, scale: 0.55, phase: 3.1 }));
    put(ctx, onTop(f, -0.28, 0.03, f.S.top, "books", { n: 2, turn: 0.25, phase: 3 }));
  }
}

// 餐厅（有餐桌就算）：桌子正上方吊灯、桌旗、每个座位一个盘子、中间花瓶 + 果盘
function dining(ctx) {
  for (const f of ctx.furn.filter((f) => f.type === "dining")) {
    const S = f.S, y = S.top;
    // 吊灯：灯罩底边离桌面 0.75 米左右；剖切高度低的时候（鸟瞰）压低到剖切面以下
    put(ctx, { ...onTop(f, 0, 0, Math.min(ctx.cut - 0.25, 1.5), "lamp"), style: "pendant", phase: 2 });
    put(ctx, { ...onTop(f, 0, 0, y, "runner"), w: S.table[0] - 0.1, d: 0.34, phase: 3 });
    for (const [cx, cz] of S.chairs) put(ctx, { ...onTop(f, cx, cz * 0.38, y, "plate"), phase: 3.4 });
    put(ctx, { ...onTop(f, -0.22, 0.02, y + 0.012, "vase"), model: 2, stems: true, scale: 0.8, phase: 3.2 });
    put(ctx, { ...onTop(f, 0.24, -0.03, y + 0.012, "bowl"), phase: 3.2 });
  }
}

// 卧室（有床就算）：被子 + 枕头 + 靠垫 + 床尾巾、两边床头柜上台灯 + 书、床下 2/3 压一块地毯、床头墙上一幅横画；
// 面积最大、床最宽的那间再加一个阅读角（休闲椅 + 落地灯）
function bedroom(ctx) {
  const beds = ctx.furn.filter((f) => /^bed/.test(f.type) && f.room);
  for (const f of beds) {
    const S = f.S, bw = S.bed, room = f.room;
    put(ctx, { kind: "bedding", room: room.name, x: f.at[0], z: f.at[1], y: 0, rot: rad(f.rot), w: bw, phase: 1 });
    for (const s of [-1, 1]) {
      const sx = s * (bw / 2 + 0.32);
      put(ctx, { ...onTop(f, sx, -0.88, 0.5, "lamp"), style: "table", phase: 2 });
      put(ctx, { ...onTop(f, sx + s * 0.08, -0.7, 0.5, "books"), n: s > 0 ? 2 : 1, small: true, turn: 0.4 * s, phase: 3 });
    }
    // 地毯：从床头往下 0.7 米铺到床尾外 0.55 米，两边各多出 0.5 米
    const [rx, rz] = toWorld(f, 0, (-0.35 + 1.6) / 2);
    const rb = fitRug(ctx, room, aabb(rx, rz, bw + 1.0, 1.95, rad(f.rot)), [f]);
    if (rb) put(ctx, rugItem(room, rb, "teddy", { role: "rug2" }));
    const hit = wallBehind(ctx, f, 0.3);
    if (hit) {
      // 画的长宽比固定（1.8）：剖切高度那套和满高那套只差一个等比缩放，墙长高时画不会被拉扁
      const top = Math.min(ctx.cut - 0.08, 1.8), bottom = S.head + 0.08, w = Math.min(bw * 0.62, clamp(top - bottom, 0.26, 0.6) * 1.8), h = w / 1.8;
      if (spanClear(ctx, hit, hit.u - w / 2, hit.u + w / 2, room, hit.dx, hit.dz))
        put(ctx, { kind: "art", room: room.name, ...onWall(hit, hit.u), y: bottom + h / 2, frames: [{ dx: 0, w, h, print: 3 }], phase: 5 });
    }
  }
  // 阅读角：主卧（床最宽、面积最大）找一个空墙角，休闲椅斜对着房间中心，旁边一盏落地灯
  const master = beds.sort((a, b) => b.S.bed - a.S.bed || area(b.room.rect) - area(a.room.rect))[0];
  if (master) readingCorner(ctx, master.room);
}
function readingCorner(ctx, room) {
  const r = room.inner, s = 1.0, g = 0.2; // 椅子占地 1 米见方，离墙 0.2 米
  const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
  const corners = [[r[0] + g, r[1] + g, 1, 1], [r[2] - g - s, r[1] + g, -1, 1], [r[0] + g, r[3] - g - s, 1, -1], [r[2] - g - s, r[3] - g - s, -1, -1]];
  for (const [x0, z0, sx, sz] of corners) {
    const box = [x0, z0, x0 + s, z0 + s];
    if (!free(ctx, box, room)) continue;
    const x = x0 + s / 2, z = z0 + s / 2;
    put(ctx, { kind: "lounge", room: room.name, x, z, y: 0, rot: snap(facing(cx - x, cz - z)), phase: 1.5 }, box);
    // 落地灯：椅子旁边几个位置里第一个空着的（先试靠墙的两侧）
    for (const [ox, oz] of [[-sx * 0.5, -sz * 0.75], [-sx * 0.75, -sz * 0.5], [sx * 0.75, -sz * 0.45], [-sx * 0.45, sz * 0.75]]) {
      const lbox = aabb(x + ox, z + oz, 0.36, 0.36);
      if (!free(ctx, lbox, room)) continue;
      put(ctx, { kind: "lamp", style: "floor", room: room.name, x: x + ox, z: z + oz, y: 0, rot: 0, phase: 2 }, lbox);
      break;
    }
    return;
  }
}

// 书桌：台灯、一摞书、笔记本电脑、杯子
function desk(ctx) {
  for (const f of ctx.furn.filter((f) => f.type === "desk")) {
    const y = f.S.top;
    put(ctx, { ...onTop(f, 0.42, -0.14, y, "lamp"), style: "desk", phase: 2 });
    put(ctx, { ...onTop(f, -0.42, -0.12, y, "books"), n: 3, turn: -0.15, phase: 3 });
    put(ctx, { ...onTop(f, -0.04, 0.0, y, "laptop"), phase: 3 });
    put(ctx, { ...onTop(f, 0.2, 0.12, y, "mug"), phase: 3.2 });
  }
}

// 厨房：台面空段从宽到窄依次放 砧板 + 果盘、水壶、调料罐 + 小绿植；台面前一条长地垫；顶灯（不画灯具）
function kitchen(ctx) {
  for (const f of ctx.furn.filter((f) => f.type === "kitchen")) {
    const y = f.S.top, spans = [...f.S.free].sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    const sets = [["board", "bowl"], ["kettle", "succulent"], ["jars"]];
    spans.forEach(([a, b], i) => {
      const items = sets[i] || [];
      items.forEach((k, j) => put(ctx, { ...onTop(f, a + ((b - a) * (j + 0.5)) / items.length, -0.06, y, k), phase: 3 + 0.1 * j }));
    });
    const [rx, rz] = toWorld(f, 0, f.S.d / 2 + 0.42);
    const rb = fitRug(ctx, f.room, aabb(rx, rz, Math.min(1.7, f.S.w - 0.5), 0.6, rad(f.rot)), [f]);
    if (rb) put(ctx, rugItem(f.room, rb, "waffle", { role: "runner" }));
  }
}

// 卫生间：淋浴前地垫、洗手台上方圆镜、洗手台旁墙上挂毛巾、台面两个瓶子、马桶水箱上一盆小绿植；顶灯
function bath(ctx) {
  for (const f of ctx.furn.filter((f) => f.type === "shower")) {
    const [x, z] = toWorld(f, 0, f.S.d / 2 + 0.33), b = aabb(x, z, 0.78, 0.48, rad(f.rot));
    if (free(ctx, b, f.room)) put(ctx, rugItem(f.room, b, "waffle", { role: "towel", rot: rad(f.rot), w: 0.78, d: 0.48, x, z }));
  }
  for (const f of ctx.furn.filter((f) => f.type === "basin")) {
    const hit = wallBehind(ctx, f, 0.15);
    if (hit) {
      const r = Math.min(0.3, (ctx.cut - 1.0) / 1.4 + 0.12);
      put(ctx, { kind: "mirror", room: f.room?.name, ...onWall(hit, hit.u, 0.015), y: Math.min(1.3, ctx.cut - 0.12), r, phase: 5 });
      // 毛巾挂在洗手台旁边的墙上（哪边不挨着别的家具挂哪边）
      for (const s of [1, -1]) {
        const u = hit.u + s * (f.S.w / 2 + 0.28);
        const p = onWall(hit, u, 0.05), box = aabb(p.x, p.z, 0.4, 0.2, hit.w.ang);
        if (!spanClear(ctx, hit, u - 0.2, u + 0.2, f.room, hit.dx, hit.dz) || ctx.furn.some((o) => o !== f && overlap(o.box, box, 0.01))) continue;
        put(ctx, { kind: "towel", room: f.room?.name, ...p, y: 0.95, phase: 4 });
        break;
      }
    }
    put(ctx, { ...onTop(f, f.S.w / 2 - 0.06, -0.12, f.S.top, "bottles"), phase: 3 });
  }
  for (const f of ctx.furn.filter((f) => f.type === "toilet")) put(ctx, { ...onTop(f, 0, -0.2, f.S.tank, "succulent"), phase: 3.5 });
}

// 阳台：远离推拉门通道的一头放一张小圆桌 + 一把椅子，沿栏杆一排绿植（连同户型里原有的凑够 3 盆），一盏地上的灯笼
function balcony(ctx) {
  for (const room of ctx.rooms.filter((r) => r.kind === "balcony")) {
    const r = room.inner;
    // 小桌椅：在内框两头找一块 0.74 × 1.0 的空地
    const ends = [[r[0] + 0.02, (r[1] + r[3]) / 2], [r[2] - 0.76, (r[1] + r[3]) / 2]];
    for (const [x0, zc] of ends) {
      const box = [x0, zc - 0.5, x0 + 0.74, zc + 0.5];
      if (!free(ctx, box, room)) continue;
      const toward = (r[0] + r[2]) / 2 > x0 + 0.37 ? 1 : -1;
      put(ctx, { kind: "bistro", room: room.name, x: x0 + 0.37, z: zc, y: 0, rot: facing(toward, 0), phase: 1.5 }, box);
      break;
    }
    // 绿植：沿最长的那条边（离门最远的那一侧）每隔一段试一个位置
    const have = ctx.furn.filter((f) => f.type === "plant" && f.room === room).length;
    let need = Math.max(0, 3 - have);
    const longX = r[2] - r[0] >= r[3] - r[1];
    const rows = longX ? [r[3] - 0.27, r[1] + 0.27] : [r[2] - 0.27, r[0] + 0.27];
    for (const row of rows) for (let k = 0; need > 0 && k < 12; k++) {
      const t = (k % 2 ? 1 - (k >> 1) / 6 : (k >> 1) / 6) * 0.84 + 0.08;
      const x = longX ? r[0] + (r[2] - r[0]) * t : row, z = longX ? row : r[1] + (r[3] - r[1]) * t;
      const box = aabb(x, z, 0.5, 0.5);
      if (!free(ctx, box, room)) continue;
      put(ctx, { kind: "plant", size: "mid", scale: need === 1 ? 0.75 : 0.9, room: room.name, x, z, y: 0, rot: k * 1.7, phase: 4 }, box);
      need--;
    }
    // 灯笼：找一个挨着绿植的空位
    const plants = ctx.out.filter((o) => o.kind === "plant" && o.room === room.name).concat(ctx.furn.filter((f) => f.type === "plant" && f.room === room).map((f) => ({ x: f.at[0], z: f.at[1] })));
    for (const p of plants) {
      let done = false;
      for (const [ox, oz] of [[0.42, 0], [-0.42, 0], [0, -0.42], [0, 0.42]]) {
        const box = aabb(p.x + ox, p.z + oz, 0.24, 0.24);
        if (!free(ctx, box, room, 0.01)) continue;
        put(ctx, { kind: "lamp", style: "lantern", room: room.name, x: p.x + ox, z: p.z + oz, y: 0, rot: 0.4, phase: 4.2 }, box);
        done = true;
        break;
      }
      if (done) break;
    }
  }
}

// 窗帘：住人的房间里，外墙上的窗和推拉门两边各一幅（拉开的），落地，挂在屋里那一侧；压到家具就不挂那一幅
function curtains(ctx) {
  for (const w of ctx.walls) for (const o of w.ops) {
    if (o.type !== "window" && o.type !== "slide") continue;
    const cx = w.a[0] + w.ux * o.at, cz = w.a[1] + w.uz * o.at, d = w.t / 2 + 0.25;
    const sides = [1, -1].map((s) => ({ s, room: ctx.roomAt(cx + w.nx * d * s, cz + w.nz * d * s) }));
    const inside = sides.find((q) => q.room && HABITABLE.has(q.room.kind) && !q.room.outdoor);
    const outside = sides.find((q) => q !== inside);
    if (!inside || (outside.room && !outside.room.outdoor)) continue;
    // 满层高（人眼高度）时窗帘从天花板的轨道上垂下来；剖切的鸟瞰里跟原来一样，最高到剖切面
    const pw = clamp(o.w * 0.16, 0.26, 0.42), h = ctx.cut >= 2.6 ? ctx.cut - 0.03 : Math.min(o.head + 0.25, ctx.cut, 2.6), off = w.t / 2 + 0.07;
    for (const e of [-1, 1]) {
      const u = o.at + e * (o.w / 2 + pw / 2 - 0.1);
      if (u - pw / 2 < 0 || u + pw / 2 > w.L) continue;
      const x = w.a[0] + w.ux * u + w.nx * off * inside.s, z = w.a[1] + w.uz * u + w.nz * off * inside.s;
      const box = aabb(x, z, pw, 0.12, w.ang);
      if (ctx.furn.some((f) => overlap(f.box, box, 0.06)) || ctx.solids.some((b) => overlap(b, box, 0.02))) continue;
      put(ctx, { kind: "curtain", room: inside.room.name, x, z, y: 0, rot: facing(w.nx * inside.s, w.nz * inside.s), w: pw, h, phase: 6 }, box);
    }
  }
}

// 绿植：住人的房间每间凑够目标数（客厅 2 盆、卧室 / 书房 1 盆，户型里原有的也算），放在空着的墙角，靠窗的墙角优先
function plants(ctx) {
  const target = { living: 2, bedroom: 1, study: 1 };
  for (const room of ctx.rooms) {
    let need = (target[room.kind] || 0) - ctx.furn.filter((f) => f.type === "plant" && f.room === room).length - ctx.out.filter((o) => o.kind === "plant" && o.room === room.name).length;
    if (need <= 0) continue;
    const r = room.inner, s = 0.5;
    // 候选：四个角 + 沿墙每 0.4 米一个；按 "离墙角近、离窗近" 打分
    const wins = ctx.walls.flatMap((w) => w.ops.filter((o) => o.type !== "door").map((o) => [w.a[0] + w.ux * o.at, w.a[1] + w.uz * o.at]));
    const cands = [];
    for (let x = r[0] + s / 2; x <= r[2] - s / 2 + 1e-6; x += 0.4) cands.push([x, r[1] + s / 2], [x, r[3] - s / 2]);
    for (let z = r[1] + s / 2; z <= r[3] - s / 2 + 1e-6; z += 0.4) cands.push([r[0] + s / 2, z], [r[2] - s / 2, z]);
    const score = ([x, z]) => {
      const corner = Math.min(Math.abs(x - r[0]), Math.abs(x - r[2])) + Math.min(Math.abs(z - r[1]), Math.abs(z - r[3]));
      const win = Math.min(9, ...wins.map(([wx, wz]) => Math.hypot(wx - x, wz - z)));
      return corner + 0.35 * win;
    };
    for (const [x, z] of cands.sort((p, q) => score(p) - score(q))) {
      if (need <= 0) break;
      const box = aabb(x, z, s, s);
      if (!free(ctx, box, room)) continue;
      put(ctx, { kind: "plant", size: room.kind === "living" ? "big" : "mid", room: room.name, x, z, y: 0, rot: x * 2.3, phase: 4 }, box);
      need--;
    }
  }
}

// 入户地垫：外墙上的门（一侧没有房间），屋里那一侧铺一块
function entry(ctx) {
  for (const w of ctx.walls) for (const o of w.ops) {
    if (o.type !== "door") continue;
    const cx = w.a[0] + w.ux * o.at, cz = w.a[1] + w.uz * o.at, d = w.t / 2 + 0.4;
    const sides = [1, -1].map((s) => ({ s, room: ctx.roomAt(cx + w.nx * d * s, cz + w.nz * d * s) }));
    const inside = sides.find((q) => q.room && !q.room.outdoor), outside = sides.find((q) => q !== inside);
    if (!inside || outside.room) continue;
    const off = w.t / 2 + 0.36, x = cx + w.nx * off * inside.s, z = cz + w.nz * off * inside.s;
    const b = aabb(x, z, Math.min(1.0, o.w), 0.6, w.ang);
    if (!ctx.furn.some((f) => overlap(f.box, b, 0.02))) put(ctx, rugItem(inside.room, b, "teddy", { role: "mat", rot: w.ang, w: Math.min(1.0, o.w), d: 0.6, x, z }));
  }
}

// 厨房、卫生间：顶灯（剖切以后看不到灯具，只挂光）
function ceilingLights(ctx) {
  for (const room of ctx.rooms.filter((r) => r.kind === "kitchen" || r.kind === "bath")) {
    const [x0, z0, x1, z1] = room.rect;
    put(ctx, { kind: "lamp", style: "ceil", room: room.name, x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 0, rot: 0, phase: 2 });
  }
}

// 顺序有讲究：先放大件（地毯不占地、客厅和卧室的落地灯 / 边几 / 休闲椅），再放桌面摆件、窗帘，最后用剩下的空地放绿植
const RULES = [living, dining, bedroom, desk, kitchen, bath, balcony, entry, curtains, plants, ceilingLights];

export function planDecor(plan, { cut = 1.5 } = {}) {
  const ctx = context(plan, cut);
  for (const rule of RULES) rule(ctx);
  // 布置顺序：同一阶段里按位置从西北到东南错开
  return ctx.out.map((o, i) => ({ ...o, i })).sort((a, b) => a.phase - b.phase || a.x + a.z - (b.x + b.z));
}
