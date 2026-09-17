"use strict";

const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");
const roundValue = document.querySelector("#round-value");
const ballValue = document.querySelector("#ball-value");
const startCard = document.querySelector("#start-card");
const gameOverCard = document.querySelector("#game-over-card");
const finalRound = document.querySelector("#final-round");
const statusPill = document.querySelector("#status-pill");
const testDialog = document.querySelector("#test-dialog");
const testRound = document.querySelector("#test-round");
const testBalls = document.querySelector("#test-balls");

const WORLD = { width: 420, height: 720 };
const SETTINGS = {
  columns: 7,
  sidePadding: 13,
  topPadding: 34,
  rowHeight: 62,
  brickGap: 7,
  brickRadius: 10,
  ballRadius: 5,
  ballSpeed: 520,
  launchInterval: 0.075,
  dangerY: 624,
  launcherY: 663,
  minAimY: 590,
  maxDelta: 1 / 30,
};

const PALETTE = {
  background: "#08091b",
  violet: "#8c5cff",
  brightViolet: "#b59aff",
  lime: "#bcff5f",
  cyan: "#4fe6ff",
  coral: "#ff6577",
  text: "#f8f8ff",
  muted: "#777b9e",
};

const game = {
  state: "intro",
  round: 1,
  ballCount: 1,
  launcherX: WORLD.width / 2,
  aim: { x: 0, y: -1 },
  bricks: [],
  pickups: [],
  balls: [],
  particles: [],
  pointer: null,
  launchQueue: 0,
  launchTimer: 0,
  volleySize: 0,
  lastTime: performance.now(),
  screenShake: 0,
  testStartRound: 1,
  testStartBalls: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function brickWidth() {
  return (WORLD.width - SETTINGS.sidePadding * 2 - SETTINGS.brickGap * (SETTINGS.columns - 1)) / SETTINGS.columns;
}

function cellX(column) {
  return SETTINGS.sidePadding + column * (brickWidth() + SETTINGS.brickGap);
}

function updateHud() {
  roundValue.textContent = game.round;
  ballValue.textContent = game.ballCount;
}

function setStatus(message, visible = true) {
  statusPill.textContent = message;
  statusPill.style.opacity = visible ? "1" : "0";
}

function healthForRound(round) {
  const base = Math.max(1, Math.floor(round * 0.72));
  const spread = Math.max(2, Math.ceil(round * 0.28));
  return randomInt(base, base + spread);
}

function createOpeningBoard() {
  game.bricks = [];
  game.pickups = [];
  spawnRow(SETTINGS.topPadding + SETTINGS.rowHeight * 2, true);
  spawnRow(SETTINGS.topPadding + SETTINGS.rowHeight, true);
  spawnRow(SETTINGS.topPadding, true);
}

function spawnRow(y = SETTINGS.topPadding, opening = false) {
  const occupied = new Set();
  const targetBricks = opening ? randomInt(2, 4) : randomInt(3, Math.min(6, 3 + Math.floor(game.round / 8)));

  while (occupied.size < targetBricks) {
    occupied.add(randomInt(0, SETTINGS.columns - 1));
  }

  for (const column of occupied) {
    game.bricks.push({
      column,
      x: cellX(column),
      y,
      width: brickWidth(),
      height: SETTINGS.rowHeight - SETTINGS.brickGap,
      health: healthForRound(game.round),
      maxHealth: 0,
      flash: 0,
    });
    game.bricks.at(-1).maxHealth = game.bricks.at(-1).health;
  }

  const emptyColumns = Array.from({ length: SETTINGS.columns }, (_, index) => index).filter((column) => !occupied.has(column));
  const pickupChance = opening ? 0.44 : clamp(0.38 - game.round * 0.006, 0.16, 0.38);
  if (emptyColumns.length && Math.random() < pickupChance) {
    const column = emptyColumns[randomInt(0, emptyColumns.length - 1)];
    game.pickups.push({
      column,
      x: cellX(column) + brickWidth() / 2,
      y: y + (SETTINGS.rowHeight - SETTINGS.brickGap) / 2,
      radius: 16,
      pulse: Math.random() * Math.PI * 2,
    });
  }
}

function resetGame() {
  game.round = game.testStartRound;
  game.ballCount = game.testStartBalls;
  game.launcherX = WORLD.width / 2;
  game.aim = { x: 0, y: -1 };
  game.balls = [];
  game.particles = [];
  game.launchQueue = 0;
  game.launchTimer = 0;
  game.volleySize = 0;
  game.screenShake = 0;
  createOpeningBoard();
  updateHud();
  gameOverCard.classList.add("hidden");
  startCard.classList.add("hidden");
  game.state = "ready";
  setStatus("MOVE • AIM • RELEASE");
}

function startVolley() {
  if (game.state !== "aiming" && game.state !== "ready") return;
  game.state = "launching";
  game.volleySize = game.ballCount;
  game.launchQueue = game.volleySize;
  game.launchTimer = 0;
  game.pointer = null;
  setStatus(`VOLLEY ×${game.volleySize}`, false);
}

function launchBall() {
  game.balls.push({
    x: game.launcherX,
    y: SETTINGS.launcherY - 13,
    vx: game.aim.x * SETTINGS.ballSpeed,
    vy: game.aim.y * SETTINGS.ballSpeed,
    radius: SETTINGS.ballRadius,
    trail: [],
  });
  game.launchQueue -= 1;
}

function endVolley() {
  if (game.state === "gameover") return;
  game.state = "transition";
  setStatus("BRICKS ADVANCING");

  window.setTimeout(() => {
    if (game.state === "gameover") return;
    game.round += 1;
    for (const brick of game.bricks) brick.y += SETTINGS.rowHeight;
    for (const pickup of game.pickups) pickup.y += SETTINGS.rowHeight;

    const reachedLine = game.bricks.some((brick) => brick.y + brick.height >= SETTINGS.dangerY);
    if (reachedLine) {
      finishGame();
      return;
    }

    spawnRow();
    game.state = "ready";
    updateHud();
    setStatus("MOVE • AIM • RELEASE");
  }, 430);
}

function finishGame() {
  game.state = "gameover";
  finalRound.textContent = game.round;
  gameOverCard.classList.remove("hidden");
  setStatus("GAME OVER", false);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (WORLD.width / rect.width),
    y: (event.clientY - rect.top) * (WORLD.height / rect.height),
  };
}

