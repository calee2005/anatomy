import {
  AmbientLight,
  Color,
  DirectionalLight,
  Euler,
  HemisphereLight,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three'
import type { OrbitEuler } from './viewGrid'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

export const BACKGROUNDS = {
  dark: 0x1b1c20,
  gray: 0xb8b8b8,
  white: 0xf4f1ea,
} as const

export type BackgroundId = keyof typeof BACKGROUNDS
export type CameraKind = 'perspective' | 'orthographic'
export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'threeQuarter'

export interface SceneBundle {
  scene: Scene
  renderer: WebGLRenderer
  persp: PerspectiveCamera
  ortho: OrthographicCamera
  camera: Camera
  orbit: TrackballControls
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

  const orbit = new TrackballControls(persp, renderer.domElement)
  orbit.rotateSpeed = 2.0
  orbit.zoomSpeed = 1.35
  orbit.panSpeed = 0.8
  orbit.dynamicDampingFactor = 0.16
  orbit.minDistance = 0.4
  orbit.maxDistance = 8
  orbit.minZoom = 0.28
  orbit.maxZoom = 12
  orbit.keys = ['', '', '']
  orbit.mouseButtons.LEFT = MOUSE.ROTATE
  orbit.mouseButtons.MIDDLE = MOUSE.PAN
  orbit.mouseButtons.RIGHT = MOUSE.PAN
  orbit.noPan = true
  orbit.target.set(0, 0, 0)
  orbit.handleResize()

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
  bundle.orbit.handleResize()
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
  next.up.copy(current.up)
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
    case 'top':
      pos.set(t.x, t.y + d, t.z)
      break
    case 'threeQuarter':
      pos.set(t.x + d * 0.55, t.y + d * 0.18, t.z + d * 0.72)
      break
  }
  if (preset === 'top') bundle.camera.up.set(0, 0, -1)
  else bundle.camera.up.set(0, 1, 0)
  bundle.camera.position.copy(pos)
  bundle.camera.lookAt(t)
  settleTrackball(bundle.orbit)
  bundle.orbit.update()
}

const DOLLY_STEP = 1.2

type TrackballInternals = TrackballControls & {
  _lastAngle: number
  _moveCurr: Vector2
  _movePrev: Vector2
  _zoomStart: Vector2
  _zoomEnd: Vector2
  _panStart: Vector2
  _panEnd: Vector2
}

export function settleTrackball(orbit: TrackballControls): void {
  const ball = orbit as TrackballInternals
  ball._lastAngle = 0
  ball._movePrev.copy(ball._moveCurr)
  ball._zoomStart.set(0, 0)
  ball._zoomEnd.copy(ball._zoomStart)
  ball._panEnd.copy(ball._panStart)
}

const _panOffset = new Vector3()
const _camRight = new Vector3()
const _camUp = new Vector3()

export function isPanPointerEvent(event: PointerEvent): boolean {
  if (event.pointerType === 'touch') return false
  if (event.button === 1 || event.button === 2) return true
  if (event.button === 0 && (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)) {
    return true
  }
  return false
}

/** Screen-space pan: drag the view with the pointer (works for perspective and orthographic). */
export function panCameraByPixels(bundle: SceneBundle, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  const camera = bundle.camera
  const height = Math.max(bundle.renderer.domElement.clientHeight, 1)
  camera.updateMatrixWorld()
  _camRight.setFromMatrixColumn(camera.matrixWorld, 0)
  _camUp.setFromMatrixColumn(camera.matrixWorld, 1)

  let worldHeight: number
  if (bundle.cameraKind === 'orthographic') {
    worldHeight = (bundle.ortho.top - bundle.ortho.bottom) / Math.max(bundle.ortho.zoom, 1e-6)
  } else {
    const distance = camera.position.distanceTo(bundle.orbit.target)
    const fov = (bundle.persp.fov * Math.PI) / 180
    worldHeight = 2 * Math.tan(fov / 2) * distance
  }

  const pixel = worldHeight / height
  _panOffset.copy(_camRight).multiplyScalar(-dx * pixel)
  _panOffset.addScaledVector(_camUp, dy * pixel)
  camera.position.add(_panOffset)
  bundle.orbit.target.add(_panOffset)
}

export function dollyCamera(bundle: SceneBundle, zoomIn: boolean): void {
  const orbit = bundle.orbit
  if (bundle.cameraKind === 'orthographic') {
    const factor = zoomIn ? DOLLY_STEP : 1 / DOLLY_STEP
    bundle.ortho.zoom = Math.min(
      orbit.maxZoom,
      Math.max(orbit.minZoom, bundle.ortho.zoom * factor),
    )
    bundle.ortho.updateProjectionMatrix()
    orbit.update()
    return
  }

  const eye = new Vector3().subVectors(bundle.camera.position, orbit.target)
  const next = zoomIn ? eye.length() / DOLLY_STEP : eye.length() * DOLLY_STEP
  const clamped = Math.min(orbit.maxDistance, Math.max(orbit.minDistance, next))
  if (clamped < 1e-4) return
  eye.setLength(clamped)
  bundle.camera.position.copy(orbit.target).add(eye)
  orbit.update()
}

const _euler = new Euler()
const _offset = new Vector3()
const _up = new Vector3()

export function applyOrbitEuler(
  bundle: SceneBundle,
  euler: OrbitEuler,
  distance?: number,
): void {
  const target = bundle.orbit.target
  const dist = distance ?? bundle.camera.position.distanceTo(target)
  _euler.set(euler.pitch, euler.yaw, euler.roll, 'YXZ')
  _offset.set(0, 0, dist).applyEuler(_euler)
  _up.set(0, 1, 0).applyEuler(_euler)
  bundle.camera.up.copy(_up)
  bundle.camera.position.copy(target).add(_offset)
  bundle.camera.lookAt(target)
  settleTrackball(bundle.orbit)
  bundle.orbit.update()
}

export function frameTarget(bundle: SceneBundle, center: Vector3, height: number): void {
  bundle.orbit.target.copy(center)
  const dist = Math.max(height * 1.55, 1.2)
  bundle.camera.up.set(0, 1, 0)
  bundle.camera.position.set(center.x + dist * 0.55, center.y + height * 0.12, center.z + dist)
  bundle.orbit.minDistance = height * 0.18
  bundle.orbit.maxDistance = height * 10
  bundle.orbit.minZoom = 0.28
  bundle.orbit.maxZoom = 12
  bundle.orbit.handleResize()
  settleTrackball(bundle.orbit)
  bundle.orbit.update()
}
