// 把户型数据画成一张标准的户型平面图（施工图画法）：墙体涂实、门画开启弧线、推拉门画双线、窗画四线、
// 外面三道尺寸线 + 轴线编号、房间名和面积、家具轮廓、指北针、图签。
// 用途：① 视频开头的"真实图纸"；② 导出 PNG 给另一个 Claude 读，检验 AI 读图（它看不到原始数据）。
const MM = (m) => Math.round(m * 1000);

export function sheetBounds(plan) {
  const xs = plan.walls.flatMap((w) => [w.a[0], w.b[0]]).concat(plan.rails.flatMap((r) => [r.a[0], r.b[0]]));
  const zs = plan.walls.flatMap((w) => [w.a[1], w.b[1]]).concat(plan.rails.flatMap((r) => [r.a[1], r.b[1]]));
  const pad = 3.2; // 图纸四周留给尺寸线和轴号的空间（米）
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad + 0.8 };
}

// g：2D context；ppm：每米多少像素
export function drawPlan(g, plan, ppm, opt = {}) {
  const B = sheetBounds(plan);
  const W = (B.x1 - B.x0) * ppm, H = (B.z1 - B.z0) * ppm;
  const P = (x, z) => [(x - B.x0) * ppm, (z - B.z0) * ppm];
  const ink = opt.ink || "#1a1a1a", soft = opt.soft || "#6b6b6b", paper = opt.paper || "#ffffff", poche = opt.poche || "#2b2b2b";
  const lw = (mm) => Math.max(1, (mm / 1000) * ppm * 0.9);
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  g.lineCap = "butt"; g.lineJoin = "miter";

  // ---------- 房间地面（极淡的填充）和家具轮廓 ----------
  for (const r of plan.rooms) {
    const [a, b] = [P(r.rect[0], r.rect[1]), P(r.rect[2], r.rect[3])];
    g.fillStyle = r.floor === "tile" ? "#f3f3f1" : "#fbfaf7";
    g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    if (r.floor === "tile") { // 地砖格子
      g.strokeStyle = "#e4e4e0"; g.lineWidth = 1;
      for (let x = r.rect[0]; x < r.rect[2]; x += 0.6) { const [px] = P(x, 0); g.beginPath(); g.moveTo(px, a[1]); g.lineTo(px, b[1]); g.stroke(); }
      for (let z = r.rect[1]; z < r.rect[3]; z += 0.6) { const [, pz] = P(0, z); g.beginPath(); g.moveTo(a[0], pz); g.lineTo(b[0], pz); g.stroke(); }
    }
  }
  drawFurniture(g, plan, P, ppm, soft);

  // ---------- 墙体：按洞口切段，涂实 ----------
  for (const w of plan.walls) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, t = w.t;
    const ops = plan.openings.filter((o) => o.wall === w.id).sort((p, q) => p.at - q.at);
    const segs = []; let u = -t / 2;
    for (const o of ops) { segs.push([u, o.at - o.w / 2]); u = o.at + o.w / 2; }
    segs.push([u, L + t / 2]);
    g.fillStyle = poche;
    for (const [u0, u1] of segs) {
      if (u1 <= u0) continue;
      const c = [[u0, -t / 2], [u1, -t / 2], [u1, t / 2], [u0, t / 2]].map(([s, n]) => P(w.a[0] + ux * s + nx * n, w.a[1] + uz * s + nz * n));
      g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    }
    // 门窗符号
    for (const o of ops) {
      const at = (s, n) => P(w.a[0] + ux * s + nx * n, w.a[1] + uz * s + nz * n);
      const s0 = o.at - o.w / 2, s1 = o.at + o.w / 2;
      g.strokeStyle = ink;
      if (o.type === "window") { // 四线窗
        g.lineWidth = lw(12);
        for (const n of [-t / 2, -t / 6, t / 6, t / 2]) { const [p, q] = [at(s0, n), at(s1, n)]; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
        for (const s of [s0, s1]) { const [p, q] = [at(s, -t / 2), at(s, t / 2)]; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
      } else if (o.type === "slide") { // 推拉门：两条错开的扇
        g.lineWidth = lw(18);
        const m = (s0 + s1) / 2;
        for (const [a0, a1, n] of [[s0, m + 0.08, -t / 6], [m - 0.08, s1, t / 6]]) { const [p, q] = [at(a0, n), at(a1, n)]; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
      } else { // 平开门：门扇 + 开启弧线（开向墙的 +n 一侧）
        const hinge = at(s0, t / 2), leafEnd = at(s0, t / 2 + o.w), close = at(s1, t / 2);
        g.lineWidth = lw(20); g.beginPath(); g.moveTo(...hinge); g.lineTo(...leafEnd); g.stroke();
        g.lineWidth = lw(8); g.setLineDash([lw(40), lw(30)]);
        const a0 = Math.atan2(leafEnd[1] - hinge[1], leafEnd[0] - hinge[0]), a1 = Math.atan2(close[1] - hinge[1], close[0] - hinge[0]);
        g.beginPath(); g.arc(hinge[0], hinge[1], o.w * ppm, a0, a1, angleCW(a0, a1)); g.stroke(); g.setLineDash([]);
      }
    }
  }
  // 阳台栏板
  g.strokeStyle = ink; g.lineWidth = lw(20);
  for (const r of plan.rails) { const [p, q] = [P(...r.a), P(...r.b)]; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }

  // ---------- 房间名 + 面积 ----------
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const r of plan.rooms) {
    const [cx, cy] = P((r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2 + (r.name === "客餐厅" ? 0.25 : 0));
    const area = ((r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1])).toFixed(1);
    g.fillStyle = ink; g.font = `700 ${0.32 * ppm}px "Noto Sans SC", "Microsoft YaHei", sans-serif`; g.fillText(r.name, cx, cy - 0.12 * ppm);
    g.fillStyle = soft; g.font = `500 ${0.22 * ppm}px "Noto Sans SC", "Microsoft YaHei", sans-serif`; g.fillText(`${area} ㎡`, cx, cy + 0.22 * ppm);
  }

  // ---------- 轴线 + 尺寸线 ----------
  const ax = [...new Set(plan.walls.flatMap((w) => (w.a[0] === w.b[0] ? [w.a[0]] : [])))].sort((p, q) => p - q);
  const az = [...new Set(plan.walls.flatMap((w) => (w.a[1] === w.b[1] ? [w.a[1]] : [])).concat(plan.rails.map((r) => r.a[1])))].sort((p, q) => p - q);
  const xMin = Math.min(...ax), xMax = Math.max(...ax), zMin = Math.min(...az), zMax = Math.max(...az);
  g.font = `500 ${0.2 * ppm}px Consolas, monospace`; g.fillStyle = ink; g.strokeStyle = ink;
  // 上方：分段尺寸 + 总尺寸；左侧同理
  dimChain(g, P, ppm, ax.map((x) => [x, zMin]), [0, -1.0], lw);
  dimChain(g, P, ppm, [[xMin, zMin], [xMax, zMin]], [0, -1.6], lw);
  dimChain(g, P, ppm, az.map((z) => [xMin, z]), [-1.0, 0], lw);
  dimChain(g, P, ppm, [[xMin, zMin], [xMin, zMax]], [-1.6, 0], lw);
  // 轴号：竖向轴 1、2、3…，横向轴 A、B、C…
  ax.forEach((x, i) => bubble(g, P(x, zMin - 2.3), String(i + 1), ppm, ink));
  az.forEach((z, i) => bubble(g, P(xMin - 2.3, z), "ABCDEFG"[i], ppm, ink));
  g.strokeStyle = "#9a9a9a"; g.lineWidth = 1; g.setLineDash([lw(120), lw(40), lw(20), lw(40)]);
  ax.forEach((x) => { const [p, q] = [P(x, zMin - 2.0), P(x, zMin - 0.3)]; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); });
  az.forEach((z) => { const [p, q] = [P(xMin - 2.0, z), P(xMin - 0.3, z)]; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); });
  g.setLineDash([]);

  // ---------- 指北针 + 图名 ----------
  const [nx0, nz0] = P(xMax + 1.6, zMin - 1.7);
  g.strokeStyle = ink; g.lineWidth = lw(15); g.beginPath(); g.arc(nx0, nz0, 0.45 * ppm, 0, Math.PI * 2); g.stroke();
  g.fillStyle = ink; g.beginPath(); g.moveTo(nx0, nz0 - 0.45 * ppm); g.lineTo(nx0 + 0.16 * ppm, nz0 + 0.3 * ppm); g.lineTo(nx0, nz0 + 0.15 * ppm); g.closePath(); g.fill();
  g.font = `700 ${0.24 * ppm}px "Noto Sans SC", sans-serif`; g.fillText("北", nx0, nz0 - 0.7 * ppm);
  const [tx, tz] = P((xMin + xMax) / 2, zMax + 1.6);
  g.font = `800 ${0.42 * ppm}px "Noto Sans SC", "Microsoft YaHei", sans-serif`; g.fillText(`${plan.name}  户型平面图`, tx, tz);
  g.font = `500 ${0.24 * ppm}px Consolas, monospace`; g.fillStyle = soft; g.fillText("1 : 100    单位：mm", tx, tz + 0.5 * ppm);
  return { W, H, B };
}

