export interface JointGuidance {
  index: number;
  userPoint: [number, number]; // [x, y] in normalized coords (0..1)
  targetPoint: [number, number]; // [x, y] in normalized coords (0..1)
  pidPoint: [number, number]; // [x, y] smoothed PID control destination
  errorDistance: number; // Euclidean distance between user and target
  status: "good" | "warn" | "bad";
  isKeyJoint: boolean;
}

export interface PidEvaluation {
  jointGuides: JointGuidance[];
  averageError: number;
  maxError: number;
  alignmentPercent: number; // 0 to 100
  isSynced: boolean; // all key joints are in tolerance
}

export class PidHandGuidance {
  private kp: number;
  private ki: number;
  private kd: number;

  private integralX: number[] = new Array(21).fill(0);
  private integralY: number[] = new Array(21).fill(0);
  private prevErrorX: number[] = new Array(21).fill(0);
  private prevErrorY: number[] = new Array(21).fill(0);
  private lastTimestamp: number = 0;

  constructor(kp = 0.75, ki = 0.08, kd = 0.22) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  public reset(): void {
    this.integralX.fill(0);
    this.integralY.fill(0);
    this.prevErrorX.fill(0);
    this.prevErrorY.fill(0);
    this.lastTimestamp = 0;
  }

  /**
   * Evaluate user landmarks against target landmarks using PID control.
   */
  public evaluate(
    userLandmarks: number[][],
    targetLandmarks: [number, number, number][],
    keyJoints: number[] = [0, 4, 8, 12, 5],
    nowMs: number = Date.now()
  ): PidEvaluation {
    if (!userLandmarks || userLandmarks.length < 21 || !targetLandmarks || targetLandmarks.length < 21) {
      return {
        jointGuides: [],
        averageError: 1.0,
        maxError: 1.0,
        alignmentPercent: 0,
        isSynced: false,
      };
    }

    const dt = this.lastTimestamp > 0 ? Math.max(0.016, Math.min(0.2, (nowMs - this.lastTimestamp) / 1000)) : 0.033;
    this.lastTimestamp = nowMs;

    const keySet = new Set(keyJoints);
    let totalError = 0;
    let keyError = 0;
    let maxError = 0;

    const jointGuides: JointGuidance[] = [];

    for (let i = 0; i < 21; i++) {
      const u = userLandmarks[i];
      const t = targetLandmarks[i];

      const ex = t[0] - u[0];
      const ey = t[1] - u[1];
      const dist = Math.hypot(ex, ey);

      totalError += dist;
      if (keySet.has(i)) {
        keyError += dist;
      }
      if (dist > maxError) {
        maxError = dist;
      }

      // PID terms
      // Integral with anti-windup clamping (-0.3 to 0.3)
      this.integralX[i] = Math.max(-0.3, Math.min(0.3, this.integralX[i] + ex * dt));
      this.integralY[i] = Math.max(-0.3, Math.min(0.3, this.integralY[i] + ey * dt));

      // Derivative
      const dex = (ex - this.prevErrorX[i]) / dt;
      const dey = (ey - this.prevErrorY[i]) / dt;
      this.prevErrorX[i] = ex;
      this.prevErrorY[i] = ey;

      // PID correction vector
      const ux = this.kp * ex + this.ki * this.integralX[i] + this.kd * dex;
      const uy = this.kp * ey + this.ki * this.integralY[i] + this.kd * dey;

      const pidPoint: [number, number] = [u[0] + ux, u[1] + uy];

      // Error thresholds in normalized screen space
      let status: "good" | "warn" | "bad" = "bad";
      if (dist <= 0.038) {
        status = "good";
      } else if (dist <= 0.082) {
        status = "warn";
      }

      jointGuides.push({
        index: i,
        userPoint: [u[0], u[1]],
        targetPoint: [t[0], t[1]],
        pidPoint,
        errorDistance: dist,
        status,
        isKeyJoint: keySet.has(i),
      });
    }

    const averageError = totalError / 21;
    const avgKeyError = keySet.size > 0 ? keyError / keySet.size : averageError;

    // Convert average error to 0-100% alignment scale:
    // 0 error -> 100%, 0.12 error -> 0%
    const alignmentPercent = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, avgKeyError / 0.10)) * 100)));

    // Synced if key joints are within good tolerance
    const isSynced = avgKeyError <= 0.042 && jointGuides.filter(j => j.isKeyJoint && j.status === "bad").length === 0;

    return {
      jointGuides,
      averageError,
      maxError,
      alignmentPercent,
      isSynced,
    };
  }
}
