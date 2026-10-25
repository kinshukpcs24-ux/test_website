
"use strict";

const COLS = 10;
const ROWS = 20;
const CELL = 30;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

const $ = (id) => document.getElementById(id);

const COLORS = {
  I: "#43e8ed",
  O: "#ffd166",
  T: "#b38cff",
  S: "#69e58c",
  Z: "#ff6685",
  J: "#668cff",
  L: "#ffab68"
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ]
};

let board;
let current;
let nextType;

let score = 0;
let lines = 0;
let level = 1;
let best = loadBest();

let running = false;
let paused = false;
let gameOver = false;

let dropCounter = 0;
let lastTime = 0;
let animationId = null;

function loadBest() {
  try {
    return Number(localStorage.getItem("blockfall-best")) || 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem("blockfall-best", String(best));
  } catch {
    // The game still works if storage is unavailable.
  }
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () =>
    Array(COLS).fill(null)
  );
}

// A seven-bag generator ensures every set of seven
// pieces contains each tetromino exactly once.
let bag = [];

function randomType() {
  if (bag.length === 0) {
    bag = Object.keys(SHAPES);

    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  return bag.pop();
}

function makePiece(type) {
  const matrix = SHAPES[type].map(row => row.slice());

  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: -getTopOffset(matrix)
  };
}

function getTopOffset(matrix) {
  for (let y = 0; y < matrix.length; y++) {
    if (matrix[y].some(Boolean)) return y;
  }
  return 0;
}

function startGame() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  board = emptyBoard();
  bag = [];

  score = 0;
  lines = 0;
  level = 1;

  running = true;
  paused = false;
  gameOver = false;
  dropCounter = 0;
  lastTime = 0;

  nextType = randomType();
  spawnPiece();

  $("overlay").classList.add("hidden");
  $("pause-btn").disabled = false;
  $("pause-btn").textContent = "Ⅱ   PAUSE";

  updateStats();
  updateStatus();
  draw();

  animationId = requestAnimationFrame(update);
}

function spawnPiece() {
  current = makePiece(nextType);
  nextType = randomType();
  drawNext();

  if (collides(current.matrix, current.x, current.y)) {
    endGame();
  }
}

function collides(matrix, px, py) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;

      const bx = px + x;
      const by = py + y;

      if (bx < 0 || bx >= COLS || by >= ROWS) {
        return true;
      }

      if (by >= 0 && board[by][bx] !== null) {
        return true;
      }
    }
  }

  return false;
}

function move(dx, dy) {
  if (!running || paused || gameOver) return false;

  if (!collides(current.matrix, current.x + dx, current.y + dy)) {
    current.x += dx;
    current.y += dy;
    return true;
  }

  return false;
}

function rotateMatrix(matrix) {
  const height = matrix.length;
  const width = matrix[0].length;

  return Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) =>
      matrix[height - 1 - y][x]
    )
  );
}

function rotatePiece() {
  if (!running || paused || gameOver) return;

  const rotated = rotateMatrix(current.matrix);

  // Simple wall kicks let the piece rotate near edges.
  const kicks = [0, -1, 1, -2, 2];

  for (const offset of kicks) {
    if (!collides(rotated, current.x + offset, current.y)) {
      current.matrix = rotated;
      current.x += offset;
      draw();
      return;
    }
  }
}

function lockPiece() {
  for (let y = 0; y < current.matrix.length; y++) {
    for (let x = 0; x < current.matrix[y].length; x++) {
      if (!current.matrix[y][x]) continue;

      const bx = current.x + x;
      const by = current.y + y;

      if (by < 0) {
        endGame();
        return;
      }

      board[by][bx] = current.type;
    }
  }

  clearLines();

  if (!gameOver) {
    spawnPiece();
  }
}

function clearLines() {
  let cleared = 0;

  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(cell => cell !== null)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }

  if (cleared > 0) {
    const points = [0, 100, 300, 500, 800];

    score += points[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;

    if (score > best) {
      best = score;
      saveBest();
    }

    updateStats();
  }
}

function softDrop() {
  if (!running || paused || gameOver) return;

  if (move(0, 1)) {
    score += 1;
    updateStats();
  } else {
    lockPiece();
  }

  dropCounter = 0;
  draw();
}

function hardDrop() {
  if (!running || paused || gameOver) return;

  let distance = 0;

  while (!collides(current.matrix, current.x, current.y + 1)) {
    current.y++;
    distance++;
  }

  score += distance * 2;
  updateStats();

  lockPiece();
  dropCounter = 0;
  draw();
}

function getDropInterval() {
  return Math.max(80, 800 * Math.pow(0.82, level - 1));
}

function update(time = 0) {
  if (!running || paused || gameOver) {
    animationId = null;
    return;
  }

  const delta = lastTime === 0 ? 0 : Math.min(time - lastTime, 100);
  lastTime = time;
  dropCounter += delta;

  if (dropCounter >= getDropInterval()) {
    if (!move(0, 1)) {
      lockPiece();
    }
    dropCounter = 0;
  }

  draw();

  if (running && !paused && !gameOver) {
    animationId = requestAnimationFrame(update);
  } else {
    animationId = null;
  }
}

