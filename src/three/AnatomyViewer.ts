import { Box3, Color, Sphere, Vector3, type Material, type MeshStandardMaterial } from 'three'
import { isShoulderGirdleJoint, SHOULDER_GIRDLE_JOINTS } from '../data/shoulderGirdle'
import { findJointDef } from '../data/joints'
import {
  applyOrbitEuler,
  applyViewPreset,
  createScene,
  dollyCamera,
  frameTarget,
  resizeScene,
  setBackground,
  setCameraKind,
  settleTrackball,
  type BackgroundId,
  type CameraKind,
  type SceneBundle,
  type ViewPreset,
} from './createScene'
import {
  applyBoneMaterial,
  collectBoneMeshes,
  loadBodyGltf,
  type BoneMesh,
} from './loadSkeleton'
import { cloneShadedBoneMaterial, updateBoneShade } from './boneShade'
import {
  eulerFromOffset,
  OrthoGimbal,
  rotateOffsetAroundAxis,
  WORLD_AXIS,
} from './orthoGimbal'
import { poseSkeletonFromPhoto } from './poseFromPhoto'
import {
  applyPose,
  buildSkeletonRig,
  capturePose,
  clampJointTranslation,
  driveShoulderGirdle,
  resetRigPose,
  type PoseMap,
  type RigJoint,
  type SkeletonRig,
} from './poseRig'
import {
  cellFromEuler,
  clampDivisions,
  eulerFromCell,
  formatCell,
  linearIndex,
  randomCell,
  stepCell,
  type GimbalAxis,
  type OrbitEuler,
  type ViewCell,
  type ViewGrid,
} from './viewGrid'

export interface BoneInfo {
  meshName: string
  zh: string
  latin: string
  jointId: string
  jointZh: string
}

export interface PracticeState {
  active: boolean
  girdleOnly: boolean
  gimbalVisible: boolean
  grid: ViewGrid
  cell: ViewCell
  euler: OrbitEuler
  linear: number
  total: number
  token: string
}

export interface ViewerCallbacks {
  onProgress?: (ratio: number) => void
  onReady?: () => void
  onError?: (message: string) => void
  onSelect?: (info: BoneInfo | null) => void
  onJointSelect?: (jointId: string | null) => void
  onPractice?: (state: PracticeState) => void
}

const HIGHLIGHT = new Color('#c45c26')
const _box = new Box3()
const _sphere = new Sphere()
const _offset = new Vector3()
const _up = new Vector3()
const _center = new Vector3()

export class AnatomyViewer {
  private bundle: SceneBundle
  private container: HTMLElement
  private rig: SkeletonRig | null = null
  private raf = 0
  private highlighted: BoneMesh | null = null
  private isolated = false
  private dragging = false
  private selectedJointId: string | null = null
  private boneMaterial: MeshStandardMaterial | null = null
  private disposed = false
  private readonly callbacks: ViewerCallbacks
  private pointerStart = { x: 0, y: 0 }
  private resizeObserver: ResizeObserver
  private readonly onResize: () => void
  private readonly onPointerDown: (event: PointerEvent) => void
  private readonly onPointerMove: (event: PointerEvent) => void
  private readonly onPointerUp: (event: PointerEvent) => void
  private readonly gimbal = new OrthoGimbal()
  private practice = false
  private girdleOnly = false
  private gimbalVisible = true
  private grid: ViewGrid = { n: 8, m: 8, k: 4 }
  private euler: OrbitEuler = { yaw: 0, pitch: 0, roll: 0 }
  private gimbalHeld = false
  private gimbalMoved = false
  private pendingHit: { axis: GimbalAxis; tick: number | null } | null = null
  private girdleRadius = 0.2
  private canvasDown = false

  constructor(container: HTMLElement, callbacks: ViewerCallbacks = {}) {
    this.container = container
    this.callbacks = callbacks
    this.bundle = createScene(container)
    this.bundle.scene.add(this.gimbal.group)
    this.gimbal.setGrid(this.grid)
    this.bundle.transform.addEventListener('dragging-changed', (event) => {
      this.dragging = Boolean(event.value)
      this.bundle.orbit.enabled = !event.value && !this.gimbalHeld
      if (!event.value) {
        this.clampActiveJoint()
        this.driveShoulderIfNeeded()
      }
    })
    this.bundle.transform.addEventListener('objectChange', () => {
      this.clampActiveJoint()
      this.driveShoulderIfNeeded()
    })

    this.onResize = () => {
      resizeScene(this.bundle, this.container.clientWidth, this.container.clientHeight)
    }
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    this.onPointerDown = (event) => this.handlePointerDown(event)
    this.onPointerMove = (event) => this.handlePointerMove(event)
    this.onPointerUp = (event) => this.handlePointerUp(event)
    window.addEventListener('resize', this.onResize)
    this.bundle.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    this.loop()
    void this.load()
  }

