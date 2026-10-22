export interface StepTemplate {
  id: string;
  name: string;
  phaseLabel: string;
  instruction: string;
  keyJoints: number[]; // indices of joints critical for this step (e.g. 4 for thumb, 8 for index)
  idealWristIndexAngle: number;
  landmarks: [number, number, number][]; // 21 normalized landmarks [x, y, z]
  svgIllustration: string; // SVG markup for the translucent picture of hand position
}

// Canonical 21-landmark models in normalized [0, 1] camera space.
// Wrist anchored at [0.50, 0.78, 0.0] by default.

const STEP_TEMPLATES: Record<string, StepTemplate> = {
  thumb_index_precision_grip: {
    id: "thumb_index_precision_grip",
    name: "Thumb-Index Precision Grip",
    phaseLabel: "Step 1 of 5",
    instruction: "Pinch thumb and index fingertip together firmly in a controlled hold.",
    keyJoints: [0, 4, 8, 5, 9],
    idealWristIndexAngle: 90,
    landmarks: [
      [0.50, 0.78, 0.0], // 0: Wrist
      [0.46, 0.71, 0.0], // 1: Thumb CMC
      [0.43, 0.63, 0.0], // 2: Thumb MCP
      [0.44, 0.55, 0.0], // 3: Thumb IP
      [0.47, 0.49, 0.0], // 4: Thumb Tip (touching index tip)
      [0.49, 0.59, 0.0], // 5: Index MCP
      [0.48, 0.53, 0.0], // 6: Index PIP
      [0.48, 0.49, 0.0], // 7: Index DIP
      [0.475, 0.49, 0.0], // 8: Index Tip (pinch closed at 0.47, 0.49)
      [0.53, 0.59, 0.0], // 9: Middle MCP
      [0.54, 0.53, 0.0], // 10: Middle PIP
      [0.55, 0.49, 0.0], // 11: Middle DIP
      [0.55, 0.46, 0.0], // 12: Middle Tip
      [0.56, 0.61, 0.0], // 13: Ring MCP
      [0.57, 0.56, 0.0], // 14: Ring PIP
      [0.58, 0.53, 0.0], // 15: Ring DIP
      [0.58, 0.51, 0.0], // 16: Ring Tip
      [0.59, 0.64, 0.0], // 17: Pinky MCP
      [0.60, 0.60, 0.0], // 18: Pinky PIP
      [0.61, 0.57, 0.0], // 19: Pinky DIP
      [0.61, 0.55, 0.0], // 20: Pinky Tip
    ],
    svgIllustration: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow-pinch" cx="48%" cy="32%" r="45%">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#065f46" stop-opacity="0.1"/>
        </radialGradient>
      </defs>
      <!-- Translucent Hand Silhouette -->
      <path d="M70 145 C65 115 50 95 55 75 C60 55 75 52 82 56 C88 59 86 70 88 80 C92 70 94 48 102 46 C110 44 112 55 110 70 C114 62 118 52 126 52 C134 52 134 65 130 82 C134 75 140 68 147 70 C154 72 150 88 142 105 C135 120 125 145 105 145 Z" fill="rgba(6, 78, 59, 0.35)" stroke="#10b981" stroke-width="2.5" stroke-dasharray="4 3"/>
      <!-- Pinch indicator circle -->
      <circle cx="95" cy="50" r="14" fill="url(#glow-pinch)" stroke="#34d399" stroke-width="2"/>
      <circle cx="95" cy="50" r="4" fill="#ecfdf5"/>
      <!-- Bones & Joints -->
      <line x1="75" y1="120" x2="80" y2="85" stroke="#6ee7b7" stroke-width="2" stroke-linecap="round"/>
      <line x1="80" y1="85" x2="95" y2="50" stroke="#34d399" stroke-width="3" stroke-linecap="round"/>
      <line x1="105" y1="90" x2="95" y2="50" stroke="#34d399" stroke-width="3" stroke-linecap="round"/>
      <text x="100" y="24" text-anchor="middle" fill="#a7f3d0" font-size="12" font-weight="700" letter-spacing="1">PRECISION PINCH</text>
    </svg>`,
  },

  middle_finger_support: {
    id: "middle_finger_support",
    name: "Middle Finger Support",
    phaseLabel: "Step 2 of 5",
    instruction: "Slide middle finger right below index finger to provide steady support.",
    keyJoints: [0, 4, 8, 12, 9],
    idealWristIndexAngle: 90,
    landmarks: [
      [0.50, 0.78, 0.0],
      [0.46, 0.71, 0.0],
      [0.43, 0.63, 0.0],
      [0.44, 0.55, 0.0],
      [0.47, 0.49, 0.0], // 4: Thumb Tip
      [0.49, 0.59, 0.0],
      [0.48, 0.53, 0.0],
      [0.48, 0.49, 0.0],
      [0.475, 0.49, 0.0], // 8: Index Tip
      [0.53, 0.59, 0.0],
      [0.51, 0.54, 0.0],
      [0.49, 0.51, 0.0],
      [0.485, 0.515, 0.0], // 12: Middle Tip supporting directly under index
      [0.56, 0.61, 0.0],
      [0.57, 0.56, 0.0],
      [0.58, 0.53, 0.0],
      [0.58, 0.51, 0.0],
      [0.59, 0.64, 0.0],
      [0.60, 0.60, 0.0],
      [0.61, 0.57, 0.0],
      [0.61, 0.55, 0.0],
    ],
    svgIllustration: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow-support" cx="50%" cy="35%" r="40%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0.1"/>
        </radialGradient>
      </defs>
      <!-- Translucent Hand Silhouette -->
      <path d="M70 145 C65 115 50 95 55 75 C60 55 75 52 82 56 C88 59 86 70 88 80 C92 70 94 48 102 46 C110 44 112 55 110 70 C113 62 116 52 122 53 C127 54 125 68 122 82 C128 75 135 70 142 72 C149 74 146 88 138 105 C132 120 122 145 105 145 Z" fill="rgba(3, 105, 161, 0.35)" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="4 3"/>
      <!-- Support Bracket indicator -->
      <path d="M85 45 Q98 42 108 45 L106 65 Q98 62 86 65 Z" fill="url(#glow-support)" stroke="#38bdf8" stroke-width="2"/>
      <circle cx="98" cy="54" r="5" fill="#f0f9ff"/>
      <path d="M98 68 L98 80 M93 75 L98 82 L103 75" stroke="#7dd3fc" stroke-width="2.5" stroke-linecap="round"/>
      <text x="100" y="24" text-anchor="middle" fill="#bae6fd" font-size="12" font-weight="700" letter-spacing="1">MIDDLE FINGER SUPPORT</text>
    </svg>`,
  },

  initial_incision_position: {
    id: "initial_incision_position",
    name: "Initial Incision Position",
    phaseLabel: "Step 3 of 5",
    instruction: "Hold instrument upright near 90° vertical orientation ready for entry.",
    keyJoints: [0, 5, 8, 4],
    idealWristIndexAngle: 90,
    landmarks: [
      [0.50, 0.80, 0.0], // 0: Wrist
      [0.46, 0.73, 0.0],
      [0.43, 0.65, 0.0],
      [0.44, 0.56, 0.0],
      [0.47, 0.48, 0.0], // 4: Thumb
      [0.50, 0.62, 0.0], // 5: Index MCP
      [0.50, 0.53, 0.0], // 6: Index PIP
      [0.50, 0.48, 0.0], // 7: Index DIP
      [0.50, 0.44, 0.0], // 8: Index Tip (wrist-to-index is 90° straight vertical!)
      [0.53, 0.61, 0.0],
      [0.52, 0.54, 0.0],
      [0.51, 0.50, 0.0],
      [0.51, 0.49, 0.0], // 12: Middle Tip
      [0.56, 0.63, 0.0],
      [0.57, 0.58, 0.0],
      [0.57, 0.55, 0.0],
      [0.57, 0.53, 0.0],
      [0.59, 0.66, 0.0],
      [0.60, 0.62, 0.0],
      [0.60, 0.59, 0.0],
      [0.60, 0.58, 0.0],
    ],
    svgIllustration: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow-vert" cx="50%" cy="40%" r="45%">
          <stop offset="0%" stop-color="#a855f7" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#6b21a8" stop-opacity="0.1"/>
        </radialGradient>
      </defs>
      <!-- Scalpel/Tool line upright -->
      <line x1="100" y1="20" x2="100" y2="135" stroke="#c084fc" stroke-width="4" stroke-linecap="round"/>
      <polygon points="96,22 104,22 100,8" fill="#e9d5ff"/>
      <!-- 90 Deg Protractor indicator -->
      <path d="M100 100 L140 100 A40 40 0 0 0 100 60 Z" fill="rgba(168, 85, 247, 0.25)" stroke="#c084fc" stroke-width="1.8"/>
      <circle cx="100" cy="100" r="4" fill="#f3e8ff"/>
      <!-- Upright Hand silhouette -->
      <path d="M80 145 C75 115 65 95 72 75 C78 55 90 52 96 56 C100 59 98 70 100 80 C104 68 106 44 114 42 C122 40 122 55 120 70 C124 64 128 55 136 56 C143 57 141 72 137 88 C130 115 120 145 105 145 Z" fill="rgba(88, 28, 135, 0.35)" stroke="#c084fc" stroke-width="2.5" stroke-dasharray="4 3"/>
      <text x="100" y="24" text-anchor="middle" fill="#f3e8ff" font-size="12" font-weight="700" letter-spacing="1">90° UPRIGHT ENTRY</text>
    </svg>`,
  },

  cutting_angle_control: {
    id: "cutting_angle_control",
    name: "Cutting Angle Control",
    phaseLabel: "Step 4 of 5",
    instruction: "Tilt instrument down to 35°–45° and maintain controlled movement.",
    keyJoints: [0, 5, 8, 4],
    idealWristIndexAngle: 38,
    landmarks: [
      [0.54, 0.78, 0.0], // 0: Wrist shifted right
      [0.50, 0.72, 0.0],
      [0.47, 0.65, 0.0],
      [0.45, 0.59, 0.0],
      [0.44, 0.57, 0.0], // 4: Thumb
      [0.50, 0.64, 0.0], // 5: Index MCP
      [0.46, 0.60, 0.0], // 6: Index PIP
      [0.43, 0.57, 0.0], // 7: Index DIP
      [0.41, 0.55, 0.0], // 8: Index Tip (wrist-to-index is angled ~38° to the horizontal!)
      [0.53, 0.65, 0.0],
      [0.49, 0.62, 0.0],
      [0.46, 0.60, 0.0],
      [0.44, 0.59, 0.0], // 12: Middle Tip supporting
      [0.56, 0.67, 0.0],
      [0.53, 0.64, 0.0],
      [0.51, 0.62, 0.0],
      [0.50, 0.61, 0.0],
      [0.59, 0.70, 0.0],
      [0.57, 0.67, 0.0],
      [0.55, 0.65, 0.0],
      [0.54, 0.64, 0.0],
    ],
    svgIllustration: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow-angle" cx="40%" cy="50%" r="45%">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#78350f" stop-opacity="0.1"/>
        </radialGradient>
      </defs>
      <!-- Angled Scalpel/Tool line ~38 deg -->
      <line x1="45" y1="55" x2="155" y2="135" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>
      <polygon points="40,50 48,58 35,46" fill="#fef3c7"/>
      <!-- Angle Arc -->
      <path d="M120 110 A35 35 0 0 0 145 105" fill="none" stroke="#f59e0b" stroke-width="2.5"/>
      <text x="145" y="98" fill="#fde68a" font-size="11" font-weight="700">38°</text>
      <!-- Angled hand outline -->
      <path d="M95 145 C90 120 80 100 70 85 C65 78 50 65 60 55 C70 48 85 60 95 72 C105 85 125 110 135 125 Z" fill="rgba(180, 83, 9, 0.35)" stroke="#fbbf24" stroke-width="2.5" stroke-dasharray="4 3"/>
      <text x="100" y="24" text-anchor="middle" fill="#fef3c7" font-size="12" font-weight="700" letter-spacing="1">35°–45° CUTTING ANGLE</text>
    </svg>`,
  },

  grip_stability: {
    id: "grip_stability",
    name: "Grip Stability Hold",
    phaseLabel: "Step 5 of 5",
    instruction: "Lock your grip at the verified cutting angle and hold motionless for 1s.",
    keyJoints: [0, 4, 8, 12, 5],
    idealWristIndexAngle: 38,
    landmarks: [
      [0.54, 0.78, 0.0],
      [0.50, 0.72, 0.0],
      [0.47, 0.65, 0.0],
      [0.45, 0.59, 0.0],
      [0.44, 0.57, 0.0],
      [0.50, 0.64, 0.0],
      [0.46, 0.60, 0.0],
      [0.43, 0.57, 0.0],
      [0.41, 0.55, 0.0],
      [0.53, 0.65, 0.0],
      [0.49, 0.62, 0.0],
      [0.46, 0.60, 0.0],
      [0.44, 0.59, 0.0],
      [0.56, 0.67, 0.0],
      [0.53, 0.64, 0.0],
      [0.51, 0.62, 0.0],
      [0.50, 0.61, 0.0],
      [0.59, 0.70, 0.0],
      [0.57, 0.67, 0.0],
      [0.55, 0.65, 0.0],
      [0.54, 0.64, 0.0],
    ],
    svgIllustration: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow-stable" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#047857" stop-opacity="0.1"/>
        </radialGradient>
      </defs>
      <!-- Stability Crosshair Rings -->
      <circle cx="100" cy="80" r="48" fill="none" stroke="#10b981" stroke-width="1.8" stroke-dasharray="6 4"/>
      <circle cx="100" cy="80" r="32" fill="none" stroke="#34d399" stroke-width="2"/>
      <circle cx="100" cy="80" r="10" fill="url(#glow-stable)"/>
      <!-- Crosshairs -->
      <line x1="100" y1="24" x2="100" y2="136" stroke="#6ee7b7" stroke-width="1.5" stroke-dasharray="3 3"/>
      <line x1="44" y1="80" x2="156" y2="80" stroke="#6ee7b7" stroke-width="1.5" stroke-dasharray="3 3"/>
      <text x="100" y="24" text-anchor="middle" fill="#d1fae5" font-size="12" font-weight="700" letter-spacing="1">ZERO TREMOR LOCK</text>
    </svg>`,
  },

  completed: {
    id: "completed",
    name: "Procedure Completed",
    phaseLabel: "Mastery Confirmed",
    instruction: "Excellent precision! Procedure completed successfully with verified stability.",
    keyJoints: [0, 4, 8, 12, 16, 20],
    idealWristIndexAngle: 90,
    landmarks: [
      [0.50, 0.78, 0.0],
      [0.45, 0.72, 0.0],
      [0.42, 0.64, 0.0],
      [0.41, 0.55, 0.0],
      [0.40, 0.47, 0.0], // Thumbs up or open palm
      [0.48, 0.59, 0.0],
      [0.47, 0.50, 0.0],
      [0.47, 0.44, 0.0],
      [0.47, 0.38, 0.0],
      [0.52, 0.59, 0.0],
      [0.52, 0.49, 0.0],
      [0.52, 0.42, 0.0],
      [0.52, 0.36, 0.0],
      [0.56, 0.61, 0.0],
      [0.56, 0.52, 0.0],
      [0.56, 0.45, 0.0],
      [0.56, 0.40, 0.0],
      [0.60, 0.64, 0.0],
      [0.60, 0.56, 0.0],
      [0.60, 0.50, 0.0],
      [0.60, 0.45, 0.0],
    ],
    svgIllustration: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="80" r="46" fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" stroke-width="3"/>
      <path d="M78 82 L93 97 L124 64" stroke="#34d399" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="100" y="24" text-anchor="middle" fill="#a7f3d0" font-size="12" font-weight="700" letter-spacing="1">SESSION COMPLETE</text>
    </svg>`,
  },
};

