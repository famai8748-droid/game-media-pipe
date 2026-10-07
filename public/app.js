/**
 * DMI YOGA - Main Game Engine
 * Featuring MediaPipe Pose (33 Landmarks), Joint Angle Evaluation,
 * Solo Mode & Duo Mode (Split Frame), and Pose Calibration Studio.
 */

/* ==========================================================
   1. GLOBAL STATE & DATA
   ========================================================== */
let allPoses = [...INITIAL_POSES];
let activePoseIndex = 0;
let p1PoseIndex = 0; // Duo Mode P1 independent pose index (starts at 0)
let p2PoseIndex = 0; // Duo Mode P2 independent pose index (starts at 0)
let gameMode = 'solo'; // 'solo' or 'duo'
let matchDuration = 60; // 60, 120, or 180 seconds
let timeRemaining = 60;
let timerInterval = null;
let isGameRunning = false;

// Player Scores
let p1Score = 0;
let p2Score = 0;
let p1ConsecutivePass = 0;
let p2ConsecutivePass = 0;

// Camera & Detection State (PoseLandmarker instances live in section 3)
let cameraStream = null;
let isWebcamProcessing = false;

// DOM Elements — Solo Target Banner
const bannerSolo = document.getElementById('banner-solo');
const bannerDuo = document.getElementById('banner-duo');
const timerDisplay = document.getElementById('timer-display');
const timerDisplayDuo = document.getElementById('timer-display-duo');
const targetImg = document.getElementById('target-img');
const targetName = document.getElementById('target-name');
const targetDesc = document.getElementById('target-desc');
const targetTag = document.getElementById('target-tag');

// Duo P1 Target Elements
const targetImgP1 = document.getElementById('target-img-p1');
const targetNameP1 = document.getElementById('target-name-p1');
const targetDescP1 = document.getElementById('target-desc-p1');
const targetTagP1 = document.getElementById('target-tag-p1');
const targetStepP1 = document.getElementById('target-step-p1');

// Duo P2 Target Elements
const targetImgP2 = document.getElementById('target-img-p2');
const targetNameP2 = document.getElementById('target-name-p2');
const targetDescP2 = document.getElementById('target-desc-p2');
const targetTagP2 = document.getElementById('target-tag-p2');
const targetStepP2 = document.getElementById('target-step-p2');

// Unified camera stage elements
const webcamVideo = document.getElementById('webcam-video');
const webcamCanvas = document.getElementById('webcam-canvas');
const webcamCtx = webcamCanvas ? webcamCanvas.getContext('2d') : null;

// Solo HUD
const hudSolo = document.getElementById('hud-solo');
const pSoloScore = document.getElementById('p-solo-score');
const accBarSolo = document.getElementById('acc-bar-solo');
const accValSolo = document.getElementById('acc-val-solo');

// Duo HUDs / Cards
const hudP1 = document.getElementById('hud-p1');
const hudP2 = document.getElementById('hud-p2');
const p1ScoreEl = document.getElementById('p1-score');
const p2ScoreEl = document.getElementById('p2-score');
const accBarP1 = document.getElementById('acc-bar-p1');
const accValP1 = document.getElementById('acc-val-p1');
const accBarP2 = document.getElementById('acc-bar-p2');
const accValP2 = document.getElementById('acc-val-p2');

// Duo zone divider
const duoZoneDivider = document.getElementById('duo-zone-divider');

// Floating bottom pill & HUD docks
const fbPill = document.getElementById('fb-pill');
const fbText = document.getElementById('fb-text');
const bottomHudSolo = document.getElementById('bottom-hud-solo');
const bottomHudDuo = document.getElementById('bottom-hud-duo');


/* ==========================================================
   2. JOINT ANGLES CALCULATION UTILITIES
   ========================================================== */
function getJointAngle(A, B, C) {
  if (!A || !B || !C) return 0;
  const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return Math.round(angle);
}

/**
 * Landmarks are normalized (0-1) on both axes, so we rescale by the source
 * width/height first — otherwise angles get distorted on 16:9 webcams.
 */
function extractPoseAngles(landmarks, width = 1, height = 1) {
  if (!landmarks) return null;
  const lm = landmarks.map(p => (p ? { x: p.x * width, y: p.y * height } : p));
  return {
    leftElbow: getJointAngle(lm[11], lm[13], lm[15]),
    rightElbow: getJointAngle(lm[12], lm[14], lm[16]),
    leftShoulder: getJointAngle(lm[23], lm[11], lm[13]),
    rightShoulder: getJointAngle(lm[24], lm[12], lm[14]),
    leftKnee: getJointAngle(lm[23], lm[25], lm[27]),
    rightKnee: getJointAngle(lm[24], lm[26], lm[28])
  };
}

function calculatePoseAccuracy(currentAngles, targetAngles) {
  if (!currentAngles || !targetAngles) return 0;

  let totalDiff = 0;
  let count = 0;

  const compareKeys = ['leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder'];
  compareKeys.forEach(k => {
    if (targetAngles[k] !== undefined && currentAngles[k] !== undefined) {
      const diff = Math.abs(currentAngles[k] - targetAngles[k]);
      totalDiff += diff;
      count++;
    }
  });

  if (count === 0) return 0;
  const avgDiff = totalDiff / count;
  // If avgDiff <= 15 deg -> 100%, if avgDiff >= 60 deg -> 0%
  const score = Math.max(0, Math.min(100, Math.round(100 - (avgDiff * 1.6))));
  return score;
}

/* ==========================================================
   3. MEDIAPIPE TASKS VISION — MULTI-PERSON POSE LANDMARKER
   ----------------------------------------------------------
   One detector looks at the FULL camera frame and finds up to
   2 people at once. Each person is then assigned to a zone by
   where their torso is on screen. This replaces the old approach
   (two legacy detectors on half-crops), which only ever tracked
   one side reliably.
   ========================================================== */
const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
// Heavier, more accurate model used only for still images in Pose Studio
// (speed doesn't matter there, and it copes noticeably better with drawings).
const POSE_MODEL_HEAVY_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';

const SKELETON_BODY_CONNECTIONS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Arms & hands
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Legs & feet
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]
];

const PLAYER_COLORS = { solo: '#38bdf8', p1: '#ef4444', p2: '#22c55e' };

let visionApi = null;
let visionFileset = null;
let videoLandmarker = null;
let imageLandmarker = null;

async function loadVisionApi() {
  if (!visionApi) {
    visionApi = await import(`${VISION_CDN}/vision_bundle.mjs`);
    visionFileset = await visionApi.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
  }
  return visionApi;
}

async function createLandmarker(runningMode, numPoses, overrides = {}) {
  const { PoseLandmarker } = await loadVisionApi();
  const {
    modelUrl = POSE_MODEL_URL,
    detectionConfidence = 0.5,
    presenceConfidence = 0.5
  } = overrides;
  const buildOptions = (delegate) => ({
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode,
    numPoses,
    minPoseDetectionConfidence: detectionConfidence,
    minPosePresenceConfidence: presenceConfidence,
    minTrackingConfidence: 0.5
  });

  // Safari's WebGL path in MediaPipe can initialise fine but then return
  // no landmarks at all, so go straight to CPU there (fast enough on Macs).
  if (overrides.forceCPU || IS_SAFARI) {
    return PoseLandmarker.createFromOptions(visionFileset, buildOptions('CPU'));
  }
  try {
    return await PoseLandmarker.createFromOptions(visionFileset, buildOptions('GPU'));
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU:', err);
    return PoseLandmarker.createFromOptions(visionFileset, buildOptions('CPU'));
  }
}

const IS_SAFARI = /^((?!chrome|chromium|crios|fxios|android|edg).)*safari/i.test(navigator.userAgent);

async function initDetectors() {
  if (!videoLandmarker) {
    videoLandmarker = await createLandmarker('VIDEO', 2);
  }
}

async function getImageLandmarker() {
  if (!imageLandmarker) {
    // Low thresholds: anime / cartoon bodies rarely reach the 0.5 confidence
    // the model gives real humans, but the landmarks are still usable.
    imageLandmarker = await createLandmarker('IMAGE', 1, {
      modelUrl: POSE_MODEL_HEAVY_URL,
      detectionConfidence: 0.1,
      presenceConfidence: 0.1
    });
  }
  return imageLandmarker;
}

