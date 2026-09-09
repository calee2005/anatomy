import {
  Box3,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { JOINT_DEFS, type JointDef, type PivotMode, type Side } from '../data/joints'
import type { BoneMesh } from './loadSkeleton'

export interface PoseJointState {
  qx: number
  qy: number
  qz: number
  qw: number
  x: number
  y: number
  z: number
}

export type PoseMap = Record<string, PoseJointState>

export interface RigJoint {
  def: JointDef
  node: Object3D
  bones: BoneMesh[]
  restQuaternion: Quaternion
  restPosition: Vector3
}

export interface SkeletonRig {
  root: Group
  joints: Map<string, RigJoint>
  bones: BoneMesh[]
  height: number
  translateLimit: number
}

const SCAPULA_FOLLOW = 0.33
const CLAVICLE_FOLLOW = 0.2
const HUMERUS_KEEP = 0.67

const _box = new Box3()
const _size = new Vector3()
const _center = new Vector3()
const _identity = new Quaternion()
const _qRel = new Quaternion()
const _qDrive = new Quaternion()
const _invJoint = new Matrix4()
const _bake = new Matrix4()

function meshSide(mesh: Object3D, midline: number, gap: number): Side {
  _box.setFromObject(mesh)
  _box.getCenter(_center)
  if (_center.x > midline + gap) return 'L'
  if (_center.x < midline - gap) return 'R'
  return 'C'
}

function computePivot(meshes: Object3D[], mode: PivotMode, side: Side): Vector3 {
  _box.makeEmpty()
  for (const mesh of meshes) _box.expandByObject(mesh)
  _box.getCenter(_center)
  _box.getSize(_size)

  const pivot = _center.clone()
  if (mode === 'proximal') {
    pivot.y = _box.max.y
  } else if (mode === 'inferior') {
    pivot.y = _box.min.y
  } else if (mode === 'base') {
    pivot.y = _box.min.y + _size.y * 0.12
  } else if (mode === 'medial') {
    pivot.x = Math.abs(_box.min.x) < Math.abs(_box.max.x) ? _box.min.x : _box.max.x
    if (side === 'L') pivot.x = _box.min.x
    if (side === 'R') pivot.x = _box.max.x
  } else if (mode === 'glenoid') {
    pivot.y = _box.min.y * 0.25 + _box.max.y * 0.75
    pivot.x = side === 'R' ? _box.min.x : _box.max.x
  }
  return pivot
}

function bakeGeometriesToJoint(joint: RigJoint): BufferGeometry[] {
  joint.node.updateWorldMatrix(true, true)
  _invJoint.copy(joint.node.matrixWorld).invert()
  const geos: BufferGeometry[] = []
  for (const bone of joint.bones) {
    bone.updateWorldMatrix(true, false)
    let geo = bone.geometry.clone()
    if (geo.index) {
      const unindexed = geo.toNonIndexed()
      geo.dispose()
      geo = unindexed
    }
    _bake.copy(bone.matrixWorld).premultiply(_invJoint)
    const pos = geo.getAttribute('position')
    const baked = new BufferGeometry()
    baked.setAttribute('position', pos.clone())
    baked.applyMatrix4(_bake)
    baked.computeVertexNormals()
    geo.dispose()
    geos.push(baked)
  }
  return geos
}

function mergeJointMeshes(joint: RigJoint, material: MeshStandardMaterial): BoneMesh[] {
  if (joint.bones.length === 0) return []

  const sources = joint.bones
  const geos = bakeGeometriesToJoint(joint)
  let merged: BufferGeometry | null = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
  if (!merged) {
    merged = geos[0]
    for (let i = 1; i < geos.length; i++) geos[i].dispose()
  } else if (geos.length > 1) {
    for (const geo of geos) geo.dispose()
  }

  merged.computeVertexNormals()
  const mesh = new Mesh(merged, material) as BoneMesh
  mesh.name = joint.def.id
  mesh.userData.jointId = joint.def.id
  mesh.castShadow = false
  mesh.receiveShadow = false

  for (const bone of sources) {
    bone.removeFromParent()
    bone.geometry.dispose()
  }

  joint.node.add(mesh)
  joint.bones = [mesh]
  return [mesh]
}

export function buildSkeletonRig(bones: BoneMesh[], material: MeshStandardMaterial): SkeletonRig {
  const root = new Group()
  root.name = 'SkeletonRig'

  _box.makeEmpty()
  for (const bone of bones) _box.expandByObject(bone)
  const height = Math.max(_box.max.y - _box.min.y, 0.001)
  const midline = (_box.min.x + _box.max.x) / 2
  const gap = Math.max(height * 0.015, (_box.max.x - _box.min.x) * 0.04)

  const claimed = new Set<BoneMesh>()
  const joints = new Map<string, RigJoint>()

  for (const def of JOINT_DEFS) {
    const matches = bones.filter((bone) => {
      if (claimed.has(bone)) return false
      if (!def.match(bone.name)) return false
      if (def.side === 'C') return true
      return meshSide(bone, midline, gap) === def.side
    })

    const node = new Object3D()
    node.name = `joint:${def.id}`
    if (matches.length > 0) {
      const pivot = computePivot(matches, def.pivot, def.side)
      node.position.copy(pivot)
    }
    joints.set(def.id, {
      def,
      node,
      bones: matches,
      restQuaternion: new Quaternion(),
      restPosition: node.position.clone(),
    })
    for (const mesh of matches) claimed.add(mesh)
  }

  for (const def of JOINT_DEFS) {
    const joint = joints.get(def.id)!
    if (def.parent) {
      const parent = joints.get(def.parent)
      if (!parent) throw new Error(`Missing parent joint ${def.parent}`)
      parent.node.attach(joint.node)
    } else {
      root.attach(joint.node)
    }
  }

  for (const joint of joints.values()) {
    for (const bone of joint.bones) {
      bone.userData.jointId = joint.def.id
      joint.node.attach(bone)
    }
  }

  const leftovers = bones.filter((b) => !claimed.has(b))
  const pelvis = joints.get('pelvis')
  if (pelvis) {
    for (const bone of leftovers) {
      bone.userData.jointId = 'pelvis'
      pelvis.node.attach(bone)
      pelvis.bones.push(bone)
    }
  }

  root.updateMatrixWorld(true)

  const worldBox = new Box3().setFromObject(root)
  const worldCenter = worldBox.getCenter(new Vector3())
  root.position.sub(worldCenter)
  root.updateMatrixWorld(true)

  const mergedBones: BoneMesh[] = []
  for (const joint of joints.values()) {
    mergedBones.push(...mergeJointMeshes(joint, material))
    joint.restQuaternion.copy(joint.node.quaternion)
    joint.restPosition.copy(joint.node.position)
  }

  return {
    root,
    joints,
    bones: mergedBones,
    height,
    translateLimit: height * 0.045,
  }
}

export function disposeSkeletonRig(rig: SkeletonRig): void {
  for (const bone of rig.bones) {
    bone.geometry.dispose()
  }
  rig.root.removeFromParent()
}

export function transferPose(from: SkeletonRig, to: SkeletonRig): void {
  for (const [id, src] of from.joints) {
    const dst = to.joints.get(id)
    if (!dst) continue
    _qRel.copy(src.restQuaternion).invert().multiply(src.node.quaternion)
    dst.node.quaternion.copy(dst.restQuaternion).multiply(_qRel)
    if (dst.def.allowTranslate) {
      dst.node.position.set(
        dst.restPosition.x + src.node.position.x - src.restPosition.x,
        dst.restPosition.y + src.node.position.y - src.restPosition.y,
        dst.restPosition.z + src.node.position.z - src.restPosition.z,
      )
      clampJointTranslation(dst, to.translateLimit)
    }
  }
  to.root.updateMatrixWorld(true)
}

export function resetRigPose(rig: SkeletonRig): void {
  for (const joint of rig.joints.values()) {
    joint.node.quaternion.copy(joint.restQuaternion)
    joint.node.position.copy(joint.restPosition)
  }
  rig.root.updateMatrixWorld(true)
}

export function capturePose(rig: SkeletonRig): PoseMap {
  const pose: PoseMap = {}
  for (const [id, joint] of rig.joints) {
    const q = joint.node.quaternion
    const p = joint.node.position
    pose[id] = { qx: q.x, qy: q.y, qz: q.z, qw: q.w, x: p.x, y: p.y, z: p.z }
  }
  return pose
}

export function applyPose(rig: SkeletonRig, pose: PoseMap): void {
  for (const [id, state] of Object.entries(pose)) {
    const joint = rig.joints.get(id)
    if (!joint) continue
    joint.node.quaternion.set(state.qx, state.qy, state.qz, state.qw)
    if (joint.def.allowTranslate) {
      joint.node.position.set(state.x, state.y, state.z)
      clampJointTranslation(joint, rig.translateLimit)
    }
  }
  rig.root.updateMatrixWorld(true)
}

export function clampJointTranslation(joint: RigJoint, limit: number): void {
  if (!joint.def.allowTranslate) return
  const rest = joint.restPosition
  const p = joint.node.position
  p.x = rest.x + Math.min(limit, Math.max(-limit, p.x - rest.x))
  p.y = rest.y + Math.min(limit, Math.max(-limit, p.y - rest.y))
  p.z = rest.z + Math.min(limit * 1.2, Math.max(-limit * 1.2, p.z - rest.z))
}

function humerusRelative(humerus: RigJoint): Quaternion {
  return _qRel.copy(humerus.restQuaternion).invert().multiply(humerus.node.quaternion)
}

function driveFromHumerus(target: RigJoint, qRel: Quaternion, weight: number): void {
  _qDrive.slerpQuaternions(_identity, qRel, weight)
  target.node.quaternion.copy(target.restQuaternion).multiply(_qDrive)
}

export function driveShoulderGirdle(rig: SkeletonRig, side: Side): void {
  if (side === 'C') return
  const humerus = rig.joints.get(`humerus_${side}`)
  const scapula = rig.joints.get(`scapula_${side}`)
  const clavicle = rig.joints.get(`clavicle_${side}`)
  if (!humerus || !scapula || !clavicle) return

  const qRel = humerusRelative(humerus)
  driveFromHumerus(scapula, qRel, SCAPULA_FOLLOW)
  driveFromHumerus(clavicle, qRel, CLAVICLE_FOLLOW)
  rig.root.updateMatrixWorld(true)
}

export function splitShoulderGirdle(rig: SkeletonRig, side: Side): void {
  if (side === 'C') return
  const humerus = rig.joints.get(`humerus_${side}`)
  const scapula = rig.joints.get(`scapula_${side}`)
  const clavicle = rig.joints.get(`clavicle_${side}`)
  if (!humerus || !scapula || !clavicle) return

  const qRel = humerusRelative(humerus).clone()
  driveFromHumerus(scapula, qRel, SCAPULA_FOLLOW)
  driveFromHumerus(clavicle, qRel, CLAVICLE_FOLLOW)
  _qDrive.slerpQuaternions(_identity, qRel, HUMERUS_KEEP)
  humerus.node.quaternion.copy(humerus.restQuaternion).multiply(_qDrive)
  rig.root.updateMatrixWorld(true)
}

export function captureJointWorld(rig: SkeletonRig): {
  position: Map<string, Vector3>
  quaternion: Map<string, Quaternion>
} {
  rig.root.updateMatrixWorld(true)
  const position = new Map<string, Vector3>()
  const quaternion = new Map<string, Quaternion>()
  for (const [id, joint] of rig.joints) {
    position.set(id, joint.node.getWorldPosition(new Vector3()))
    quaternion.set(id, joint.node.getWorldQuaternion(new Quaternion()))
  }
  return { position, quaternion }
}