function angleCW(a0, a1) { let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d < 0; }

// 一串尺寸：pts 是轴线上的点，off 是往外偏移（米）
function dimChain(g, P, ppm, pts, off, lw) {
  const q = pts.map(([x, z]) => P(x + off[0], z + off[1]));
  g.lineWidth = lw(8);
  g.beginPath(); g.moveTo(...q[0]); g.lineTo(...q[q.length - 1]); g.stroke();
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i], ext = P(pts[i][0] + off[0] * 0.25, pts[i][1] + off[1] * 0.25);
    g.beginPath(); g.moveTo(...ext); g.lineTo(x + (off[0] ? -0.08 : 0) * ppm * Math.sign(off[0]), y + (off[1] ? -0.08 : 0) * ppm * Math.sign(off[1])); g.stroke();
    const s = 0.1 * ppm; g.lineWidth = lw(20); g.beginPath(); g.moveTo(x - s, y + s); g.lineTo(x + s, y - s); g.stroke(); g.lineWidth = lw(8);
    if (i) {
      const len = MM(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const [mx, my] = [(x + q[i - 1][0]) / 2, (y + q[i - 1][1]) / 2];
      g.save(); g.translate(mx, my); if (off[0]) g.rotate(-Math.PI / 2);
      g.textBaseline = "bottom"; g.fillText(String(len), 0, -0.06 * ppm); g.restore(); g.textBaseline = "middle";
    }
  }
}

