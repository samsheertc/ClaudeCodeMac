(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Setup & constants
  // ---------------------------------------------------------------------

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const PLAYER_RADIUS = 16;
  const PLAYER_SPEED = 240;
  const PLAYER_MAX_HEALTH = 100;
  const GUN_LENGTH = 24;

  const BULLET_SPEED = 620;
  const BULLET_RADIUS = 4;
  const FIRE_COOLDOWN = 200; // ms

  const ENEMY_RADIUS = 15;
  const ENEMY_CONTACT_DAMAGE = 10;
  const ENEMY_CONTACT_COOLDOWN = 800; // ms
  const SPAWN_MARGIN = 60;

  const TIER_COLORS = {
    1: { body: "#e74c3c", dark: "#a93226" },
    2: { body: "#9b59b6", dark: "#6c3a86" },
    3: { body: "#f39c12", dark: "#b3730d" },
  };

  const LEVELS = [
    { count: 8, spawnInterval: 1400, speed: 65, health: 1 },
    { count: 12, spawnInterval: 1150, speed: 72, health: 1 },
    { count: 16, spawnInterval: 950, speed: 80, health: 2 },
    { count: 20, spawnInterval: 800, speed: 90, health: 2 },
    { count: 25, spawnInterval: 650, speed: 100, health: 3 },
  ];

  const HEAL_BETWEEN_LEVELS = 20;
  const SCORE_PER_KILL = 10;
  const SCORE_PER_LEVEL = 50;

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------

  const hud = document.getElementById("hud");
  const hudHealthFill = document.getElementById("hud-health-fill");
  const hudLevelNum = document.getElementById("hud-level-num");
  const hudScoreNum = document.getElementById("hud-score-num");

  const screens = {
    menu: document.getElementById("menu-screen"),
    paused: document.getElementById("pause-screen"),
    levelComplete: document.getElementById("levelComplete-screen"),
    gameOver: document.getElementById("gameOver-screen"),
    win: document.getElementById("win-screen"),
  };

  const lcLevelNum = document.getElementById("lc-level-num");
  const lcScoreLine = document.getElementById("lc-score-line");
  const goScoreLine = document.getElementById("go-score-line");
  const winScoreLine = document.getElementById("win-score-line");

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.add("hidden"));
    if (name) screens[name].classList.remove("hidden");
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false };

  const MOVE_KEYS = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "w", "a", "s", "d", "W", "A", "S", "D",
  ]);

  window.addEventListener("keydown", (e) => {
    if (MOVE_KEYS.has(e.key) || e.key === " ") e.preventDefault();
    keys.add(e.key);

    if (e.key === "Escape") {
      if (state === "playing") setState("paused");
      else if (state === "paused") setState("playing");
    }

    if (e.key === "Enter") {
      if (state === "menu") startGame();
      else if (state === "levelComplete") advanceLevel();
      else if (state === "gameOver" || state === "win") startGame();
    }
  });

  window.addEventListener("keyup", (e) => keys.delete(e.key));

  function updateMouseFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  }

  canvas.addEventListener("mousemove", updateMouseFromEvent);
  canvas.addEventListener("mousedown", (e) => {
    updateMouseFromEvent(e);
    mouse.down = true;
  });
  window.addEventListener("mouseup", () => (mouse.down = false));

  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("resumeBtn").addEventListener("click", () => setState("playing"));
  document.getElementById("continueBtn").addEventListener("click", advanceLevel);
  document.getElementById("retryBtn").addEventListener("click", startGame);
  document.getElementById("playAgainBtn").addEventListener("click", startGame);

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------

  let state = "menu"; // menu | playing | paused | levelComplete | gameOver | win
  let levelIndex = 0;
  let score = 0;

  let player, enemies, bullets, particles;
  let enemiesSpawned, spawnTimer;
  let shake = { magnitude: 0, duration: 0 };

  function setState(next) {
    state = next;
    if (next === "playing") {
      hud.classList.remove("hidden");
      showScreen(null);
    } else {
      showScreen(next);
    }
  }

  function makePlayer() {
    return {
      x: W / 2,
      y: H / 2,
      angle: 0,
      health: PLAYER_MAX_HEALTH,
      fireCooldown: 0,
      isMoving: false,
      moveAngle: 0,
      legPhase: 0,
      muzzleFlash: 0,
    };
  }

  function resetLevelEntities() {
    enemies = [];
    bullets = [];
    particles = [];
    enemiesSpawned = 0;
    spawnTimer = 0;
  }

  function startGame() {
    levelIndex = 0;
    score = 0;
    player = makePlayer();
    resetLevelEntities();
    setState("playing");
  }

  function advanceLevel() {
    levelIndex++;
    if (levelIndex >= LEVELS.length) {
      winScoreLine.textContent = `Final Score: ${score}`;
      setState("win");
      return;
    }
    player.health = Math.min(PLAYER_MAX_HEALTH, player.health + HEAL_BETWEEN_LEVELS);
    resetLevelEntities();
    setState("playing");
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function spawnParticles(x, y, color, count, speedRange, lifeRange, sizeRange) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]),
        size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
        color,
      });
    }
  }

  function triggerShake(magnitude, duration) {
    shake.magnitude = Math.max(shake.magnitude, magnitude);
    shake.duration = Math.max(shake.duration, duration);
  }

  // ---------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------

  function updatePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;

    player.isMoving = dx !== 0 || dy !== 0;

    if (player.isMoving) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      player.moveAngle = Math.atan2(dy, dx);
      player.x = clamp(player.x + dx * PLAYER_SPEED * dt, PLAYER_RADIUS, W - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * PLAYER_SPEED * dt, PLAYER_RADIUS, H - PLAYER_RADIUS);
      player.legPhase += dt * 10;
    }

    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    if (player.fireCooldown > 0) player.fireCooldown -= dt * 1000;
    if (player.muzzleFlash > 0) player.muzzleFlash -= dt * 1000;

    if (mouse.down && player.fireCooldown <= 0) {
      fireBullet();
      player.fireCooldown = FIRE_COOLDOWN;
      player.muzzleFlash = 80;
    }
  }

  function fireBullet() {
    const tipX = player.x + Math.cos(player.angle) * GUN_LENGTH;
    const tipY = player.y + Math.sin(player.angle) * GUN_LENGTH;
    bullets.push({
      x: tipX,
      y: tipY,
      vx: Math.cos(player.angle) * BULLET_SPEED,
      vy: Math.sin(player.angle) * BULLET_SPEED,
    });
    spawnParticles(tipX, tipY, "#fff08a", 4, [40, 140], [70, 120], [2, 3]);
  }

  function currentLevel() {
    return LEVELS[levelIndex];
  }

  function spawnEnemy() {
    const level = currentLevel();
    const angle = Math.random() * Math.PI * 2;
    const spawnRadius = Math.hypot(W, H) / 2 + SPAWN_MARGIN;
    const cx = W / 2 + Math.cos(angle) * spawnRadius;
    const cy = H / 2 + Math.sin(angle) * spawnRadius;
    const tier = Math.min(3, level.health);
    enemies.push({
      x: cx,
      y: cy,
      health: level.health,
      maxHealth: level.health,
      speed: level.speed,
      tier,
      legPhase: Math.random() * Math.PI * 2,
      hitCooldown: 0,
      dying: false,
      deathTimer: 0,
      flash: 0,
    });
  }

  function updateEnemies(dt) {
    const level = currentLevel();

    if (enemiesSpawned < level.count) {
      spawnTimer -= dt * 1000;
      if (spawnTimer <= 0) {
        spawnEnemy();
        enemiesSpawned++;
        spawnTimer = level.spawnInterval;
      }
    }

    for (const enemy of enemies) {
      if (enemy.flash > 0) enemy.flash -= dt * 1000;

      if (enemy.dying) {
        enemy.deathTimer += dt * 1000;
        continue;
      }

      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt;
      enemy.y += Math.sin(angle) * enemy.speed * dt;
      enemy.legPhase += dt * 9;

      if (enemy.hitCooldown > 0) enemy.hitCooldown -= dt * 1000;

      const d = dist(enemy.x, enemy.y, player.x, player.y);
      if (d < ENEMY_RADIUS + PLAYER_RADIUS && enemy.hitCooldown <= 0) {
        player.health = Math.max(0, player.health - ENEMY_CONTACT_DAMAGE);
        enemy.hitCooldown = ENEMY_CONTACT_COOLDOWN;
        triggerShake(7, 220);
        spawnParticles(player.x, player.y, "#ff5c72", 6, [50, 160], [150, 260], [2, 4]);
        if (player.health <= 0) {
          goScoreLine.textContent = `Final Score: ${score}`;
          setState("gameOver");
        }
      }
    }

    enemies = enemies.filter((e) => !(e.dying && e.deathTimer >= 300));
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    bullets = bullets.filter((b) => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);

    for (const enemy of enemies) {
      if (enemy.dying) continue;
      for (const b of bullets) {
        if (b.hit) continue;
        if (dist(b.x, b.y, enemy.x, enemy.y) < ENEMY_RADIUS + BULLET_RADIUS) {
          b.hit = true;
          enemy.health -= 1;
          enemy.flash = 100;
          const tierColor = TIER_COLORS[enemy.tier] || TIER_COLORS[1];
          spawnParticles(b.x, b.y, "#ffffff", 3, [30, 100], [80, 140], [1.5, 2.5]);
          if (enemy.health <= 0) {
            enemy.dying = true;
            score += SCORE_PER_KILL;
            spawnParticles(enemy.x, enemy.y, tierColor.body, 10, [60, 220], [300, 550], [2, 4]);
          }
        }
      }
    }

    bullets = bullets.filter((b) => !b.hit);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life += dt * 1000;
    }
    particles = particles.filter((p) => p.life < p.maxLife);
  }

  function updateShake(dt) {
    if (shake.duration > 0) {
      shake.duration -= dt * 1000;
      if (shake.duration <= 0) {
        shake.duration = 0;
        shake.magnitude = 0;
      }
    }
  }

  function checkLevelComplete() {
    const level = currentLevel();
    if (enemiesSpawned >= level.count && enemies.length === 0) {
      score += SCORE_PER_LEVEL;
      lcLevelNum.textContent = levelIndex + 1;
      lcScoreLine.textContent = `Score: ${score}`;
      setState("levelComplete");
    }
  }

  function update(dt) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateParticles(dt);
    updateShake(dt);
    if (state === "playing") checkLevelComplete();
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  function drawBackground() {
    ctx.fillStyle = "#0d1017";
    ctx.fillRect(0, 0, W, H);

    const grid = 40;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawHumanoid(x, y, aimAngle, isMoving, moveAngle, legPhase, bodyColor, darkColor, radius, flashWhite) {
    // legs
    ctx.fillStyle = darkColor;
    const swing = isMoving ? Math.sin(legPhase) * 5 : 0;
    const legAngle = isMoving ? moveAngle : aimAngle;
    const lx = Math.cos(legAngle + Math.PI / 2) * 5;
    const ly = Math.sin(legAngle + Math.PI / 2) * 5;
    ctx.fillRect(x - lx - 3 + Math.cos(legAngle) * swing * 0.3, y - ly - 3 + Math.sin(legAngle) * swing * 0.3, 6, 8);
    ctx.fillRect(x + lx - 3 - Math.cos(legAngle) * swing * 0.3, y + ly - 3 - Math.sin(legAngle) * swing * 0.3, 6, 8);

    // body
    ctx.beginPath();
    ctx.fillStyle = flashWhite ? "#ffffff" : bodyColor;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = darkColor;
    ctx.stroke();

    // facing indicator
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const tipx = x + Math.cos(aimAngle) * (radius - 4);
    const tipy = y + Math.sin(aimAngle) * (radius - 4);
    ctx.arc(tipx, tipy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    drawHumanoid(
      player.x, player.y, player.angle,
      player.isMoving, player.moveAngle, player.legPhase,
      "#3aa0ff", "#1c5f9e", PLAYER_RADIUS, false
    );

    // gun
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#333844";
    ctx.fillRect(6, -3, GUN_LENGTH, 6);
    ctx.restore();

    // muzzle flash
    if (player.muzzleFlash > 0) {
      const tipX = player.x + Math.cos(player.angle) * (GUN_LENGTH + 6);
      const tipY = player.y + Math.sin(player.angle) * (GUN_LENGTH + 6);
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 240, 150, 0.9)";
      ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemies() {
    for (const enemy of enemies) {
      const tierColor = TIER_COLORS[enemy.tier] || TIER_COLORS[1];
      const scale = enemy.dying ? Math.max(0, 1 - enemy.deathTimer / 300) : 1;
      const alpha = enemy.dying ? scale : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(enemy.x, enemy.y);
      ctx.scale(scale, scale);
      ctx.translate(-enemy.x, -enemy.y);

      const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      drawHumanoid(
        enemy.x, enemy.y, angleToPlayer,
        !enemy.dying, angleToPlayer, enemy.legPhase,
        tierColor.body, tierColor.dark, ENEMY_RADIUS, enemy.flash > 0
      );
      ctx.restore();

      if (enemy.maxHealth > 1 && !enemy.dying) {
        const barW = 26;
        const pct = Math.max(0, enemy.health / enemy.maxHealth);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(enemy.x - barW / 2, enemy.y - ENEMY_RADIUS - 10, barW, 4);
        ctx.fillStyle = "#4ade80";
        ctx.fillRect(enemy.x - barW / 2, enemy.y - ENEMY_RADIUS - 10, barW * pct, 4);
      }
    }
  }

  function drawBullets() {
    ctx.fillStyle = "#fff08a";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shake.magnitude > 0) {
      const sx = (Math.random() * 2 - 1) * shake.magnitude;
      const sy = (Math.random() * 2 - 1) * shake.magnitude;
      ctx.translate(sx, sy);
    }

    drawBackground();
    drawParticles();
    drawEnemies();
    drawPlayer();
    drawBullets();

    ctx.restore();
  }

  function updateHud() {
    if (!player) return;
    const pct = clamp(player.health / PLAYER_MAX_HEALTH, 0, 1);
    hudHealthFill.style.width = `${pct * 100}%`;
    hudHealthFill.style.background =
      pct > 0.5 ? "#4ade80" : pct > 0.25 ? "#fbbf24" : "#ff5c72";
    hudLevelNum.textContent = levelIndex + 1;
    hudScoreNum.textContent = score;
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------

  let lastTime = 0;

  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05) || 0;
    lastTime = timestamp;

    if (state === "playing") {
      update(dt);
    }

    if (player) {
      render();
      updateHud();
    } else {
      drawBackground();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
