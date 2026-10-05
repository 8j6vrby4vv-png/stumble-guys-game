const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = {
  level: document.getElementById('levelValue'),
  coins: document.getElementById('coinsValue'),
  wins: document.getElementById('winsValue'),
};

const menuPanel = document.getElementById('menuPanel');
const resultPanel = document.getElementById('resultPanel');
const resultTitle = document.getElementById('resultTitle');
const resultText = document.getElementById('resultText');
const mapButtons = [...document.querySelectorAll('.map-btn')];
const skinButtons = [...document.querySelectorAll('.skin-btn')];
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');

const config = {
  roads: {
    sky: { name: 'Sky Sprint', theme: '#5cb6ff', finishZ: 2400 },
    bridge: { name: 'Bridge Rush', theme: '#ffb75e', finishZ: 2550 },
    ice: { name: 'Ice Drop', theme: '#7ef5dd', finishZ: 2700 },
  },
  skins: {
    blue: '#56c3ff',
    pink: '#ff7ac6',
    green: '#78ff7a',
    gold: '#ffd166',
  },
};

const state = {
  mode: 'menu',
  currentMap: 'sky',
  skin: 'blue',
  time: 0,
  lastTime: 0,
  lastFrame: performance.now(),
  coins: 0,
  wins: 0,
  level: 1,
};

const input = {
  left: false,
  right: false,
  jump: false,
  slide: false,
};

let world = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function setActiveButton(list, activeValue, attr) {
  list.forEach((node) => {
    const active = node.dataset[attr] === activeValue;
    node.classList.toggle('active', active);
  });
}

function updateHud() {
  hud.level.textContent = String(state.level);
  hud.coins.textContent = String(state.coins);
  hud.wins.textContent = String(state.wins);
}

function createMapData(mapKey) {
  const cfg = config.roads[mapKey];
  const obstacles = [];
  const pickups = [];
  const bots = [];

  const lanePositions = [-2.3, 0, 2.3];

  for (let i = 0; i < 48; i++) {
    const z = 180 + i * 120;
    const lane = lanePositions[Math.floor(Math.random() * lanePositions.length)];
    const kindRoll = Math.random();

    if (kindRoll < 0.32) {
      obstacles.push({ z, x: lane, kind: 'low', width: 1.3, height: 0.7, depth: 1.5, color: '#ffb13b' });
    } else if (kindRoll < 0.6) {
      obstacles.push({ z, x: lane, kind: 'high', width: 1.3, height: 2.1, depth: 1.5, color: '#ff5b5b' });
    } else {
      obstacles.push({ z, x: lane, kind: 'wall', width: 1.4, height: 1.5, depth: 1.2, color: '#7f8aa4' });
    }

    if (i % 4 === 0) {
      pickups.push({ z: z + 30, x: lanePositions[(Math.floor(i / 3) + 1) % lanePositions.length], y: 1.3, color: '#ffd166', radius: 0.45 });
    }
  }

  const botCount = 5;
  for (let i = 0; i < botCount; i++) {
    const colors = ['#ff7ac6', '#7af5a8', '#ffc857', '#8aaeff', '#f0f4ff'];
    bots.push({
      id: i,
      x: lanePositions[i % lanePositions.length],
      z: 40,
      vy: 0,
      y: 0,
      color: colors[i],
      slideTimer: 0,
      jumpLock: 0,
      targetLane: lanePositions[(i + 1) % lanePositions.length],
      active: true,
      speed: 12 + i * 0.25,
    });
  }

  return {
    cfg,
    obstacles,
    pickups,
    bots,
    finishZ: cfg.finishZ,
    startZ: 0,
    groundColor: cfg.theme,
    skyTop: '#0a1330',
    skyBottom: '#1b294b',
  };
}

function resetPlayer() {
  return {
    x: 0,
    z: 0,
    y: 0,
    vy: 0,
    jumpPower: 9.8,
    gravity: 24,
    onGround: true,
    slideTimer: 0,
    alive: true,
    hasFinished: false,
    targetX: 0,
    wobble: 0,
    colliding: false,
  };
}

function startGame() {
  state.mode = 'playing';
  menuPanel.classList.add('hidden');
  resultPanel.classList.add('hidden');
  state.time = 0;
  world = {
    mapKey: state.currentMap,
    map: createMapData(state.currentMap),
    player: resetPlayer(),
    cameraZ: 0,
    cameraY: 0,
    coins: 0,
    elapsed: 0,
    finished: false,
  };

  world.map.obstacles.forEach((obs) => {
    obs.hit = false;
  });

  world.map.pickups.forEach((pickup) => {
    pickup.collected = false;
  });

  updateHud();
}

function endRound(win) {
  state.mode = 'menu';
  if (win) {
    state.wins += 1;
    resultTitle.textContent = 'Gewonnen';
    resultText.textContent = `Du hast die Map ${config.roads[state.currentMap].name} geschafft!`;
  } else {
    resultTitle.textContent = 'Verloren';
    resultText.textContent = 'Komm wieder zurück und versuch es erneut.';
  }
  updateHud();
  resultPanel.classList.remove('hidden');
}

