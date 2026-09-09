import {
  Box3,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type Object3DEventMap,
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { isTinyFragmentName } from '../data/joints'
import { createBoneMaterial } from './boneShade'

export interface BoneMesh extends Mesh {
  userData: {
    type?: string
    name?: string
    nameDetail?: string
    wikiLink?: string
    originalMaterial?: Mesh['material']
    jointId?: string
    [key: string]: unknown
  }
}

const SOFT_NAME = /muscle|tendon|ligament|sheath|aponeurosis|fascia/i

export function isBoneObject(obj: Object3D): obj is BoneMesh {
  if (!(obj as Mesh).isMesh) return false
  const type = obj.userData?.type as string | undefined
  if (type === 'muscle') return false
  if (type === 'bone') return true
  if (SOFT_NAME.test(obj.name)) return false
  return true
}

export function collectBoneMeshes(root: Object3D): BoneMesh[] {
  const bones: BoneMesh[] = []
  root.traverse((child) => {
    if (!isBoneObject(child) || isTinyFragmentName(child.name)) {
      if ((child as Mesh).isMesh) child.visible = false
      return
    }
    bones.push(child)
  })
  return bones
}

/** Drop muscles and other non-bone meshes so sex clones stay small. */
export function pruneNonBoneMeshes(root: Object3D): void {
  const remove: Object3D[] = []
  root.traverse((child) => {
    if (!(child as Mesh).isMesh) return
    if (!isBoneObject(child) || isTinyFragmentName(child.name)) remove.push(child)
  })
  for (const obj of remove) {
    const mesh = obj as Mesh
    mesh.removeFromParent()
    mesh.geometry.dispose()
  }
}

export function cloneBoneGraph(source: Object3D): Object3D {
  const cloned = source.clone(true)
  cloned.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.geometry = mesh.geometry.clone()
  })
  return cloned
}

export function disposeObjectGeometries(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh) mesh.geometry.dispose()
  })
}

export function applyBoneMaterial(bones: BoneMesh[]): MeshStandardMaterial {
  const material = createBoneMaterial()

  for (const bone of bones) {
    bone.userData.originalMaterial = bone.material
    bone.material = material
    bone.castShadow = false
    bone.receiveShadow = false
  }
  return material
}

export function modelBounds(root: Object3D): { box: Box3; size: Vector3; center: Vector3 } {
  const box = new Box3().setFromObject(root)
  return {
    box,
    size: box.getSize(new Vector3()),
    center: box.getCenter(new Vector3()),
  }
}

export function loadBodyGltf(
  url: string,
  onProgress?: (ratio: number) => void,
): Promise<Object3D<Object3DEventMap>> {
  const draco = new DRACOLoader()
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        draco.dispose()
        resolve(gltf.scene)
      },
      (event) => {
        if (event.total) onProgress?.(event.loaded / event.total)
      },
      (err) => {
        draco.dispose()
        reject(err)
      },
    )
  })
}
