import { Box3, Matrix4, Mesh, Vector3, type BufferAttribute, type Object3D } from 'three'
import { JOINT_DEFS, isTinyFragmentName } from '../data/joints'
import type { BodySex } from '../data/bodySex'
import { isBoneObject } from './loadSkeleton'

const _box = new Box3()
const _world = new Vector3()
const _inv = new Matrix4()

/** Height-normalized width scale: 0 at the feet, 1 at the crown. */
const WIDTH_KEYS: readonly [number, number][] = [
  [0.0, 0.98],
  [0.08, 0.98],
  [0.28, 0.92],
  [0.42, 1.04],
  [0.5, 1.18],
  [0.55, 1.2],
  [0.6, 0.96],
  [0.7, 0.9],
  [0.8, 0.84],
  [0.88, 0.9],
  [0.94, 0.93],
  [1.0, 0.92],
]

function lerpKeys(t: number, keys: readonly [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1]
      const [t1, v1] = keys[i]
      const u = (t - t0) / Math.max(t1 - t0, 1e-6)
      return v0 + (v1 - v0) * u
    }
  }
  return keys[keys.length - 1][1]
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

function jointFamily(name: string): string {
  for (const def of JOINT_DEFS) {
    if (def.match(name)) return def.id.replace(/_[LR]$/, '')
  }
  return 'other'
}

function collectMorphMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((child) => {
    if (!isBoneObject(child) || isTinyFragmentName(child.name)) return
    meshes.push(child)
  })
  return meshes
}

function forEachWorldVertex(mesh: Mesh, fn: (world: Vector3) => void): void {
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
  if (!pos) return
  mesh.updateWorldMatrix(true, false)
  for (let i = 0; i < pos.count; i++) {
    _world.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
    fn(_world)
  }
}

function inferPelvisAnterior(meshes: Mesh[], midX: number, pelvisMinY: number, pelvisH: number): number {
  let sumMedial = 0
  let nMedial = 0
  let sumAll = 0
  let nAll = 0
  const yCut = pelvisMinY + pelvisH * 0.35
  for (const mesh of meshes) {
    const family = jointFamily(mesh.name)
    if (family !== 'pelvis' && family !== 'sacrum') continue
    forEachWorldVertex(mesh, (p) => {
      if (p.y > yCut) return
      sumAll += p.z
      nAll++
      if (Math.abs(p.x - midX) < pelvisH * 0.35) {
        sumMedial += p.z
        nMedial++
      }
    })
  }
  if (!nMedial || !nAll) return 1
  const delta = sumMedial / nMedial - sumAll / nAll
  return Math.abs(delta) < 1e-5 ? 1 : Math.sign(delta)
}

/**
 * Z-Anatomy only publishes a male whole-body template. Female is a sexual-
 * dimorphism warp of that mesh for artistic reference (wider pelvis, narrower
 * shoulders, more valgus knees, slightly smaller skull).
 */
export function applyBodySexMorph(root: Object3D, sex: BodySex): void {
  if (sex === 'male') return

  const meshes = collectMorphMeshes(root)
  if (meshes.length === 0) return

  _box.makeEmpty()
  for (const mesh of meshes) _box.expandByObject(mesh)
  const minY = _box.min.y
  const height = Math.max(_box.max.y - _box.min.y, 1e-4)
  const midX = (_box.min.x + _box.max.x) * 0.5
  const midZ = (_box.min.z + _box.max.z) * 0.5

  _box.makeEmpty()
  for (const mesh of meshes) {
    if (jointFamily(mesh.name) === 'skull' || jointFamily(mesh.name) === 'mandible') {
      _box.expandByObject(mesh)
    }
  }
  const skullCenter = _box.isEmpty()
    ? new Vector3(midX, minY + height * 0.95, midZ)
    : _box.getCenter(new Vector3())

  _box.makeEmpty()
  for (const mesh of meshes) {
    if (jointFamily(mesh.name) === 'pelvis' || jointFamily(mesh.name) === 'sacrum') {
      _box.expandByObject(mesh)
    }
  }
  const pelvisMinY = _box.isEmpty() ? minY + height * 0.44 : _box.min.y
  const pelvisMaxY = _box.isEmpty() ? minY + height * 0.58 : _box.max.y
  const pelvisH = Math.max(pelvisMaxY - pelvisMinY, 1e-4)
  const anterior = inferPelvisAnterior(meshes, midX, pelvisMinY, pelvisH)

  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
    if (!pos) continue
    const family = jointFamily(mesh.name)
    mesh.updateWorldMatrix(true, false)
    _inv.copy(mesh.matrixWorld).invert()

    for (let i = 0; i < pos.count; i++) {
      _world.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      morphFemaleVertex(_world, {
        family,
        minY,
        height,
        midX,
        midZ,
        anterior,
        skullCenter,
        pelvisMinY,
        pelvisH,
      })
      _world.applyMatrix4(_inv)
      pos.setXYZ(i, _world.x, _world.y, _world.z)
    }
    pos.needsUpdate = true
    mesh.geometry.computeVertexNormals()
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
  }
}