export function getStepTemplate(stepId?: string): StepTemplate {
  if (stepId && STEP_TEMPLATES[stepId]) {
    return STEP_TEMPLATES[stepId];
  }
  return STEP_TEMPLATES.thumb_index_precision_grip;
}

export function getAllStepTemplates(): StepTemplate[] {
  return Object.values(STEP_TEMPLATES);
}

/**
 * Adapt canonical template coordinates to the user's observed hand position and palm size.
 * If user hand is not detected, centers the template naturally in the camera feed.
 */
export function adaptTemplateToHand(
  templateLandmarks: [number, number, number][],
  userLandmarks?: number[][] | null
): [number, number, number][] {
  if (!userLandmarks || userLandmarks.length < 21) {
    // Return standard centered template
    return templateLandmarks;
  }

  const uWrist = userLandmarks[0];
  const uIndexMcp = userLandmarks[5];
  const uPinkyMcp = userLandmarks[17];

  const tWrist = templateLandmarks[0];
  const tIndexMcp = templateLandmarks[5];
  const tPinkyMcp = templateLandmarks[17];

  // User palm width
  const uPalmWidth = Math.hypot(uIndexMcp[0] - uPinkyMcp[0], uIndexMcp[1] - uPinkyMcp[1]);
  // Template palm width
  const tPalmWidth = Math.hypot(tIndexMcp[0] - tPinkyMcp[0], tIndexMcp[1] - tPinkyMcp[1]);

  const scale = tPalmWidth > 0.001 ? Math.max(0.65, Math.min(1.5, uPalmWidth / tPalmWidth)) : 1.0;

  // Offset so template wrist anchors onto user's wrist
  const dx = uWrist[0] - tWrist[0];
  const dy = uWrist[1] - tWrist[1];

  return templateLandmarks.map(([tx, ty, tz]) => {
    // Relative to template wrist
    const relX = tx - tWrist[0];
    const relY = ty - tWrist[1];
    const relZ = tz - tWrist[2];

    return [
      uWrist[0] + relX * scale,
      uWrist[1] + relY * scale,
      (uWrist[2] ?? 0) + relZ * scale,
    ];
  });
}
