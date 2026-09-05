'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paleta original de piezas, compartida por los skins Retro y Pixel.
const RETRO_COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const SKINS = {
  retro: {
    name: 'Retro',
    colors: RETRO_COLORS,
    draw: drawBlockRetro,
  },
  neon: {
    name: 'Neon',
    colors: [
      null,
      '#00fff7', // I - cyan neon
      '#fff700', // O - amarillo neon
      '#d500ff', // T - magenta neon
      '#00ff41', // S - verde neon
      '#ff073a', // Z - rojo neon
      '#00aaff', // J - azul neon
      '#ff8c00', // L - naranja neon
    ],
    draw: drawBlockNeon,
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#b2ebf2', // I - celeste pastel
      '#fff9c4', // O - amarillo pastel
      '#e1bee7', // T - lila pastel
      '#c8e6c9', // S - verde pastel
      '#ffcdd2', // Z - rosa pastel
      '#bbdefb', // J - azul pastel
      '#ffe0b2', // L - naranja pastel
    ],
    draw: drawBlockPastel,
  },
  pixel: {
    name: 'Pixel',
    colors: RETRO_COLORS,
    draw: drawBlockPixel,
  },
};

let activeSkin = SKINS.retro;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const POWERUP_FALL_SPEED = 6; // filas por segundo
const POWERUP_SPAWN_CHANCE = 0.25;
const BLAST_DURATION = 350; // ms
const BLAST_POINTS = 10;

const POWERUPS = {
  bomb: {
    name: 'Bomba',
    lifespan: Infinity, // no caduca: solo detona por contacto o click
    detonateOnContact: true,
    onActivate: (p) => explode(p),
    drawIcon: drawBombIcon,
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, powerups;

function themeVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  themeToggleBtn.textContent = isLight ? '☀️' : '🌙';
}

function toggleTheme() {
  const isLight = !document.body.classList.contains('light-theme');
  applyTheme(isLight);
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  if (board) draw();
}

function applySkin(key) {
  if (!SKINS[key]) key = 'retro';
  activeSkin = SKINS[key];
  Array.from(document.body.classList).forEach(cls => {
    if (cls.startsWith('skin-')) document.body.classList.remove(cls);
  });
  document.body.classList.add(`skin-${key}`);
  localStorage.setItem('tetris-skin', key);
  if (skinSelect) skinSelect.value = key;
  if (board) draw();
  if (next) drawNext();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function spawnPowerup() {
  if (Math.random() >= POWERUP_SPAWN_CHANCE) return;
  const keys = Object.keys(POWERUPS);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const x = Math.floor(Math.random() * COLS);
  powerups.push({ key, x, y: -1, born: performance.now(), state: 'falling', t: 0 });
}

function updatePowerups(dt) {
  const now = performance.now();
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    const def = POWERUPS[p.key];
    if (p.state === 'falling') {
      p.y += (POWERUP_FALL_SPEED * dt) / 1000;
      const row = Math.floor(p.y);
      const nextRow = row + 1;
      const landed = nextRow >= ROWS || (nextRow >= 0 && board[nextRow][p.x]);
      if (landed) {
        p.y = Math.max(0, Math.min(row, ROWS - 1));
        if (def.detonateOnContact) {
          def.onActivate(p);
        } else {
          powerups.splice(i, 1);
        }
        continue;
      }
      if (isFinite(def.lifespan) && now - p.born > def.lifespan) {
        powerups.splice(i, 1);
      }
    } else if (p.state === 'blast') {
      p.t += dt;
      if (p.t >= BLAST_DURATION) powerups.splice(i, 1);
    }
  }
}

function explode(p) {
  const row = Math.floor(p.y);
  const cx = p.x;
  let destroyed = 0;
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      if (board[r][c]) {
        board[r][c] = 0;
        destroyed++;
      }
    }
  }
  if (destroyed) {
    score += destroyed * BLAST_POINTS;
    updateHUD();
  }
  p.state = 'blast';
  p.t = 0;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawnPowerup();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  const color = activeSkin.colors[colorIndex];
  activeSkin.draw(context, x, y, color, size);
  context.globalAlpha = 1;
}

// ---- Skin: Retro (comportamiento original) ----
function drawBlockRetro(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeVar('--block-highlight');
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

// ---- Skin: Neon (glow + borde grueso sobre fondo oscuro) ----
function drawBlockNeon(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  // fondo casi negro
  context.fillStyle = '#0a0a0f';
  context.fillRect(px, py, s, s);
  // borde con glow
  const lw = Math.max(2, size * 0.12);
  context.shadowBlur = size * 0.4;
  context.shadowColor = color;
  context.strokeStyle = color;
  context.lineWidth = lw;
  context.strokeRect(px + lw / 2, py + lw / 2, s - lw, s - lw);
  // CRÍTICO: resetear el glow para no filtrarlo al resto del canvas
  context.shadowBlur = 0;
}

// ---- Skin: Pastel (esquinas redondeadas) ----
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBlockPastel(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const r = size * 0.25;
  roundRect(context, px, py, s, s, r);
  context.fillStyle = color;
  context.fill();
}

// ---- Skin: Pixel (textura tipo damero) ----
// Cache de tonos claros/oscuros por color: solo hay 7 colores de pieza posibles
// y no cambian en tiempo de ejecución, así que se calculan una única vez.
const shadeCache = new Map();

function shadeColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return [r, g, b];
}