function updateAim(point) {
  const dx = point.x - game.launcherX;
  const dy = Math.min(point.y, SETTINGS.minAimY) - SETTINGS.launcherY;
  const length = Math.hypot(dx, dy) || 1;
  let x = dx / length;
  let y = dy / length;
  const maxHorizontal = 0.94;
  x = clamp(x, -maxHorizontal, maxHorizontal);
  y = -Math.sqrt(Math.max(0.12, 1 - x * x));
  game.aim = { x, y };
}

function onPointerDown(event) {
  if (game.state !== "ready" && game.state !== "aiming") return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  const nearLauncher = point.y > SETTINGS.launcherY - 52;
  game.pointer = { id: event.pointerId, mode: nearLauncher ? "moving" : "aiming", start: point };

  if (nearLauncher) {
    game.launcherX = clamp(point.x, 27, WORLD.width - 27);
    game.state = "ready";
    setStatus("POSITION SET • NOW AIM");
  } else {
    game.state = "aiming";
    updateAim(point);
    setStatus("RELEASE TO FIRE");
  }
}

function onPointerMove(event) {
  if (!game.pointer || game.pointer.id !== event.pointerId) return;
  event.preventDefault();
  const point = canvasPoint(event);
  if (game.pointer.mode === "moving") {
    game.launcherX = clamp(point.x, 27, WORLD.width - 27);
  } else {
    updateAim(point);
  }
}

function onPointerUp(event) {
  if (!game.pointer || game.pointer.id !== event.pointerId) return;
  event.preventDefault();
  const mode = game.pointer.mode;
  game.pointer = null;
  if (mode === "aiming") startVolley();
}

function circleRectCollision(ball, brick) {
  const nearestX = clamp(ball.x, brick.x, brick.x + brick.width);
  const nearestY = clamp(ball.y, brick.y, brick.y + brick.height);
  const dx = ball.x - nearestX;
  const dy = ball.y - nearestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius ? { nearestX, nearestY, dx, dy } : null;
}

function bounceFromBrick(ball, brick, collision) {
  const previousX = ball.x - ball.vx * 0.002;
  const previousY = ball.y - ball.vy * 0.002;
  const wasLeft = previousX + ball.radius <= brick.x;
  const wasRight = previousX - ball.radius >= brick.x + brick.width;
  const wasAbove = previousY + ball.radius <= brick.y;
  const wasBelow = previousY - ball.radius >= brick.y + brick.height;

  if (wasLeft || wasRight) {
    ball.vx *= -1;
    ball.x = wasLeft ? brick.x - ball.radius - 0.1 : brick.x + brick.width + ball.radius + 0.1;
  } else if (wasAbove || wasBelow) {
    ball.vy *= -1;
    ball.y = wasAbove ? brick.y - ball.radius - 0.1 : brick.y + brick.height + ball.radius + 0.1;
  } else if (Math.abs(collision.dx) > Math.abs(collision.dy)) {
    ball.vx *= -1;
  } else {
    ball.vy *= -1;
  }
}