/* ==========================================================
   4. WEBCAM MANAGEMENT & REAL-TIME DETECTION LOOP
   ========================================================== */
async function startWebcam() {
  if (cameraStream) return;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false
    });

    if (webcamVideo) {
      webcamVideo.srcObject = cameraStream;
      await webcamVideo.play();
    }
  } catch (err) {
    console.error('Camera Error:', err);
    alert('Cannot access webcam. Please allow camera permissions in your browser.');
    return;
  }

  try {
    if (fbText) fbText.innerText = 'Loading MediaPipe AI Pose Model...';
    await initDetectors();
    if (fbText) fbText.innerText = 'Match your body to the target pose above';
    isWebcamProcessing = true;
    requestAnimationFrame(detectionLoop);
  } catch (err) {
    console.error('Pose model load error:', err);
    alert('Failed to load AI model. Please check internet connection and refresh.');
  }
}

function stopWebcam() {
  isWebcamProcessing = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

let lastFrameTime = 0;
let frameErrorCount = 0;
let rebuildingDetector = false;
function detectionLoop() {
  if (!isWebcamProcessing) return;

  const now = performance.now();
  // Don't gate on video.currentTime: Safari may not advance it for live
  // camera streams, which would stall detection completely.
  const videoReady = webcamVideo.readyState >= 2 && webcamVideo.videoWidth > 0;

  // Throttle to ~30 FPS
  if (videoLandmarker && videoReady && !rebuildingDetector && now - lastFrameTime > 33) {
    lastFrameTime = now;
    try {
      const result = videoLandmarker.detectForVideo(webcamVideo, now);
      frameErrorCount = 0;
      processPoseResults(result.landmarks || []);
    } catch (e) {
      console.warn('Frame detection skipped:', e);
      // Repeated failures usually mean the GPU path is broken in this
      // browser — rebuild the detector on CPU once.
      if (++frameErrorCount >= 15) rebuildDetectorOnCPU();
    }
  }

  requestAnimationFrame(detectionLoop);
}

async function rebuildDetectorOnCPU() {
  if (rebuildingDetector) return;
  rebuildingDetector = true;
  console.warn('Detection keeps failing — switching pose model to CPU');
  try {
    const old = videoLandmarker;
    videoLandmarker = await createLandmarker('VIDEO', 2, { forceCPU: true });
    if (old && old.close) old.close();
  } catch (err) {
    console.error('CPU fallback failed:', err);
  }
  frameErrorCount = 0;
  rebuildingDetector = false;
}

/* ==========================================================
   5. PLAYER ASSIGNMENT, RENDERING & ACCURACY SCORING
   ========================================================== */
const isVisible = (p, min = 0.3) => p && (p.visibility ?? 1) > min;

/** A real player must show both shoulders — filters out stray hands/arms. */
function isValidPlayer(lm) {
  return isVisible(lm[11], 0.5) && isVisible(lm[12], 0.5);
}

/** Horizontal torso center in raw (un-mirrored) camera coordinates. */
function getTorsoCenterX(lm) {
  const ids = [11, 12, 23, 24].filter(i => isVisible(lm[i]));
  const use = ids.length ? ids : [11, 12];
  return use.reduce((sum, i) => sum + lm[i].x, 0) / use.length;
}

/** Rough body size — the closest/biggest person wins a zone. */
function getPoseSize(lm) {
  const shoulderW = Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y);
  const torsoH = Math.abs((lm[11].y + lm[12].y) / 2 - (lm[23].y + lm[24].y) / 2);
  return shoulderW + torsoH;
}

function pickLargest(poses) {
  return poses.reduce((best, p) => (!best || getPoseSize(p) > getPoseSize(best) ? p : best), null);
}

function processPoseResults(poses) {
  prepareStageCanvas();

  const players = poses.filter(isValidPlayer);
  const w = webcamCanvas.width;
  const h = webcamCanvas.height;

  if (gameMode === 'solo') {
    const solo = pickLargest(players);
    if (solo) drawSkeleton(webcamCtx, solo, PLAYER_COLORS.solo, w, h);
    const target = allPoses[activePoseIndex];
    if (target) handlePlayerScore(solo, target, 'solo');
    return;
  }

  // Duo: the video is displayed mirrored (CSS scaleX(-1)), so the
  // on-screen x is (1 - raw x). Screen-left = P1 (Mario), screen-right = P2 (Luigi).
  const screenX = (lm) => 1 - getTorsoCenterX(lm);
  const p1 = pickLargest(players.filter(lm => screenX(lm) < 0.5));
  const p2 = pickLargest(players.filter(lm => screenX(lm) >= 0.5));

  if (p1) drawSkeleton(webcamCtx, p1, PLAYER_COLORS.p1, w, h);
  if (p2) drawSkeleton(webcamCtx, p2, PLAYER_COLORS.p2, w, h);

  // Independent pose comparison for each player in Duo Mode
  const targetP1 = allPoses[p1PoseIndex];
  const targetP2 = allPoses[p2PoseIndex];

  if (targetP1) handlePlayerScore(p1, targetP1, 'p1');
  if (targetP2) handlePlayerScore(p2, targetP2, 'p2');
}

/** Size the overlay canvas to the video once, then just clear each frame. */
function prepareStageCanvas() {
  const vw = webcamVideo.videoWidth || 1280;
  const vh = webcamVideo.videoHeight || 720;
  if (webcamCanvas.width !== vw || webcamCanvas.height !== vh) {
    webcamCanvas.width = vw;
    webcamCanvas.height = vh;
  }
  webcamCtx.clearRect(0, 0, vw, vh);
}

