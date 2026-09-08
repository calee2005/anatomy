import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { Quaternion, Vector3 } from 'three'
import {
  captureJointWorld,
  resetRigPose,
  splitShoulderGirdle,
  type SkeletonRig,
} from './poseRig'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

const VISIBILITY_MIN = 0.45

const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

const AIM_CHILD: Record<string, string> = {
  pelvis: 'lumbar',
  lumbar: 'thorax',
  thorax: 'cervical',
  cervical: 'skull',
  humerus_L: 'forearm_L',
  humerus_R: 'forearm_R',
  forearm_L: 'hand_L',
  forearm_R: 'hand_R',
  femur_L: 'shin_L',
  femur_R: 'shin_R',
  shin_L: 'foot_L',
  shin_R: 'foot_R',
}

const AIM_ORDER = [
  'pelvis',
  'lumbar',
  'thorax',
  'cervical',
  'skull',
  'femur_L',
  'femur_R',
  'shin_L',
  'shin_R',
  'humerus_L',
  'humerus_R',
] as const

type Landmark = { x: number; y: number; z: number; visibility?: number }

let landmarkerPromise: Promise<PoseLandmarker> | null = null

const _parentWorld = new Quaternion()
const _desiredWorld = new Quaternion()
const _align = new Quaternion()
const _restDir = new Vector3()
const _poseDir = new Vector3()
const _local = new Quaternion()

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error instanceof Event) return '姿势模型加载失败，请检查网络后重试'
  return String(error)
}

function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      const options = {
        runningMode: 'IMAGE' as const,
        numPoses: 1,
      }
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        })
      } catch {
        return PoseLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        })
      }
    })().catch((error: unknown) => {
      landmarkerPromise = null
      throw new Error(errorMessage(error))
    })
  }
  return landmarkerPromise
}

function mpToThree(lm: Landmark): Vector3 {
  return new Vector3(-lm.x, -lm.y, -lm.z)
}

function mix(a: Vector3, b: Vector3, t: number): Vector3 {
  return a.clone().lerp(b, t)
}

function visible(landmarks: Landmark[], index: number): boolean {
  const vis = landmarks[index]?.visibility
  return vis === undefined || vis >= VISIBILITY_MIN
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取这张图片'))
    }
    img.src = url
  })
}

function landmarksToJoints(
  world: Landmark[],
  image: Landmark[],
): Map<string, Vector3> | null {
  const need = [
    LM.leftHip,
    LM.rightHip,
    LM.leftShoulder,
    LM.rightShoulder,
  ] as const
  if (need.some((i) => !world[i] || !visible(image, i))) return null

  const lHip = mpToThree(world[LM.leftHip])
  const rHip = mpToThree(world[LM.rightHip])
  const lSh = mpToThree(world[LM.leftShoulder])
  const rSh = mpToThree(world[LM.rightShoulder])
  const pelvis = mix(lHip, rHip, 0.5)
  const thorax = mix(lSh, rSh, 0.5)

  const detected = new Map<string, Vector3>()
  detected.set('pelvis', pelvis)
  detected.set('thorax', thorax)
  detected.set('lumbar', mix(pelvis, thorax, 0.38))

  const ears =
    world[LM.leftEar] &&
    world[LM.rightEar] &&
    visible(image, LM.leftEar) &&
    visible(image, LM.rightEar)
      ? mix(mpToThree(world[LM.leftEar]), mpToThree(world[LM.rightEar]), 0.5)
      : world[LM.nose] && visible(image, LM.nose)
        ? mpToThree(world[LM.nose])
        : thorax.clone().add(new Vector3(0, 0.25, 0))

  detected.set('skull', ears)
  detected.set('cervical', mix(thorax, ears, 0.45))

  const limb = (id: string, index: number): void => {
    if (world[index] && visible(image, index)) detected.set(id, mpToThree(world[index]))
  }

  limb('humerus_L', LM.leftShoulder)
  limb('humerus_R', LM.rightShoulder)
  limb('forearm_L', LM.leftElbow)
  limb('forearm_R', LM.rightElbow)
  limb('hand_L', LM.leftWrist)
  limb('hand_R', LM.rightWrist)
  limb('femur_L', LM.leftHip)
  limb('femur_R', LM.rightHip)
  limb('shin_L', LM.leftKnee)
  limb('shin_R', LM.rightKnee)
  limb('foot_L', LM.leftAnkle)
  limb('foot_R', LM.rightAnkle)

  return detected
}