function damageBrick(brick, ball, collision) {
  bounceFromBrick(ball, brick, collision);
  brick.health -= 1;
  brick.flash = 1;
  createImpact(ball.x, ball.y, brick.health <= 0 ? 10 : 4);

  if (brick.health <= 0) {
    game.bricks = game.bricks.filter((item) => item !== brick);
    game.screenShake = Math.max(game.screenShake, 4);
  }
}

function createImpact(x, y, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomInt(35, 120);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.25,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function collectPickup(pickup) {
  game.pickups = game.pickups.filter((item) => item !== pickup);
  game.ballCount += 1;
  updateHud();
  createImpact(pickup.x, pickup.y, 14);
}

function updateBall(ball, dt) {
  const maxStep = 1 / 180;
  const steps = Math.max(1, Math.ceil(dt / maxStep));
  const step = dt / steps;

  for (let index = 0; index < steps; index += 1) {
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    if (ball.x - ball.radius <= 0 && ball.vx < 0) {
      ball.x = ball.radius;
      ball.vx *= -1;
    } else if (ball.x + ball.radius >= WORLD.width && ball.vx > 0) {
      ball.x = WORLD.width - ball.radius;
      ball.vx *= -1;
    }

    if (ball.y - ball.radius <= 0 && ball.vy < 0) {
      ball.y = ball.radius;
      ball.vy *= -1;
    }

    for (const brick of [...game.bricks]) {
      const collision = circleRectCollision(ball, brick);
      if (collision) {
        damageBrick(brick, ball, collision);
        break;
      }
    }

    for (const pickup of [...game.pickups]) {
      const distance = Math.hypot(ball.x - pickup.x, ball.y - pickup.y);
      if (distance <= ball.radius + pickup.radius) collectPickup(pickup);
    }
  }

  ball.trail.unshift({ x: ball.x, y: ball.y });
  if (ball.trail.length > 8) ball.trail.pop();
}

function update(dt) {
  for (const brick of game.bricks) brick.flash = Math.max(0, brick.flash - dt * 7);
  for (const pickup of game.pickups) pickup.pulse += dt * 3;
  game.screenShake = Math.max(0, game.screenShake - dt * 20);

  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);

  if (game.state === "launching" || game.state === "playing") {
    if (game.launchQueue > 0) {
      game.launchTimer -= dt;
      if (game.launchTimer <= 0) {
        launchBall();
        game.launchTimer = SETTINGS.launchInterval;
        game.state = "playing";
      }
    }

    for (const ball of game.balls) updateBall(ball, dt);
    game.balls = game.balls.filter((ball) => ball.y - ball.radius <= WORLD.height + 8);

    if (game.launchQueue === 0 && game.balls.length === 0) endVolley();
  }
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawDangerLine() {
  ctx.save();
  ctx.setLineDash([7, 8]);
  ctx.strokeStyle = "rgba(255, 101, 119, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, SETTINGS.dangerY);
  ctx.lineTo(WORLD.width, SETTINGS.dangerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255, 101, 119, 0.8)";
  ctx.font = "700 8px system-ui";
  ctx.letterSpacing = "1px";
  ctx.fillText("DANGER LINE", 13, SETTINGS.dangerY - 8);
  ctx.restore();
}

function brickColour(brick) {
  const pressure = clamp((brick.y - 80) / (SETTINGS.dangerY - 100), 0, 1);
  const hue = 265 - pressure * 245;
  return `hsl(${hue} 82% ${58 + brick.flash * 22}%)`;
}

function brickShadowColour(brick) {
  const pressure = clamp((brick.y - 80) / (SETTINGS.dangerY - 100), 0, 1);
  const hue = 265 - pressure * 245;
  return `hsl(${hue} 62% 30%)`;
}

function drawBricks() {
  for (const brick of game.bricks) {
    const colour = brickColour(brick);
    ctx.save();
    ctx.shadowColor = colour;
    ctx.shadowBlur = 8 + brick.flash * 13;
    roundedRect(brick.x, brick.y, brick.width, brick.height, SETTINGS.brickRadius);
    const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, brickShadowColour(brick));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.font = "800 18px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(brick.health, brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
    ctx.restore();
  }
}

