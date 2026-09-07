import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

export const BACKGROUNDS = {
  dark: 0x1b1c20,
  gray: 0xb8b8b8,
  white: 0xf4f1ea,
} as const

export type BackgroundId = keyof typeof BACKGROUNDS
export type CameraKind = 'perspective' | 'orthographic'
export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'threeQuarter'

export interface SceneBundle {
  scene: Scene
  renderer: WebGLRenderer
  persp: PerspectiveCamera
  ortho: OrthographicCamera
  camera: Camera
  orbit: OrbitControls
  transform: TransformControls
  raycaster: Raycaster
  pointer: Vector2
  cameraKind: CameraKind
}

export function createScene(container: HTMLElement): SceneBundle {
  const scene = new Scene()
  scene.background = new Color(BACKGROUNDS.dark)

  const renderer = new WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.appendChild(renderer.domElement)

  const persp = new PerspectiveCamera(
    35,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.01,
    100,
  )
  persp.position.set(1.6, 1.1, 2.2)

  const frustum = 1.2
  const aspect = container.clientWidth / Math.max(container.clientHeight, 1)
  const ortho = new OrthographicCamera(
    -frustum * aspect,
    frustum * aspect,
    frustum,
    -frustum,
    0.01,
    100,
  )
  ortho.position.copy(persp.position)

  scene.add(new AmbientLight(0xffffff, 0.35))
  const hemi = new HemisphereLight(0xf0f4ff, 0x3a2a18, 0.7)
  scene.add(hemi)

  const key = new DirectionalLight(0xfff6e8, 1.15)
  key.position.set(2.4, 4.2, 2.8)
  scene.add(key)

  const fill = new DirectionalLight(0xc9d7ff, 0.45)
  fill.position.set(-3, 1.2, -1.5)
  scene.add(fill)

  const rim = new DirectionalLight(0xffffff, 0.35)
  rim.position.set(0, 2, -4)
  scene.add(rim)

  const orbit = new OrbitControls(persp, renderer.domElement)
  orbit.enableDamping = true
  orbit.dampingFactor = 0.08
  orbit.screenSpacePanning = true
  orbit.minDistance = 0.4
  orbit.maxDistance = 8
  orbit.target.set(0, 0, 0)

  const transform = new TransformControls(persp, renderer.domElement)
  transform.setMode('rotate')
  transform.setSpace('local')
  transform.setSize(0.85)
  scene.add(transform.getHelper())

  transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value
  })

  return {
    scene,
    renderer,
    persp,
    ortho,
    camera: persp,
    orbit,
    transform,
    raycaster: new Raycaster(),
    pointer: new Vector2(),
    cameraKind: 'perspective',
  }
}

export function resizeScene(bundle: SceneBundle, width: number, height: number): void {
  const h = Math.max(height, 1)
  const aspect = width / h
  bundle.persp.aspect = aspect
  bundle.persp.updateProjectionMatrix()

  const frustum = orthoFrustum(bundle)
  bundle.ortho.left = -frustum * aspect
  bundle.ortho.right = frustum * aspect
  bundle.ortho.top = frustum
  bundle.ortho.bottom = -frustum
  bundle.ortho.updateProjectionMatrix()
  bundle.renderer.setSize(width, height)
}

function orthoFrustum(bundle: SceneBundle): number {
  const dist = bundle.ortho.position.distanceTo(bundle.orbit.target)
  return Math.max(dist * 0.35, 0.3)
}

export function setCameraKind(bundle: SceneBundle, kind: CameraKind): void {
  const current = bundle.camera
  const next = kind === 'orthographic' ? bundle.ortho : bundle.persp
  if (current === next) {
    bundle.cameraKind = kind
    return
  }
  next.position.copy(current.position)
  next.quaternion.copy(current.quaternion)
  bundle.camera = next
  bundle.cameraKind = kind
  bundle.orbit.object = next
  bundle.transform.camera = next
  bundle.orbit.update()
  if (kind === 'orthographic') {
    const width = bundle.renderer.domElement.clientWidth
    const height = bundle.renderer.domElement.clientHeight
    resizeScene(bundle, width, height)
  }
}

export function setBackground(bundle: SceneBundle, id: BackgroundId): void {
  bundle.scene.background = new Color(BACKGROUNDS[id])
}

export function applyViewPreset(
  bundle: SceneBundle,
  preset: ViewPreset,
  distance: number,
): void {
  const t = bundle.orbit.target
  const d = distance
  const pos = new Vector3()
  switch (preset) {
    case 'front':
      pos.set(t.x, t.y, t.z + d)
      break
    case 'back':
      pos.set(t.x, t.y, t.z - d)
      break
    case 'left':
      pos.set(t.x + d, t.y, t.z)
      break
    case 'right':
      pos.set(t.x - d, t.y, t.z)
      break
    case 'threeQuarter':
      pos.set(t.x + d * 0.55, t.y + d * 0.18, t.z + d * 0.72)
      break
  }
  bundle.camera.position.copy(pos)
  bundle.orbit.update()
}

export function frameTarget(bundle: SceneBundle, center: Vector3, height: number): void {
  bundle.orbit.target.copy(center)
  const dist = Math.max(height * 1.55, 1.2)
  bundle.camera.position.set(center.x + dist * 0.55, center.y + height * 0.12, center.z + dist)
  bundle.orbit.minDistance = height * 0.2
  bundle.orbit.maxDistance = height * 8
  bundle.orbit.update()
}