function drawSkeleton(ctx, lm, color, w, h) {
  if (!lm || lm.length < 33) return;
  const scale = Math.max(1, Math.min(w, h) / 360);

  ctx.save();
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4;

  // 1. Draw Body Bones (Exclude Face lines 0-10)
  ctx.beginPath();
  for (const [a, b] of SKELETON_BODY_CONNECTIONS) {
    if (isVisible(lm[a]) && isVisible(lm[b])) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
  }
  ctx.stroke();

  // 2. Head Circle: Clean single circle enclosing head, no eyes/nose/mouth clutter
  let headX = null;
  let headY = null;
  let headRadius = 24 * scale;

  const nose = lm[0];
  const lEar = lm[7];
  const rEar = lm[8];
  const lShoulder = lm[11];
  const rShoulder = lm[12];

  if (isVisible(nose)) {
    headX = nose.x * w;
    headY = nose.y * h;
  } else if (isVisible(lEar) && isVisible(rEar)) {
    headX = ((lEar.x + rEar.x) / 2) * w;
    headY = ((lEar.y + rEar.y) / 2) * h;
  } else if (isVisible(lShoulder) && isVisible(rShoulder)) {
    headX = ((lShoulder.x + rShoulder.x) / 2) * w;
    headY = ((lShoulder.y + rShoulder.y) / 2) * h - (40 * scale);
  }

  if (headX !== null && headY !== null) {
    // Dynamic radius based on shoulder width or ear distance
    if (isVisible(lShoulder) && isVisible(rShoulder)) {
      const shoulderDist = Math.hypot((rShoulder.x - lShoulder.x) * w, (rShoulder.y - lShoulder.y) * h);
      headRadius = Math.max(18 * scale, shoulderDist * 0.32);
    } else if (isVisible(lEar) && isVisible(rEar)) {
      const earDist = Math.hypot((rEar.x - lEar.x) * w, (rEar.y - lEar.y) * h);
      headRadius = Math.max(18 * scale, earDist * 0.85);
    }

    // Connect head circle to neck / shoulders
    if (isVisible(lShoulder) && isVisible(rShoulder)) {
      const neckX = ((lShoulder.x + rShoulder.x) / 2) * w;
      const neckY = ((lShoulder.y + rShoulder.y) / 2) * h;
      ctx.beginPath();
      ctx.moveTo(headX, headY + headRadius * 0.7);
      ctx.lineTo(neckX, neckY);
      ctx.stroke();
    }

    // Draw Sleek Head Circle
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fill();
    ctx.lineWidth = 3.5 * scale;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // 3. Draw Body Landmark Dots (Only from index 11 downwards: shoulders to feet)
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (let i = 11; i < lm.length; i++) {
    const p = lm[i];
    if (!isVisible(p)) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function handlePlayerScore(landmarks, target, player) {
  if (!isGameRunning) return;

  if (!landmarks) {
    updateMeter(player, 0);
    return;
  }

  const angles = extractPoseAngles(landmarks, webcamVideo.videoWidth, webcamVideo.videoHeight);
  const accuracy = calculatePoseAccuracy(angles, target.angles);
  updateMeter(player, accuracy);

  if (accuracy >= 72) {
    if (player === 'solo' || player === 'p1') {
      p1ConsecutivePass++;
      if (p1ConsecutivePass >= 5) {
        onPoseCompleted(player);
      }
    } else if (player === 'p2') {
      p2ConsecutivePass++;
      if (p2ConsecutivePass >= 5) {
        onPoseCompleted(player);
      }
    }
  } else {
    if (player === 'solo' || player === 'p1') p1ConsecutivePass = Math.max(0, p1ConsecutivePass - 1);
    if (player === 'p2') p2ConsecutivePass = Math.max(0, p2ConsecutivePass - 1);
  }
}

function updateMeter(player, score) {
  if (player === 'solo') {
    if (accBarSolo) accBarSolo.style.width = `${score}%`;
    if (accValSolo) accValSolo.innerText = `${score}%`;
    if (fbText) {
      fbText.innerHTML = score >= 72
        ? `<span style="color: #22c55e;">🔥 PERFECT! HOLD IT!</span>`
        : `Match the target pose!`;
    }
  } else if (player === 'p1') {
    if (accBarP1) accBarP1.style.width = `${score}%`;
    if (accValP1) accValP1.innerText = `${score}%`;
  } else if (player === 'p2') {
    if (accBarP2) accBarP2.style.width = `${score}%`;
    if (accValP2) accValP2.innerText = `${score}%`;
  }
}

/* ==========================================================
   6. SCORING & INDEPENDENT POSE ADVANCEMENT
   ========================================================== */
function onPoseCompleted(player) {
  SoundFX.playCoin();

  if (player === 'solo') {
    p1ConsecutivePass = 0;
    p1Score += 100;
    if (pSoloScore) pSoloScore.innerText = p1Score;
    triggerCoinFx('solo');

    // Solo advances active pose
    activePoseIndex = (activePoseIndex + 1) % allPoses.length;
    renderTargetPose();
  } else if (player === 'p1') {
    p1ConsecutivePass = 0;
    p1Score += 100;
    if (p1ScoreEl) p1ScoreEl.innerText = p1Score;
    triggerCoinFx('p1');

    // Player 1 advances independently
    p1PoseIndex = (p1PoseIndex + 1) % allPoses.length;
    renderP1TargetPose();
  } else if (player === 'p2') {
    p2ConsecutivePass = 0;
    p2Score += 100;
    if (p2ScoreEl) p2ScoreEl.innerText = p2Score;
    triggerCoinFx('p2');

    // Player 2 advances independently
    p2PoseIndex = (p2PoseIndex + 1) % allPoses.length;
    renderP2TargetPose();
  }
}

function renderTargetPose() {
  if (gameMode === 'solo') {
    const current = allPoses[activePoseIndex];
    if (!current) return;

    if (targetImg) targetImg.src = current.image;
    if (targetName) targetName.innerText = current.name;
    if (targetDesc) targetDesc.innerText = current.desc;

    if (targetTag) {
      targetTag.className = `category-tag tag-${current.category || 'yoga'}`;
      targetTag.innerText = current.category ? current.category.toUpperCase() : 'YOGA';
    }
  } else {
    renderP1TargetPose();
    renderP2TargetPose();
  }
}

function renderP1TargetPose() {
  const current = allPoses[p1PoseIndex];
  if (!current) return;

  if (targetImgP1) targetImgP1.src = current.image;
  if (targetNameP1) targetNameP1.innerText = current.name;
  if (targetDescP1) targetDescP1.innerText = current.desc;
  if (targetStepP1) targetStepP1.innerText = `POSE #${p1PoseIndex + 1}`;

  if (targetTagP1) {
    targetTagP1.className = `category-tag tag-${current.category || 'yoga'}`;
    targetTagP1.innerText = current.category ? current.category.toUpperCase() : 'YOGA';
  }
}

function renderP2TargetPose() {
  const current = allPoses[p2PoseIndex];
  if (!current) return;

  if (targetImgP2) targetImgP2.src = current.image;
  if (targetNameP2) targetNameP2.innerText = current.name;
  if (targetDescP2) targetDescP2.innerText = current.desc;
  if (targetStepP2) targetStepP2.innerText = `POSE #${p2PoseIndex + 1}`;

  if (targetTagP2) {
    targetTagP2.className = `category-tag tag-${current.category || 'yoga'}`;
    targetTagP2.innerText = current.category ? current.category.toUpperCase() : 'YOGA';
  }
}

function triggerCoinFx(player) {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: {
      x: player === 'p1' ? 0.3 : player === 'p2' ? 0.7 : 0.5,
      y: 0.6
    }
  });
}

/* ==========================================================
   7. GAMEPLAY LIFECYCLE: START, TIMER & GAME OVER
   ========================================================== */
/* ==========================================================
   7. ANIME CHARACTER SELECT & NAME ENTRY SYSTEM (DUO MODE)
   ========================================================== */
let p1SelectedChar = (typeof ANIME_CHARACTERS !== 'undefined' && ANIME_CHARACTERS[0]) ? ANIME_CHARACTERS[0] : null; // Goku
let p2SelectedChar = (typeof ANIME_CHARACTERS !== 'undefined' && ANIME_CHARACTERS[1]) ? ANIME_CHARACTERS[1] : null; // Naruto
let p1PlayerName = 'Player 1';
let p2PlayerName = 'Player 2';
let p1IsLocked = false;
let p2IsLocked = false;
let activeSelectPlayer = 'p1'; // 'p1' or 'p2'

function openCharSelectModal() {
  closeStartMenuModal();
  const modal = document.getElementById('char-select-modal');
  if (!modal) return;

  p1IsLocked = false;
  p2IsLocked = false;
  activeSelectPlayer = 'p1';

  // Read current input values
  const p1In = document.getElementById('p1-name-input');
  const p2In = document.getElementById('p2-name-input');
  if (p1In && !p1In.value) p1In.value = p1PlayerName || 'Player 1';
  if (p2In && !p2In.value) p2In.value = p2PlayerName || 'Player 2';

  updateFighterPreview('p1');
  updateFighterPreview('p2');
  renderArcadeRosterGrid();
  updateTurnBarUI();
  updateLockStatusUI();

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  SoundFX.playOneUp();
}

function closeCharSelectModal() {
  const modal = document.getElementById('char-select-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function setActiveSelectPlayer(player) {
  activeSelectPlayer = player;
  SoundFX.playCursorMove();
  updateTurnBarUI();

  const promptText = document.getElementById('select-prompt-text');
  if (promptText) {
    promptText.innerText = player === 'p1'
      ? '👉 SELECTING FOR: PLAYER 1 (Choose your anime champion and enter your name)'
      : '👉 SELECTING FOR: PLAYER 2 (Choose your anime champion and enter your name)';
  }
}

function updateTurnBarUI() {
  const pill1 = document.getElementById('pill-select-p1');
  const pill2 = document.getElementById('pill-select-p2');
  const panel1 = document.getElementById('p1-fighter-panel');
  const panel2 = document.getElementById('p2-fighter-panel');

  if (pill1) pill1.classList.toggle('active-turn', activeSelectPlayer === 'p1');
  if (pill2) pill2.classList.toggle('active-turn', activeSelectPlayer === 'p2');
  if (panel1) panel1.classList.toggle('active-selection', activeSelectPlayer === 'p1');
  if (panel2) panel2.classList.toggle('active-selection', activeSelectPlayer === 'p2');
}

function updateFighterPreview(player) {
  const char = player === 'p1' ? p1SelectedChar : p2SelectedChar;
  if (!char) return;

  const prefix = player;
  const portrait = document.getElementById(`${prefix}-portrait-img`);
  const animeTag = document.getElementById(`${prefix}-anime-tag`);
  const nameDisp = document.getElementById(`${prefix}-name-display`);
  const thaiDisp = document.getElementById(`${prefix}-thai-display`);
  const quoteDisp = document.getElementById(`${prefix}-quote-display`);

  if (portrait) portrait.src = char.image;
  if (animeTag) animeTag.innerText = char.anime;
  if (nameDisp) nameDisp.innerText = char.name;
  if (thaiDisp) thaiDisp.innerText = char.subtitle || char.name;
  if (quoteDisp) quoteDisp.innerText = `"${char.quote}"`;

  // Center stats preview reflects currently inspected character
  const statsName = document.getElementById('stats-char-name');
  const powFill = document.getElementById('stat-power-fill');
  const spdFill = document.getElementById('stat-speed-fill');
  const nrgFill = document.getElementById('stat-energy-fill');

  if (statsName) statsName.innerText = `${char.name} - STATS`;
  if (powFill) powFill.style.width = `${char.stats ? char.stats.power : 90}%`;
  if (spdFill) spdFill.style.width = `${char.stats ? char.stats.speed : 90}%`;
  if (nrgFill) nrgFill.style.width = `${char.stats ? char.stats.energy : 90}%`;
}

function renderArcadeRosterGrid() {
  const grid = document.getElementById('arcade-roster-grid');
  if (!grid || typeof ANIME_CHARACTERS === 'undefined') return;
  grid.innerHTML = '';

  // Render 12 Anime Champion Tiles
  ANIME_CHARACTERS.forEach(char => {
    const tile = document.createElement('div');
    tile.className = 'roster-char-tile';
    tile.title = `${char.name} (${char.anime})`;

    const isP1 = p1SelectedChar && p1SelectedChar.id === char.id;
    const isP2 = p2SelectedChar && p2SelectedChar.id === char.id;

    if (isP1 && isP2) tile.classList.add('selected-both');
    else if (isP1) tile.classList.add('selected-p1');
    else if (isP2) tile.classList.add('selected-p2');

    tile.innerHTML = `
      <img src="${char.image}" alt="${char.name}" loading="lazy">
      ${isP1 ? '<div class="tile-cursor-badge cursor-p1">1P</div>' : ''}
      ${isP2 ? '<div class="tile-cursor-badge cursor-p2">2P</div>' : ''}
    `;

    tile.onclick = () => onCharacterTileClicked(char);
    tile.onmouseenter = () => {
      const statsName = document.getElementById('stats-char-name');
      const powFill = document.getElementById('stat-power-fill');
      const spdFill = document.getElementById('stat-speed-fill');
      const nrgFill = document.getElementById('stat-energy-fill');
      if (statsName) statsName.innerText = `${char.name} - STATS`;
      if (powFill) powFill.style.width = `${char.stats ? char.stats.power : 90}%`;
      if (spdFill) spdFill.style.width = `${char.stats ? char.stats.speed : 90}%`;
      if (nrgFill) nrgFill.style.width = `${char.stats ? char.stats.energy : 90}%`;
    };

    grid.appendChild(tile);
  });
}

function onCharacterTileClicked(char) {
  SoundFX.playCursorMove();

  if (activeSelectPlayer === 'p1') {
    p1SelectedChar = char;
    p1IsLocked = false; // Unlock if player switches character
    updateFighterPreview('p1');
  } else {
    p2SelectedChar = char;
    p2IsLocked = false; // Unlock if player switches character
    updateFighterPreview('p2');
  }

  renderArcadeRosterGrid();
  updateLockStatusUI();
}

function randomSelectFighter(player) {
  if (typeof ANIME_CHARACTERS === 'undefined' || ANIME_CHARACTERS.length === 0) return;
  SoundFX.playCursorMove();
  const randChar = ANIME_CHARACTERS[Math.floor(Math.random() * ANIME_CHARACTERS.length)];
  const target = player || activeSelectPlayer;
  if (target === 'p1') {
    p1SelectedChar = randChar;
    p1IsLocked = false;
    updateFighterPreview('p1');
  } else {
    p2SelectedChar = randChar;
    p2IsLocked = false;
    updateFighterPreview('p2');
  }
  renderArcadeRosterGrid();
  updateLockStatusUI();
}

function toggleLockIn(player) {
  SoundFX.playCharacterSelect();

  if (player === 'p1') {
    const input = document.getElementById('p1-name-input');
    p1PlayerName = (input && input.value.trim()) ? input.value.trim() : (p1SelectedChar ? p1SelectedChar.name : 'Player 1');
    p1IsLocked = !p1IsLocked;

    // If P1 locked and P2 not yet locked, auto-switch to P2
    if (p1IsLocked && !p2IsLocked) {
      setActiveSelectPlayer('p2');
    }
  } else {
    const input = document.getElementById('p2-name-input');
    p2PlayerName = (input && input.value.trim()) ? input.value.trim() : (p2SelectedChar ? p2SelectedChar.name : 'Player 2');
    p2IsLocked = !p2IsLocked;
  }

  updateLockStatusUI();
}

function updateLockStatusUI() {
  const btn1 = document.getElementById('btn-lock-p1');
  const ind1 = document.getElementById('p1-lock-indicator');
  const btn2 = document.getElementById('btn-lock-p2');
  const ind2 = document.getElementById('p2-lock-indicator');
  const btnBattle = document.getElementById('btn-start-duo-battle');

  if (btn1) {
    btn1.innerText = p1IsLocked ? '✅ P1 READY! (Click to change)' : '🔴 LOCK IN P1';
    btn1.classList.toggle('locked', p1IsLocked);
  }
  if (ind1) {
    ind1.innerHTML = p1IsLocked
      ? `<span style="color: #4ade80;">🔥 LOCKED IN: <b>${p1PlayerName}</b> (${p1SelectedChar.name})</span>`
      : '⏳ Selecting Fighter...';
  }

  if (btn2) {
    btn2.innerText = p2IsLocked ? '✅ P2 READY! (Click to change)' : '🟢 LOCK IN P2';
    btn2.classList.toggle('locked', p2IsLocked);
  }
  if (ind2) {
    ind2.innerHTML = p2IsLocked
      ? `<span style="color: #4ade80;">🔥 LOCKED IN: <b>${p2PlayerName}</b> (${p2SelectedChar.name})</span>`
      : '⏳ Selecting Fighter...';
  }

  // Both ready enables battle launch button
  const bothReady = p1IsLocked && p2IsLocked;
  if (btnBattle) {
    btnBattle.disabled = !bothReady;
    btnBattle.innerText = bothReady
      ? '⚔️ BOTH PLAYERS READY! START FIGHT! ⚔️'
      : '⏳ Awaiting confirmation from both players...';
  }
}

async function confirmDuoBattle() {
  // Sync latest name inputs
  const p1In = document.getElementById('p1-name-input');
  const p2In = document.getElementById('p2-name-input');
  if (p1In && p1In.value.trim()) p1PlayerName = p1In.value.trim();
  if (p2In && p2In.value.trim()) p2PlayerName = p2In.value.trim();

  // Close Character Select Screen
  closeCharSelectModal();

  // Show Versus Intro Battle Clash Splash
  const vsModal = document.getElementById('versus-intro-modal');
  if (vsModal && p1SelectedChar && p2SelectedChar) {
    const p1Img = document.getElementById('vs-splash-p1-img');
    const p1Nm = document.getElementById('vs-splash-p1-name');
    const p1Ch = document.getElementById('vs-splash-p1-char');

    const p2Img = document.getElementById('vs-splash-p2-img');
    const p2Nm = document.getElementById('vs-splash-p2-name');
    const p2Ch = document.getElementById('vs-splash-p2-char');

    if (p1Img) p1Img.src = p1SelectedChar.image;
    if (p1Nm) p1Nm.innerText = p1PlayerName.toUpperCase();
    if (p1Ch) p1Ch.innerText = `${p1SelectedChar.name} (${p1SelectedChar.title})`;

    if (p2Img) p2Img.src = p2SelectedChar.image;
    if (p2Nm) p2Nm.innerText = p2PlayerName.toUpperCase();
    if (p2Ch) p2Ch.innerText = `${p2SelectedChar.name} (${p2SelectedChar.title})`;

    vsModal.classList.remove('hidden');
    vsModal.style.display = 'flex';
    SoundFX.playVersus();
  }

  // Update in-game Duo banner with chosen anime characters & custom names
  updateInGameDuoFightersUI();

  // After 1.8s VS intro splash, start the webcam and match countdown
  setTimeout(async () => {
    if (vsModal) {
      vsModal.classList.add('hidden');
      vsModal.style.display = 'none';
    }
    await beginDuoMatchGameplay();
  }, 1800);
}

function updateInGameDuoFightersUI() {
  const p1Avatar = document.getElementById('p1-ingame-avatar');
  const p1Label = document.getElementById('p1-ingame-label');
  const p2Avatar = document.getElementById('p2-ingame-avatar');
  const p2Label = document.getElementById('p2-ingame-label');

  if (p1Avatar && p1SelectedChar) p1Avatar.src = p1SelectedChar.image;
  if (p1Label && p1SelectedChar) p1Label.innerText = `🔴 ${p1PlayerName} (${p1SelectedChar.name})`;

  if (p2Avatar && p2SelectedChar) p2Avatar.src = p2SelectedChar.image;
  if (p2Label && p2SelectedChar) p2Label.innerText = `🟢 ${p2PlayerName} (${p2SelectedChar.name})`;

  // Update bottom zone tags in camera stage
  const zoneL = document.querySelector('.zone-tag-left');
  const zoneR = document.querySelector('.zone-tag-right');
  if (zoneL && p1SelectedChar) zoneL.innerText = `🔴 ${p1PlayerName.toUpperCase()} (${p1SelectedChar.name})`;
  if (zoneR && p2SelectedChar) zoneR.innerText = `🟢 ${p2PlayerName.toUpperCase()} (${p2SelectedChar.name})`;
}

/* ==========================================================
   8. GAMEPLAY LIFECYCLE: START, TIMER & GAME OVER
   ========================================================== */
async function startMatch() {
  if (gameMode === 'duo') {
    // Open Anime Character Select Screen for 2-player selection and name entry
    openCharSelectModal();
    return;
  }

  // Solo mode starts directly:
  closeStartMenuModal();
  await startWebcam();
  resetMatchState();
  beginMatchCountdown();
}

async function beginDuoMatchGameplay() {
  await startWebcam();
  resetMatchState();
  beginMatchCountdown();
}

function resetMatchState() {
  // Reset Scores
  p1Score = 0;
  p2Score = 0;
  p1ConsecutivePass = 0;
  p2ConsecutivePass = 0;
  if (pSoloScore) pSoloScore.innerText = '0';
  if (p1ScoreEl) p1ScoreEl.innerText = '0';
  if (p2ScoreEl) p2ScoreEl.innerText = '0';

  // Reset meters
  updateMeter('solo', 0);
  updateMeter('p1', 0);
  updateMeter('p2', 0);

  // Shuffle poses for variety
  allPoses.sort(() => Math.random() - 0.5);

  // Reset pose indices: Solo starts at 0, Duo both P1 & P2 start at 0 (exact same initial pose)
  activePoseIndex = 0;
  p1PoseIndex = 0;
  p2PoseIndex = 0;

  // Update HUD visibility and render target pose
  updateHUDVisibility();
  renderTargetPose();
}

function beginMatchCountdown() {
  // Countdown 3... 2... 1... GO!
  const countdownModal = document.getElementById('countdown-modal');
  const countdownNum = document.getElementById('countdown-num');
  if (!countdownModal || !countdownNum) {
    beginMatchTimer();
    return;
  }

  countdownModal.classList.remove('hidden');
  countdownModal.style.display = 'flex';

  let count = 3;
  countdownNum.innerText = count;
  SoundFX.playCountdownBeep(false);

  const cdInterval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNum.innerText = count;
      SoundFX.playCountdownBeep(false);
    } else if (count === 0) {
      countdownNum.innerText = 'GO!';
      SoundFX.playCountdownBeep(true);
    } else {
      clearInterval(cdInterval);
      countdownModal.classList.add('hidden');
      countdownModal.style.display = 'none';
      beginMatchTimer();
    }
  }, 900);
}