function drawPickups() {
  for (const pickup of game.pickups) {
    const pulse = 1 + Math.sin(pickup.pulse) * 0.08;
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = PALETTE.lime;
    ctx.shadowBlur = 17;
    ctx.fillStyle = "rgba(188, 255, 95, 0.14)";
    ctx.strokeStyle = PALETTE.lime;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.lime;
    ctx.font = "900 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+1", 0, 1);
    ctx.restore();
  }
}

function drawAimGuide() {
  if (game.state !== "ready" && game.state !== "aiming") return;
  const origin = { x: game.launcherX, y: SETTINGS.launcherY - 14 };
  let point = { ...origin };
  let direction = { ...game.aim };
  let remaining = 370;

  ctx.save();
  ctx.strokeStyle = game.state === "aiming" ? "rgba(188, 255, 95, 0.82)" : "rgba(188, 255, 95, 0.38)";
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);

  for (let bounce = 0; bounce < 3 && remaining > 0; bounce += 1) {
    const distanceToSide = direction.x > 0
      ? (WORLD.width - 8 - point.x) / direction.x
      : (8 - point.x) / direction.x;
    const distanceToTop = (8 - point.y) / direction.y;
    const distance = Math.min(
      remaining,
      distanceToSide > 0 ? distanceToSide : Infinity,
      distanceToTop > 0 ? distanceToTop : Infinity,
    );
    point = { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
    ctx.lineTo(point.x, point.y);
    remaining -= distance;
    if (distance === distanceToSide) direction.x *= -1;
    if (distance === distanceToTop) direction.y *= -1;
  }

  ctx.stroke();
  ctx.restore();
}

function drawLauncher() {
  ctx.save();
  ctx.translate(game.launcherX, SETTINGS.launcherY);
  const angle = Math.atan2(game.aim.y, game.aim.x) + Math.PI / 2;
  ctx.rotate(angle);
  ctx.shadowColor = PALETTE.brightViolet;
  ctx.shadowBlur = 16;
  const gradient = ctx.createLinearGradient(0, -25, 0, 12);
  gradient.addColorStop(0, PALETTE.lime);
  gradient.addColorStop(0.28, PALETTE.brightViolet);
  gradient.addColorStop(1, PALETTE.violet);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.lineTo(13, 12);
  ctx.lineTo(0, 7);
  ctx.lineTo(-13, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (game.state === "ready") {
    ctx.save();
    ctx.strokeStyle = "rgba(181, 154, 255, 0.28)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(Math.max(30, game.launcherX - 45), SETTINGS.launcherY + 25);
    ctx.lineTo(Math.min(WORLD.width - 30, game.launcherX + 45), SETTINGS.launcherY + 25);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBalls() {
  for (const ball of game.balls) {
    for (let index = ball.trail.length - 1; index >= 0; index -= 1) {
      const point = ball.trail[index];
      const opacity = (ball.trail.length - index) / ball.trail.length * 0.12;
      ctx.fillStyle = `rgba(79, 230, 255, ${opacity})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, ball.radius * (1 - index * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 13;
    ctx.fillStyle = "#e9fcff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = PALETTE.lime;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  const shakeX = game.screenShake ? (Math.random() - 0.5) * game.screenShake : 0;
  const shakeY = game.screenShake ? (Math.random() - 0.5) * game.screenShake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawDangerLine();
  drawBricks();
  drawPickups();
  drawAimGuide();
  drawLauncher();
  drawBalls();
  drawParticles();
  ctx.restore();
}

function frame(now) {
  const dt = Math.min((now - game.lastTime) / 1000, SETTINGS.maxDelta);
  game.lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

document.querySelector("#start-button").addEventListener("click", resetGame);
document.querySelector("#restart-button").addEventListener("click", resetGame);

let versionTaps = 0;
let versionTimer;
document.querySelector("#version-button").addEventListener("click", () => {
  versionTaps += 1;
  window.clearTimeout(versionTimer);
  versionTimer = window.setTimeout(() => { versionTaps = 0; }, 1800);
  if (versionTaps >= 5) {
    versionTaps = 0;
    testRound.value = game.testStartRound;
    testBalls.value = game.testStartBalls;
    testDialog.showModal();
  }
});

document.querySelector("#apply-test-button").addEventListener("click", (event) => {
  event.preventDefault();
  game.testStartRound = clamp(Number.parseInt(testRound.value, 10) || 1, 1, 100);
  game.testStartBalls = clamp(Number.parseInt(testBalls.value, 10) || 1, 1, 100);
  testDialog.close();
  resetGame();
});

createOpeningBoard();
updateHud();
requestAnimationFrame(frame);
