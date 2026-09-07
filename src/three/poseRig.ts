import { Box3, Group, Object3D, Quaternion, Vector3 } from 'three'
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

const _box = new Box3()
const _size = new Vector3()
const _center = new Vector3()

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

export function buildSkeletonRig(bones: BoneMesh[]): SkeletonRig {
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
    joint.restQuaternion.copy(joint.node.quaternion)
    joint.restPosition.copy(joint.node.position)
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

  return {
    root,
    joints,
    bones,
    height,
    translateLimit: height * 0.045,
  }
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