function handleInput() {
  if (state.mode !== 'playing' || !world) return;

  const player = world.player;

  if (input.left && !input.right) {
    player.targetX = clamp(player.targetX - 0.12, -3.5, 3.5);
  }

  if (input.right && !input.left) {
    player.targetX = clamp(player.targetX + 0.12, -3.5, 3.5);
  }

  if (input.jump && player.onGround) {
    player.vy = player.jumpPower;
    player.onGround = false;
    input.jump = false;
  }

  if (input.slide && player.onGround) {
    player.slideTimer = 0.7;
    input.slide = false;
  }
}

function updatePlayer(dt) {
  const player = world.player;
  player.x = lerp(player.x, player.targetX, 0.14);

  if (!player.onGround) {
    player.vy -= player.gravity * dt;
  }

  player.y += player.vy * dt;

  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.onGround = true;
  }

  if (player.slideTimer > 0) {
    player.slideTimer = Math.max(0, player.slideTimer - dt);
  }

  if (player.z >= world.map.finishZ) {
    player.hasFinished = true;
    world.finished = true;
    endRound(true);
  }

  player.z += 12.5 * dt;
}

function updateBots(dt) {
  if (!world) return;

  world.map.bots.forEach((bot) => {
    if (!bot.active) return;

    bot.z += bot.speed * dt;
    if (Math.random() < 0.02) {
      bot.targetLane = [-2.3, 0, 2.3][Math.floor(Math.random() * 3)];
    }
    bot.x = lerp(bot.x, bot.targetLane, 0.08);

    if (Math.random() < 0.014 && bot.z < world.map.finishZ - 40) {
      bot.slideTimer = 0.45;
    }

    if (Math.random() < 0.01) {
      bot.jumpLock = 0.7;
    }

    if (bot.jumpLock > 0) {
      bot.jumpLock -= dt;
    }
  });
}

function checkCollisions() {
  if (!world) return;

  const player = world.player;

  world.map.obstacles.forEach((ob) => {
    const nearZ = Math.abs(ob.z - player.z) < 1.8;
    const sameLane = Math.abs(ob.x - player.x) < 1.1;
    if (!nearZ || !sameLane || ob.hit) return;

    if (ob.kind === 'low') {
      const jumpClear = player.y > 1.1;
      if (!jumpClear) {
        ob.hit = true;
        player.z -= 55;
        player.targetX = 0;
      }
    }

    if (ob.kind === 'high') {
      const slideClear = player.slideTimer > 0.05;
      if (!slideClear) {
        ob.hit = true;
        player.z -= 55;
        player.targetX = 0;
      }
    }

    if (ob.kind === 'wall') {
      if (player.y < 1.5) {
        ob.hit = true;
        player.z -= 70;
        player.targetX = 0;
      }
    }
  });

  world.map.pickups.forEach((pickup) => {
    if (pickup.collected) return;
    const nearZ = Math.abs(pickup.z - player.z) < 1.1;
    const sameLane = Math.abs(pickup.x - player.x) < 1.1;
    if (nearZ && sameLane) {
      pickup.collected = true;
      state.coins += 1;
      updateHud();
    }
  });

  world.map.bots.forEach((bot) => {
    const near = Math.abs(bot.z - player.z) < 1.2;
    const sameLane = Math.abs(bot.x - player.x) < 0.9;
    if (near && sameLane) {
      player.z -= 40;
      player.targetX = 0;
    }
  });

  if (player.z < 0) {
    player.z = 0;
  }
}

function update(dt) {
  if (state.mode !== 'playing' || !world) return;

  state.time += dt;
  world.elapsed += dt;
  handleInput();
  updatePlayer(dt);
  updateBots(dt);
  checkCollisions();

  world.cameraZ = lerp(world.cameraZ, world.player.z - 430, 0.07);
  world.cameraY = lerp(world.cameraY, Math.max(0, world.player.y * 0.45), 0.08);

  if (world.player.z > world.map.finishZ && !world.finished) {
    world.finished = true;
    endRound(true);
  }
}

function project(x, y, z) {
  const cameraZ = world.cameraZ;
  const depth = z - cameraZ;
  const perspective = 780 / (depth + 220);
  return {
    x: canvas.width * 0.5 + x * perspective * 1.15,
    y: canvas.height * 0.78 - y * perspective * 1.1,
    scale: perspective,
  };
}

