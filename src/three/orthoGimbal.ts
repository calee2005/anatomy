import {
  CircleGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from 'three'
import type { GimbalAxis, OrbitEuler, ViewGrid } from './viewGrid'
import { angleForIndex } from './viewGrid'

export const GIMBAL_COLORS: Record<GimbalAxis, string> = {
  x: '#d46565',
  y: '#6fbf7a',
  z: '#6a9ee8',
}

interface AxisVisual {
  axis: GimbalAxis
  worldAxis: Vector3
  ring: Mesh
  pickRing: Mesh
  disc: Mesh
  ticks: Group
  bead: Mesh
}

const _pointer = new Vector2()
const _axis = new Vector3()
const _q = new Quaternion()
const _euler = new Euler()
const _m = new Matrix4()
const _x = new Vector3()
const _y = new Vector3()
const _z = new Vector3()
const _eye = new Vector3()
const _tangent = new Vector3()
const _ndc0 = new Vector3()
const _ndc1 = new Vector3()
const _lastNdc = new Vector2()

function pointerFromEvent(event: PointerEvent, canvas: HTMLElement, out: Vector2): void {
  const rect = canvas.getBoundingClientRect()
  out.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
}

export class OrthoGimbal {
  readonly group = new Group()
  private readonly visuals: AxisVisual[]
  private readonly raycaster = new Raycaster()
  private readonly tickGeo: SphereGeometry
  private readonly beadGeo: SphereGeometry
  private radius = 0.25
  private grid: ViewGrid = { n: 8, m: 8, k: 4 }
  private drag: { axis: GimbalAxis; lastPointer: Vector2 } | null = null

  constructor() {
    this.group.name = 'OrthoGimbal'
    this.tickGeo = new SphereGeometry(1, 10, 8)
    this.beadGeo = new SphereGeometry(1, 12, 10)
    this.visuals = [
      this.makeAxis('x', new Vector3(1, 0, 0), 0, Math.PI / 2),
      this.makeAxis('y', new Vector3(0, 1, 0), Math.PI / 2, 0),
      this.makeAxis('z', new Vector3(0, 0, 1), 0, 0),
    ]
    this.group.visible = false
  }

  get dragging(): boolean {
    return this.drag !== null
  }

  setCenter(center: Vector3): void {
    this.group.position.copy(center)
  }

  setRadius(radius: number): void {
    this.radius = Math.max(radius, 0.04)
    this.layout()
  }

  setGrid(grid: ViewGrid): void {
    this.grid = grid
    this.rebuildTicks()
  }

  setEuler(euler: OrbitEuler): void {
    for (const visual of this.visuals) {
      const angle =
        visual.axis === 'y' ? euler.yaw : visual.axis === 'x' ? euler.pitch : euler.roll
      this.placeOnRing(visual, visual.bead, angle)
    }
  }

  setHovered(axis: GimbalAxis | null): void {
    for (const visual of this.visuals) {
      const hot = visual.axis === axis
      ;(visual.disc.material as MeshBasicMaterial).opacity = hot ? 0.16 : 0.07
      ;(visual.ring.material as MeshBasicMaterial).opacity = hot ? 1 : 0.88
    }
  }

  hitTest(
    event: PointerEvent,
    canvas: HTMLElement,
    camera: Camera,
  ): { axis: GimbalAxis; tick: number | null } | null {
    if (!this.group.visible) return null
    pointerFromEvent(event, canvas, _pointer)
    this.raycaster.setFromCamera(_pointer, camera)
    const ticks = this.visuals.flatMap((v) => v.ticks.children)
    const tickHits = this.raycaster.intersectObjects(ticks, false)
    if (tickHits.length > 0) {
      const obj = tickHits[0].object
      return { axis: obj.userData.axis as GimbalAxis, tick: obj.userData.tick as number }
    }
    const ringHits = this.raycaster.intersectObjects(
      this.visuals.map((v) => v.pickRing),
      false,
    )
    if (ringHits.length > 0) {
      return { axis: ringHits[0].object.userData.axis as GimbalAxis, tick: null }
    }
    return null
  }

  beginDrag(
    event: PointerEvent,
    canvas: HTMLElement,
    axis: GimbalAxis,
  ): boolean {
    pointerFromEvent(event, canvas, _pointer)
    this.drag = { axis, lastPointer: _pointer.clone() }
    this.setHovered(axis)
    return true
  }

  dragDelta(
    event: PointerEvent,
    canvas: HTMLElement,
    camera: Camera,
  ): { axis: GimbalAxis; delta: number } | null {
    if (!this.drag) return null
    pointerFromEvent(event, canvas, _pointer)
    const axis = this.drag.axis
    _axis.copy(this.visuals.find((v) => v.axis === axis)!.worldAxis)
    _eye.subVectors(camera.position, this.group.position)
    if (_eye.lengthSq() < 1e-10) return null
    _eye.normalize()
    _lastNdc.copy(this.drag.lastPointer)
    const dx = _pointer.x - _lastNdc.x
    const dy = _pointer.y - _lastNdc.y
    this.drag.lastPointer.copy(_pointer)
    _tangent.crossVectors(_axis, _eye)
    let delta = 0
    if (_tangent.lengthSq() < 0.04) {
      _ndc0.copy(this.group.position).project(camera)
      const lx = _lastNdc.x - _ndc0.x
      const ly = _lastNdc.y - _ndc0.y
      const cx = _pointer.x - _ndc0.x
      const cy = _pointer.y - _ndc0.y
      const lastLen = Math.hypot(lx, ly)
      const currLen = Math.hypot(cx, cy)
      if (lastLen < 1e-5 || currLen < 1e-5) return null
      const facing = Math.sign(_eye.dot(_axis)) || 1
      delta = -Math.atan2(lx * cy - ly * cx, lx * cx + ly * cy) * facing
    } else {
      _tangent.normalize()
      _ndc0.copy(this.group.position).project(camera)
      _ndc1.copy(this.group.position).addScaledVector(_tangent, this.radius).project(camera)
      const sx = _ndc1.x - _ndc0.x
      const sy = _ndc1.y - _ndc0.y
      const lenSq = sx * sx + sy * sy
      if (lenSq < 1e-10) return null
      delta = -(dx * sx + dy * sy) / lenSq
    }
    if (Math.abs(delta) < 1e-6) return null
    return { axis, delta }
  }

  endDrag(): void {
    this.drag = null
  }

  tickCount(axis: GimbalAxis): number {
    if (axis === 'y') return this.grid.n
    if (axis === 'x') return this.grid.m
    return this.grid.k
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const visual of this.visuals) {
      visual.disc.geometry.dispose()
      visual.ring.geometry.dispose()
      visual.pickRing.geometry.dispose()
      ;(visual.disc.material as MeshBasicMaterial).dispose()
      ;(visual.ring.material as MeshBasicMaterial).dispose()
      ;(visual.pickRing.material as MeshBasicMaterial).dispose()
      ;(visual.bead.material as MeshBasicMaterial).dispose()
      for (const child of visual.ticks.children) {
        ;((child as Mesh).material as MeshBasicMaterial).dispose()
      }
    }
    this.tickGeo.dispose()
    this.beadGeo.dispose()
  }

  private makeAxis(axis: GimbalAxis, worldAxis: Vector3, rotX: number, rotY: number): AxisVisual {
    const color = new Color(GIMBAL_COLORS[axis])
    const disc = new Mesh(
      new CircleGeometry(1, 64),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.07,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    disc.rotation.x = rotX
    disc.rotation.y = rotY
    disc.renderOrder = 2
    disc.userData.axis = axis

    const ring = new Mesh(
      new TorusGeometry(1, 0.018, 10, 96),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false }),
    )
    ring.rotation.copy(disc.rotation)
    ring.renderOrder = 3
    ring.userData.axis = axis

    const pickRing = new Mesh(
      new TorusGeometry(1, 0.07, 8, 64),
      new MeshBasicMaterial({ visible: false }),
    )
    pickRing.rotation.copy(disc.rotation)
    pickRing.userData.axis = axis

    const ticks = new Group()
    ticks.name = `ticks:${axis}`

    const bead = new Mesh(this.beadGeo, new MeshBasicMaterial({ color, depthWrite: false }))
    bead.renderOrder = 4

    this.group.add(disc, ring, pickRing, ticks, bead)
    return { axis, worldAxis: worldAxis.clone(), ring, pickRing, disc, ticks, bead }
  }

  private layout(): void {
    const r = this.radius
    const tube = Math.max(r * 0.018, 0.0035)
    const pickTube = Math.max(tube * 5.5, 0.016)
    for (const visual of this.visuals) {
      visual.disc.scale.setScalar(r * 0.97)
      visual.ring.geometry.dispose()
      visual.ring.geometry = new TorusGeometry(r, tube, 10, 96)
      visual.pickRing.geometry.dispose()
      visual.pickRing.geometry = new TorusGeometry(r, pickTube, 8, 64)
      visual.bead.scale.setScalar(Math.max(r * 0.045, 0.006))
    }
    this.rebuildTicks()
  }

  private rebuildTicks(): void {
    const r = this.radius
    const tickScale = Math.max(r * 0.028, 0.004)
    for (const visual of this.visuals) {
      for (const child of [...visual.ticks.children]) {
        visual.ticks.remove(child)
        ;((child as Mesh).material as MeshBasicMaterial).dispose()
      }
      const count = this.tickCount(visual.axis)
      for (let i = 0; i < count; i++) {
        const tick = new Mesh(
          this.tickGeo,
          new MeshBasicMaterial({
            color: GIMBAL_COLORS[visual.axis],
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
          }),
        )
        tick.scale.setScalar(tickScale)
        tick.userData.axis = visual.axis
        tick.userData.tick = i
        tick.renderOrder = 4
        this.placeOnRing(visual, tick, angleForIndex(i, count))
        visual.ticks.add(tick)
      }
    }
  }

  private placeOnRing(visual: AxisVisual, obj: Object3D, angle: number): void {
    if (visual.axis === 'z') {
      obj.position.set(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius, 0)
      return
    }
    if (visual.axis === 'y') {
      obj.position.set(Math.sin(angle) * this.radius, 0, Math.cos(angle) * this.radius)
      return
    }
    obj.position.set(0, Math.sin(angle) * this.radius, Math.cos(angle) * this.radius)
  }
}

export function rotateOffsetAroundAxis(
  offset: Vector3,
  up: Vector3,
  axis: Vector3,
  delta: number,
): void {
  _q.setFromAxisAngle(axis, delta)
  offset.applyQuaternion(_q)
  up.applyQuaternion(_q)
}

export function eulerFromOffset(offset: Vector3, up: Vector3): OrbitEuler {
  if (offset.lengthSq() < 1e-12) return { yaw: 0, pitch: 0, roll: 0 }
  _z.copy(offset).normalize()
  _y.copy(up).normalize()
  _x.crossVectors(_y, _z)
  if (_x.lengthSq() < 1e-10) {
    return { yaw: 0, pitch: _z.y >= 0 ? Math.PI / 2 : -Math.PI / 2, roll: 0 }
  }
  _x.normalize()
  _y.crossVectors(_z, _x).normalize()
  _m.makeBasis(_x, _y, _z)
  _euler.setFromRotationMatrix(_m, 'YXZ')
  return { pitch: _euler.x, yaw: _euler.y, roll: _euler.z }
}

export const WORLD_AXIS: Record<GimbalAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
}