interface MorphContext {
  family: string
  minY: number
  height: number
  midX: number
  midZ: number
  anterior: number
  skullCenter: Vector3
  pelvisMinY: number
  pelvisH: number
}

function morphFemaleVertex(p: Vector3, ctx: MorphContext): void {
  const t = clamp01((p.y - ctx.minY) / ctx.height)
  let sx = lerpKeys(t, WIDTH_KEYS)

  if (ctx.family === 'clavicle' || ctx.family === 'scapula') {
    sx = 0.8
  } else if (ctx.family === 'humerus' || ctx.family === 'forearm' || ctx.family === 'hand') {
    // Keep the hanging arms under the narrower shoulders; do not flare them
    // with the pelvis just because they occupy the same height.
    sx = 0.82
  } else if (ctx.family === 'pelvis' || ctx.family === 'sacrum') {
    const ty = clamp01((p.y - ctx.pelvisMinY) / ctx.pelvisH)
    const nx = (p.x - ctx.midX) / Math.max(ctx.height * 0.12, 1e-4)
    const anteriorness = clamp01(
      0.5 + (ctx.anterior * (p.z - ctx.midZ)) / Math.max(ctx.height * 0.08, 1e-4),
    )
    const iliacFlare = smoothstep(0.4, 1, ty) * (0.3 + 0.7 * Math.min(1, Math.abs(nx)))
    const pubicArch = (1 - ty) * anteriorness
    const ischial = (1 - ty) * (1 - anteriorness)
    sx = 1.28 + 0.14 * iliacFlare + 0.2 * pubicArch * Math.min(1, Math.abs(nx)) + 0.08 * ischial
    if (ctx.family === 'sacrum') sx = 1.22 - 0.04 * ty
    p.y = ctx.pelvisMinY + (p.y - ctx.pelvisMinY) * (1 - 0.08 * smoothstep(0.35, 1, ty))
  } else if (ctx.family === 'femur') {
    const u = clamp01((t - 0.26) / 0.28)
    sx = 0.9 + 0.34 * u
  } else if (ctx.family === 'shin' || ctx.family === 'foot') {
    sx = 0.9
  } else if (ctx.family === 'skull' || ctx.family === 'mandible') {
    p.sub(ctx.skullCenter)
    p.multiplyScalar(ctx.family === 'mandible' ? 0.92 : 0.95)
    p.add(ctx.skullCenter)
    sx = ctx.family === 'mandible' ? 0.92 : 1
  } else if (ctx.family === 'thorax' || ctx.family === 'sternum') {
    sx = 0.84 + 0.04 * (1 - t)
    p.z = ctx.midZ + (p.z - ctx.midZ) * 0.92
  } else if (ctx.family === 'lumbar' || ctx.family === 'cervical') {
    sx = 0.92
  }

  p.x = ctx.midX + (p.x - ctx.midX) * sx
  p.y = ctx.minY + (p.y - ctx.minY) * 0.97
}