function updateHUDVisibility() {
  if (gameMode === 'solo') {
    if (hudSolo) hudSolo.style.display = 'block';
    if (bannerSolo) bannerSolo.style.display = 'flex';
    if (bannerDuo) bannerDuo.style.display = 'none';
    if (duoZoneDivider) duoZoneDivider.style.display = 'none';
    if (bottomHudSolo) bottomHudSolo.style.display = 'flex';
    if (bottomHudDuo) bottomHudDuo.style.display = 'none';
    if (fbPill) fbPill.style.display = 'none';
  } else {
    if (hudSolo) hudSolo.style.display = 'none';
    if (bannerSolo) bannerSolo.style.display = 'none';
    if (bannerDuo) bannerDuo.style.display = 'flex';
    if (duoZoneDivider) duoZoneDivider.style.display = 'flex';
    if (bottomHudSolo) bottomHudSolo.style.display = 'none';
    if (bottomHudDuo) bottomHudDuo.style.display = 'flex';
    if (fbPill) fbPill.style.display = 'none';
  }
}

function beginMatchTimer() {
  isGameRunning = true;
  timeRemaining = matchDuration;
  updateTimerUI();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerUI();

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      endMatch();
    }
  }, 1000);
}

function updateTimerUI() {
  const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  const s = (timeRemaining % 60).toString().padStart(2, '0');
  const formatted = `${m}:${s}`;
  if (timerDisplay) timerDisplay.innerText = formatted;
  if (timerDisplayDuo) timerDisplayDuo.innerText = formatted;
}

