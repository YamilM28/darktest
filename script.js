// ============================================================
// game-levels.js  —  branch: levels-feature
// Drop this file alongside your existing index.html and replace
// the <script src="game.js"> tag with <script src="game-levels.js">
//
// Changes vs. original:
//   • 4-level progression (ghost count + speed vary per level)
//   • loadLevel(n) resets map/ghosts/timer without a full reload
//   • Win → advances to next level; after level 4 → true win screen
//   • Dark-pattern purchase flow preserved (lives & time purchases)
//   • All original functions kept; additions clearly marked NEW
// ============================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const tileSize = 22;

/* ---------------- MAP TEMPLATE ---------------- */
// Stored as a template so we can reset it each level
const MAP_TEMPLATE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,0,0,1,0,1,1,1,0,1,0,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,1,1,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,0,1,0,1,1,1,0,1,1,1,0,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Deep-copy helper so each level gets a fresh map
function freshMap() {
  return MAP_TEMPLATE.map(row => [...row]);
}

let map = freshMap();

canvas.width  = map[0].length * tileSize;
canvas.height = map.length    * tileSize;

/* ----------------------------------------------------------------
   NEW — LEVEL CONFIG
   Each entry describes one level:
     ghosts   : starting positions (determines ghost count)
     ghostInterval : ms between ghost moves (lower = faster)
     timeLimit: seconds on the clock
---------------------------------------------------------------- */
const LEVEL_CONFIG = [
  {
    // Level 1 — 2 ghosts, normal speed
    ghosts: [
      { x: 17, y: 1  },
      { x: 17, y: 13 },
    ],
    ghostInterval: 400,
    timeLimit: 120,
    label: "Level 1"
  },
  {
    // Level 2 — 3 ghosts, normal speed
    ghosts: [
      { x: 17, y: 1  },
      { x: 17, y: 13 },
      { x: 1,  y: 13 },
    ],
    ghostInterval: 400,
    timeLimit: 100,
    label: "Level 2"
  },
  {
    // Level 3 — 4 ghosts, normal speed
    ghosts: [
      { x: 17, y: 1  },
      { x: 17, y: 13 },
      { x: 1,  y: 13 },
      { x: 9,  y: 7  },
    ],
    ghostInterval: 400,
    timeLimit: 90,
    label: "Level 3"
  },
  {
    // Level 4 — 4 ghosts, FASTER (ghostInterval halved)
    ghosts: [
      { x: 17, y: 1  },
      { x: 17, y: 13 },
      { x: 1,  y: 13 },
      { x: 9,  y: 7  },
    ],
    ghostInterval: 200,   // twice as fast as normal
    timeLimit: 90,
    label: "Level 4 — Speed Run!"
  },
];

/* ---------------- STATE ---------------- */
let gameState    = "menu";
let score        = 0;
let lives        = 3;
let timeLeft     = LEVEL_CONFIG[0].timeLimit;
let currentLevel = 0;   // NEW — 0-indexed into LEVEL_CONFIG
let ghosts       = [];
let ghostMoveInterval = null;   // NEW — handle to the ghost-move timer
let pelletsEatenThisLevel = 0;

const menuScreen    = document.getElementById("menuScreen");
const pauseScreen   = document.getElementById("pauseScreen");
const gameOverScreen = document.getElementById("gameOverScreen");

/* ---------------- PLAYER ---------------- */
let pacman = { x: 1, y: 1, dx: 0, dy: 0 };

/* ---------------- PELLET COUNT (recalculated per level) ---------------- */
let totalPellets = 0;
function countPellets() {
  totalPellets = 0;
  map.forEach(r => r.forEach(c => { if (c === 0) totalPellets++; }));
}
countPellets();

/* ---------------- LEADERBOARD ---------------- */
let leaderboard = [
  { name: "Alex",   score: 120 },
  { name: "Jordan", score: 95  },
  { name: "Sam",    score: 80  },
  { name: "HURRY UP YOU:",    score: 0   }
];

/* ---------------- POPUP ---------------- */
const popup   = document.getElementById("popup");
const title   = document.getElementById("popupTitle");
const text    = document.getElementById("popupText");
const closeBtn = document.getElementById("closePopupBtn");

