import { Body, type BodyOptions } from './Body';

/**
 * A small physics engine specialised for circles inside a box.
 *
 * The solver follows Box2D v3's "soft step" design (Erin Catto): sub-stepping, soft contact
 * constraints, a relax pass, warm starting and restitution applied once per step.
 * What matters for this game:
 *  - Contacts persist between steps and are warm started, so a resting pile converges to
 *    an exact stand-still instead of being re-solved from scratch every frame (no wiggle).
 *  - Overlap is pushed out at a capped speed and the relax pass removes that push speed
 *    afterwards, so merges and heavy stacks never "explode".
 *  - Impacts slower than `restitutionThreshold` do not bounce (no endless hopping).
 *
 * How balls lose energy and come to rest is deliberately physical, so round things behave
 * like round things:
 *  - Touching balls lose energy through *viscous* damping (proportional to speed). It never
 *    holds a ball still on a slope, so a ball balanced on another ball rolls off and a push
 *    always moves its target; it just calms rolling and rocking down quickly.
 *  - Only a contact group in which every ball is actually held up (by the floor, or by two
 *    or more things) may fall asleep. A ball perched on a single ball is an unstable
 *    balance, so it is never frozen in place.
 *
 * All coordinates are container-local: x in [0, width], floor at y = height, y grows down.
 */
export interface PhysicsConfig {
  gravity: number;
  substeps: number;
  /** Contact stiffness (Hz). Capped at a quarter of the substep rate for stability. */
  contactHertz: number;
  contactDampingRatio: number;
  /** Fastest speed at which overlap is pushed apart. */
  pushMaxVelocity: number;
  restitution: number;
  restitutionThreshold: number;
  friction: number;
  /** Damping (per second) of a body's speed while it touches something. */
  contactDamping: number;
  /** Damping (per second) of a body's spin while it touches something. */
  contactAngularDamping: number;
  /** Damping (per second) that always applies, e.g. in flight (keep small). */
  linearDamping: number;
  angularDamping: number;
  sleepSpeed: number;
  sleepTime: number;
  maxSpeed: number;
  /** Extra distance at which two circles still count as touching (for merges). */
  touchSlop: number;
  /** Contacts are created this far before circles actually touch. */
  speculativeDistance: number;
}

export interface WorldBounds {
  width: number;
  height: number;
  /** Hard ceiling (negative y) so nothing can fly away forever. */
  ceiling: number;
}

interface Soft {
  biasRate: number;
  massScale: number;
  impulseScale: number;
}

function makeSoft(hertz: number, zeta: number, h: number): Soft {
  if (hertz <= 0) return { biasRate: 0, massScale: 1, impulseScale: 0 };
  const omega = 2 * Math.PI * hertz;
  const a1 = 2 * zeta + h * omega;
  const a2 = h * omega * a1;
  const a3 = 1 / (1 + a2);
  return { biasRate: omega / a1, massScale: a2 * a3, impulseScale: a3 };
}

const enum Wall {
  Left = 0,
  Right = 1,
  Floor = 2,
  Top = 3,
}

interface Contact<T> {
  key: number;
  /** null = a static wall. For two circles, `a` always has the lower id. */
  a: Body<T> | null;
  b: Body<T>;
  /** Unit normal pointing from a to b, and tangent = right-perp(normal). */
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  /** Contact point relative to each centre (fixed for the step). */
  rax: number;
  ray: number;
  rbx: number;
  rby: number;
  /** Gap at the start of the step (negative = overlap). */
  separation: number;
  // per-step solver data
  mA: number;
  iA: number;
  mB: number;
  iB: number;
  isStatic: boolean;
  normalMass: number;
  tangentMass: number;
  relativeVelocity: number;
  // accumulated impulses (warm started across steps)
  normalImpulse: number;
  tangentImpulse: number;
  maxNormalImpulse: number;
  stamp: number;
}