function getShades(color) {
  let shades = shadeCache.get(color);
  if (!shades) {
    shades = {
      light: shadeColor(color, 40),
      dark: shadeColor(color, -40),
    };
    shadeCache.set(color, shades);
  }
  return shades;
}

function drawBlockPixel(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const { light: [lr, lg, lb], dark: [dr, dg, db] } = getShades(color);
  const cell = 3;
  for (let ry = 0; ry * cell < s; ry++) {
    for (let cx = 0; cx * cell < s; cx++) {
      const isLight = (ry + cx) % 2 === 0;
      const [r, g, b] = isLight ? [lr, lg, lb] : [dr, dg, db];
      context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
      const w = Math.min(cell, s - cx * cell);
      const h = Math.min(cell, s - ry * cell);
      context.fillRect(px + cx * cell, py + ry * cell, w, h);
    }
  }
}

function drawGrid() {
  ctx.strokeStyle = themeVar('--grid-line');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  drawPowerups();

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece: siempre por encima de los power-ups para que nunca quede tapada
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawPowerups() {
  const now = performance.now();
  for (const p of powerups) {
    const def = POWERUPS[p.key];
    const cx = (p.x + 0.5) * BLOCK;
    const cy = (p.y + 0.5) * BLOCK;
    if (p.state === 'falling') {
      def.drawIcon(ctx, cx, cy, BLOCK * 0.4, now);
    } else if (p.state === 'blast') {
      drawBlast(ctx, cx, cy, p.t);
    }
  }
}

function drawBombIcon(ctx, cx, cy, r, now) {
  const pulse = 1 + Math.sin(now / 250) * 0.06;

  // halo pulsante
  const haloR = r * 1.8 * pulse;
  const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, haloR);
  halo.addColorStop(0, 'rgba(229, 115, 115, 0.35)');
  halo.addColorStop(1, 'rgba(229, 115, 115, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // cuerpo
  const bodyR = r * pulse;
  const grad = ctx.createRadialGradient(cx - bodyR * 0.3, cy - bodyR * 0.3, bodyR * 0.1, cx, cy, bodyR);
  grad.addColorStop(0, '#4a4a55');
  grad.addColorStop(1, '#15151c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.fill();

  // brillo especular
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(cx - bodyR * 0.35, cy - bodyR * 0.35, bodyR * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // mecha
  const fx = cx + bodyR * 0.35;
  const fy = cy - bodyR * 1.35;
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = Math.max(1.5, r * 0.15);
  ctx.beginPath();
  ctx.moveTo(cx + bodyR * 0.2, cy - bodyR * 0.75);
  ctx.quadraticCurveTo(fx + bodyR * 0.3, fy + bodyR * 0.4, fx, fy);
  ctx.stroke();

  // chispa parpadeante
  const sparkAlpha = 0.5 + Math.sin(now / 90) * 0.5;
  const sparkR = r * (0.18 + Math.sin(now / 90) * 0.06);
  ctx.globalAlpha = sparkAlpha;
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.arc(fx, fy, sparkR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBlast(ctx, cx, cy, t) {
  const progress = Math.min(1, t / BLAST_DURATION);
  const maxR = BLOCK * 1.8;
  const minR = BLOCK * 0.4;

  if (progress < 0.3) {
    const flashAlpha = 1 - progress / 0.3;
    ctx.globalAlpha = flashAlpha * 0.8;
    ctx.fillStyle = '#fff8e1';
    ctx.beginPath();
    ctx.arc(cx, cy, BLOCK * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  [0, 0.15].forEach(delay => {
    const p = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
    if (p <= 0) return;
    const r = minR + (maxR - minR) * (1 - Math.pow(1 - p, 2));
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.strokeStyle = '#ff8a65';
    ctx.lineWidth = Math.max(1, BLOCK * 0.12 * (1 - p));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) { animId = null; return; }
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  updatePowerups(dt);
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  powerups = [];
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

function boardCoordsFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  return { x: px / BLOCK, y: py / BLOCK };
}

function powerupAt(bx, by) {
  for (const p of powerups) {
    if (p.state !== 'falling') continue;
    const dx = bx - (p.x + 0.5);
    const dy = by - (p.y + 0.5);
    if (Math.sqrt(dx * dx + dy * dy) < 0.6) return p;
  }
  return null;
}

canvas.addEventListener('pointerdown', e => {
  if (paused || gameOver) return;
  const { x, y } = boardCoordsFromEvent(e);
  const p = powerupAt(x, y);
  if (p) POWERUPS[p.key].onActivate(p);
});

canvas.addEventListener('pointermove', e => {
  if (paused || gameOver) { canvas.style.cursor = 'default'; return; }
  const { x, y } = boardCoordsFromEvent(e);
  canvas.style.cursor = powerupAt(x, y) ? 'pointer' : 'default';
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
if (skinSelect) skinSelect.addEventListener('change', e => applySkin(e.target.value));

applyTheme(localStorage.getItem('theme') === 'light');
applySkin(localStorage.getItem('tetris-skin') || 'retro');
init();