function openPopup(type) {
  popup.classList.remove("hidden");
  if (type === "speed") {
    title.textContent = "⚡ Speed Boost";
    text.textContent  = "Increases movement speed in-game.";
  }
  if (type === "lives") {
    title.textContent = "❤️ Extra Lives";
    text.textContent  = "Adds extra chances when hit by ghosts.";
  }
}
function closePopup() { popup.classList.add("hidden"); }
closeBtn.addEventListener("click", closePopup);

/* ---------------- TIMER ---------------- */
function updateTimer() {
  const el = document.getElementById("timer");
  el.textContent  = timeLeft;
  el.style.color  = "white";
  if (timeLeft <= 30) el.style.color = "orange";
  if (timeLeft <= 10) el.style.color = "red";

  if (timeLeft <= 0) {
    gameState = "gameover";
    showGameOver();
  }
}

/* ---------------- LEADERBOARD ---------------- */
function updateLeaderboard() {
  const list = document.getElementById("scoresList");
  leaderboard = leaderboard.map(p => ({
    ...p,
    score: p.name === "FALLING BEHIND YOU:"
      ? score
      : p.score + Math.floor(Math.random() * 3)
  }));
  leaderboard.sort((a, b) => b.score - a.score);
  list.innerHTML = "";
  const rankSymbols = ["①", "②", "③", "④"];
  leaderboard.forEach((p, i) => {
    const li = document.createElement("li");
    li.setAttribute("data-rank", rankSymbols[i] || `${i+1}.`);
    if (p.name === "FALLING BEHIND YOU:") {
      li.classList.add("you-row");
    }
    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;
    nameSpan.style.flex = "1";
    nameSpan.style.textAlign = "left";
    nameSpan.style.marginRight = "6px";
    const scoreSpan = document.createElement("span");
    scoreSpan.textContent = String(p.score).padStart(4, "0");
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    list.appendChild(li);
  });
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  document.getElementById("score").textContent = score;
  document.getElementById("lives").textContent = lives;

  // NEW — show current level label if element exists
  const lvlEl = document.getElementById("levelLabel");
  if (lvlEl) lvlEl.textContent = LEVEL_CONFIG[currentLevel].label;
}