function drawGround() {
  const groundTop = canvas.height * 0.72;
  const horizonY = canvas.height * 0.33;

  const startZ = Math.max(0, world.cameraZ - 120);
  const endZ = world.map.finishZ + 160;

  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  ctx.lineTo(0, groundTop);

  for (let z = startZ; z <= endZ; z += 60) {
    const left = project(-6.8, 0, z).x;
    const right = project(6.8, 0, z).x;
    const y = project(0, 0, z).y;
    ctx.lineTo(left, y);
    ctx.lineTo(right, y);
  }

  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
  grad.addColorStop(0, '#0c1230');
  grad.addColorStop(1, '#0a0d18');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  for (let z = startZ; z <= endZ; z += 70) {
    const p1 = project(-6.5, 0, z);
    const p2 = project(6.5, 0, z);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();

  const finishP = project(0, 0, world.map.finishZ);
  ctx.strokeStyle = '#dffcff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(finishP.x - 170, finishP.y);
  ctx.lineTo(finishP.x + 170, finishP.y);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawPickup(pickup) {
  if (pickup.collected) return;
  const p = project(pickup.x, pickup.y, pickup.z);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 16 * p.scale * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(p.x - 8, p.y);
  ctx.lineTo(p.x + 8, p.y);
  ctx.moveTo(p.x, p.y - 8);
  ctx.lineTo(p.x, p.y + 8);
  ctx.strokeStyle = '#fff2b5';
  ctx.stroke();
}

function drawObstacle(obs) {
  if (!obs || obs.hit) return;
  const base = project(obs.x, 0, obs.z);
  const h = 70 * obs.height * (base.scale * 0.13);
  const w = 90 * obs.width * (base.scale * 0.14);
  const d = 40 * obs.depth * (base.scale * 0.14);

  const x = base.x;
  const y = base.y - h * 0.75;

  ctx.fillStyle = obs.color;
  ctx.fillRect(x - w * 0.5, y, w, h);

  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(x - w * 0.5, y + h * 0.2, w, h * 0.8);

  if (obs.kind === 'high') {
    ctx.fillStyle = '#ffe0a9';
    ctx.fillRect(x - w * 0.5, y - 7, w, 9);
  }
}

function drawBot(bot) {
  const p = project(bot.x, 0, bot.z);
  const bodyW = 40;
  const bodyH = 52;
  ctx.fillStyle = bot.color;
  ctx.fillRect(p.x - bodyW * 0.5, p.y - bodyH, bodyW, bodyH);
  ctx.fillStyle = '#1a1f2f';
  ctx.fillRect(p.x - bodyW * 0.5, p.y - 18, bodyW, 8);
}

function drawPlayer() {
  const player = world.player;
  const p = project(player.x, player.y, player.z);
  const skinColor = config.skins[state.skin];

  const bodyWidth = player.slideTimer > 0 ? 58 : 42;
  const bodyHeight = player.slideTimer > 0 ? 26 : 52;
  const baseY = p.y - bodyHeight;

  ctx.fillStyle = '#111827';
  ctx.fillRect(p.x - bodyWidth * 0.5, baseY + bodyHeight - 8, bodyWidth, 10);

  ctx.fillStyle = skinColor;
  ctx.fillRect(p.x - bodyWidth * 0.5, baseY, bodyWidth, bodyHeight);

  ctx.fillStyle = '#f5f8ff';
  ctx.fillRect(p.x - 7, baseY + 10, 14, 18);

  if (player.slideTimer > 0) {
    ctx.fillStyle = '#7ef5dd';
    ctx.fillRect(p.x - bodyWidth * 0.6, baseY + bodyHeight - 5, bodyWidth * 1.2, 8);
  }
}

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#7ec9ff');
  sky.addColorStop(0.27, '#4b78c9');
  sky.addColorStop(1, '#181f33');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sun = { x: canvas.width * 0.8, y: canvas.height * 0.2, r: 70 };
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, sun.r, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!world) {
    drawSky();
    drawGround();
    return;
  }

  drawSky();
  drawGround();

  world.map.pickups.forEach(drawPickup);
  world.map.obstacles.forEach(drawObstacle);
  world.map.bots.forEach(drawBot);
  drawPlayer();
}

function tick(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastFrame) / 1000 || 0.016);
  state.lastFrame = timestamp;

  if (state.mode === 'playing') {
    update(dt);
  }

  render();
  requestAnimationFrame(tick);
}

mapButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.currentMap = btn.dataset.map;
    setActiveButton(mapButtons, state.currentMap, 'map');
  });
});

skinButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.skin = btn.dataset.skin;
    setActiveButton(skinButtons, state.skin, 'skin');
  });
});

startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') input.left = true;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') input.right = true;
  if (event.key === 'ArrowUp' || event.key === ' ' || event.key.toLowerCase() === 'w') input.jump = true;
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') input.slide = true;
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') input.left = false;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') input.right = false;
  if (event.key === 'ArrowUp' || event.key === ' ' || event.key.toLowerCase() === 'w') input.jump = false;
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') input.slide = false;
});

document.getElementById('leftBtn').addEventListener('pointerdown', () => input.left = true);
document.getElementById('leftBtn').addEventListener('pointerup', () => input.left = false);
document.getElementById('rightBtn').addEventListener('pointerdown', () => input.right = true);
document.getElementById('rightBtn').addEventListener('pointerup', () => input.right = false);
document.getElementById('jumpBtn').addEventListener('pointerdown', () => input.jump = true);
document.getElementById('slideBtn').addEventListener('pointerdown', () => input.slide = true);

updateHud();
setActiveButton(mapButtons, state.currentMap, 'map');
setActiveButton(skinButtons, state.skin, 'skin');
requestAnimationFrame(tick);