export class World<T = unknown> {
  readonly bodies: Body<T>[] = [];
  gravityX = 0;
  gravityY: number;
  /** y of a temporary lid that closes the box (used while flipping); null = open top. */
  lidY: number | null = null;
  /** Pairs touching after the latest step, flattened: [a0, b0, a1, b1, ...]. */
  readonly touching: Body<T>[] = [];

  private nextId = 1;
  private stepCount = 0;
  private order: Body<T>[] = [];
  private orderDirty = true;
  private candidates: Body<T>[] = [];
  private contacts = new Map<number, Contact<T>>();
  private active: Contact<T>[] = [];

  constructor(
    readonly bounds: WorldBounds,
    readonly cfg: PhysicsConfig,
  ) {
    this.gravityY = cfg.gravity;
  }

  add(x: number, y: number, radius: number, data: T, opts?: BodyOptions): Body<T> {
    const body = new Body(this.nextId++, x, y, radius, data, opts);
    this.bodies.push(body);
    this.orderDirty = true;
    return body;
  }

  remove(body: Body<T>): void {
    if (body.removed) return;
    body.removed = true;
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
    this.orderDirty = true;
    // Anything resting on the removed body must wake up and fall.
    this.wakeFlood([body]);
  }

  clear(): void {
    for (const b of this.bodies) b.removed = true;
    this.bodies.length = 0;
    this.touching.length = 0;
    this.contacts.clear();
    this.active.length = 0;
    this.orderDirty = true;
  }

  wakeAll(): void {
    for (const b of this.bodies) this.wake(b);
  }

  /** The body containing the point (closest to its centre), or null. */
  bodyAt(x: number, y: number, pad = 0): Body<T> | null {
    let best: Body<T> | null = null;
    let bestScore = Infinity;
    for (const b of this.bodies) {
      const d = Math.hypot(b.x - x, b.y - y);
      const r = b.radius + pad;
      if (d <= r && d / r < bestScore) {
        bestScore = d / r;
        best = b;
      }
    }
    return best;
  }

  /**
   * Point-reflect every body through the centre of the closed box [0,width] x [lidY,height].
   * Rendering the result upright looks exactly like the box rotated by 180°.
   */
  flipThroughCentre(lidY: number): void {
    const w = this.bounds.width;
    const h = this.bounds.height;
    for (const b of this.bodies) {
      b.x = w - b.x;
      b.y = lidY + h - b.y;
      b.lastX = w - b.lastX;
      b.lastY = lidY + h - b.lastY;
      b.angle += Math.PI;
      b.lastAngle += Math.PI;
      b.vx = -b.vx;
      b.vy = -b.vy;
    }
    this.contacts.clear();
    this.orderDirty = true;
  }

  step(dt: number): void {
    this.stepCount++;
    for (const b of this.bodies) {
      b.lastX = b.x;
      b.lastY = b.y;
      b.lastAngle = b.angle;
      b.stepRadius = b.radius;
      b.impact = 0;
    }
    if (this.bodies.length === 0) return;

    this.broadphase(dt);
    this.narrowphase();

    const cfg = this.cfg;
    const h = dt / cfg.substeps;
    const hertz = Math.min(cfg.contactHertz, 0.25 / h);
    const soft = makeSoft(hertz, cfg.contactDampingRatio, h);
    const staticSoft = makeSoft(2 * hertz, cfg.contactDampingRatio, h);

    this.prepare();
    for (let s = 0; s < cfg.substeps; s++) {
      this.integrateVelocities(h);
      this.warmStart();
      this.solve(h, soft, staticSoft, true);
      this.integratePositions(h);
      this.solve(h, soft, staticSoft, false);
    }
    this.recordImpacts();
    this.applyRestitution();
    this.clampToBounds();
    this.collectTouching();
    this.updateSleep(dt);
  }

  // ---------------------------------------------------------------- collision