function togglePause() {
  if (!running || gameOver) return;

  paused = !paused;

  $("pause-btn").textContent = paused
    ? "▶   RESUME"
    : "Ⅱ   PAUSE";

  if (paused) {
    $("status").textContent = "PAUSED";
    showOverlay("Paused", "Take a breath. Your board is waiting.", "RESUME");
  } else {
    $("overlay").classList.add("hidden");
    updateStatus();
    lastTime = 0;
    dropCounter = 0;

    if (animationId === null) {
      animationId = requestAnimationFrame(update);
    }
  }
}

function endGame() {
  running = false;
  paused = false;
  gameOver = true;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  $("pause-btn").disabled = true;
  $("status").textContent = "GAME OVER";

  showOverlay(
    "Game over",
    `You scored ${score.toLocaleString()}. Ready for another round?`,
    "PLAY AGAIN"
  );

  updateStats();
  draw();
}

function showOverlay(title, message, buttonText) {
  $("overlay-title").textContent = title;
  $("overlay-message").textContent = message;
  $("start-btn").textContent = buttonText;
  $("overlay").classList.remove("hidden");
}

function updateStatus() {
  $("status").textContent = running ? "PLAYING" : "READY";
}

function updateStats() {
  $("score").textContent = String(score).padStart(6, "0");
  $("best").textContent = String(best).padStart(6, "0");
  $("lines").textContent = lines;
  $("level").textContent = level;
}

function drawCell(context, x, y, color, size, ghost = false) {
  const pad = ghost ? 3 : 1.5;

  context.globalAlpha = ghost ? 0.35 : 1;
  context.fillStyle = color;
  context.fillRect(
    x * size + pad,
    y * size + pad,
    size - pad * 2,
    size - pad * 2
  );

  if (!ghost) {
    context.fillStyle = "#ffffff30";
    context.fillRect(
      x * size + pad + 2,
      y * size + pad + 1,
      size - pad * 2 - 4,
      2
    );

    context.fillStyle = "#00000020";
    context.fillRect(
      x * size + pad + 2,
      y * size + size - pad - 3,
      size - pad * 2 - 4,
      2
    );
  }

  context.globalAlpha = 1;
}

function drawMatrix(context, matrix, px, py, type, ghost = false) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && py + y >= 0) {
        drawCell(context, px + x, py + y, COLORS[type], CELL, ghost);
      }
    });
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#080a12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle grid.
  ctx.strokeStyle = "#ffffff0b";
  ctx.lineWidth = 1;

  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(canvas.width, y * CELL + 0.5);
    ctx.stroke();
  }

  if (!board) return;

  // Settled blocks.
  board.forEach((row, y) => {
    row.forEach((type, x) => {
      if (type) drawCell(ctx, x, y, COLORS[type], CELL);
    });
  });

  if (!current || gameOver) return;

  // Ghost piece shows where the active block will land.
  let ghostY = current.y;

  while (!collides(current.matrix, current.x, ghostY + 1)) {
    ghostY++;
  }

  drawMatrix(ctx, current.matrix, current.x, ghostY, current.type, true);
  drawMatrix(ctx, current.matrix, current.x, current.y, current.type);
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

  const matrix = SHAPES[nextType];
  const size = 24;
  const width = matrix[0].length * size;
  const height = matrix.length * size;
  const ox = (nextCanvas.width - width) / 2;
  const oy = (nextCanvas.height - height) / 2;

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;

      nextCtx.fillStyle = COLORS[nextType];
      nextCtx.fillRect(
        ox + x * size + 1,
        oy + y * size + 1,
        size - 2,
        size - 2
      );

      nextCtx.fillStyle = "#ffffff30";
      nextCtx.fillRect(
        ox + x * size + 3,
        oy + y * size + 3,
        size - 6,
        2
      );
    });
  });
}

function performAction(action) {
  if (action === "start") {
    if (paused) {
      togglePause();
    } else {
      startGame();
    }
    return;
  }

  if (action === "pause") {
    togglePause();
    return;
  }

  if (action === "restart") {
    startGame();
    return;
  }

  if (!running || paused || gameOver) return;

  switch (action) {
    case "left":
      move(-1, 0);
      break;
    case "right":
      move(1, 0);
      break;
    case "down":
      softDrop();
      break;
    case "rotate":
      rotatePiece();
      break;
    case "drop":
      hardDrop();
      break;
  }

  draw();
}

document.addEventListener("keydown", event => {
  const keys = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowDown: "down",
    ArrowUp: "rotate",
    " ": "drop",
    p: "pause",
    P: "pause",
    Escape: "pause"
  };

  const action = keys[event.key];
  if (!action) return;

  event.preventDefault();
  performAction(action);
});

$("start-btn").addEventListener("click", () => performAction("start"));
$("pause-btn").addEventListener("click", () => performAction("pause"));
$("restart-btn").addEventListener("click", () => performAction("restart"));

document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    performAction(button.dataset.action);
  });
});

// Initial screen.
board = emptyBoard();
nextType = randomType();
current = null;

updateStats();
draw();
drawNext();
