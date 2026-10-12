// 注入到页面最前面：把页面里的时钟换成"虚拟时钟"。
// 页面加载时照常用真实时间；录制开始后（__vt.start()）时间只在录屏脚本调用 __vt.step(毫秒) 时往前走，
// requestAnimationFrame、setTimeout、setInterval、performance.now、Date.now 都跟着虚拟时间。
// 这样不管电脑渲染一帧要多久，录出来的每一帧都正好隔 1/60 秒，画面是匀速的。
(() => {
  const real = {
    now: performance.now.bind(performance),
    dateNow: Date.now,
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window),
    ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window),
    ci: window.clearInterval.bind(window),
  };
  let virtual = false;
  let vnow = 0; // 毫秒，和 performance.now 同一个起点
  let dateOffset = 0;
  const VID = 1e9; // 虚拟计时器的编号从这里开始，和真实计时器分开
  let nextId = VID;
  const rafs = new Map();
  const timers = new Map();

  performance.now = () => (virtual ? vnow : real.now());
  Date.now = () => (virtual ? vnow + dateOffset : real.dateNow());
  window.requestAnimationFrame = (cb) => {
    if (!virtual) return real.raf(cb);
    const id = nextId++;
    rafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => (id >= VID ? rafs.delete(id) : real.caf(id));
  window.setTimeout = (cb, ms = 0, ...args) => {
    if (!virtual) return real.st(cb, ms, ...args);
    const id = nextId++;
    timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), every: 0, cb, args });
    return id;
  };
  window.clearTimeout = (id) => (id >= VID ? timers.delete(id) : real.ct(id));
  window.setInterval = (cb, ms = 0, ...args) => {
    if (!virtual) return real.si(cb, ms, ...args);
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { at: vnow + every, every, cb, args });
    return id;
  };
  window.clearInterval = (id) => (id >= VID ? timers.delete(id) : real.ci(id));

  const run = (fn, args) => {
    try {
      if (typeof fn === "function") fn(...args);
    } catch (e) {
      console.error(e);
    }
  };

  window.__vt = {
    real,
    get virtual() { return virtual; },
    now: () => vnow,
    /** 切到虚拟时间（从当前真实时间接着走） */
    start() {
      vnow = real.now();
      dateOffset = real.dateNow() - vnow;
      virtual = true;
    },
    /** 往前走 ms 毫秒：先按时间顺序触发到期的计时器，再跑一帧 requestAnimationFrame */
    step(ms) {
      const target = vnow + ms;
      for (let guard = 0; guard < 10000; guard++) {
        let pick = null;
        for (const [id, t] of timers) if (t.at <= target && (!pick || t.at < pick[1].at)) pick = [id, t];
        if (!pick) break;
        const [id, t] = pick;
        vnow = Math.max(vnow, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        run(t.cb, t.args);
      }
      vnow = target;
      const frame = [...rafs.values()];
      rafs.clear();
      for (const cb of frame) run(cb, [vnow]);
    },
  };
})();