  /** Sweep-and-prune along x with motion margins. */
  private broadphase(dt: number): void {
    const g = Math.hypot(this.gravityX, this.gravityY);
    const spec = this.cfg.speculativeDistance;
    for (const b of this.bodies) {
      b.margin = b.sleeping ? spec : (b.speed + g * dt) * dt + (b.targetRadius - b.radius) + spec;
      const r = b.radius + b.margin;
      b.minX = b.x - r;
      b.maxX = b.x + r;
      b.minY = b.y - r;
      b.maxY = b.y + r;
    }

    if (this.orderDirty) {
      this.order = this.bodies.slice();
      this.orderDirty = false;
    }
    const order = this.order;
    // Insertion sort: the order barely changes between steps, so this is ~O(n).
    for (let i = 1; i < order.length; i++) {
      const item = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].minX > item.minX) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = item;
    }

    const cand = this.candidates;
    cand.length = 0;
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j];
        if (b.minX > a.maxX) break;
        if (b.minY > a.maxY || b.maxY < a.minY) continue;
        cand.push(a, b);
      }
    }

    // A moving body about to hit a sleeping group wakes the whole group first.
    const wakeSpeed = this.cfg.sleepSpeed * 2;
    for (let i = 0; i < cand.length; i += 2) {
      const a = cand[i];
      const b = cand[i + 1];
      if (a.sleeping === b.sleeping) continue;
      const awake = a.sleeping ? b : a;
      const sleeper = a.sleeping ? a : b;
      if (awake.growing || awake.motion > wakeSpeed) {
        this.wake(sleeper);
        this.wakeFlood([sleeper]);
      }
    }
  }

  /** Create/refresh persistent contacts; contacts not refreshed this step are dropped. */
  private narrowphase(): void {
    const stamp = this.stepCount;
    const cand = this.candidates;
    for (let i = 0; i < cand.length; i += 2) {
      let a = cand[i];
      let b = cand[i + 1];
      if (a.sleeping && b.sleeping) continue;
      if (a.id > b.id) {
        const t = a;
        a = b;
        b = t;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const sep = dist - a.radius - b.radius;
      if (sep > a.margin + b.margin) continue;
      let nx = 0;
      let ny = 1;
      if (dist > 1e-6) {
        nx = dx / dist;
        ny = dy / dist;
      }
      const c = this.contactFor(a.id * 2097152 + b.id, a, b);
      const ha = a.radius + sep * 0.5;
      const hb = b.radius + sep * 0.5;
      this.setGeometry(c, nx, ny, sep, nx * ha, ny * ha, -nx * hb, -ny * hb);
      c.stamp = stamp;
    }

    const w = this.bounds.width;
    const hgt = this.bounds.height;
    const top = this.lidY ?? this.bounds.ceiling;
    for (const b of this.bodies) {
      if (b.sleeping) continue;
      const r = b.radius;
      const m = b.margin;
      const base = -(b.id * 4) - 1;
      const left = b.x - r;
      if (left < m) this.wallContact(base - Wall.Left, b, 1, 0, left, stamp);
      const right = w - b.x - r;
      if (right < m) this.wallContact(base - Wall.Right, b, -1, 0, right, stamp);
      const floor = hgt - b.y - r;
      if (floor < m) this.wallContact(base - Wall.Floor, b, 0, -1, floor, stamp);
      const ceil = b.y - r - top;
      if (ceil < m) this.wallContact(base - Wall.Top, b, 0, 1, ceil, stamp);
    }

    const active = this.active;
    active.length = 0;
    for (const [key, c] of this.contacts) {
      if (c.b.removed || (c.a && c.a.removed)) {
        this.contacts.delete(key);
      } else if (c.stamp === stamp) {
        active.push(c);
      } else if (!(c.b.sleeping && (c.a === null || c.a.sleeping))) {
        // Keep contacts inside sleeping groups so they wake up warm; drop the rest.
        this.contacts.delete(key);
      }
    }
  }

  private wallContact(key: number, b: Body<T>, nx: number, ny: number, sep: number, stamp: number): void {
    const c = this.contactFor(key, null, b);
    this.setGeometry(c, nx, ny, sep, 0, 0, -nx * b.radius, -ny * b.radius);
    c.stamp = stamp;
  }

  private contactFor(key: number, a: Body<T> | null, b: Body<T>): Contact<T> {
    let c = this.contacts.get(key);
    if (!c) {
      c = {
        key,
        a,
        b,
        nx: 0,
        ny: 0,
        tx: 0,
        ty: 0,
        rax: 0,
        ray: 0,
        rbx: 0,
        rby: 0,
        separation: 0,
        mA: 0,
        iA: 0,
        mB: 0,
        iB: 0,
        isStatic: false,
        normalMass: 0,
        tangentMass: 0,
        relativeVelocity: 0,
        normalImpulse: 0,
        tangentImpulse: 0,
        maxNormalImpulse: 0,
        stamp: 0,
      };
      this.contacts.set(key, c);
    }
    return c;
  }

  private setGeometry(
    c: Contact<T>,
    nx: number,
    ny: number,
    sep: number,
    rax: number,
    ray: number,
    rbx: number,
    rby: number,
  ): void {
    c.nx = nx;
    c.ny = ny;
    c.tx = ny;
    c.ty = -nx;
    c.separation = sep;
    c.rax = rax;
    c.ray = ray;
    c.rbx = rbx;
    c.rby = rby;
  }

  // ---------------------------------------------------------------- solver

  private prepare(): void {
    for (const b of this.bodies) b.inContact = false;
    const touch = this.cfg.touchSlop;
    for (const c of this.active) {
      const a = c.a;
      const b = c.b;
      if (c.separation < touch) {
        b.inContact = true;
        if (a) a.inContact = true;
      }
      c.mA = a && !a.sleeping ? a.invMass : 0;
      c.iA = a && !a.sleeping ? a.invInertia : 0;
      c.mB = b.sleeping ? 0 : b.invMass;
      c.iB = b.sleeping ? 0 : b.invInertia;
      c.isStatic = c.mA === 0 || c.mB === 0;

      const rnA = c.rax * c.ny - c.ray * c.nx;
      const rnB = c.rbx * c.ny - c.rby * c.nx;
      const kn = c.mA + c.mB + c.iA * rnA * rnA + c.iB * rnB * rnB;
      c.normalMass = kn > 0 ? 1 / kn : 0;
      const rtA = c.rax * c.ty - c.ray * c.tx;
      const rtB = c.rbx * c.ty - c.rby * c.tx;
      const kt = c.mA + c.mB + c.iA * rtA * rtA + c.iB * rtB * rtB;
      c.tangentMass = kt > 0 ? 1 / kt : 0;
      c.maxNormalImpulse = 0;

      let dvx = b.vx - b.omega * c.rby;
      let dvy = b.vy + b.omega * c.rbx;
      if (a) {
        dvx -= a.vx - a.omega * c.ray;
        dvy -= a.vy + a.omega * c.rax;
      }
      c.relativeVelocity = dvx * c.nx + dvy * c.ny;
    }
  }

  private integrateVelocities(h: number): void {
    const cfg = this.cfg;
    const gx = this.gravityX * h;
    const gy = this.gravityY * h;
    const linDamp = 1 / (1 + h * cfg.linearDamping);
    const angDamp = 1 / (1 + h * cfg.angularDamping);
    // Viscous losses while touching something: slows rolling/rocking, never holds a ball still.
    const linContact = 1 / (1 + h * (cfg.linearDamping + cfg.contactDamping));
    const angContact = 1 / (1 + h * (cfg.angularDamping + cfg.contactAngularDamping));
    const maxV2 = cfg.maxSpeed * cfg.maxSpeed;
    for (const b of this.bodies) {
      if (b.sleeping) continue;
      const lin = b.inContact ? linContact : linDamp;
      b.vx = b.vx * lin + gx;
      b.vy = b.vy * lin + gy;
      b.omega *= b.inContact ? angContact : angDamp;
      const v2 = b.vx * b.vx + b.vy * b.vy;
      if (v2 > maxV2) {
        const k = cfg.maxSpeed / Math.sqrt(v2);
        b.vx *= k;
        b.vy *= k;
      }
    }
  }

  private warmStart(): void {
    for (const c of this.active) {
      const px = c.normalImpulse * c.nx + c.tangentImpulse * c.tx;
      const py = c.normalImpulse * c.ny + c.tangentImpulse * c.ty;
      const a = c.a;
      const b = c.b;
      if (a && c.mA > 0) {
        a.vx -= px * c.mA;
        a.vy -= py * c.mA;
        a.omega -= c.iA * (c.rax * py - c.ray * px);
      }
      if (c.mB > 0) {
        b.vx += px * c.mB;
        b.vy += py * c.mB;
        b.omega += c.iB * (c.rbx * py - c.rby * px);
      }
    }
  }

  private solve(h: number, soft: Soft, staticSoft: Soft, useBias: boolean): void {
    const { friction, pushMaxVelocity } = this.cfg;
    const invH = 1 / h;
    for (const c of this.active) {
      const a = c.a;
      const b = c.b;
      const { nx, ny, tx, ty, rax, ray, rbx, rby, mA, iA, mB, iB } = c;
      const s0 = c.isStatic ? staticSoft : soft;

      let vax = 0;
      let vay = 0;
      let wa = 0;
      let dpx = b.x - b.lastX;
      let dpy = b.y - b.lastY;
      let grow = b.radius - b.stepRadius;
      if (a) {
        vax = a.vx;
        vay = a.vy;
        wa = a.omega;
        dpx -= a.x - a.lastX;
        dpy -= a.y - a.lastY;
        grow += a.radius - a.stepRadius;
      }
      let vbx = b.vx;
      let vby = b.vy;
      let wb = b.omega;

      // ---- normal
      const s = dpx * nx + dpy * ny + c.separation - grow;
      let bias = 0;
      let massScale = 1;
      let impulseScale = 0;
      if (s > 0) {
        bias = s * invH; // speculative: may close the gap, but not cross it
      } else if (useBias) {
        bias = Math.max(s0.biasRate * s, -pushMaxVelocity);
        massScale = s0.massScale;
        impulseScale = s0.impulseScale;
      }
      let dvx = vbx - wb * rby - (vax - wa * ray);
      let dvy = vby + wb * rbx - (vay + wa * rax);
      const vn = dvx * nx + dvy * ny;
      let impulse = -c.normalMass * massScale * (vn + bias) - impulseScale * c.normalImpulse;
      const newImpulse = Math.max(c.normalImpulse + impulse, 0);
      impulse = newImpulse - c.normalImpulse;
      c.normalImpulse = newImpulse;
      if (impulse > c.maxNormalImpulse) c.maxNormalImpulse = impulse;
      let px = impulse * nx;
      let py = impulse * ny;
      vax -= mA * px;
      vay -= mA * py;
      wa -= iA * (rax * py - ray * px);
      vbx += mB * px;
      vby += mB * py;
      wb += iB * (rbx * py - rby * px);

      // ---- friction
      dvx = vbx - wb * rby - (vax - wa * ray);
      dvy = vby + wb * rbx - (vay + wa * rax);
      const vt = dvx * tx + dvy * ty;
      const maxF = friction * c.normalImpulse;
      let ft = c.tangentImpulse - c.tangentMass * vt;
      ft = ft < -maxF ? -maxF : ft > maxF ? maxF : ft;
      impulse = ft - c.tangentImpulse;
      c.tangentImpulse = ft;
      px = impulse * tx;
      py = impulse * ty;
      vax -= mA * px;
      vay -= mA * py;
      wa -= iA * (rax * py - ray * px);
      vbx += mB * px;
      vby += mB * py;
      wb += iB * (rbx * py - rby * px);

      if (a && mA > 0) {
        a.vx = vax;
        a.vy = vay;
        a.omega = wa;
      }
      if (mB > 0) {
        b.vx = vbx;
        b.vy = vby;
        b.omega = wb;
      }
    }
  }

  private integratePositions(h: number): void {
    for (const b of this.bodies) {
      if (b.sleeping) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.angle += b.omega * h;
      if (b.radius < b.targetRadius) b.radius = Math.min(b.targetRadius, b.radius + b.growSpeed * h);
    }
  }

  /**
   * Each body's hardest hit this step: the closing speed measured before solving, for the
   * contacts that really pushed (speculative ones that never closed don't count).
   */
  private recordImpacts(): void {
    for (const c of this.active) {
      const speed = -c.relativeVelocity;
      if (speed <= 0 || c.maxNormalImpulse === 0) continue;
      if (speed > c.b.impact) c.b.impact = speed;
      if (c.a && speed > c.a.impact) c.a.impact = speed;
    }
  }

  private applyRestitution(): void {
    const { restitution, restitutionThreshold } = this.cfg;
    if (restitution === 0) return;
    for (const c of this.active) {
      if (c.relativeVelocity > -restitutionThreshold || c.maxNormalImpulse === 0) continue;
      const a = c.a;
      const b = c.b;
      let dvx = b.vx - b.omega * c.rby;
      let dvy = b.vy + b.omega * c.rbx;
      if (a) {
        dvx -= a.vx - a.omega * c.ray;
        dvy -= a.vy + a.omega * c.rax;
      }
      const vn = dvx * c.nx + dvy * c.ny;
      let impulse = -c.normalMass * (vn + restitution * c.relativeVelocity);
      const newImpulse = Math.max(c.normalImpulse + impulse, 0);
      impulse = newImpulse - c.normalImpulse;
      c.normalImpulse = newImpulse;
      if (impulse > c.maxNormalImpulse) c.maxNormalImpulse = impulse;
      const px = impulse * c.nx;
      const py = impulse * c.ny;
      if (a && c.mA > 0) {
        a.vx -= c.mA * px;
        a.vy -= c.mA * py;
        a.omega -= c.iA * (c.rax * py - c.ray * px);
      }
      if (c.mB > 0) {
        b.vx += c.mB * px;
        b.vy += c.mB * py;
        b.omega += c.iB * (c.rbx * py - c.rby * px);
      }
    }
  }

  // ---------------------------------------------------------------- end of step

  /** Final safety net: nothing may ever end a step outside the box. */
  private clampToBounds(): void {
    const w = this.bounds.width;
    const h = this.bounds.height;
    const top = this.lidY ?? this.bounds.ceiling;
    for (const b of this.bodies) {
      if (b.sleeping) continue;
      const r = b.radius;
      if (b.x < r) {
        b.x = r;
        if (b.vx < 0) b.vx = 0;
      } else if (b.x > w - r) {
        b.x = w - r;
        if (b.vx > 0) b.vx = 0;
      }
      if (b.y > h - r) {
        b.y = h - r;
        if (b.vy > 0) b.vy = 0;
      } else if (b.y < top + r) {
        b.y = top + r;
        if (b.vy < 0) b.vy = 0;
      }
    }
  }

  private collectTouching(): void {
    const t = this.touching;
    t.length = 0;
    const slop = this.cfg.touchSlop;
    for (const c of this.active) {
      const a = c.a;
      if (!a) continue;
      const b = c.b;
      const rs = a.radius + b.radius + slop;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy <= rs * rs) t.push(a, b);
    }
  }

  /**
   * Union-find over touching awake bodies; a whole group sleeps once every member has been
   * still for `sleepTime` *and* is properly held up. A body held up by just one ball is at
   * best balanced on a hump, and the slightest offset must still let it roll off.
   */
  private updateSleep(dt: number): void {
    const { sleepSpeed, sleepTime } = this.cfg;
    const awake: Body<T>[] = [];
    const index = new Map<Body<T>, number>();
    for (const b of this.bodies) {
      if (b.sleeping) continue;
      const moved = Math.hypot(b.x - b.lastX, b.y - b.lastY);
      const spun = Math.abs(b.angle - b.lastAngle) * b.radius;
      b.motion = Math.max(moved, spun) / dt;
      index.set(b, awake.length);
      awake.push(b);
    }
    if (awake.length === 0) return;

    const held = this.heldUp(awake, index);
    for (let i = 0; i < awake.length; i++) {
      const b = awake[i];
      if (!b.growing && held[i] && b.motion < sleepSpeed) b.sleepTimer += dt;
      else b.sleepTimer = 0;
    }

    const parent = awake.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const t = this.touching;
    for (let i = 0; i < t.length; i += 2) {
      const ia = index.get(t[i]);
      const ib = index.get(t[i + 1]);
      if (ia === undefined || ib === undefined) continue;
      parent[find(ia)] = find(ib);
    }

    const minTimer = new Array<number>(awake.length).fill(Infinity);
    for (let i = 0; i < awake.length; i++) {
      const r = find(i);
      minTimer[r] = Math.min(minTimer[r], awake[i].sleepTimer);
    }
    for (let i = 0; i < awake.length; i++) {
      if (minTimer[find(i)] >= sleepTime) this.sleep(awake[i]);
    }
  }

  /**
   * Which awake bodies can be in a stable rest. A circle touching just one other circle can
   * only balance with that contact exactly underneath, and even then the slightest nudge
   * rolls it off, so it needs the floor or at least two contacts (a dip between two balls, a
   * ball and a wall, or neighbours leaning on it in a pile). Contacts are counted by touch
   * rather than force, so the answer doesn't flicker between substeps.
   */
  private heldUp(awake: Body<T>[], index: Map<Body<T>, number>): boolean[] {
    const g = Math.hypot(this.gravityX, this.gravityY);
    if (g < 1e-6) return awake.map(() => true);
    const ux = -this.gravityX / g;
    const uy = -this.gravityY / g;
    const touching = new Array<number>(awake.length).fill(0);
    const grounded = new Array<boolean>(awake.length).fill(false);
    const slop = this.cfg.touchSlop;
    for (const c of this.active) {
      if (c.separation > slop) continue;
      const ib = index.get(c.b);
      if (ib !== undefined) {
        // a wall pushing straight up against gravity is a floor
        if (c.a === null && c.nx * ux + c.ny * uy > 0.5) grounded[ib] = true;
        touching[ib]++;
      }
      const ia = c.a ? index.get(c.a) : undefined;
      if (ia !== undefined) touching[ia]++;
    }
    return awake.map((_, i) => grounded[i] || touching[i] >= 2);
  }

  private sleep(b: Body<T>): void {
    b.sleeping = true;
    b.motion = 0;
    b.vx = b.vy = b.omega = 0;
  }

  private wake(b: Body<T>): void {
    if (!b.sleeping) return;
    b.sleeping = false;
    b.sleepTimer = 0;
  }

  /** Wake every sleeping body connected (by touch) to the seeds. */
  private wakeFlood(seeds: Body<T>[]): void {
    const stack = seeds.slice();
    const reach = this.cfg.touchSlop + this.cfg.speculativeDistance;
    while (stack.length > 0) {
      const s = stack.pop()!;
      for (const o of this.bodies) {
        if (!o.sleeping || o === s) continue;
        const rs = s.radius + o.radius + reach;
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        if (dx * dx + dy * dy <= rs * rs) {
          this.wake(o);
          stack.push(o);
        }
      }
    }
  }
}
