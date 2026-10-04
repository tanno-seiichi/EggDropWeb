// EggDrop Web版 — iOS版 GameScene.swift (SpriteKit) の移植
// 座標系: シーン 750x1334, 原点は画面中央 / y 上向き (SpriteKit と同じ)
(() => {
  'use strict';

  // 幅は 750 固定。縦画面では高さを画面の縦横比に合わせて伸縮し、黒帯を出さずに全面表示する
  // (iOS版も frame.height 基準で配置しているので、高さが変わっても配置が崩れない)
  const W = 750, H_DEFAULT = 1334, H_MIN = 1000, H_MAX = 1700;
  let H = H_DEFAULT;
  let pendingDH = 0; // ゲーム中に高さが変わった分 (プレーヤー位置の補正用)
  const BASE = (window.EGGDROP_BASE || '') + 'assets/';

  // ---------- 画像 ----------
  const Constants = {
    LifeImages: ['Mihochan0-1', 'Mihochan0-2'],
    Player1Images: ['Mihochan1-1', 'Mihochan1-2'],
    Player1ClearImages: ['Mihochan1-3', 'Mihochan1-4'],
    Player2Images: ['Mihochan2-1', 'Mihochan2-2'],
    Player2ClearImages: ['Mihochan2-3', 'Mihochan2-4'],
    Player3Images: ['Mihochan3-1', 'Mihochan3-2'],
    Player3ClearImages: ['Mihochan3-3', 'Mihochan3-4'],
    EggImages: ['Egg1-1', 'Egg1-2'],
    BugImages: ['Bug1-1', 'Bug1-2'],
    StarFighterImages: ['StarFighter_Blue'],
  };
  const BG = { 1: 'bg1.jpg', 2: 'bg2.jpg', 3: 'bg3.jpg' };

  const images = {};
  function loadImage(name, file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { images[name] = img; resolve(); };
      img.onerror = () => reject(new Error('image load failed: ' + file));
      img.src = BASE + 'img/' + file;
    });
  }

  // ---------- サウンド ----------
  const SOUND = {
    catch: 'se_pikon7.mp3',
    miss: 'explosion3.mp3',
    stageClear: 'VSQSE_0532_sfx_up_1.mp3',
  };
  // BGM も Web Audio で鳴らす。START のタップで AudioContext を一度起こせば、
  // 以降はタップなしで曲を切り替えられる (Safari / iPhone で audioPlayer2 が鳴らない対策)
  const BGM = {
    bgm1: { file: 'VSQ_MUSIC_025.mp3', volume: 0.7 }, // 通常モードの曲
    bgm2: { file: 'VSQ_MUSIC_037.mp3', volume: 0.8 }, // 難しいモードの曲
  };
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = AC ? new AC() : null;
  const master = actx ? actx.createGain() : null;
  if (master) master.connect(actx.destination);
  const buffers = {};
  const bgmNow = { key: null, src: null, wanted: null };
  let muted = false;
  try { muted = localStorage.getItem('eggdrop.muted') === '1'; } catch (e) { /* storage unavailable */ }
  if (master) master.gain.value = muted ? 0 : 1;

  function loadSound(key, file) {
    if (!actx) return;
    fetch(BASE + 'sound/' + file)
      .then(r => r.arrayBuffer())
      .then(b => new Promise((res, rej) => actx.decodeAudioData(b, res, rej)))
      .then(buf => {
        buffers[key] = buf;
        // 読み込み前に再生要求された曲はここで開始
        if (bgmNow.wanted === key && !bgmNow.src) playBgm(key);
      })
      .catch(() => {});
  }
  for (const [key, file] of Object.entries(SOUND)) loadSound(key, file);
  for (const [key, b] of Object.entries(BGM)) loadSound(key, b.file);

  function initAudio() {
    if (!actx) return;
    if (actx.state !== 'running') actx.resume();
    // iOS の古い Safari 向け: タップ中に無音を1回鳴らして音声を有効化
    const s = actx.createBufferSource();
    s.buffer = actx.createBuffer(1, 1, 22050);
    s.connect(master);
    s.start(0);
  }
  function playSfx(key) {
    if (!actx || !buffers[key]) return;
    const src = actx.createBufferSource();
    src.buffer = buffers[key];
    src.connect(master);
    src.start();
  }
  function playBgm(key) {
    stopAllBgm();
    bgmNow.wanted = key;
    if (!actx || !buffers[key]) return; // 読み込み完了時に開始
    const src = actx.createBufferSource();
    src.buffer = buffers[key];
    src.loop = true;
    const g = actx.createGain();
    g.gain.value = BGM[key].volume;
    src.connect(g).connect(master);
    src.start();
    bgmNow.key = key; bgmNow.src = src;
  }
  function stopBgm(key) {
    if (bgmNow.wanted === key) bgmNow.wanted = null;
    if (bgmNow.key === key && bgmNow.src) {
      try { bgmNow.src.stop(); } catch (e) { /* already stopped */ }
      bgmNow.key = null; bgmNow.src = null;
    }
  }
  function stopAllBgm() { stopBgm('bgm1'); stopBgm('bgm2'); }

  // ---------- ハイスコア ----------
  function loadHighScores() {
    try {
      const v = JSON.parse(localStorage.getItem('eggdrop.highScores'));
      if (Array.isArray(v) && v.length) return v;
    } catch (e) { /* ignore */ }
    return [10, 11, 12];
  }
  function saveHighScores(list) {
    try { localStorage.setItem('eggdrop.highScores', JSON.stringify(list.slice(0, 10))); } catch (e) { /* ignore */ }
  }

  // ---------- Canvas ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  function resize() {
    const vw = document.body.clientWidth || window.innerWidth, vh = document.body.clientHeight || window.innerHeight;
    // 縦画面: 画面の縦横比に合わせる / 横画面 (PC): iOS版と同じ 750x1334
    const newH = vh > vw ? Math.round(Math.max(H_MIN, Math.min(H_MAX, W * vh / vw))) : H_DEFAULT;
    pendingDH += newH - H;
    H = newH;
    const s = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * s), ch = Math.floor(H * s);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // シーン座標 → canvas 描画座標
  const sx = x => x + W / 2;
  const sy = y => H / 2 - y;

  // ---------- ゲーム内時間で動く簡易アクションスケジューラ ----------
  let gameTime = 0;
  let timers = [];
  function after(sec, fn) { timers.push({ t: gameTime + sec, fn }); }
  function runTimers() {
    const due = timers.filter(t => t.t <= gameTime);
    if (!due.length) return;
    timers = timers.filter(t => t.t > gameTime);
    due.sort((a, b) => a.t - b.t).forEach(t => t.fn());
  }

  // ---------- 状態 ----------
  const KIND_EGG = 0, KIND_BUG = 1, KIND_FIGHTER = 2;

  let S = null; // ゲーム状態
  let running = false, paused = false;

  const eggSize = W / 10;          // 卵: 幅の 1/10
  const bugSize = W / 12;          // 虫: 幅の 1/12
  const fighterSize = W / 5;       // 戦闘機: 幅の 1/5
  const lifeSize = W / 10;         // ライフ: 幅の 1/10
  const playerSize = W / 5;        // プレーヤー: 幅の 1/5

  function newGame() {
    gameTime = 0;
    pendingDH = 0;
    timers = [];
    const hs = loadHighScores();
    S = {
      life: 3,
      score: 0,
      highScore: hs[0],
      stage: 1,
      stageType: 1,
      audioNum: 1,
      enemyCount: 0,
      bg: 1,
      player: {
        x: 0,
        y: (-H / 2) + H / 20 + playerSize,
        frames: Constants.Player1Images, tpf: 0.2,
      },
      objs: [],
      broken: [],
      stageLabel: null,
      dropInterval: 1.0,
      nextDrop: 1.0,
      over: false,
    };
  }

  // 卵を表示するメソッド
  function moveEgg() {
    let idx = Math.floor(Math.random() * 3);
    if ((S.stageType === 2 || S.stageType === 3) && idx === 2) {
      if (S.enemyCount > 1) idx = 0;
      else S.enemyCount += 1;
    }
    let kind = KIND_EGG, size = eggSize, frames = Constants.EggImages;
    if (S.stageType === 2 && idx === 2) { kind = KIND_BUG; size = bugSize; frames = Constants.BugImages; }
    else if (S.stageType === 3 && idx === 2) { kind = KIND_FIGHTER; size = fighterSize; frames = Constants.StarFighterImages; }

    // 敵の x 方向の位置を生成する (元コードと同じ分布)
    const xPos = (W * 0.9 / (1 + Math.random() * 4)) - W / 2;
    // 曲番号に応じて卵の移動速度を設定する
    const duration = (S.audioNum >= 2 && S.audioNum <= 3) ? 1.5 : 2.0;
    const hit = kind === KIND_EGG ? size : size * 0.5;
    S.objs.push({ kind, x: xPos, y: H / 2, size, hit, frames, born: gameTime, vy: H / duration, dead: false });
  }

  function updateHighScore() {
    if (S.score > S.highScore) S.highScore = S.score;
  }

  function miss() {
    if (S.over) return;
    if (S.life > 0) {
      playSfx('miss');
      S.life -= 1;
    }
    if (S.life <= 0) gameOver();
  }

  function gameOver() {
    S.over = true;
    S.nextDrop = Infinity;
    stopAllBgm();
    const hs = loadHighScores();
    hs.push(S.score);
    hs.sort((a, b) => b - a);
    saveHighScores(hs);
    // START 画面に戻る
    after(0.5, () => showTitle(S.score));
  }

  function setPlayerAnim(frames, tpf) {
    S.player.frames = frames; S.player.tpf = tpf; S.player.animStart = gameTime;
  }

  function onCatchEgg() {
    playSfx('catch');
    S.score += 10;
    updateHighScore();

    const musicChangeFlag = S.score < 400 ? S.score % 200 === 0 : S.score % 400 === 0;
    if (!musicChangeFlag) return;

    S.audioNum = S.audioNum < 4 ? S.audioNum + 1 : 1;

    if (S.audioNum === 1) {
      stopAllBgm();
      after(1.0, () => { if (!S.over) playBgm('bgm1'); });

      // ステージクリア表示
      S.stageLabel = 'STAGE ' + S.stage + ' CLEAR';
      after(3.0, () => { S.stageLabel = null; });
      playSfx('stageClear');

      const clearFrames = S.stageType === 2 ? Constants.Player2ClearImages
        : S.stageType === 3 ? Constants.Player3ClearImages : Constants.Player1ClearImages;
      setPlayerAnim(clearFrames, 0.4);

      // ステージを進める
      S.stage += 1;
      S.stageType = S.stageType < 3 ? S.stageType + 1 : 1;
      if (S.stageType === 1) S.life += 1;

      after(4.0, () => {
        S.bg = S.stageType;
        const f = S.stageType === 2 ? Constants.Player2Images
          : S.stageType === 3 ? Constants.Player3Images : Constants.Player1Images;
        setPlayerAnim(f, 0.2);
      });
    }

    if (S.audioNum === 4) {
      stopAllBgm();
      after(1.0, () => { if (!S.over) playBgm('bgm2'); });
    }

    // 落下を一旦止め、間隔を変えて再開
    S.nextDrop = Infinity;
    const an = S.audioNum;
    after(an === 1 ? 6.0 : 1.5, () => {
      if (S.over) return;
      S.dropInterval = 1.0 / (an + 1);
      S.nextDrop = gameTime + S.dropInterval;
    });
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
  }

  function update(dt) {
    gameTime += dt;
    runTimers();
    if (!S || S.over && !timers.length) return;

    // キーボード移動
    const p = S.player;
    // 画面サイズが変わったら、プレーヤーと下端の距離を保つ
    if (pendingDH) { p.y -= pendingDH / 2; pendingDH = 0; }
    const kdx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const kdy = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    if (kdx || kdy) {
      const spd = 900 * dt;
      p.x += kdx * spd; p.y += kdy * spd;
    }
    p.x = Math.max(-W / 2 + playerSize / 2, Math.min(W / 2 - playerSize / 2, p.x));
    p.y = Math.max(-H / 2 + playerSize / 2, Math.min(H / 2 - playerSize / 2, p.y));

    // 卵の生成
    while (gameTime >= S.nextDrop) {
      moveEgg();
      S.nextDrop += S.dropInterval;
    }

    // 移動と判定
    const bottom = -H / 2;
    for (const o of S.objs) {
      if (o.dead) continue;
      o.y -= o.vy * dt;
      if (!S.over && overlap(p.x, p.y, playerSize, playerSize, o.x, o.y, o.hit, o.hit)) {
        o.dead = true;
        if (o.kind === KIND_EGG) onCatchEgg();
        else { S.enemyCount -= 1; miss(); }
        continue;
      }
      if (o.y <= bottom) {
        o.dead = true;
        if (o.kind === KIND_EGG) {
          S.broken.push({ x: o.x, y: bottom + eggSize, until: gameTime + 1.0 });
          miss();
        } else {
          S.enemyCount -= 1;
        }
      }
    }
    S.objs = S.objs.filter(o => !o.dead);
    S.broken = S.broken.filter(b => b.until > gameTime);
  }

  // ---------- 描画 ----------
  function frameOf(frames, tpf, start) {
    const i = Math.floor((gameTime - (start || 0)) / tpf) % frames.length;
    return images[frames[i]];
  }
  function drawSprite(img, x, y, size) {
    if (!img) return;
    ctx.drawImage(img, sx(x) - size / 2, sy(y) - size / 2, size, size);
  }
  function drawBackground(n) {
    const img = images['bg' + n];
    if (!img) return;
    // 高さを画面に合わせ、中央揃え (SpriteKit と同じ)
    const h = H, w = img.width * H / img.height;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, (W - w) / 2, 0, w, h);
    ctx.imageSmoothingEnabled = false;
  }
  function drawLabel(text, x, y, size, color, align) {
    ctx.font = `bold ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, sx(x), sy(y));
  }

  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!S) return;

    drawBackground(S.bg);

    // 卵・敵
    for (const o of S.objs) drawSprite(frameOf(o.frames, 0.2, o.born), o.x, o.y, o.size);

    // 割れた卵
    for (const b of S.broken) drawSprite(images['EggBroken'], b.x, b.y, eggSize * 1.5);

    // プレーヤー
    drawSprite(frameOf(S.player.frames, S.player.tpf, S.player.animStart), S.player.x, S.player.y, playerSize);

    // ライフ (残機 = life - 1 個表示, 最大 4)
    const shown = Math.max(0, Math.min(4, S.life - 1));
    const lifeImg = frameOf(Constants.LifeImages, 0.2, 0);
    for (let i = 1; i <= shown; i++) drawSprite(lifeImg, -W / 2 + 70 * i, H / 2 - 125, lifeSize);

    // スコア
    const labelY = H / 2 - 68;
    drawLabel('SCORE : ' + S.score, -W / 2 + 35, labelY, 37, '#fff', 'left');
    drawLabel('HIGH-SCORE : ' + S.highScore, W / 2 - 35, labelY, 37, '#fff', 'right');

    // ステージクリア
    if (S.stageLabel) {
      const y = H / 2 - H / 5;
      drawLabel(S.stageLabel, 5, y - 5, 80, '#000', 'center');
      drawLabel(S.stageLabel, 0, y, 80, '#ff00ff', 'center');
    }

    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      drawLabel('PAUSE', 0, 40, 90, '#fff', 'center');
      drawLabel('クリック / タップ / P キーで再開', 0, -40, 34, '#fff', 'center');
    }
  }

  // ---------- ループ ----------
  let last = 0;
  function loop(ts) {
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    if (running && !paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- 入力 ----------
  const keys = { left: false, right: false, up: false, down: false };
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  };
  window.addEventListener('keydown', e => {
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (running) setPaused(!paused); }
    if (e.code === 'KeyM') toggleMute();
    if ((e.code === 'Enter' || e.code === 'Space') && !running && !titleEl.hidden) { e.preventDefault(); startGame(); }
  });
  window.addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.up = keys.down = false; });

  // ドラッグで移動 (元コード: 指の移動量 × 2.2 / 画面幅 375pt ≒ シーン 750 なので 1.1 倍)
  let dragId = null, lastPt = null;
  function toScene(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener('pointerdown', e => {
    if (!running) return;
    if (paused) { setPaused(false); return; }
    dragId = e.pointerId; lastPt = toScene(e);
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== dragId || !S || paused) return;
    const pt = toScene(e);
    S.player.x += (pt.x - lastPt.x) * 1.1;
    S.player.y -= (pt.y - lastPt.y) * 1.1;
    lastPt = pt;
    e.preventDefault();
  });
  const endDrag = e => { if (e.pointerId === dragId) { dragId = null; lastPt = null; } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // バックグラウンド時は一時停止
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused) setPaused(true);
  });

  function setPaused(v) {
    paused = v;
    // AudioContext ごと止めるので、BGM も効果音も止まった位置から再開する
    if (actx) { if (v) actx.suspend(); else actx.resume(); }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 1;
    try { localStorage.setItem('eggdrop.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // ---------- 画面遷移 ----------
  const titleEl = document.getElementById('title');
  const startBtn = document.getElementById('start');
  const lastScoreEl = document.getElementById('lastScore');
  const hiEl = document.getElementById('hi');

  function showTitle(lastScore) {
    running = false; paused = false;
    stopAllBgm();
    titleEl.hidden = false;
    hiEl.textContent = loadHighScores()[0];
    if (lastScore != null) {
      lastScoreEl.textContent = 'SCORE : ' + lastScore;
      lastScoreEl.hidden = false;
    }
    startBtn.focus();
  }

  function startGame() {
    initAudio();
    titleEl.hidden = true;
    newGame();
    running = true; paused = false;
    playBgm('bgm1');
  }
  startBtn.addEventListener('click', startGame);

  // ---------- 読み込み ----------
  const all = new Set();
  Object.values(Constants).forEach(a => a.forEach(n => all.add(n)));
  all.add('EggBroken');
  const loads = [...all].map(n => loadImage(n, n + '.png'));
  for (const [k, f] of Object.entries(BG)) loads.push(loadImage('bg' + k, f));
  Promise.all(loads).then(() => {
    document.getElementById('loading').hidden = true;
    startBtn.disabled = false;
    showTitle(null);
  }).catch(err => {
    document.getElementById('loading').textContent = '読み込みに失敗しました: ' + err.message;
  });

  requestAnimationFrame(loop);
})();