const CHUUNIBYOU_VICTORY_QUOTES = [
  {
    shout: "KONO SHOURI WA ORE NO MONO DA!",
    subtitle: "VICTORY RIGHTFULLY BELONGS TO ME!",
    flavor: "Tremble before the awakening of my supreme yoga spirit! The cosmos itself acknowledges my absolute dominance!"
  },
  {
    shout: "SUBARASHII! KISAMA NO MAKE DA!",
    subtitle: "MAGNIFICENT! KNEEL BEFORE TRUE TRANSCENDENCE!",
    flavor: "Did you truly believe you could challenge a prodigy of my caliber? Absolute defeat is your destiny!"
  },
  {
    shout: "MUGEN NO CHIKARA... UNLEASHED!",
    subtitle: "THE POWER OF INFINITY SURPASSES ALL LIMITS!",
    flavor: "Through heaven and earth, I alone stand undefeated! My pose alignment is nothing short of divine perfection!"
  },
  {
    shout: "OMAE WA MOU SHINDEIRU!",
    subtitle: "YOUR DEFEAT WAS DECIDED FROM THE VERY FIRST POSE!",
    flavor: "My joint angles have transcended the mortal realm! Witness the unrivaled supremacy of the Chosen Champion!"
  },
  {
    shout: "YATTA ZE! DIVINE AWAKENING COMPLETE!",
    subtitle: "WITNESS THE UNSTOPPABLE TRANSCENDENCE OF MY AURA!",
    flavor: "This is not merely 100% power... this is the infinite aura of a legendary anime warrior!"
  }
];

