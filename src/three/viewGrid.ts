const TAU = Math.PI * 2

export type GimbalAxis = 'x' | 'y' | 'z'

export interface ViewGrid {
  n: number
  m: number
  k: number
}

export interface ViewCell {
  i: number
  j: number
  l: number
}

export interface OrbitEuler {
  yaw: number
  pitch: number
  roll: number
}

export const VIEW_GRID_MIN = 1
export const VIEW_GRID_MAX = 24

export function clampDivisions(count: number): number {
  if (!Number.isFinite(count)) return 1
  return Math.min(VIEW_GRID_MAX, Math.max(VIEW_GRID_MIN, Math.round(count)))
}

export function wrapTau(rad: number): number {
  return ((rad % TAU) + TAU) % TAU
}

export function angleForIndex(index: number, count: number): number {
  const n = Math.max(1, count)
  if (n === 1) return 0
  return (TAU * (((index % n) + n) % n)) / n
}

export function indexFromAngle(rad: number, count: number): number {
  const n = Math.max(1, count)
  if (n === 1) return 0
  return Math.round(wrapTau(rad) / TAU * n) % n
}

export function eulerFromCell(grid: ViewGrid, cell: ViewCell): OrbitEuler {
  return {
    yaw: angleForIndex(cell.i, grid.n),
    pitch: angleForIndex(cell.j, grid.m),
    roll: angleForIndex(cell.l, grid.k),
  }
}

export function cellFromEuler(grid: ViewGrid, euler: OrbitEuler): ViewCell {
  return {
    i: indexFromAngle(euler.yaw, grid.n),
    j: indexFromAngle(euler.pitch, grid.m),
    l: indexFromAngle(euler.roll, grid.k),
  }
}

export function wrapIndex(index: number, count: number): number {
  const n = Math.max(1, count)
  return ((index % n) + n) % n
}

export function cellCount(grid: ViewGrid): number {
  return Math.max(1, grid.n) * Math.max(1, grid.m) * Math.max(1, grid.k)
}

export function linearIndex(grid: ViewGrid, cell: ViewCell): number {
  const n = Math.max(1, grid.n)
  const m = Math.max(1, grid.m)
  const i = wrapIndex(cell.i, n)
  const j = wrapIndex(cell.j, m)
  const l = wrapIndex(cell.l, grid.k)
  return l * n * m + j * n + i
}

export function cellFromLinear(grid: ViewGrid, index: number): ViewCell {
  const n = Math.max(1, grid.n)
  const m = Math.max(1, grid.m)
  const total = cellCount(grid)
  const idx = wrapIndex(index, total)
  const l = Math.floor(idx / (n * m))
  const rem = idx % (n * m)
  return {
    i: rem % n,
    j: Math.floor(rem / n),
    l,
  }
}

export function stepCell(grid: ViewGrid, cell: ViewCell, delta: number): ViewCell {
  return cellFromLinear(grid, linearIndex(grid, cell) + delta)
}

export function randomCell(grid: ViewGrid, current?: ViewCell): ViewCell {
  const total = cellCount(grid)
  if (total <= 1) return cellFromLinear(grid, 0)
  const now = current ? linearIndex(grid, current) : -1
  let next = Math.floor(Math.random() * total)
  if (next === now) next = (next + 1) % total
  return cellFromLinear(grid, next)
}

export function parseCellToken(raw: string, grid: ViewGrid): ViewCell | null {
  const parts = raw
    .trim()
    .split(/[,xX*/\s-]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length !== 3) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((v) => !Number.isFinite(v))) return null
  const [a, b, c] = nums.map((v) => Math.round(v))
  const oneBased = a >= 1 && b >= 1 && c >= 1
  const i = oneBased ? a - 1 : a
  const j = oneBased ? b - 1 : b
  const l = oneBased ? c - 1 : c
  if (i < 0 || i >= grid.n || j < 0 || j >= grid.m || l < 0 || l >= grid.k) return null
  return { i, j, l }
}

export function formatCell(cell: ViewCell): string {
  return `${cell.i + 1},${cell.j + 1},${cell.l + 1}`
}
