import { Color, MeshStandardMaterial, Vector3, type Camera } from 'three'

export interface BoneShadeUniforms {
  uCavityCenter: { value: Vector3 }
  uCavityRadius: { value: number }
  uDepthNear: { value: number }
  uDepthFar: { value: number }
}

export function createBoneMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: new Color('#e6d5b8'),
    roughness: 0.58,
    metalness: 0.04,
  })
  attachBoneShade(material, {
    uCavityCenter: { value: new Vector3() },
    uCavityRadius: { value: 0.25 },
    uDepthNear: { value: 0.2 },
    uDepthFar: { value: 1.6 },
  })
  return material
}

export function cloneShadedBoneMaterial(base: MeshStandardMaterial): MeshStandardMaterial {
  const cloned = base.clone()
  const uniforms = base.userData.boneShade as BoneShadeUniforms | undefined
  if (uniforms) attachBoneShade(cloned, uniforms)
  return cloned
}

export function updateBoneShade(
  material: MeshStandardMaterial,
  camera: Camera,
  target: Vector3,
  cavityCenter: Vector3,
  cavityRadius: number,
): void {
  const uniforms = material.userData.boneShade as BoneShadeUniforms | undefined
  if (!uniforms) return
  const radius = Math.max(cavityRadius, 0.06)
  const dist = camera.position.distanceTo(target)
  uniforms.uCavityCenter.value.copy(cavityCenter)
  uniforms.uCavityRadius.value = radius
  uniforms.uDepthNear.value = Math.max(0.02, dist - radius * 0.95)
  uniforms.uDepthFar.value = dist + radius * 0.95
}

function attachBoneShade(material: MeshStandardMaterial, uniforms: BoneShadeUniforms): void {
  material.userData.boneShade = uniforms
  material.customProgramCacheKey = () => 'bone-shade-v1'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCavityCenter = uniforms.uCavityCenter
    shader.uniforms.uCavityRadius = uniforms.uCavityRadius
    shader.uniforms.uDepthNear = uniforms.uDepthNear
    shader.uniforms.uDepthFar = uniforms.uDepthFar

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBoneWorldPos;
varying vec3 vBoneWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vBoneWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vBoneWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBoneWorldPos;
varying vec3 vBoneWorldNormal;
uniform vec3 uCavityCenter;
uniform float uCavityRadius;
uniform float uDepthNear;
uniform float uDepthFar;`,
      )
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
{
  vec3 worldN = normalize(vBoneWorldNormal);
  vec3 fromCenter = vBoneWorldPos - uCavityCenter;
  float cavityDist = length(fromCenter);
  float inCage = 1.0 - smoothstep(uCavityRadius * 0.85, uCavityRadius * 1.55, cavityDist);
  float facingOut = dot(worldN, fromCenter / max(cavityDist, 1e-5));
  float inner = smoothstep(0.25, -0.25, facingOut);
  vec3 outerCol = vec3(1.22, 1.1, 0.92);
  vec3 innerCol = vec3(0.38, 0.52, 0.72);
  outgoingLight *= mix(vec3(1.0), mix(outerCol, innerCol, inner), inCage);
  float depthT = smoothstep(uDepthNear, uDepthFar, vViewPosition.z);
  outgoingLight *= mix(1.28, 0.38, depthT);
}`,
      )
  }
}
