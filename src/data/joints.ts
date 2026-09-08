export type Side = 'L' | 'R' | 'C'

export type PivotMode = 'center' | 'proximal' | 'inferior' | 'medial' | 'glenoid' | 'base'

export interface JointDef {
  id: string
  parent: string | null
  labelZh: string
  labelLa: string
  side: Side
  pivot: PivotMode
  allowTranslate?: boolean
  match: (name: string) => boolean
}

export function stripBlenderSuffix(name: string): string {
  return name
    .replace(/[._]?(\d{3})$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeBoneName(name: string): string {
  return stripBlenderSuffix(name).toLowerCase()
}

function n(name: string): string {
  return normalizeBoneName(name)
}

function isFootName(name: string): boolean {
  return /foot|tarsal|metatarsal|calcaneus|talus|navicular|cuboid|cuneiform|sesamoid/.test(
    n(name),
  )
}

function isHandName(name: string): boolean {
  return /carpal|metacarpal|phalanx|finger|scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate/.test(
    n(name),
  )
}

export function isTinyFragmentName(name: string): boolean {
  const s = n(name)
  return /malleus|incus|stapes/.test(s)
}

export function isMandibleName(name: string): boolean {
  const s = n(name)
  if (s === 'mandible' || s.startsWith('mandible')) return true
  return /^(lower|mandibular)\b/.test(s) && /incisor|canine|premolar|molar|tooth/.test(s)
}

export const JOINT_DEFS: JointDef[] = [
  {
    id: 'pelvis',
    parent: null,
    labelZh: '骨盆',
    labelLa: 'Pelvis',
    side: 'C',
    pivot: 'center',
    match: (name) =>
      /^(hip bone|sacrum|coccyx|ilium|ischium|pubis)$/.test(n(name)),
  },
  {
    id: 'lumbar',
    parent: 'pelvis',
    labelZh: '腰椎',
    labelLa: 'Vertebrae lumbales',
    side: 'C',
    pivot: 'center',
    match: (name) => /vertebra l\d/.test(n(name)),
  },
  {
    id: 'thorax',
    parent: 'lumbar',
    labelZh: '胸廓',
    labelLa: 'Thorax',
    side: 'C',
    pivot: 'base',
    match: (name) => {
      const s = n(name)
      return (
        /vertebra t\d/.test(s) ||
        /rib/.test(s) ||
        /sternum|manubrium|xiphoid/.test(s) ||
        /costal cartilage/.test(s)
      )
    },
  },
  {
    id: 'cervical',
    parent: 'thorax',
    labelZh: '颈椎',
    labelLa: 'Vertebrae cervicales',
    side: 'C',
    pivot: 'center',
    match: (name) => {
      const s = n(name)
      return (
        /vertebra c\d/.test(s) ||
        /atlas \(c1\)|^atlas$/.test(s) ||
        /axis \(c2\)/.test(s) ||
        s === 'hyoid bone' ||
        /laryngeal|thyroid cartilage|cricoid|arytenoid|corniculate/.test(s)
      )
    },
  },
  {
    id: 'clavicle_L',
    parent: 'thorax',
    labelZh: '左锁骨',
    labelLa: 'Clavicula (sin.)',
    side: 'L',
    pivot: 'medial',
    match: (name) => /^clavicle$/.test(n(name)),
  },
  {
    id: 'clavicle_R',
    parent: 'thorax',
    labelZh: '右锁骨',
    labelLa: 'Clavicula (dex.)',
    side: 'R',
    pivot: 'medial',
    match: (name) => /^clavicle$/.test(n(name)),
  },
  {
    id: 'scapula_L',
    parent: 'thorax',
    labelZh: '左肩胛',
    labelLa: 'Scapula (sin.)',
    side: 'L',
    pivot: 'glenoid',
    allowTranslate: true,
    match: (name) => /^scapula$/.test(n(name)),
  },
  {
    id: 'scapula_R',
    parent: 'thorax',
    labelZh: '右肩胛',
    labelLa: 'Scapula (dex.)',
    side: 'R',
    pivot: 'glenoid',
    allowTranslate: true,
    match: (name) => /^scapula$/.test(n(name)),
  },
  {
    id: 'humerus_L',
    parent: 'scapula_L',
    labelZh: '左上臂',
    labelLa: 'Humerus (sin.)',
    side: 'L',
    pivot: 'proximal',
    match: (name) => /^humerus$/.test(n(name)),
  },
  {
    id: 'humerus_R',
    parent: 'scapula_R',
    labelZh: '右上臂',
    labelLa: 'Humerus (dex.)',
    side: 'R',
    pivot: 'proximal',
    match: (name) => /^humerus$/.test(n(name)),
  },
  {
    id: 'forearm_L',
    parent: 'humerus_L',
    labelZh: '左前臂',
    labelLa: 'Antebrachium (sin.)',
    side: 'L',
    pivot: 'proximal',
    match: (name) => /^(radius|ulna)$/.test(n(name)),
  },
  {
    id: 'forearm_R',
    parent: 'humerus_R',
    labelZh: '右前臂',
    labelLa: 'Antebrachium (dex.)',
    side: 'R',
    pivot: 'proximal',
    match: (name) => /^(radius|ulna)$/.test(n(name)),
  },
  {
    id: 'hand_L',
    parent: 'forearm_L',
    labelZh: '左手',
    labelLa: 'Manus (sin.)',
    side: 'L',
    pivot: 'proximal',
    match: (name) => {
      if (isFootName(name)) return false
      return isHandName(name)
    },
  },
  {
    id: 'hand_R',
    parent: 'forearm_R',
    labelZh: '右手',
    labelLa: 'Manus (dex.)',
    side: 'R',
    pivot: 'proximal',
    match: (name) => {
      if (isFootName(name)) return false
      return isHandName(name)
    },
  },
  {
    id: 'femur_L',
    parent: 'pelvis',
    labelZh: '左大腿',
    labelLa: 'Femur (sin.)',
    side: 'L',
    pivot: 'proximal',
    match: (name) => /^(femur|patella)$/.test(n(name)),
  },
  {
    id: 'femur_R',
    parent: 'pelvis',
    labelZh: '右大腿',
    labelLa: 'Femur (dex.)',
    side: 'R',
    pivot: 'proximal',
    match: (name) => /^(femur|patella)$/.test(n(name)),
  },
  {
    id: 'shin_L',
    parent: 'femur_L',
    labelZh: '左小腿',
    labelLa: 'Crus (sin.)',
    side: 'L',
    pivot: 'proximal',
    match: (name) => /^(tibia|fibula)$/.test(n(name)),
  },
  {
    id: 'shin_R',
    parent: 'femur_R',
    labelZh: '右小腿',
    labelLa: 'Crus (dex.)',
    side: 'R',
    pivot: 'proximal',
    match: (name) => /^(tibia|fibula)$/.test(n(name)),
  },
  {
    id: 'foot_L',
    parent: 'shin_L',
    labelZh: '左足',
    labelLa: 'Pes (sin.)',
    side: 'L',
    pivot: 'proximal',
    match: (name) => isFootName(name),
  },
  {
    id: 'foot_R',
    parent: 'shin_R',
    labelZh: '右足',
    labelLa: 'Pes (dex.)',
    side: 'R',
    pivot: 'proximal',
    match: (name) => isFootName(name),
  },
  {
    id: 'skull',
    parent: 'cervical',
    labelZh: '头骨',
    labelLa: 'Cranium',
    side: 'C',
    pivot: 'inferior',
    match: (name) => {
      const s = n(name)
      if (isFootName(name) || isHandName(name) || isMandibleName(name)) return false
      return /bone|maxilla|vomer|concha|incisor|canine|premolar|molar|tooth|nasal/.test(s)
    },
  },
  {
    id: 'mandible',
    parent: 'skull',
    labelZh: '下颌',
    labelLa: 'Mandibula',
    side: 'C',
    pivot: 'proximal',
    match: (name) => isMandibleName(name),
  },
]

export function findJointDef(id: string): JointDef | undefined {
  return JOINT_DEFS.find((d) => d.id === id)
}
