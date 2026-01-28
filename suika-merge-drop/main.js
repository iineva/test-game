(() => {
  const { Engine, World, Bodies, Body, Events } = Matter;

  const CONFIG = {
    gravityY: 1.0,
    dt: 1000 / 60,

    worldWidth: 360,
    worldHeight: 640,

    wallThickness: 24,
    floorThickness: 26,

    dangerLineY: 110,
    GAMEOVER_HOLD_MS: 1000,

    spawnY: 90,
    dropCooldownMs: 300,
    dropImpulseNudge: 0.0002,
    maxDropXMargin: 18,

    MERGE_CONTACT_MS: 120,
    MERGE_SPEED_MAX: 2.8,

    fruits: [
      { name: { en: "Cherry",     ar: "كرز"     }, r: 14, color: "#ff5a7a", score: 2   },
      { name: { en: "Strawberry", ar: "فراولة"  }, r: 18, color: "#ff3b3b", score: 5   },
      { name: { en: "Grape",      ar: "عنب"     }, r: 22, color: "#a855f7", score: 10  },
      { name: { en: "Orange",     ar: "برتقال"  }, r: 26, color: "#fb923c", score: 18  },
      { name: { en: "Apple",      ar: "تفاح"    }, r: 30, color: "#34d399", score: 28  },
      { name: { en: "Pear",       ar: "كمثرى"   }, r: 34, color: "#a3e635", score: 40  },
      { name: { en: "Peach",      ar: "خوخ"     }, r: 38, color: "#fda4af", score: 55  },
      { name: { en: "Pineapple",  ar: "أناناس"  }, r: 42, color: "#facc15", score: 75  },
      { name: { en: "Melon",      ar: "شمام"    }, r: 48, color: "#22c55e", score: 110 },
      { name: { en: "Watermelon", ar: "بطيخ"    }, r: 56, color: "#16a34a", score: 160 },
      { name: { en: "Mega",       ar: "عملاق"   }, r: 66, color: "#60a5fa", score: 240 },
    ],

    spawnWeights: [
      { tier: 0, w: 38 },
      { tier: 1, w: 26 },
      { tier: 2, w: 18 },
      { tier: 3, w: 10 },
      { tier: 4, w: 6  },
      { tier: 5, w: 2  },
    ],

    background: "#0b0f1a",
    containerStroke: "rgba(255,255,255,.16)",
    dangerLineStroke: "rgba(255,80,80,.85)",
    textColor: "rgba(255,255,255,.92)",
    shadowAlpha: 0.28,
  };

  // DOM
  const canvas = document.getElementById("gameCanvas");
  const stage = document.getElementById("stage");
  const ctx = canvas.getContext("2d");

  const scoreValueEl = document.getElementById("scoreValue");
  const nextBadgeEl = document.getElementById("nextBadge");
  const nextNameEl = document.getElementById("nextName");
  const restartBtn = document.getElementById("restartBtn");

  const modal = document.getElementById("gameOverModal");
  const finalScoreEl = document.getElementById("finalScore");
  const playAgainBtn = document.getElementById("playAgainBtn");

  const langSelect = document.getElementById("langSelect");
  const labelScoreEl = document.getElementById("labelScore");
  const labelNextEl = document.getElementById("labelNext");
  const tipLine1El = document.getElementById("tipLine1");
  const tipLine2El = document.getElementById("tipLine2");
  const gameOverTitleEl = document.getElementById("gameOverTitle");
  const finalScoreLabelEl = document.getElementById("finalScoreLabel");

  // i18n
  const I18N = {
    en: {
      dir: "ltr",
      score: "Score",
      next: "Next",
      restart: "Restart",
      tip1: "PC: Move mouse / drag to position, click / release to drop",
      tip2: "Keyboard: \u2190/\u2192 or A/D move, Space/Enter drop",
      gameOver: "Game Over",
      finalScore: "Final Score:",
      playAgain: "Play Again",
      nextUnknown: "—",
    },
    ar: {
      dir: "rtl",
      score: "النتيجة",
      next: "التالي",
      restart: "إعادة",
      tip1: "الكمبيوتر: حرّك الفأرة/اسحب لتحديد المكان، انقر/اترك للإسقاط",
      tip2: "لوحة المفاتيح: \u2190/\u2192 أو A/D للتحريك، Space/Enter للإسقاط",
      gameOver: "انتهت اللعبة",
      finalScore: "النتيجة النهائية:",
      playAgain: "العب مرة أخرى",
      nextUnknown: "—",
    },
  };

  let currentLang = "en";
  function setLanguage(lang) {
    if (!I18N[lang]) lang = "en";
    currentLang = lang;
    const t = I18N[currentLang];

    document.documentElement.lang = currentLang;
    document.documentElement.dir = t.dir;

    labelScoreEl.textContent = t.score;
    labelNextEl.textContent = t.next;
    restartBtn.textContent = t.restart;

    tipLine1El.textContent = t.tip1;
    tipLine2El.textContent = t.tip2;

    gameOverTitleEl.textContent = t.gameOver;
    finalScoreLabelEl.textContent = t.finalScore;
    playAgainBtn.textContent = t.playAgain;

    updateNextUI();
  }

  // state
  let engine, world;
  let bodies = [];
  let running = true;
  let score = 0;

  let pointerX = CONFIG.worldWidth / 2;
  let canDropAt = 0;
  let nextTier = 0;

  // merge bookkeeping
  const contactMap = new Map();
  const mergeQueue = [];
  const mergingIds = new Set();
  let overSince = null;

  // sizing
  let dpr = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const rect = stage.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    scale = Math.min(
      (rect.width * dpr) / CONFIG.worldWidth,
      (rect.height * dpr) / CONFIG.worldHeight
    );

    const worldPxW = CONFIG.worldWidth * scale;
    const worldPxH = CONFIG.worldHeight * scale;
    offsetX = (canvas.width - worldPxW) / 2;
    offsetY = (canvas.height - worldPxH) / 2;
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  // utils
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowMs = () => performance.now();

  function setScore(v) {
    score = v;
    scoreValueEl.textContent = String(score);
  }
  function addScore(d) { setScore(score + d); }

  function pickWeightedTier() {
    const total = CONFIG.spawnWeights.reduce((s, it) => s + it.w, 0);
    let r = Math.random() * total;
    for (const it of CONFIG.spawnWeights) {
      r -= it.w;
      if (r <= 0) return it.tier;
    }
    return CONFIG.spawnWeights[0].tier;
  }

  function updateNextUI() {
    const f = CONFIG.fruits[nextTier];
    nextBadgeEl.textContent = String(nextTier + 1);
    const t = I18N[currentLang] || I18N.en;
    const name = f?.name?.[currentLang] || f?.name?.en || t.nextUnknown;
    nextNameEl.textContent = name;
  }

  function isFruit(body) {
    return body && body.label === "fruit" && body.plugin && Number.isInteger(body.plugin.tier);
  }

  function makeFruit(tier, x, y, opts = {}) {
    const def = CONFIG.fruits[tier];
    const body = Bodies.circle(x, y, def.r, {
      restitution: 0.02,
      friction: 0.12,
      frictionAir: 0.015,
      density: 0.0012,
      label: "fruit",
      ...opts,
    });

    body.plugin = body.plugin || {};
    body.plugin.tier = tier;
    body.plugin.id = crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}-${Date.now()}`;
    body.plugin.popUntil = null;

    bodies.push(body);
    World.add(world, body);
    return body;
  }

  function removeBody(body) {
    World.remove(world, body);
    bodies = bodies.filter(b => b !== body);
  }

  function makeContainer() {
    const W = CONFIG.worldWidth;
    const H = CONFIG.worldHeight;
    const t = CONFIG.wallThickness;
    const ft = CONFIG.floorThickness;

    const left = Bodies.rectangle(-t / 2, H / 2, t, H * 2, { isStatic: true, label: "wall" });
    const right = Bodies.rectangle(W + t / 2, H / 2, t, H * 2, { isStatic: true, label: "wall" });
    const floor = Bodies.rectangle(W / 2, H + ft / 2, W + t * 2, ft, { isStatic: true, label: "floor" });

    World.add(world, [left, right, floor]);
  }

  // merge helpers
  function pairKey(idA, idB) {
    return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
  }

  function relSpeed(a, b) {
    const dvx = (a.velocity?.x || 0) - (b.velocity?.x || 0);
    const dvy = (a.velocity?.y || 0) - (b.velocity?.y || 0);
    return Math.hypot(dvx, dvy);
  }

  function markContact(a, b) {
    const k = pairKey(a.plugin.id, b.plugin.id);
    if (!contactMap.has(k)) contactMap.set(k, { start: nowMs(), last: nowMs() });
    else contactMap.get(k).last = nowMs();
  }

  function clearContact(a, b) {
    contactMap.delete(pairKey(a.plugin.id, b.plugin.id));
  }

  function maybeQueueMerge(a, b) {
    if (!isFruit(a) || !isFruit(b)) return;
    if (a.plugin.tier !== b.plugin.tier) return;
    if (mergingIds.has(a.plugin.id) || mergingIds.has(b.plugin.id)) return;

    const k = pairKey(a.plugin.id, b.plugin.id);
    const rec = contactMap.get(k);
    if (!rec) return;

    if (nowMs() - rec.start < CONFIG.MERGE_CONTACT_MS) return;
    if (relSpeed(a, b) > CONFIG.MERGE_SPEED_MAX) return;

    mergingIds.add(a.plugin.id);
    mergingIds.add(b.plugin.id);
    mergeQueue.push([a, b]);
  }

  function processMergeQueue() {
    if (!mergeQueue.length) return;

    const batch = mergeQueue.splice(0, 4);
    for (const [a, b] of batch) {
      if (!bodies.includes(a) || !bodies.includes(b)) {
        mergingIds.delete(a?.plugin?.id);
        mergingIds.delete(b?.plugin?.id);
        continue;
      }

      const tier = a.plugin.tier;
      const next = tier + 1;
      if (next >= CONFIG.fruits.length) {
        mergingIds.delete(a.plugin.id);
        mergingIds.delete(b.plugin.id);
        continue;
      }

      const cx = (a.position.x + b.position.x) / 2;
      const cy = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2;
      const vy = (a.velocity.y + b.velocity.y) / 2;

      clearContact(a, b);
      removeBody(a);
      removeBody(b);
      mergingIds.delete(a.plugin.id);
      mergingIds.delete(b.plugin.id);

      const nb = makeFruit(next, cx, cy);
      Body.setVelocity(nb, { x: vx * 0.6, y: vy * 0.6 });

      const nudge = (Math.random() - 0.5) * 2;
      Body.applyForce(nb, nb.position, { x: nudge * CONFIG.dropImpulseNudge, y: 0 });

      addScore(CONFIG.fruits[next].score);
      nb.plugin.popUntil = nowMs() + 140;
    }
  }

  // ✅ 关键：每次 resetGame 创建了新 engine，都必须重新绑定事件
  function attachCollisionHandlers() {
    Events.on(engine, "collisionStart", (ev) => {
      for (const p of ev.pairs) {
        const a = p.bodyA, b = p.bodyB;
        if (isFruit(a) && isFruit(b) && a.plugin.tier === b.plugin.tier) markContact(a, b);
      }
    });

    Events.on(engine, "collisionActive", (ev) => {
      for (const p of ev.pairs) {
        const a = p.bodyA, b = p.bodyB;
        if (isFruit(a) && isFruit(b) && a.plugin.tier === b.plugin.tier) {
          markContact(a, b);
          maybeQueueMerge(a, b);
        }
      }
    });

    Events.on(engine, "collisionEnd", (ev) => {
      for (const p of ev.pairs) {
        const a = p.bodyA, b = p.bodyB;
        if (isFruit(a) && isFruit(b)) clearContact(a, b);
      }
    });
  }

  function resetGame() {
    // 重新开局：创建新 engine/world
    engine = Engine.create();
    world = engine.world;
    engine.gravity.y = CONFIG.gravityY;

    bodies = [];
    contactMap.clear();
    mergeQueue.length = 0;
    mergingIds.clear();

    setScore(0);
    running = true;
    overSince = null;
    hideModal();

    makeContainer();
    attachCollisionHandlers(); // ✅ 修复点：绑定到“新 engine”

    nextTier = pickWeightedTier();
    updateNextUI();
  }

  // input mapping
  function clientXToWorldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * dpr;
    return (px - offsetX) / scale;
  }

  function updatePointerX(clientX) {
    const x = clientXToWorldX(clientX);
    pointerX = clamp(x, CONFIG.maxDropXMargin, CONFIG.worldWidth - CONFIG.maxDropXMargin);
  }

  function tryDrop() {
    if (!running) return;
    const t = nowMs();
    if (t < canDropAt) return;

    const tier = nextTier;
    const r = CONFIG.fruits[tier].r;
    const x = clamp(pointerX, r + 6, CONFIG.worldWidth - r - 6);
    makeFruit(tier, x, CONFIG.spawnY, { frictionAir: 0.012 });

    nextTier = pickWeightedTier();
    updateNextUI();
    canDropAt = t + CONFIG.dropCooldownMs;
  }

  // pointer events
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    updatePointerX(e.clientX);
  }, { passive: false });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pressure === 0 && e.buttons === 0) return;
    e.preventDefault();
    updatePointerX(e.clientX);
  }, { passive: false });

  canvas.addEventListener("pointerup", (e) => {
    e.preventDefault();
    updatePointerX(e.clientX);
    tryDrop();
  }, { passive: false });

  // keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") pointerX = clamp(pointerX - 14, 0, CONFIG.worldWidth);
    else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") pointerX = clamp(pointerX + 14, 0, CONFIG.worldWidth);
    else if (e.key === " " || e.key === "Enter") tryDrop();
  });

  restartBtn.addEventListener("click", resetGame);
  playAgainBtn.addEventListener("click", resetGame);

  function checkGameOver() {
    if (!running) return;

    let anyAbove = false;
    for (const b of bodies) {
      if (!isFruit(b)) continue;
      const r = CONFIG.fruits[b.plugin.tier].r;
      const top = b.position.y - r;
      if (top < CONFIG.dangerLineY) { anyAbove = true; break; }
    }

    const t = nowMs();
    if (anyAbove) {
      if (overSince == null) overSince = t;
      if (t - overSince >= CONFIG.GAMEOVER_HOLD_MS) endGame();
    } else {
      overSince = null;
    }
  }

  function endGame() {
    running = false;
    showModal();
  }

  function showModal() {
    finalScoreEl.textContent = String(score);
    modal.classList.remove("hidden");
  }

  function hideModal() {
    modal.classList.add("hidden");
  }

  // render
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    ctx.fillStyle = CONFIG.background;
    ctx.fillRect(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);

    ctx.strokeStyle = CONFIG.containerStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);

    ctx.strokeStyle = CONFIG.dangerLineStroke;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.dangerLineY);
    ctx.lineTo(CONFIG.worldWidth, CONFIG.dangerLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    drawPreview();

    for (const b of bodies) if (isFruit(b)) drawFruit(b);
  }

  function drawPreview() {
    if (!running) return;
    const def = CONFIG.fruits[nextTier];
    const r = def.r;
    const x = clamp(pointerX, r + 6, CONFIG.worldWidth - r - 6);
    const y = CONFIG.spawnY;

    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CONFIG.worldHeight);
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(10, r * 0.45), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `bold ${Math.max(12, r * 0.75)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(nextTier + 1), x, y);
  }

  function drawFruit(b) {
    const def = CONFIG.fruits[b.plugin.tier];
    const r = def.r;
    const x = b.position.x;
    const y = b.position.y;

    let pop = 1;
    if (b.plugin.popUntil) {
      const t = nowMs();
      if (t < b.plugin.popUntil) pop = 1 + 0.18 * ((b.plugin.popUntil - t) / 140);
      else b.plugin.popUntil = null;
    }

    ctx.save();
    ctx.globalAlpha = CONFIG.shadowAlpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 6, r * 0.95, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.angle);
    ctx.scale(pop, pop);

    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.28, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(10, r * 0.42), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.textColor;
    ctx.font = `bold ${Math.max(12, r * 0.70)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.plugin.tier + 1), 0, 0);

    ctx.restore();
  }

  // loop
  function tick() {
    if (running) {
      Engine.update(engine, CONFIG.dt);
      processMergeQueue();
      checkGameOver();
    }
    draw();
    requestAnimationFrame(tick);
  }

  function initLanguage() {
    const savedLang = localStorage.getItem("suika_lang");
    const browserLang = (navigator.language || "en").startsWith("ar") ? "ar" : "en";
    const lang = savedLang || browserLang;

    langSelect.value = lang;
    setLanguage(lang);

    langSelect.addEventListener("change", () => {
      localStorage.setItem("suika_lang", langSelect.value);
      setLanguage(langSelect.value);
    });
  }

  // boot
  resetGame();      // ✅ 只创建一次 engine，并绑定碰撞事件
  initLanguage();
  pointerX = CONFIG.worldWidth / 2;
  tick();
})();
