import { stripBlenderSuffix } from './joints'

const ZH_NAMES: Record<string, string> = {
  'Parietal bone': '顶骨',
  'Frontal bone': '额骨',
  'Occipital bone': '枕骨',
  'Sphenoid bone': '蝶骨',
  'Temporal bone': '颞骨',
  'Ethmoid bone': '筛骨',
  'Inferior nasal concha bone': '下鼻甲',
  'Lacrimal bone': '泪骨',
  'Nasal bone': '鼻骨',
  Maxilla: '上颌骨',
  'Palatine bone': '腭骨',
  'Zygomatic bone': '颧骨',
  Mandible: '下颌骨',
  'Hyoid bone': '舌骨',
  'Atlas (C1)': '寰椎 (C1)',
  'Axis (C2)': '枢椎 (C2)',
  Clavicle: '锁骨',
  Scapula: '肩胛骨',
  Humerus: '肱骨',
  Radius: '桡骨',
  Ulna: '尺骨',
  'Hip bone': '髋骨',
  Ilium: '髂骨',
  Ischium: '坐骨',
  Pubis: '耻骨',
  Sacrum: '骶骨',
  Coccyx: '尾骨',
  Femur: '股骨',
  Patella: '髌骨',
  Tibia: '胫骨',
  Fibula: '腓骨',
  'Manubrium of sternum': '胸骨柄',
  'Body of sternum': '胸骨体',
  'Xiphoid process': '剑突',
  Sternum: '胸骨',
  Talus: '距骨',
  Calcaneus: '跟骨',
  'Navicular bone': '足舟骨',
  'Cuboid bone': '骰骨',
  'Medial cuneiform bone': '内侧楔骨',
  'Intermediate cuneiform bone': '中间楔骨',
  'Lateral cuneiform bone': '外侧楔骨',
  Vomer: '犁骨',
  Malleus: '锤骨',
  Incus: '砧骨',
  Stapes: '镫骨',
}

const VERTEBRA = /^Vertebra ([CTL])(\d{1,2})$/i
const RIB = /^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth) rib$/i
const COSTAL = /^Costal cartilage of (.+) rib$/i

const ORDINAL_ZH: Record<string, string> = {
  First: '第1',
  Second: '第2',
  Third: '第3',
  Fourth: '第4',
  Fifth: '第5',
  Sixth: '第6',
  Seventh: '第7',
  Eighth: '第8',
  Ninth: '第9',
  Tenth: '第10',
  Eleventh: '第11',
  Twelfth: '第12',
}

export function latinBoneName(raw: string): string {
  return stripBlenderSuffix(raw)
}

export function chineseBoneName(raw: string): string {
  const name = latinBoneName(raw)
  if (ZH_NAMES[name]) return ZH_NAMES[name]

  const v = name.match(VERTEBRA)
  if (v) {
    const region = v[1].toUpperCase()
    const num = v[2]
    if (region === 'C') return `颈椎 C${num}`
    if (region === 'T') return `胸椎 T${num}`
    if (region === 'L') return `腰椎 L${num}`
  }

  const rib = name.match(RIB)
  if (rib) return `${ORDINAL_ZH[rib[1]] ?? rib[1]}肋`

  const costal = name.match(COSTAL)
  if (costal) {
    const key = costal[1].replace(/^\w/, (c) => c.toUpperCase())
    const ordinal = ORDINAL_ZH[key] ?? costal[1]
    return `${ordinal}肋软骨`
  }

  if (/incisor|canine|premolar|molar|tooth/i.test(name)) {
    return name
      .replace('Upper', '上')
      .replace('Lower', '下')
      .replace('medial incisor', '中切牙')
      .replace('lateral incisor', '侧切牙')
      .replace('canine', '尖牙')
      .replace('first premolar', '第一前磨牙')
      .replace('second premolar', '第二前磨牙')
      .replace('first molar tooth', '第一磨牙')
      .replace('second molar tooth', '第二磨牙')
      .replace('third molar tooth', '第三磨牙')
  }

  if (/phalanx|metacarpal|metatarsal|carpal/i.test(name)) return name

  return name
}