function bubble(g, [x, y], label, ppm, ink) {
  g.strokeStyle = ink; g.lineWidth = Math.max(1, 0.015 * ppm); g.fillStyle = "#fff";
  g.beginPath(); g.arc(x, y, 0.3 * ppm, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = ink; g.font = `700 ${0.28 * ppm}px Consolas, monospace`; g.fillText(label, x, y + 0.01 * ppm);
}

// 家具：平面图里的细线轮廓
function drawFurniture(g, plan, P, ppm, soft) {
  const SIZE = { sofa: [2.3, 0.9], coffee: [1.1, 0.6], tv: [1.9, 0.4], dining: [1.4, 0.8], bed18: [1.88, 2.1], bed15: [1.58, 2.1], wardrobe: [2.4, 0.6], desk: [1.2, 0.6],
    kitchen: [2.6, 0.6], fridge: [0.7, 0.68], shower: [1.84, 1.0], toilet: [0.4, 0.65], basin: [0.7, 0.46], plant: [0.4, 0.4] };
  g.strokeStyle = soft; g.lineWidth = Math.max(1, 0.012 * ppm);
  for (const f of plan.furniture) {
    const s = SIZE[f.type]; if (!s) continue;
    const r = (f.rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    // 局部 (x 沿宽, z 沿深) → 世界：绕竖轴转 rot（和 three.js 的 rotation.y 一致）
    const W = (lx, lz) => P(f.at[0] + lx * c + lz * sn, f.at[1] - lx * sn + lz * c);
    const corners = [[-s[0] / 2, -s[1] / 2], [s[0] / 2, -s[1] / 2], [s[0] / 2, s[1] / 2], [-s[0] / 2, s[1] / 2]].map(([x, z]) => W(x, z));
    g.beginPath(); corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    if (f.type.startsWith("bed")) { // 枕头
      for (const sx of [-1, 1]) { const q = [[sx * s[0] / 4 - 0.3, -0.95], [sx * s[0] / 4 + 0.3, -0.95], [sx * s[0] / 4 + 0.3, -0.6], [sx * s[0] / 4 - 0.3, -0.6]].map(([x, z]) => W(x, z)); g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); }
    }
    if (f.type === "plant") { const [x, y] = W(0, 0); g.beginPath(); g.arc(x, y, 0.2 * ppm, 0, Math.PI * 2); g.stroke(); }
  }
}
