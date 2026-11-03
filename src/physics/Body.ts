/** Mass is proportional to area (a 2D disc). Dividing by a reference radius keeps the numbers near 1. */
const REF_RADIUS = 20;

export interface BodyOptions {
  /** Start at this radius and grow to the full radius (used for the merge "pop"). */
  startRadius?: number;
  /** Seconds it takes to grow from `startRadius` to the full radius. */
  growTime?: number;
}

/** A dynamic circle. Positions are in container-local units (x right, y down). */
export class Body<T = unknown> {
  readonly id: number;
  data: T;

  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** Radians; positive = clockwise on screen (y points down). */
  angle = 0;
  omega = 0;

  radius: number;
  readonly targetRadius: number;
  readonly growSpeed: number;

  readonly invMass: number;
  readonly invInertia: number;

  sleeping = false;
  sleepTimer = 0;
  removed = false;
  /**
   * How fast the body really moved during the last step (units/s, includes spin at the rim).
   * Measured from displacement over the whole step, so sub-pixel solver noise between
   * substeps does not count as motion.
   */
  motion = 0;
  /**
   * Hardest hit taken during the last step: the closing speed (units/s) of a contact that
   * really touched, against another body or a wall. 0 when nothing hit it; resting contacts
   * close at about 0, so this only reports real impacts.
   */
  impact = 0;

  /** State at the start of the latest fixed step, used to interpolate rendering. */
  lastX: number;
  lastY: number;
  lastAngle = 0;

  // ---- solver scratch, valid during a step ----
  /** Radius at the start of the step (growth during the step pushes neighbours). */
  stepRadius: number;
  /** Broadphase margin for this step. */
  margin = 0;
  /** Touching something at the start of this step (gets contact damping). */
  inContact = false;
  minX = 0;
  maxX = 0;
  minY = 0;
  maxY = 0;

  constructor(id: number, x: number, y: number, radius: number, data: T, opts: BodyOptions = {}) {
    this.id = id;
    this.data = data;
    this.x = this.lastX = x;
    this.y = this.lastY = y;
    this.targetRadius = radius;
    const start = Math.min(radius, opts.startRadius ?? radius);
    this.radius = this.stepRadius = start;
    const growTime = opts.growTime ?? 0;
    this.growSpeed = growTime > 0 ? (radius - start) / growTime : Infinity;
    if (!Number.isFinite(this.growSpeed)) this.radius = this.stepRadius = radius;

    const mass = (radius / REF_RADIUS) ** 2;
    this.invMass = 1 / mass;
    this.invInertia = 1 / (0.5 * mass * radius * radius);
  }

  get growing(): boolean {
    return this.radius < this.targetRadius;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }
}