function endMatch() {
  isGameRunning = false;
  try {
    if (SoundFX && typeof SoundFX.playGameOver === 'function') {
      SoundFX.playGameOver();
    }
  } catch (err) {
    console.warn('Audio playGameOver error:', err);
  }

  // Show Game Over Modal
  const modal = document.getElementById('gameover-modal');
  const title = document.getElementById('gameover-title');
  const details = document.getElementById('gameover-details');

  const chuuni = CHUUNIBYOU_VICTORY_QUOTES[Math.floor(Math.random() * CHUUNIBYOU_VICTORY_QUOTES.length)];

  let winner = 'Solo';
  if (gameMode === 'solo') {
    title.innerText = '🏆 STAGE CLEARED!';
    title.style.color = '#ffe600';
    details.innerHTML = `
      <div class="chuunibyou-victory-banner">
        <div class="chuuni-japanese-shout">🌟 "YOKU YATTA! STAGE COMPLETE!"</div>
        <div class="chuuni-eng-subtitle">⚡ THE PATH TO SUPREME ENLIGHTENMENT HAS OPENED!</div>
        <div class="chuuni-flavor-quote">"You scored <b>${p1Score}</b> PTS! Your body has synchronized with the universal energy!"</div>
      </div>
      <div style="font-size: 1.15rem; background: rgba(0,0,0,0.6); padding: 0.6rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.1);">
        🪙 TOTAL SCORE: <b style="color: #ffe600;">${p1Score}</b> PTS | RECORD SAVED!
      </div>
    `;
  } else {
    const p1Char = p1SelectedChar || ANIME_CHARACTERS[0];
    const p2Char = p2SelectedChar || ANIME_CHARACTERS[1];

    if (p1Score > p2Score) {
      winner = p1PlayerName;
      title.innerText = `👑 ${p1PlayerName.toUpperCase()} WINS!`;
      title.style.color = '#ef4444';
      details.innerHTML = `
        <div class="chuunibyou-victory-banner">
          <div class="chuuni-japanese-shout">🔥 "${chuuni.shout}"</div>
          <div class="chuuni-eng-subtitle">⚡ ${chuuni.subtitle}</div>
          <div class="chuuni-flavor-quote">"${chuuni.flavor}"</div>
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 0.85rem; background: rgba(239, 68, 68, 0.12); border: 2px solid #ef4444; border-radius: 1rem; padding: 0.75rem;">
          <img src="${p1Char.image}" style="width: 72px; height: 72px; border-radius: 50%; border: 3px solid #ef4444; object-fit: cover; box-shadow: 0 0 18px rgba(239, 68, 68, 0.8); flex-shrink: 0;">
          <div style="text-align: left;">
            <div style="font-size: 1.25rem; font-weight: 800; color: #fff;">${p1PlayerName} <span style="font-size: 0.85rem; color: #fca5a5;">(${p1Char.name})</span></div>
            <div style="font-size: 0.82rem; color: #ffe600; font-style: italic;">"${p1Char.quote}"</div>
          </div>
        </div>

        <div style="font-size: 1.15rem; background: rgba(0,0,0,0.6); padding: 0.6rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.1);">
          🔴 <b style="color: #f87171;">${p1PlayerName}</b>: <b>${p1Score}</b> PTS  vs  🟢 <b style="color: #4ade80;">${p2PlayerName}</b>: <b>${p2Score}</b> PTS
        </div>
      `;
    } else if (p2Score > p1Score) {
      winner = p2PlayerName;
      title.innerText = `👑 ${p2PlayerName.toUpperCase()} WINS!`;
      title.style.color = '#22c55e';
      details.innerHTML = `
        <div class="chuunibyou-victory-banner">
          <div class="chuuni-japanese-shout">🔥 "${chuuni.shout}"</div>
          <div class="chuuni-eng-subtitle">⚡ ${chuuni.subtitle}</div>
          <div class="chuuni-flavor-quote">"${chuuni.flavor}"</div>
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 0.85rem; background: rgba(34, 197, 94, 0.12); border: 2px solid #22c55e; border-radius: 1rem; padding: 0.75rem;">
          <img src="${p2Char.image}" style="width: 72px; height: 72px; border-radius: 50%; border: 3px solid #22c55e; object-fit: cover; box-shadow: 0 0 18px rgba(34, 197, 94, 0.8); flex-shrink: 0;">
          <div style="text-align: left;">
            <div style="font-size: 1.25rem; font-weight: 800; color: #fff;">${p2PlayerName} <span style="font-size: 0.85rem; color: #86efac;">(${p2Char.name})</span></div>
            <div style="font-size: 0.82rem; color: #ffe600; font-style: italic;">"${p2Char.quote}"</div>
          </div>
        </div>

        <div style="font-size: 1.15rem; background: rgba(0,0,0,0.6); padding: 0.6rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.1);">
          🟢 <b style="color: #4ade80;">${p2PlayerName}</b>: <b>${p2Score}</b> PTS  vs  🔴 <b style="color: #f87171;">${p1PlayerName}</b>: <b>${p1Score}</b> PTS
        </div>
      `;
    } else {
      winner = 'Tie';
      title.innerText = `⚖️ IT'S A DRAW! CLASH OF GODS!`;
      title.style.color = '#facc15';
      details.innerHTML = `
        <div class="chuunibyou-victory-banner">
          <div class="chuuni-japanese-shout">⚡ "MASAKA... KONO CHIKARA WA DOUDOU?!"</div>
          <div class="chuuni-eng-subtitle">🔥 IMPOSSIBLE! TWO LEGENDARY AURAS EQUALLY MATCHED!</div>
          <div class="chuuni-flavor-quote">"Neither warrior yields an inch! A destined rivalry that shakes the heavens!"</div>
        </div>
        <div style="font-size: 1.15rem; background: rgba(0,0,0,0.6); padding: 0.6rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.1); margin-top: 0.75rem;">
          🔴 <b style="color: #f87171;">${p1PlayerName}</b>: <b>${p1Score}</b> PTS  vs  🟢 <b style="color: #4ade80;">${p2PlayerName}</b>: <b>${p2Score}</b> PTS
        </div>
      `;
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  // Confetti behind the card (zIndex 9990, card is 100000)
  try {
    if (typeof confetti === 'function') confetti({ particleCount: 140, spread: 85, zIndex: 9990 });
  } catch (e) {}

  // Save to Backend Database
  saveScoreToBackend(winner);
}

async function saveScoreToBackend(winner) {
  try {
    await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: gameMode,
        player1_name: p1PlayerName,
        player1_score: p1Score,
        player2_name: gameMode === 'duo' ? p2PlayerName : null,
        player2_score: gameMode === 'duo' ? p2Score : null,
        winner: winner,
        duration_sec: matchDuration
      })
    });
  } catch (e) {
    console.warn('Could not save score to backend:', e);
  }
}

/* ==========================================================
   8. MODAL CLOSE & INTERACTION FUNCTIONS
   ========================================================== */
function closeStartMenuModal() {
  const modal = document.getElementById('start-menu-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function closeGameOverModal() {
  const modal = document.getElementById('gameover-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  if (typeof confetti !== 'undefined' && confetti.reset) {
    try { confetti.reset(); } catch (e) {}
  }
}

function onReplayClicked() {
  closeGameOverModal();
  const menu = document.getElementById('start-menu-modal');
  if (menu) {
    menu.classList.remove('hidden');
    menu.style.display = 'flex';
  }
}

function onOverlayClick(event, modalId) {
  // Close if user clicked the dark background outside the card
  if (event.target.id === modalId) {
    if (modalId === 'gameover-modal') closeGameOverModal();
    if (modalId === 'start-menu-modal') closeStartMenuModal();
    if (modalId === 'char-select-modal') closeCharSelectModal();
  }
}

/* ==========================================================
   9. POSE STUDIO (UPLOAD & INSPECT TO BACKEND)
   ========================================================== */
const studioFileInput = document.getElementById('studio-file-input');
const studioDropzone = document.getElementById('studio-dropzone');
const studioImg = document.getElementById('studio-img');
const studioCanvas = document.getElementById('studio-canvas');
const studioCtx = studioCanvas ? studioCanvas.getContext('2d') : null;
const studioStatusBadge = document.getElementById('studio-status-badge');
const studioBtnSave = document.getElementById('studio-btn-save');

let inspectedPoseData = null;

if (studioDropzone) {
  studioDropzone.onclick = () => studioFileInput.click();
  studioDropzone.ondragover = (e) => { e.preventDefault(); studioDropzone.style.borderColor = '#facc15'; };
  studioDropzone.ondragleave = () => { studioDropzone.style.borderColor = '#38bdf8'; };
  studioDropzone.ondrop = (e) => {
    e.preventDefault();
    studioDropzone.style.borderColor = '#38bdf8';
    if (e.dataTransfer.files.length) handleStudioFile(e.dataTransfer.files[0]);
  };
  studioFileInput.onchange = (e) => {
    if (e.target.files.length) handleStudioFile(e.target.files[0]);
  };
}

function handleStudioFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select a JPG or PNG image file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    studioImg.onload = async () => {
      await inspectStudioImage(studioImg, file);
    };
    studioImg.src = e.target.result;
    studioImg.style.display = 'block';
    setStudioStatus('⚡ Scanning joints...', '#f59e0b');
  };
  reader.readAsDataURL(file);
}

function setStudioStatus(text, color) {
  studioStatusBadge.innerText = text;
  studioStatusBadge.style.background = color;
}

