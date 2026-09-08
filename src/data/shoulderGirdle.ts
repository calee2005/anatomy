export const SHOULDER_GIRDLE_JOINTS = [
  'lumbar',
  'thorax',
  'sternum',
  'cervical',
  'clavicle_L',
  'clavicle_R',
  'scapula_L',
  'scapula_R',
] as const

export type ShoulderGirdleJointId = (typeof SHOULDER_GIRDLE_JOINTS)[number]

export function isShoulderGirdleJoint(id: string | null | undefined): boolean {
  if (!id) return false
  return (SHOULDER_GIRDLE_JOINTS as readonly string[]).includes(id)
}
