import {
  Color,
  Vector3,
  type Material,
  type MeshStandardMaterial,
} from 'three'
import { chineseBoneName, latinBoneName } from '../data/boneNames'
import { findJointDef } from '../data/joints'
import {
  applyViewPreset,
  createScene,
  frameTarget,
  resizeScene,
  setBackground,
  setCameraKind,
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
import {
  applyPose,
  buildSkeletonRig,
  capturePose,
  clampJointTranslation,
  resetRigPose,
  type PoseMap,
  type RigJoint,
  type SkeletonRig,
} from './poseRig'

export interface BoneInfo {
  meshName: string
  zh: string
  latin: string
  jointId: string
  jointZh: string
}

export interface ViewerCallbacks {
  onProgress?: (ratio: number) => void
  onReady?: () => void
  onError?: (message: string) => void
  onSelect?: (info: BoneInfo | null) => void
  onJointSelect?: (jointId: string | null) => void
}

const HIGHLIGHT = new Color('#c45c26')

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
  private readonly onPointerUp: (event: PointerEvent) => void

  constructor(container: HTMLElement, callbacks: ViewerCallbacks = {}) {
    this.container = container
    this.callbacks = callbacks
    this.bundle = createScene(container)
    this.bundle.transform.addEventListener('dragging-changed', (event) => {
      this.dragging = Boolean(event.value)
      if (!event.value) this.clampActiveJoint()
    })
    this.bundle.transform.addEventListener('objectChange', () => this.clampActiveJoint())

    this.onResize = () => {
      resizeScene(this.bundle, this.container.clientWidth, this.container.clientHeight)
    }
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    this.onPointerDown = (event) => {
      this.pointerStart = { x: event.clientX, y: event.clientY }
    }
    this.onPointerUp = (event) => this.handlePointerUp(event)
    window.addEventListener('resize', this.onResize)
    this.bundle.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.bundle.renderer.domElement.addEventListener('pointerup', this.onPointerUp)

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

  private async load(): Promise<void> {
    try {
      const model = await loadBodyGltf(
        `${import.meta.env.BASE_URL}models/body.glb`,
        this.callbacks.onProgress,
      )
      if (this.disposed) return
      const bones = collectBoneMeshes(model)
      this.boneMaterial = applyBoneMaterial(bones)
      this.rig = buildSkeletonRig(bones)
      this.bundle.scene.add(this.rig.root)
      frameTarget(this.bundle, new Vector3(0, 0, 0), this.rig.height)
      applyViewPreset(this.bundle, 'threeQuarter', Math.max(this.rig.height * 1.6, 1.4))
      this.callbacks.onReady?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.callbacks.onError?.(message)
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    this.bundle.orbit.update()
    this.bundle.renderer.render(this.bundle.scene, this.bundle.camera)
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.dragging || event.button !== 0) return
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
    const highlightMat = base.clone()
    highlightMat.emissive.copy(HIGHLIGHT)
    highlightMat.emissiveIntensity = 0.42
    mesh.material = highlightMat

    const jointId = mesh.userData.jointId ?? null
    this.selectedJointId = jointId
    if (jointId) this.attachGizmo(jointId)

    this.callbacks.onSelect?.({
      meshName: mesh.name,
      zh: chineseBoneName(mesh.name),
      latin: latinBoneName(mesh.name),
      jointId: jointId ?? '',
      jointZh: findJointDef(jointId ?? '')?.labelZh ?? '',
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
    const dist = this.rig ? Math.max(this.rig.height * 1.6, 1.4) : 2
    applyViewPreset(this.bundle, preset, dist)
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

  hideSelected(): void {
    if (!this.highlighted) return
    this.highlighted.visible = false
    this.selectMesh(null)
  }

  isolateSelected(): void {
    if (!this.highlighted || !this.rig) return
    this.isolated = true
    const keep = this.highlighted.uuid
    for (const bone of this.rig.bones) {
      bone.visible = bone.uuid === keep
    }
  }

  showAll(): void {
    if (!this.rig) return
    this.isolated = false
    for (const bone of this.rig.bones) bone.visible = true
  }

  get isIsolated(): boolean {
    return this.isolated
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    window.removeEventListener('resize', this.onResize)
    this.bundle.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.bundle.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.bundle.transform.dispose()
    this.bundle.orbit.dispose()
    this.bundle.renderer.dispose()
    this.bundle.renderer.domElement.remove()
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