/* ---------- Multi-pass detection (helps anime / cartoon art) ---------- */
const MIRROR_PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const KEY_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24];

/**
 * Renders the image onto an offscreen canvas with optional padding, upscaling,
 * colour filter and mirroring. Anime art is often cropped tight to the body and
 * drawn with flat colours, which the detector (trained on photos) struggles with.
 */
function buildDetectionVariant(img, { pad = 0, filter = 'none', mirror = false }) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const up = Math.max(1, 768 / Math.max(iw, ih)); // upscale tiny images
  const dw = Math.round(iw * up);
  const dh = Math.round(ih * up);
  const padX = Math.round(dw * pad);
  const padY = Math.round(dh * pad);

  const c = document.createElement('canvas');
  c.width = dw + padX * 2;
  c.height = dh + padY * 2;
  const ctx = c.getContext('2d');

  // Fill padding with the image's corner colour so it looks like background
  ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.filter = filter;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, padX, padY, dw, dh);

  return { canvas: c, padX, padY, dw, dh, mirror };
}

/** Converts landmarks from variant-canvas space back to original-image space. */
function mapVariantLandmarks(lms, v) {
  const cw = v.canvas.width;
  const ch = v.canvas.height;
  let out = lms.map(p => {
    let x = (p.x * cw - v.padX) / v.dw;
    const y = (p.y * ch - v.padY) / v.dh;
    if (v.mirror) x = 1 - x;
    return { x, y, z: p.z, visibility: p.visibility ?? 1 };
  });
  if (v.mirror) {
    // Mirroring flips which side the model calls left/right — swap them back
    const swapped = out.slice();
    MIRROR_PAIRS.forEach(([a, b]) => { swapped[a] = out[b]; swapped[b] = out[a]; });
    out = swapped;
  }
  return out;
}

function scoreLandmarks(lms) {
  return KEY_JOINTS.reduce((s, i) => s + (lms[i]?.visibility ?? 0), 0) / KEY_JOINTS.length;
}

async function detectPoseRobust(img) {
  const landmarker = await getImageLandmarker();
  const variants = [
    { pad: 0 },
    { pad: 0.25 },
    { pad: 0.25, filter: 'contrast(1.4) saturate(0.6)' },
    { pad: 0.25, mirror: true },
    { pad: 0.4, filter: 'grayscale(1) contrast(1.6)' }
  ];

  let best = null;
  for (const opts of variants) {
    const v = buildDetectionVariant(img, opts);
    const res = landmarker.detect(v.canvas);
    const raw = res.landmarks && res.landmarks[0];
    if (!raw) continue;
    const lms = mapVariantLandmarks(raw, v);
    const score = scoreLandmarks(lms);
    if (!best || score > best.score) best = { lms, score };
    if (score > 0.8) break; // good enough, stop early
  }
  return best;
}

/* ---------- Manual skeleton editor (drag joints) ---------- */
// Joints the user can drag, and the extra points that follow them
const EDITABLE_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const JOINT_FOLLOWERS = {
  0: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  15: [17, 19, 21], 16: [18, 20, 22],
  27: [29, 31], 28: [30, 32]
};
const LEFT_JOINTS = new Set([11, 13, 15, 23, 25, 27]);

let studioLandmarks = null;
let studioDragIdx = -1;

/** Generic standing pose used when the AI can't find anyone (person faces viewer). */
function createTemplateLandmarks() {
  const base = {
    0: [0.5, 0.14],
    11: [0.6, 0.28], 12: [0.4, 0.28],
    13: [0.67, 0.42], 14: [0.33, 0.42],
    15: [0.71, 0.55], 16: [0.29, 0.55],
    23: [0.56, 0.56], 24: [0.44, 0.56],
    25: [0.57, 0.73], 26: [0.43, 0.73],
    27: [0.58, 0.9], 28: [0.42, 0.9]
  };
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.14, visibility: 1 }));
  Object.entries(base).forEach(([i, [x, y]]) => { lm[i] = { x, y, visibility: 1 }; });
  const offsets = {
    1: [0.01, -0.02], 2: [0.02, -0.02], 3: [0.03, -0.02], 4: [-0.01, -0.02], 5: [-0.02, -0.02],
    6: [-0.03, -0.02], 7: [0.05, -0.01], 8: [-0.05, -0.01], 9: [0.015, 0.02], 10: [-0.015, 0.02],
    17: [0.02, 0.04], 19: [0.01, 0.05], 21: [0.0, 0.03],
    18: [-0.02, 0.04], 20: [-0.01, 0.05], 22: [0.0, 0.03],
    29: [-0.01, 0.03], 31: [0.03, 0.04], 30: [0.01, 0.03], 32: [-0.03, 0.04]
  };
  const parent = { 17: 15, 19: 15, 21: 15, 18: 16, 20: 16, 22: 16, 29: 27, 31: 27, 30: 28, 32: 28 };
  Object.entries(offsets).forEach(([i, [dx, dy]]) => {
    const p = lm[parent[i] ?? 0];
    lm[i] = { x: p.x + dx, y: p.y + dy, visibility: 1 };
  });
  return lm;
}

function renderStudioEditor() {
  const w = studioCanvas.width;
  const h = studioCanvas.height;
  studioCtx.clearRect(0, 0, w, h);
  if (!studioLandmarks) return;

  drawSkeleton(studioCtx, studioLandmarks, '#06b6d4', w, h);

  // Drag handles — orange = character's LEFT side, pink = RIGHT side
  const r = Math.max(6, Math.min(w, h) / 55);
  studioCtx.save();
  EDITABLE_JOINTS.forEach(i => {
    const p = studioLandmarks[i];
    studioCtx.beginPath();
    studioCtx.arc(p.x * w, p.y * h, i === studioDragIdx ? r * 1.4 : r, 0, Math.PI * 2);
    studioCtx.fillStyle = i === 0 ? '#facc15' : LEFT_JOINTS.has(i) ? '#f97316' : '#ec4899';
    studioCtx.globalAlpha = (p.visibility ?? 1) < 0.3 ? 0.55 : 1;
    studioCtx.fill();
    studioCtx.lineWidth = r / 3;
    studioCtx.strokeStyle = '#fff';
    studioCtx.stroke();
  });
  studioCtx.restore();
}

function refreshStudioAngles() {
  const angles = extractPoseAngles(studioLandmarks, studioCanvas.width, studioCanvas.height);
  document.getElementById('insp-le').innerText = `${angles.leftElbow}°`;
  document.getElementById('insp-re').innerText = `${angles.rightElbow}°`;
  document.getElementById('insp-ls').innerText = `${angles.leftShoulder}°`;
  document.getElementById('insp-rs').innerText = `${angles.rightShoulder}°`;
  if (inspectedPoseData) inspectedPoseData.angles = angles;
  return angles;
}

function canvasPointFromEvent(e) {
  const rect = studioCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height
  };
}

if (studioCanvas) {
  studioCanvas.addEventListener('pointerdown', (e) => {
    if (!studioLandmarks) return;
    const pt = canvasPointFromEvent(e);
    const rect = studioCanvas.getBoundingClientRect();
    const hitRadius = 22; // CSS pixels
    let bestDist = Infinity;
    studioDragIdx = -1;
    EDITABLE_JOINTS.forEach(i => {
      const p = studioLandmarks[i];
      const d = Math.hypot((p.x - pt.x) * rect.width, (p.y - pt.y) * rect.height);
      if (d < hitRadius && d < bestDist) { bestDist = d; studioDragIdx = i; }
    });
    if (studioDragIdx >= 0) {
      studioCanvas.setPointerCapture(e.pointerId);
      studioCanvas.style.cursor = 'grabbing';
      renderStudioEditor();
    }
  });

  studioCanvas.addEventListener('pointermove', (e) => {
    if (studioDragIdx < 0) return;
    const pt = canvasPointFromEvent(e);
    const x = Math.min(1, Math.max(0, pt.x));
    const y = Math.min(1, Math.max(0, pt.y));
    const joint = studioLandmarks[studioDragIdx];
    const dx = x - joint.x;
    const dy = y - joint.y;
    studioLandmarks[studioDragIdx] = { ...joint, x, y, visibility: 1 };
    (JOINT_FOLLOWERS[studioDragIdx] || []).forEach(f => {
      const p = studioLandmarks[f];
      studioLandmarks[f] = { ...p, x: p.x + dx, y: p.y + dy, visibility: 1 };
    });
    renderStudioEditor();
    refreshStudioAngles();
  });

  const endDrag = () => {
    if (studioDragIdx < 0) return;
    studioDragIdx = -1;
    studioCanvas.style.cursor = '';
    renderStudioEditor();
  };
  studioCanvas.addEventListener('pointerup', endDrag);
  studioCanvas.addEventListener('pointercancel', endDrag);
}