/* ---------------- DRAW ---------------- */
function drawMap() {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === 1) {
        ctx.fillStyle = "blue";
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      } else if (map[y][x] === 0) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(x * tileSize + 11, y * tileSize + 11, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman() {
  ctx.fillStyle = "yellow";
  ctx.beginPath();
  ctx.arc(pacman.x * tileSize + 11, pacman.y * tileSize + 11, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawGhosts() {
  ctx.fillStyle = "red";
  ghosts.forEach(g => {
    ctx.fillRect(g.x * tileSize + 4, g.y * tileSize + 4, 14, 14);
  });
}

/* ---------------- GAME LOGIC ---------------- */
function movePacman() {
  let nx = pacman.x + pacman.dx;
  let ny = pacman.y + pacman.dy;
  if (map[ny][nx] !== 1) {
    pacman.x = nx;
    pacman.y = ny;
    if (map[ny][nx] === 0) {
      score++;
      pelletsEatenThisLevel++;
      map[ny][nx] = 2;
    }
  }
}

function bfsNextStep(ghost, target) {
  // Returns the first step a ghost should take toward target using BFS
  const queue = [{ x: ghost.x, y: ghost.y, path: [] }];
  const visited = new Set();
  visited.add(`${ghost.x},${ghost.y}`);

  while (queue.length > 0) {
    const current = queue.shift();

    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];

    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      const key = `${nx},${ny}`;

      if (map[ny]?.[nx] === undefined) continue;  // out of bounds
      if (map[ny][nx] === 1) continue;             // wall
      if (visited.has(key)) continue;              // already seen

      const newPath = [...current.path, { x: nx, y: ny }];

      // Found Pac-Man — return the first step of the path
      if (nx === target.x && ny === target.y) {
        return newPath[0] || { x: ghost.x, y: ghost.y };
      }

      visited.add(key);
      queue.push({ x: nx, y: ny, path: newPath });
    }
  }

  // No path found — stay put
  return { x: ghost.x, y: ghost.y };
}

function moveGhosts() {
  ghosts.forEach(g => {
    // Level 4 ghosts chase perfectly — earlier levels have some randomness
    const chaseChance = currentLevel === 3 ? 1.0   // level 4: always chase
                      : currentLevel === 2 ? 0.80  // level 3: 80% chase
                      : currentLevel === 1 ? 0.60  // level 2: 60% chase
                      : 0.40;                       // level 1: 40% chase

    if (Math.random() < chaseChance) {
      // BFS toward Pac-Man
      const next = bfsNextStep(g, pacman);
      g.x = next.x;
      g.y = next.y;
    } else {
      // Random move as fallback
      const dirs = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
        { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
      ];
      const d = dirs[Math.floor(Math.random() * dirs.length)];
      const nx = g.x + d.dx;
      const ny = g.y + d.dy;
      if (map[ny][nx] !== 1) { g.x = nx; g.y = ny; }
    }
  });
}

function checkCollision() {
  ghosts.forEach(g => {
    if (g.x === pacman.x && g.y === pacman.y) {
      lives--;
      pacman.x = 1; pacman.y = 1;
      if (lives <= 0) {
        gameState = "gameover";
        showGameOver();
      }
    }
  });
}

/* NEW — advance level or trigger true win */
function checkWin() {
  if (pelletsEatenThisLevel < totalPellets) return;   // not done yet

  if (currentLevel < LEVEL_CONFIG.length - 1) {
    // More levels remain — advance
    currentLevel++;
    loadLevel(currentLevel);
  } else {
    // Finished all 4 levels
    gameState = "gameover";
    const finalEl = document.getElementById("finalMessage");
    if (finalEl) finalEl.textContent = "🏆 YOU BEAT ALL 4 LEVELS!";
    showGameOver();
  }
}

/* ----------------------------------------------------------------
   NEW — loadLevel(n)
   Resets map, ghosts, pacman position, timer, and pellet count
   for the given 0-indexed level. Also re-starts the ghost-move
   interval at the correct speed for that level.
---------------------------------------------------------------- */
function loadLevel(n) {
  const cfg = LEVEL_CONFIG[n];
  pelletsEatenThisLevel = 0;

  // Reset map
  map = freshMap();
  countPellets();

  // Reset pacman
  pacman = { x: 1, y: 1, dx: 0, dy: 0 };

  // Reset ghosts — deep copy so positions are independent
  ghosts = cfg.ghosts.map(g => ({ ...g }));

  // Reset timer
  timeLeft = cfg.timeLimit;

  // Restart the ghost movement interval at the new speed
  if (ghostMoveInterval !== null) clearInterval(ghostMoveInterval);
  ghostMoveInterval = setInterval(() => {
    if (gameState === "playing") moveGhosts();
  }, cfg.ghostInterval);

  // Brief on-screen flash of the level name (if element exists)
  const lvlEl = document.getElementById("levelLabel");
  if (lvlEl) {
    lvlEl.textContent = cfg.label;
    lvlEl.style.animation = "none";
    // force reflow then re-animate
    void lvlEl.offsetWidth;
    lvlEl.style.animation = "levelFlash 1.5s ease-out";
  }

  gameState = "playing";
}

/* ----------------------------------------------------------------
   NEW — showGameOver
   Shows game-over screen with the dark-pattern purchase UI.
   Players can buy lives ($0.99) or time (+30s for $1.99) to
   continue instead of starting over.
---------------------------------------------------------------- */
function showGameOver() {
  gameOverScreen.classList.remove("hidden");

  // Inject purchase options into the game-over screen if not already there
  if (!document.getElementById("purchasePanel")) {
    const panel = document.createElement("div");
    panel.id = "purchasePanel";
    panel.style.cssText = `
      margin-top: 12px;
      background: #1a1a2e;
      border: 2px solid #e94560;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
      color: white;
      font-family: monospace;
    `;
    panel.innerHTML = `
      <p style="color:#ffd700;font-size:1.1em;margin:0 0 10px">
        Don't lose your progress on <strong>${LEVEL_CONFIG[currentLevel].label}</strong>!
      </p>
      <button onclick="purchaseLives()" style="
        background:#e94560;color:white;border:none;border-radius:6px;
        padding:10px 18px;margin:4px;cursor:pointer;font-size:0.95em;">
        ❤️ Buy 3 Lives — $0.99
      </button>
      <button onclick="purchaseTime()" style="
        background:#f5a623;color:black;border:none;border-radius:6px;
        padding:10px 18px;margin:4px;cursor:pointer;font-size:0.95em;">
        ⏱ Buy +30s — $1.99
      </button>
      <p style="font-size:0.75em;color:#aaa;margin:8px 0 0">
        Or <a href="#" onclick="restartGame()" style="color:#e94560">start over from Level 1</a>
      </p>
    `;
    gameOverScreen.appendChild(panel);
  }
}

/* NEW — dark pattern purchase handlers */
window.purchaseLives = function () {
  // In a real game this would hit a payment API.
  // For now: simulate purchase, restore lives, and continue.
  lives = 3;
  gameOverScreen.classList.add("hidden");
  document.getElementById("purchasePanel")?.remove();
  loadLevel(currentLevel);   // resume from same level
};

window.purchaseTime = function () {
  timeLeft += 30;
  lives = lives > 0 ? lives : 1;
  gameOverScreen.classList.add("hidden");
  document.getElementById("purchasePanel")?.remove();
  loadLevel(currentLevel);
};

/* ---------------- INPUT ---------------- */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    const adContainer = document.getElementById("promoContainer");
    if (gameState === "playing") {
      gameState = "paused";
      pauseScreen.classList.remove("hidden");
      createAds();
  } else if (gameState === "paused") {
      gameState = "playing";
      pauseScreen.classList.add("hidden");
      adContainer.classList.add("hidden");
      document.querySelectorAll(".promoItem").forEach(el => el.remove());
    }
    return;
  }
  if (gameState !== "playing") return;
  if (e.key === "ArrowUp")    pacman = { ...pacman, dx: 0,  dy: -1 };
  if (e.key === "ArrowDown")  pacman = { ...pacman, dx: 0,  dy:  1 };
  if (e.key === "ArrowLeft")  pacman = { ...pacman, dx: -1, dy:  0 };
  if (e.key === "ArrowRight") pacman = { ...pacman, dx: 1,  dy:  0 };
});