  get jointList() {
    if (!this.rig) return []
    return [...this.rig.joints.values()].map((j) => ({
      id: j.def.id,
      labelZh: j.def.labelZh,
      labelLa: j.def.labelLa,
      allowTranslate: Boolean(j.def.allowTranslate),
    }))
  }

  get selectedJoint() {
    return this.selectedJointId
  }

  get practiceState(): PracticeState {
    const cell = cellFromEuler(this.grid, this.euler)
    const total = this.grid.n * this.grid.m * this.grid.k
    return {
      active: this.practice,
      girdleOnly: this.girdleOnly,
      gimbalVisible: this.gimbalVisible,
      grid: { ...this.grid },
      cell,
      euler: { ...this.euler },
      linear: linearIndex(this.grid, cell),
      total,
      token: formatCell(cell),
    }
  }

  private async load(): Promise<void> {
    try {
      const model = await loadBodyGltf(
        `${import.meta.env.BASE_URL}models/body.glb`,
        this.callbacks.onProgress,
      )
      if (this.disposed) return
      const bones = collectBoneMeshes(model)
      this.boneMaterial = applyBoneMaterial(bones)
      this.rig = buildSkeletonRig(bones, this.boneMaterial)
      this.bundle.scene.add(this.rig.root)
      frameTarget(this.bundle, new Vector3(0, 0, 0), this.rig.height)
      applyViewPreset(this.bundle, 'threeQuarter', Math.max(this.rig.height * 1.6, 1.4))
      this.callbacks.onReady?.()
      this.emitPractice()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.callbacks.onError?.(message)
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    if (this.gimbal.group.visible) this.gimbal.setCenter(this.bundle.orbit.target)
    this.syncBoneShade?.()
    this.bundle.orbit.update()
    this.bundle.renderer.render(this.bundle.scene, this.bundle.camera)
  }

  private handlePointerDown(event: PointerEvent): void {
    this.canvasDown = true
    this.pointerStart = { x: event.clientX, y: event.clientY }
    if (event.button !== 0 || this.dragging) return
    if (!this.practice || !this.gimbal.group.visible) return
    const hit = this.gimbal.hitTest(event, this.bundle.renderer.domElement, this.bundle.camera)
    if (!hit) return
    if (!this.gimbal.beginDrag(event, this.bundle.renderer.domElement, hit.axis)) {
      return
    }
    this.gimbalHeld = true
    this.gimbalMoved = false
    this.pendingHit = hit
    this.bundle.orbit.enabled = false
    this.bundle.renderer.domElement.style.cursor = 'grabbing'
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.gimbalHeld) {
      const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y)
      if (moved > 4) this.gimbalMoved = true
      const delta = this.gimbal.dragDelta(event, this.bundle.renderer.domElement, this.bundle.camera)
      if (delta) this.applyAxisDelta(delta.axis, delta.delta)
      return
    }
    if (!this.practice || this.dragging || !this.gimbal.group.visible) return
    const hit = this.gimbal.hitTest(event, this.bundle.renderer.domElement, this.bundle.camera)
    this.gimbal.setHovered(hit?.axis ?? null)
    this.bundle.renderer.domElement.style.cursor = hit ? 'grab' : ''
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.gimbalHeld) {
      const hit = this.pendingHit
      const moved = this.gimbalMoved
      this.gimbal.endDrag()
      this.gimbalHeld = false
      this.pendingHit = null
      this.canvasDown = false
      this.bundle.orbit.enabled = !this.dragging
      this.bundle.renderer.domElement.style.cursor = ''
      this.gimbal.setHovered(null)
      if (!moved && hit?.tick != null) this.snapAxis(hit.axis, hit.tick)
      this.emitPractice()
      return
    }
    const fromCanvas = this.canvasDown
    this.canvasDown = false
    if (!fromCanvas || this.dragging || event.button !== 0) return
    if (this.bundle.transform.axis) return
    const moved = Math.hypot(
      event.clientX - this.pointerStart.x,
      event.clientY - this.pointerStart.y,
    )
    if (moved > 6) return
    const canvas = this.bundle.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    const dx = event.clientX - rect.left
    const dy = event.clientY - rect.top
    if (dx < 0 || dy < 0 || dx > rect.width || dy > rect.height) return

    this.bundle.pointer.set((dx / rect.width) * 2 - 1, -(dy / rect.height) * 2 + 1)
    this.bundle.raycaster.setFromCamera(this.bundle.pointer, this.bundle.camera)
    const bones = this.rig?.bones.filter((b) => b.visible) ?? []
    const hits = this.bundle.raycaster.intersectObjects(bones, false)
    if (hits.length === 0) {
      this.selectMesh(null)
      return
    }
    const mesh = hits[0].object as BoneMesh
    this.selectMesh(mesh)
  }

  selectMesh(mesh: BoneMesh | null): void {
    this.clearHighlight()
    this.highlighted = mesh
    if (!mesh || !this.rig) {
      this.selectedJointId = null
      this.bundle.transform.detach()
      this.callbacks.onSelect?.(null)
      this.callbacks.onJointSelect?.(null)
      return
    }

    const base = this.boneMaterial
    if (!base) return
    const highlightMat = cloneShadedBoneMaterial(base)
    highlightMat.emissive.copy(HIGHLIGHT)
    highlightMat.emissiveIntensity = 0.42
    mesh.material = highlightMat

    const jointId = mesh.userData.jointId ?? null
    this.selectedJointId = jointId
    if (jointId) this.attachGizmo(jointId)

    const def = findJointDef(jointId ?? '')
    this.callbacks.onSelect?.({
      meshName: mesh.name,
      zh: def?.labelZh ?? mesh.name,
      latin: def?.labelLa ?? mesh.name,
      jointId: jointId ?? '',
      jointZh: def?.labelZh ?? '',
    })
    this.callbacks.onJointSelect?.(jointId)
  }

  selectJoint(id: string): void {
    if (!this.rig) return
    const joint = this.rig.joints.get(id)
    if (!joint) return
    const mesh = joint.bones.find((b) => b.visible) ?? joint.bones[0] ?? null
    if (mesh) this.selectMesh(mesh)
    else {
      this.selectedJointId = id
      this.attachGizmo(id)
      this.callbacks.onJointSelect?.(id)
    }
  }

  setGizmoMode(mode: 'rotate' | 'translate'): void {
    const joint = this.activeJoint()
    if (mode === 'translate' && !joint?.def.allowTranslate) return
    this.bundle.transform.setMode(mode)
  }

  setCameraKind(kind: CameraKind): void {
    setCameraKind(this.bundle, kind)
    this.onResize()
  }

  setBackground(id: BackgroundId): void {
    setBackground(this.bundle, id)
  }

  setView(preset: ViewPreset): void {
    const dist = this.practice
      ? this.bundle.camera.position.distanceTo(this.bundle.orbit.target)
      : this.rig
        ? Math.max(this.rig.height * 1.6, 1.4)
        : 2
    applyViewPreset(this.bundle, preset, dist)
    if (this.practice) this.syncEulerFromCamera()
  }

  zoomIn(): void {
    dollyCamera(this.bundle, true)
  }

  zoomOut(): void {
    dollyCamera(this.bundle, false)
  }

  resetPose(): void {
    if (!this.rig) return
    resetRigPose(this.rig)
  }

  exportPose(): PoseMap | null {
    if (!this.rig) return null
    return capturePose(this.rig)
  }

  importPose(pose: PoseMap): void {
    if (!this.rig) return
    applyPose(this.rig, pose)
  }

  async poseFromPhoto(file: File): Promise<void> {
    if (!this.rig) throw new Error('骨骼尚未加载完成')
    await poseSkeletonFromPhoto(this.rig, file)
  }

  hideSelected(): void {
    if (!this.highlighted) return
    this.highlighted.visible = false
    this.selectMesh(null)
  }

  isolateSelected(): void {
    if (!this.highlighted || !this.rig) return
    this.isolated = true
    this.applyVisibility()
  }

  showAll(): void {
    this.isolated = false
    this.applyVisibility()
  }

  get isIsolated(): boolean {
    return this.isolated
  }

  setPracticeMode(on: boolean): void {
    this.practice = on
    this.applyGimbalVisibility()
    if (on) {
      this.girdleOnly = true
      this.isolated = false
      this.selectMesh(null)
      this.applyVisibility()
      this.euler = { yaw: 0, pitch: 0, roll: 0 }
      this.framePractice()
    } else {
      this.girdleOnly = false
      this.isolated = false
      this.applyVisibility()
      this.bundle.renderer.domElement.style.cursor = ''
      this.gimbal.setHovered(null)
      if (this.rig) {
        frameTarget(this.bundle, new Vector3(0, 0, 0), this.rig.height)
        applyViewPreset(this.bundle, 'threeQuarter', Math.max(this.rig.height * 1.6, 1.4))
      }
    }
    this.emitPractice()
  }

  setGimbalVisible(on: boolean): void {
    this.gimbalVisible = on
    this.applyGimbalVisibility()
    this.emitPractice()
  }

  setGirdleOnly(on: boolean): void {
    this.girdleOnly = on
    if (on) this.isolated = false
    this.applyVisibility()
    if (this.practice) this.framePractice(false)
    this.emitPractice()
  }

  setDivisions(n: number, m: number, k: number): void {
    this.grid = {
      n: clampDivisions(n),
      m: clampDivisions(m),
      k: clampDivisions(k),
    }
    this.gimbal.setGrid(this.grid)
    this.gimbal.setEuler(this.euler)
    this.emitPractice()
  }

  goToCell(cell: ViewCell): void {
    this.euler = eulerFromCell(this.grid, {
      i: ((cell.i % this.grid.n) + this.grid.n) % this.grid.n,
      j: ((cell.j % this.grid.m) + this.grid.m) % this.grid.m,
      l: ((cell.l % this.grid.k) + this.grid.k) % this.grid.k,
    })
    applyOrbitEuler(this.bundle, this.euler)
    this.gimbal.setEuler(this.euler)
    this.emitPractice()
  }

  snapToGrid(): void {
    this.goToCell(cellFromEuler(this.grid, this.euler))
  }

  stepPractice(delta: number): void {
    this.goToCell(stepCell(this.grid, cellFromEuler(this.grid, this.euler), delta))
  }

  randomPractice(): void {
    this.goToCell(randomCell(this.grid, cellFromEuler(this.grid, this.euler)))
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    window.removeEventListener('resize', this.onResize)
    this.bundle.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.gimbal.dispose()
    this.bundle.transform.dispose()
    this.bundle.orbit.dispose()
    this.bundle.renderer.dispose()
    this.bundle.renderer.domElement.remove()
  }

  private syncBoneShade(): void {
    if (!this.boneMaterial || !this.rig) return
    _box.makeEmpty()
    const thorax = this.rig.joints.get('thorax')
    const sternum = this.rig.joints.get('sternum')
    if (thorax) {
      for (const bone of thorax.bones) _box.expandByObject(bone)
    }
    if (sternum) {
      for (const bone of sternum.bones) _box.expandByObject(bone)
    }
    if (_box.isEmpty()) {
      _center.copy(this.bundle.orbit.target)
      _sphere.radius = this.girdleRadius
    } else {
      _box.getCenter(_center)
      _box.getBoundingSphere(_sphere)
    }
    updateBoneShade(
      this.boneMaterial,
      this.bundle.camera,
      this.bundle.orbit.target,
      _center,
      Math.max(_sphere.radius, this.girdleRadius, 0.06),
    )
  }

  private applyAxisDelta(axis: GimbalAxis, delta: number): void {
    _offset.copy(this.bundle.camera.position).sub(this.bundle.orbit.target)
    _up.copy(this.bundle.camera.up)
    rotateOffsetAroundAxis(_offset, _up, WORLD_AXIS[axis], delta)
    this.bundle.camera.position.copy(this.bundle.orbit.target).add(_offset)
    this.bundle.camera.up.copy(_up)
    this.bundle.camera.lookAt(this.bundle.orbit.target)
    settleTrackball(this.bundle.orbit)
    this.bundle.orbit.update()
    this.syncEulerFromCamera(false)
    this.emitPractice()
  }

  private snapAxis(axis: GimbalAxis, tick: number): void {
    const next = { ...this.euler }
    if (axis === 'y') next.yaw = eulerFromCell(this.grid, { i: tick, j: 0, l: 0 }).yaw
    else if (axis === 'x') next.pitch = eulerFromCell(this.grid, { i: 0, j: tick, l: 0 }).pitch
    else next.roll = eulerFromCell(this.grid, { i: 0, j: 0, l: tick }).roll
    this.euler = next
    applyOrbitEuler(this.bundle, this.euler)
    this.gimbal.setEuler(this.euler)
    this.emitPractice()
  }

  private syncEulerFromCamera(emit = true): void {
    _offset.copy(this.bundle.camera.position).sub(this.bundle.orbit.target)
    this.euler = eulerFromOffset(_offset, this.bundle.camera.up)
    this.gimbal.setEuler(this.euler)
    if (emit) this.emitPractice()
  }

  private framePractice(resetView = true): void {
    if (!this.rig) return
    _box.makeEmpty()
    for (const id of SHOULDER_GIRDLE_JOINTS) {
      const joint = this.rig.joints.get(id)
      if (!joint) continue
      for (const bone of joint.bones) _box.expandByObject(bone)
    }
    if (_box.isEmpty()) return
    _box.getCenter(_center)
    _box.getBoundingSphere(_sphere)
    this.girdleRadius = Math.max(_sphere.radius, 0.05)
    this.bundle.orbit.target.copy(_center)
    this.bundle.orbit.minDistance = this.girdleRadius * 0.3
    this.bundle.orbit.maxDistance = this.girdleRadius * 20
    this.gimbal.setCenter(_center)
    this.gimbal.setRadius(this.girdleRadius * 1.22)
    const dist = Math.max(this.girdleRadius * 2.55, 0.4)
    if (resetView) applyOrbitEuler(this.bundle, this.euler, dist)
    else {
      applyOrbitEuler(this.bundle, this.euler)
      this.gimbal.setEuler(this.euler)
    }
  }

  private applyVisibility(): void {
    if (!this.rig) return
    const keep = this.isolated ? this.highlighted?.uuid : null
    for (const bone of this.rig.bones) {
      if (keep) {
        bone.visible = bone.uuid === keep
        continue
      }
      if (this.girdleOnly) {
        bone.visible = isShoulderGirdleJoint(bone.userData.jointId)
        continue
      }
      bone.visible = true
    }
  }

  private applyGimbalVisibility(): void {
    const show = this.practice && this.gimbalVisible
    this.gimbal.group.visible = show
    this.bundle.orbit.noRotate = show
    if (!show) {
      this.bundle.renderer.domElement.style.cursor = ''
      this.gimbal.setHovered(null)
    }
  }

  private emitPractice(): void {
    this.callbacks.onPractice?.(this.practiceState)
  }

  private activeJoint(): RigJoint | undefined {
    if (!this.rig || !this.selectedJointId) return undefined
    return this.rig.joints.get(this.selectedJointId)
  }

  private attachGizmo(jointId: string): void {
    const joint = this.rig?.joints.get(jointId)
    if (!joint) return
    this.bundle.transform.attach(joint.node)
    const keepTranslate =
      this.bundle.transform.mode === 'translate' && Boolean(joint.def.allowTranslate)
    this.bundle.transform.setMode(keepTranslate ? 'translate' : 'rotate')
    this.bundle.transform.showX = true
    this.bundle.transform.showY = true
    this.bundle.transform.showZ = true
  }

  private clampActiveJoint(): void {
    const joint = this.activeJoint()
    if (!joint || !this.rig) return
    clampJointTranslation(joint, this.rig.translateLimit)
  }

  private driveShoulderIfNeeded(): void {
    if (!this.rig) return
    const id = this.selectedJointId
    if (id === 'humerus_L') driveShoulderGirdle(this.rig, 'L')
    else if (id === 'humerus_R') driveShoulderGirdle(this.rig, 'R')
  }

  private clearHighlight(): void {
    if (!this.highlighted) return
    const original = this.boneMaterial
    if (original) {
      const current = this.highlighted.material
      if (current !== original && !Array.isArray(current)) {
        ;(current as Material).dispose()
      }
      this.highlighted.material = original
    }
    this.highlighted = null
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function readJsonFile(file: File): Promise<PoseMap> {
  return file.text().then((text) => JSON.parse(text) as PoseMap)
}