const studioBtnReset = document.getElementById('studio-btn-reset');
if (studioBtnReset) {
  studioBtnReset.onclick = () => {
    if (!studioImg.src) return;
    studioLandmarks = createTemplateLandmarks();
    renderStudioEditor();
    refreshStudioAngles();
  };
}

async function inspectStudioImage(imgElement, rawFile) {
  const w = imgElement.naturalWidth || 640;
  const h = imgElement.naturalHeight || 480;
  studioCanvas.width = w;
  studioCanvas.height = h;
  studioCtx.clearRect(0, 0, w, h);
  studioLandmarks = null;
  inspectedPoseData = { file: rawFile, angles: null };

  let best = null;
  try {
    best = await detectPoseRobust(imgElement);
  } catch (err) {
    console.error('Studio detection error:', err);
  }

  if (best) {
    studioLandmarks = best.lms;
    if (best.score >= 0.5) {
      setStudioStatus('✅ Scan Successful! Drag joints to fine-tune', '#22c55e');
    } else {
      setStudioStatus('⚠️ Low confidence — please drag joints into place', '#f59e0b');
    }
  } else {
    // Not detected (common for chibi / stylised anime): let the user place joints
    studioLandmarks = createTemplateLandmarks();
    setStudioStatus('✋ AI could not find a body — drag joints onto the character', '#f59e0b');
  }

  studioCanvas.classList.add('editable');
  renderStudioEditor();
  refreshStudioAngles();
  studioBtnSave.disabled = false;
  if (studioBtnReset) studioBtnReset.disabled = false;
}

if (studioBtnSave) {
  studioBtnSave.onclick = async () => {
    if (!inspectedPoseData) return;

    const title = document.getElementById('new-pose-title').value.trim() || 'Custom Pose';
    const cat = document.getElementById('new-pose-cat').value;
    const inst = document.getElementById('new-pose-inst').value.trim() || 'Match the target pose guide';

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', cat);
    formData.append('instruction', inst);
    formData.append('angles_json', JSON.stringify(inspectedPoseData.angles));
    formData.append('image', inspectedPoseData.file);

    try {
      const resp = await fetch('/api/poses', {
        method: 'POST',
        body: formData
      });
      const data = await resp.json();

      if (data.success) {
        alert(`🎉 Pose "${title}" saved to database successfully!`);
        // Add to active game pool
        allPoses.push({
          id: data.id,
          name: title,
          category: cat,
          desc: inst,
          image: data.imageUrl,
          angles: inspectedPoseData.angles
        });
        // Switch back to game
        switchAppTab('game');
      }
    } catch (e) {
      alert('Error saving pose: ' + e.message);
    }
  };
}

/* ==========================================================
   10. LOAD CUSTOM POSES FROM BACKEND
   ========================================================== */
async function loadPosesFromBackend() {
  try {
    const res = await fetch('/api/poses');
    const custom = await res.json();
    if (Array.isArray(custom) && custom.length > 0) {
      allPoses = [...INITIAL_POSES, ...custom];
    }
  } catch (e) {
    console.warn('Backend poses fetch error, using built-in library');
  }
  renderTargetPose();
}

/* ==========================================================
   11. UI TABS & EVENT LISTENERS
   ========================================================== */
function switchAppTab(tab) {
  const viewArena = document.getElementById('view-arena');
  const viewStudio = document.getElementById('view-studio');
  const viewLeaderboard = document.getElementById('view-leaderboard');

  // Arena uses display:block via the .arena-fullscreen-container 
  if (viewArena) viewArena.style.display = tab === 'game' ? 'block' : 'none';
  if (viewStudio) viewStudio.classList.toggle('active', tab === 'studio');
  if (viewLeaderboard) viewLeaderboard.classList.toggle('active', tab === 'scores');

  document.getElementById('tab-game').classList.toggle('active', tab === 'game');
  document.getElementById('tab-studio').classList.toggle('active', tab === 'studio');
  document.getElementById('tab-scores').classList.toggle('active', tab === 'scores');

  if (tab === 'scores') loadLeaderboard();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">Loading match records...</td></tr>';
  try {
    const res = await fetch('/api/scores');
    const rows = await res.json();
    tbody.innerHTML = '';
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94a3b8;">No match records yet</td></tr>';
      return;
    }
    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      const p1Name = escapeHtml(r.player1_name || 'Player 1');
      const p2Name = r.player2_name ? escapeHtml(r.player2_name) : 'Player 2';
      const winnerName = escapeHtml(r.winner || '-');
      tr.innerHTML = `
        <td style="font-family: 'KarmaticArcade'; font-size: 0.85rem; padding: 0.75rem;">#${idx + 1}</td>
        <td style="padding: 0.75rem;"><span class="pixel-font">${r.mode.toUpperCase()}</span> (${r.duration_sec}s)</td>
        <td style="padding: 0.75rem;"><b style="color: #f87171;">${p1Name}</b>: <b>${r.player1_score}</b> pts</td>
        <td style="padding: 0.75rem;">${r.player2_score !== null ? `<b style="color: #4ade80;">${p2Name}</b>: <b>${r.player2_score}</b> pts` : '-'}</td>
        <td style="color: #facc15; font-family: 'KarmaticArcade'; font-size: 0.8rem; padding: 0.75rem;">${winnerName}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ef4444;">Failed to load records</td></tr>';
  }
}

// Mode Selection Buttons
document.getElementById('opt-solo').onclick = () => setGameMode('solo');
document.getElementById('opt-duo').onclick = () => setGameMode('duo');

function setGameMode(mode) {
  gameMode = mode;
  const optSolo = document.getElementById('opt-solo');
  const optDuo = document.getElementById('opt-duo');
  if (optSolo) optSolo.classList.toggle('selected', mode === 'solo');
  if (optDuo) optDuo.classList.toggle('selected', mode === 'duo');
  updateHUDVisibility();
  renderTargetPose();
}

// Duration Selection Buttons
function setDuration(sec) {
  matchDuration = sec;
  document.querySelectorAll('.dur-btn').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.sec, 10) === sec);
  });
}
document.querySelectorAll('.dur-btn').forEach(b => {
  b.onclick = () => setDuration(parseInt(b.dataset.sec, 10));
});

// Start & Replay Buttons
document.getElementById('btn-modal-start').onclick = startMatch;

const btnReplayEl = document.getElementById('btn-replay');
if (btnReplayEl) btnReplayEl.onclick = onReplayClicked;

const btnCloseGov = document.getElementById('btn-close-gameover');
if (btnCloseGov) btnCloseGov.onclick = closeGameOverModal;

const btnCloseGovBottom = document.getElementById('btn-close-gameover-bottom');
if (btnCloseGovBottom) btnCloseGovBottom.onclick = closeGameOverModal;

const btnGotoScoresEl = document.getElementById('btn-goto-scores');
if (btnGotoScoresEl) {
  btnGotoScoresEl.onclick = () => {
    switchAppTab('scores');
    closeGameOverModal();
  };
}

document.getElementById('btn-header-start').onclick = () => {
  const menu = document.getElementById('start-menu-modal');
  if (menu) {
    menu.classList.remove('hidden');
    menu.style.display = 'flex';
  }
};

// Global ESC key to close any modal
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeGameOverModal();
    closeStartMenuModal();
    closeCharSelectModal();
  }
});

// Sound Mute Toggle
document.getElementById('btn-sound-toggle').onclick = () => {
  const isMuted = SoundFX.toggleMute();
  document.getElementById('btn-sound-toggle').innerText = isMuted ? '🔇 MUTE' : '🔊 SFX ON';
};

// Initialize
setGameMode('solo');
setDuration(60);
loadPosesFromBackend();