/* ---------------- GAME LOOP (pacman + draw — runs every 160ms) ---- */
function gameLoop() {
  if (gameState !== "playing") return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  movePacman();
  // NOTE: ghosts are moved by their own interval (loadLevel sets it)
  checkCollision();
  checkWin();

  drawMap();
  drawPacman();
  drawGhosts();

  updateHUD();
  updateLeaderboard();
  updateTimer();
}

setInterval(gameLoop, 160);

// Countdown timer — 1 tick per second
setInterval(() => {
  if (gameState === "playing") timeLeft--;
}, 1000);

/* ---------------- MENU / CONTROL FUNCTIONS ---------------- */
function startGame() {
  gameState = "menu";           // loadLevel will set it to "playing"
  menuScreen.classList.add("hidden");
  currentLevel = 0;
  score = 0;
  lives = 3;
  document.getElementById("promoContainer").style.display = "";
  loadLevel(0);                 // NEW — initialize level 1
}

function restartGame() {
  location.reload();
}

window.endGame = function () {
  gameState = "gameover";
  showGameOver();
};

window.resumeGame = function () {
  gameState = "playing";
  pauseScreen.classList.add("hidden");
  document.getElementById("promoContainer").classList.add("hidden");
  document.querySelectorAll(".promoItem").forEach(el => el.remove());
};

function createAds() {
  // Remove any existing ads first
  document.querySelectorAll(".promoItem").forEach(el => el.remove());

  const btn = document.createElement("button");
  btn.id = "hidePromoBtn";
  btn.className = "promoItem";
  btn.onclick = RemoveAds;
  btn.style.cssText = "position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:999999; background:linear-gradient(45deg,#f1c40f,#f39c12); color:black; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold;";
  btn.textContent = "Remove Ads";
  document.body.appendChild(btn);

  const ad1 = new Image();
  ad1.className = "promoItem";
  ad1.src = "promo-left.jpg";
  ad1.style.cssText = "position:fixed; left:0; top:0; width:160px; height:100vh; z-index:99999;";
  document.body.appendChild(ad1);

  const ad2 = new Image();
  ad2.className = "promoItem";
  ad2.src = "promo-right.jpg";
  ad2.style.cssText = "position:fixed; right:0; top:0; width:160px; height:100vh; z-index:99999;";
  document.body.appendChild(ad2);

  const ad3 = new Image();
  ad3.className = "promoItem";
  ad3.src = "promo-bottom.jpg";
  ad3.style.cssText = "position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:60%; max-width:600px; height:120px; z-index:99999;";
  document.body.appendChild(ad3);
}

function RemoveAds() {
  document.querySelectorAll(".promoItem").forEach(el => el.remove());
}