function alignDetectedToRest(
  detected: Map<string, Vector3>,
  rest: Map<string, Vector3>,
): void {
  const restPelvis = rest.get('pelvis')
  const detPelvis = detected.get('pelvis')
  const restHead = rest.get('skull')
  const detHead = detected.get('skull')
  if (!restPelvis || !detPelvis || !restHead || !detHead) return

  const restSpan = Math.max(restHead.distanceTo(restPelvis), 1e-4)
  const detSpan = Math.max(detHead.distanceTo(detPelvis), 1e-4)
  const scale = restSpan / detSpan
  for (const pos of detected.values()) {
    pos.sub(detPelvis).multiplyScalar(scale).add(restPelvis)
  }
}

function aimJoint(
  rig: SkeletonRig,
  id: string,
  childId: string,
  restPos: Map<string, Vector3>,
  restQuat: Map<string, Quaternion>,
  detPos: Map<string, Vector3>,
): void {
  const joint = rig.joints.get(id)
  const restFrom = restPos.get(id)
  const restTo = restPos.get(childId)
  const detFrom = detPos.get(id)
  const detTo = detPos.get(childId)
  const restWorldQ = restQuat.get(id)
  if (!joint || !restFrom || !restTo || !detFrom || !detTo || !restWorldQ) return

  _restDir.copy(restTo).sub(restFrom)
  _poseDir.copy(detTo).sub(detFrom)
  const restLen = _restDir.length()
  const poseLen = _poseDir.length()
  if (restLen < 1e-5 || poseLen < 1e-5) return
  if (poseLen < restLen * 0.2 || poseLen > restLen * 2.8) return
  _restDir.multiplyScalar(1 / restLen)
  _poseDir.multiplyScalar(1 / poseLen)
  if (_restDir.dot(_poseDir) > 0.9995) return

  _align.setFromUnitVectors(_restDir, _poseDir)
  _desiredWorld.copy(_align).multiply(restWorldQ)

  if (joint.def.parent) {
    const parent = rig.joints.get(joint.def.parent)
    if (!parent) return
    parent.node.updateWorldMatrix(true, false)
    parent.node.getWorldQuaternion(_parentWorld)
    _local.copy(_parentWorld).invert().multiply(_desiredWorld)
  } else {
    rig.root.updateWorldMatrix(true, false)
    rig.root.getWorldQuaternion(_parentWorld)
    _local.copy(_parentWorld).invert().multiply(_desiredWorld)
  }
  joint.node.quaternion.copy(_local)
  joint.node.updateWorldMatrix(true, true)
}

export async function poseSkeletonFromPhoto(rig: SkeletonRig, file: File): Promise<void> {
  const image = await loadImage(file)
  const landmarker = await getLandmarker()
  const result = landmarker.detect(image)
  const world = result.worldLandmarks[0]
  const landmarks = result.landmarks[0]
  if (!world?.length || !landmarks?.length) {
    throw new Error('照片里没有检测到人体，请换一张全身或大半身图')
  }

  const detected = landmarksToJoints(world, landmarks)
  if (!detected) {
    throw new Error('关键点不够清晰，请换一张更正面或侧面的全身照片')
  }

  resetRigPose(rig)
  const rest = captureJointWorld(rig)
  alignDetectedToRest(detected, rest.position)

  for (const id of AIM_ORDER) {
    const child = AIM_CHILD[id]
    if (child) aimJoint(rig, id, child, rest.position, rest.quaternion, detected)
  }

  splitShoulderGirdle(rig, 'L')
  splitShoulderGirdle(rig, 'R')
}
