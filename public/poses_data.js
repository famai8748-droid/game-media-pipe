/**
 * DMI YOGA - Curated Playable Poses & MediaPipe Vector Visualizer
 *
 * Each pose includes:
 * 1. Joint angles for real-time accuracy scoring (MediaPipe Pose).
 * 2. 2D body keypoints for rendering an authentic MediaPipe skeleton diagram
 *    (neon stick-figure with landmark keypoints and neon connection bones).
 * 3. Clear Thai instructions that are easy for players to imitate in front of the camera.
 */

function createMediaPipeSVG(kp, title = '') {
  // Coordinates tuned to fill the viewBox with maximum legibility
  const def = {
    head: [50, 11],
    neck: [50, 19],
    lShoulder: [35, 25],
    rShoulder: [65, 25],
    lElbow: [19, 25],
    rElbow: [81, 25],
    lWrist: [7, 25],
    rWrist: [93, 25],
    lHip: [40, 52],
    rHip: [60, 52],
    lKnee: [38, 68],
    rKnee: [62, 68],
    lAnkle: [37, 84],
    rAnkle: [63, 84]
  };

  const p = { ...def, ...kp };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs>
      <!-- Tech Grid Pattern -->
      <pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(56, 189, 248, 0.12)" stroke-width="0.6"/>
      </pattern>
      <!-- Neon Glow Filter -->
      <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- Deep Tech Blueprint Background -->
    <rect width="100" height="100" fill="#050914" rx="10"/>
    <rect width="100" height="100" fill="url(#grid)" rx="10"/>
    <rect width="96" height="96" x="2" y="2" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" rx="8"/>

    <!-- Corner Target Crosshairs -->
    <path d="M 6 12 L 6 6 L 12 6 M 88 6 L 94 6 L 94 12 M 6 88 L 6 94 L 12 94 M 88 94 L 94 94 L 94 88" fill="none" stroke="#ffe600" stroke-width="1.5"/>

    <!-- Spine & Torso -->
    <polygon points="${p.lShoulder[0]},${p.lShoulder[1]} ${p.rShoulder[0]},${p.rShoulder[1]} ${p.rHip[0]},${p.rHip[1]} ${p.lHip[0]},${p.lHip[1]}" fill="rgba(56, 189, 248, 0.22)" stroke="#38bdf8" stroke-width="2.8" stroke-linejoin="round"/>
    <line x1="${p.neck[0]}" y1="${p.neck[1]}" x2="50" y2="52" stroke="#818cf8" stroke-width="2.4" stroke-dasharray="2,2"/>

    <!-- Head & Face Landmark -->
    <circle cx="${p.head[0]}" cy="${p.head[1]}" r="8" fill="#0b1329" stroke="#38bdf8" stroke-width="2.8"/>
    <circle cx="${p.head[0]}" cy="${p.head[1]}" r="2.8" fill="#fff"/>
    <line x1="${p.head[0]}" y1="${p.head[1] + 8}" x2="${p.neck[0]}" y2="${p.neck[1]}" stroke="#38bdf8" stroke-width="2.8"/>

    <!-- Left Arm (Cyan / Left Side) - Extra Bold Neon -->
    <g filter="url(#neonGlow)">
      <line x1="${p.lShoulder[0]}" y1="${p.lShoulder[1]}" x2="${p.lElbow[0]}" y2="${p.lElbow[1]}" stroke="#00f2fe" stroke-width="4.2" stroke-linecap="round"/>
      <line x1="${p.lElbow[0]}" y1="${p.lElbow[1]}" x2="${p.lWrist[0]}" y2="${p.lWrist[1]}" stroke="#00f2fe" stroke-width="4.2" stroke-linecap="round"/>
    </g>

    <!-- Right Arm (Green / Right Side) - Extra Bold Neon -->
    <g filter="url(#neonGlow)">
      <line x1="${p.rShoulder[0]}" y1="${p.rShoulder[1]}" x2="${p.rElbow[0]}" y2="${p.rElbow[1]}" stroke="#22c55e" stroke-width="4.2" stroke-linecap="round"/>
      <line x1="${p.rElbow[0]}" y1="${p.rElbow[1]}" x2="${p.rWrist[0]}" y2="${p.rWrist[1]}" stroke="#22c55e" stroke-width="4.2" stroke-linecap="round"/>
    </g>

    <!-- Legs & Feet -->
    <line x1="${p.lHip[0]}" y1="${p.lHip[1]}" x2="${p.lKnee[0]}" y2="${p.lKnee[1]}" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round"/>
    <line x1="${p.lKnee[0]}" y1="${p.lKnee[1]}" x2="${p.lAnkle[0]}" y2="${p.lAnkle[1]}" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round"/>
    <line x1="${p.rHip[0]}" y1="${p.rHip[1]}" x2="${p.rKnee[0]}" y2="${p.rKnee[1]}" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round"/>
    <line x1="${p.rKnee[0]}" y1="${p.rKnee[1]}" x2="${p.rAnkle[0]}" y2="${p.rAnkle[1]}" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round"/>

    <!-- Keypoint Joints (White core + Neon ring) -->
    <circle cx="${p.lShoulder[0]}" cy="${p.lShoulder[1]}" r="3.4" fill="#fff" stroke="#00f2fe" stroke-width="1.8"/>
    <circle cx="${p.rShoulder[0]}" cy="${p.rShoulder[1]}" r="3.4" fill="#fff" stroke="#22c55e" stroke-width="1.8"/>

    <!-- Elbow Joints (Target Angle Joint Highlighted in Gold Yellow) -->
    <circle cx="${p.lElbow[0]}" cy="${p.lElbow[1]}" r="4.2" fill="#ffe600" stroke="#000" stroke-width="1.8"/>
    <circle cx="${p.rElbow[0]}" cy="${p.rElbow[1]}" r="4.2" fill="#ffe600" stroke="#000" stroke-width="1.8"/>

    <!-- Wrists / Hands -->
    <circle cx="${p.lWrist[0]}" cy="${p.lWrist[1]}" r="3.6" fill="#fff" stroke="#00f2fe" stroke-width="1.8"/>
    <circle cx="${p.rWrist[0]}" cy="${p.rWrist[1]}" r="3.6" fill="#fff" stroke="#22c55e" stroke-width="1.8"/>

    <!-- Lower Body Keypoints -->
    <circle cx="${p.lHip[0]}" cy="${p.lHip[1]}" r="2.5" fill="#fff" stroke="#38bdf8" stroke-width="1.4"/>
    <circle cx="${p.rHip[0]}" cy="${p.rHip[1]}" r="2.5" fill="#fff" stroke="#38bdf8" stroke-width="1.4"/>
    <circle cx="${p.lKnee[0]}" cy="${p.lKnee[1]}" r="2.8" fill="#fff" stroke="#38bdf8" stroke-width="1.4"/>
    <circle cx="${p.rKnee[0]}" cy="${p.rKnee[1]}" r="2.8" fill="#fff" stroke="#38bdf8" stroke-width="1.4"/>
    <circle cx="${p.lAnkle[0]}" cy="${p.lAnkle[1]}" r="2.8" fill="#fff" stroke="#38bdf8" stroke-width="1.4"/>
    <circle cx="${p.rAnkle[0]}" cy="${p.rAnkle[1]}" r="2.8" fill="#fff" stroke="#38bdf8" stroke-width="1.4"/>

    <!-- Tech Badge -->
    <rect x="14" y="88" width="72" height="9" fill="#000" rx="3.5" stroke="#ffe600" stroke-width="1"/>
    <text x="50" y="94.5" font-family="'Outfit', sans-serif" font-size="5" font-weight="bold" fill="#ffe600" text-anchor="middle" letter-spacing="0.6">MEDIAPIPE POSE</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ==========================================================
// 24 CURATED, ACCESSIBLE POSES (Easy to imitate & detect)
// ==========================================================
const POSES_RAW = [
  // --- Category: Action & Victory ---
  {
    id: 'pose_v_arms',
    name: 'Victory V-Arms',
    category: 'yoga',
    desc: 'Stand straight and raise both arms upward in a 45-degree victory V shape!',
    angles: { leftElbow: 175, rightElbow: 175, leftShoulder: 150, rightShoulder: 150 },
    kp: { lElbow: [24, 16], lWrist: [14, 6], rElbow: [76, 16], rWrist: [86, 6] }
  },
  {
    id: 'pose_t_pose',
    name: 'T-Pose Airplane',
    category: 'yoga',
    desc: 'Stand straight and extend both arms horizontally at shoulder height.',
    angles: { leftElbow: 175, rightElbow: 175, leftShoulder: 90, rightShoulder: 90 },
    kp: { lElbow: [20, 26], lWrist: [6, 26], rElbow: [80, 26], rWrist: [94, 26] }
  },
  {
    id: 'pose_arm_right_up',
    name: 'Right Arm Skyward',
    category: 'hero',
    desc: 'Raise right arm straight up toward the sky, left arm resting by your side.',
    angles: { leftElbow: 170, rightElbow: 175, leftShoulder: 25, rightShoulder: 170 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [68, 14], rWrist: [70, 2] }
  },
  {
    id: 'pose_arm_left_up',
    name: 'Left Arm Skyward',
    category: 'hero',
    desc: 'Raise left arm straight up toward the sky, right arm resting by your side.',
    angles: { leftElbow: 175, rightElbow: 170, leftShoulder: 170, rightShoulder: 25 },
    kp: { lElbow: [32, 14], lWrist: [30, 2], rElbow: [66, 40], rWrist: [66, 54] }
  },
  {
    id: 'pose_muscle_flex',
    name: 'Double Muscle Flex',
    category: 'hero',
    desc: 'Raise both arms to shoulder height and flex your biceps with 90-degree elbows!',
    angles: { leftElbow: 85, rightElbow: 85, leftShoulder: 90, rightShoulder: 90 },
    kp: { lElbow: [20, 26], lWrist: [20, 10], rElbow: [80, 26], rWrist: [80, 10] }
  },
  {
    id: 'pose_namaste',
    name: 'Namaste Prayer',
    category: 'yoga',
    desc: 'Press palms together at center chest and flare elbows outward gracefully.',
    angles: { leftElbow: 65, rightElbow: 65, leftShoulder: 35, rightShoulder: 35 },
    kp: { lElbow: [28, 36], lWrist: [47, 30], rElbow: [72, 36], rWrist: [53, 30] }
  },
  {
    id: 'pose_wakanda',
    name: 'Wakanda Cross X',
    category: 'hero',
    desc: 'Cross both forearms in front of your chest to form an X with clenched fists!',
    angles: { leftElbow: 65, rightElbow: 65, leftShoulder: 50, rightShoulder: 50 },
    kp: { lElbow: [30, 36], lWrist: [58, 28], rElbow: [70, 36], rWrist: [42, 28] }
  },
  {
    id: 'pose_superman',
    name: 'Superman Flight',
    category: 'hero',
    desc: 'Thrust right arm forward and skyward like soaring through the sky!',
    angles: { leftElbow: 170, rightElbow: 175, leftShoulder: 25, rightShoulder: 150 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [78, 16], rWrist: [90, 6] }
  },
  {
    id: 'pose_touch_shoulders',
    name: 'Touch Shoulders',
    category: 'yoga',
    desc: 'Bend both elbows and place your hands directly onto your shoulders.',
    angles: { leftElbow: 45, rightElbow: 45, leftShoulder: 40, rightShoulder: 40 },
    kp: { lElbow: [22, 36], lWrist: [36, 26], rElbow: [78, 36], rWrist: [64, 26] }
  },
  {
    id: 'pose_hands_on_hips',
    name: 'Hands on Hips',
    category: 'hero',
    desc: 'Rest both hands firmly on your hips, chest out, elbows flared with confidence.',
    angles: { leftElbow: 85, rightElbow: 85, leftShoulder: 40, rightShoulder: 40 },
    kp: { lElbow: [22, 42], lWrist: [38, 52], rElbow: [78, 42], rWrist: [62, 52] }
  },
  {
    id: 'pose_boxing_guard',
    name: 'Boxing Guard',
    category: 'hero',
    desc: 'Raise both fists up to chin level with elbows tucked in, ready to fight!',
    angles: { leftElbow: 60, rightElbow: 60, leftShoulder: 40, rightShoulder: 40 },
    kp: { lElbow: [34, 38], lWrist: [44, 22], rElbow: [66, 38], rWrist: [56, 22] }
  },
  {
    id: 'pose_friendly_wave',
    name: 'Friendly Wave',
    category: 'anime',
    desc: 'Raise right hand to head level with a 90-degree elbow and wave to the camera.',
    angles: { leftElbow: 170, rightElbow: 90, leftShoulder: 25, rightShoulder: 85 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [80, 24], rWrist: [82, 10] }
  },
  {
    id: 'pose_stretch_right',
    name: 'Side Stretch Right',
    category: 'yoga',
    desc: 'Arch left arm over your head and bend your torso to the right side.',
    angles: { leftElbow: 155, rightElbow: 170, leftShoulder: 150, rightShoulder: 25 },
    kp: { lElbow: [30, 14], lWrist: [48, 4], rElbow: [66, 40], rWrist: [66, 54] }
  },
  {
    id: 'pose_stretch_left',
    name: 'Side Stretch Left',
    category: 'yoga',
    desc: 'Arch right arm over your head and bend your torso to the left side.',
    angles: { leftElbow: 170, rightElbow: 155, leftShoulder: 25, rightShoulder: 150 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [70, 14], rWrist: [52, 4] }
  },
  {
    id: 'pose_low_v',
    name: 'Low V-Arms',
    category: 'anime',
    desc: 'Extend both arms straight down diagonally at 45 degrees, chest open.',
    angles: { leftElbow: 175, rightElbow: 175, leftShoulder: 50, rightShoulder: 50 },
    kp: { lElbow: [24, 38], lWrist: [14, 50], rElbow: [76, 38], rWrist: [86, 50] }
  },
  {
    id: 'pose_right_l_arm',
    name: 'Right L-Arm Stance',
    category: 'anime',
    desc: 'Bend right arm 90 degrees skyward, left arm straight out to the side.',
    angles: { leftElbow: 175, rightElbow: 90, leftShoulder: 90, rightShoulder: 90 },
    kp: { lElbow: [20, 26], lWrist: [6, 26], rElbow: [80, 26], rWrist: [80, 10] }
  },
  {
    id: 'pose_left_l_arm',
    name: 'Left L-Arm Stance',
    category: 'anime',
    desc: 'Bend left arm 90 degrees skyward, right arm straight out to the side.',
    angles: { leftElbow: 90, rightElbow: 175, leftShoulder: 90, rightShoulder: 90 },
    kp: { lElbow: [20, 26], lWrist: [20, 10], rElbow: [80, 26], rWrist: [94, 26] }
  },
  {
    id: 'pose_star',
    name: 'Five-Point Star',
    category: 'yoga',
    desc: 'Widen legs and extend both arms diagonally upward like a shining star!',
    angles: { leftElbow: 180, rightElbow: 180, leftShoulder: 120, rightShoulder: 120 },
    kp: {
      lElbow: [20, 20], lWrist: [8, 14], rElbow: [80, 20], rWrist: [92, 14],
      lKnee: [32, 74], lAnkle: [24, 94], rKnee: [68, 74], rAnkle: [76, 94]
    }
  },
  {
    id: 'pose_stand_straight',
    name: 'Standing Ready',
    category: 'yoga',
    desc: 'Stand tall with arms down by sides, calm and motionless like a mountain.',
    angles: { leftElbow: 175, rightElbow: 175, leftShoulder: 15, rightShoulder: 15 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [66, 40], rWrist: [66, 54] }
  },
  {
    id: 'pose_iron_man',
    name: 'Iron Man Repulsor',
    category: 'hero',
    desc: 'Thrust right palm forward at chest level to blast your repulsor beam!',
    angles: { leftElbow: 170, rightElbow: 180, leftShoulder: 20, rightShoulder: 85 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [76, 26], rWrist: [90, 26] }
  },
  {
    id: 'pose_batman_wings',
    name: 'Dark Knight Cape',
    category: 'hero',
    desc: 'Stand firm and flare both arms downward like spreading bat wings into the night.',
    angles: { leftElbow: 160, rightElbow: 160, leftShoulder: 45, rightShoulder: 45 },
    kp: { lElbow: [24, 38], lWrist: [16, 48], rElbow: [76, 38], rWrist: [84, 48] }
  },
  {
    id: 'pose_thor_hammer',
    name: 'Thunder Hammer',
    category: 'hero',
    desc: 'Raise left fist to the sky at 45 degrees, right hand on hip, summoning thunder!',
    angles: { leftElbow: 175, rightElbow: 85, leftShoulder: 140, rightShoulder: 40 },
    kp: { lElbow: [24, 18], lWrist: [16, 8], rElbow: [78, 42], rWrist: [62, 52] }
  },
  {
    id: 'pose_chest_tap',
    name: 'Honor Chest Tap',
    category: 'anime',
    desc: 'Place right fist firmly over your heart with resolute determination!',
    angles: { leftElbow: 170, rightElbow: 60, leftShoulder: 25, rightShoulder: 50 },
    kp: { lElbow: [34, 40], lWrist: [34, 54], rElbow: [72, 36], rWrist: [46, 30] }
  },
  {
    id: 'pose_spidey_ready',
    name: 'Spidey Web-Shooter',
    category: 'hero',
    desc: 'Reach both arms forward with bent elbows, crouching slightly ready to sling webs!',
    angles: { leftElbow: 135, rightElbow: 135, leftShoulder: 65, rightShoulder: 65 },
    kp: { lElbow: [30, 32], lWrist: [22, 22], rElbow: [70, 32], rWrist: [78, 22] }
  }
];

// Pre-render SVG diagrams for all poses so they load instantly
const INITIAL_POSES = POSES_RAW.map(p => ({
  ...p,
  image: createMediaPipeSVG(p.kp, p.name)
}));
