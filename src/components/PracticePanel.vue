<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PracticeState } from '../three/AnatomyViewer'
import { parseCellToken, VIEW_GRID_MAX, VIEW_GRID_MIN } from '../three/viewGrid'

const props = defineProps<{
  practice: PracticeState
}>()

const emit = defineEmits<{
  girdleOnly: [on: boolean]
  gimbalVisible: [on: boolean]
  divisions: [n: number, m: number, k: number]
  go: [i: number, j: number, l: number]
  snap: []
  step: [delta: number]
  random: []
}>()

const token = ref(props.practice.token)
const tokenError = ref('')

watch(
  () => props.practice.token,
  (value) => {
    token.value = value
    tokenError.value = ''
  },
)

const girdleOnly = computed({
  get: () => props.practice.girdleOnly,
  set: (on: boolean) => emit('girdleOnly', on),
})

const gimbalVisible = computed({
  get: () => props.practice.gimbalVisible,
  set: (on: boolean) => emit('gimbalVisible', on),
})

const cells = computed(() => {
  const { n, m } = props.practice.grid
  const list: { i: number; j: number; key: string }[] = []
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      list.push({ i, j, key: `${i}-${j}` })
    }
  }
  return list
})

function onDiv(axis: 'n' | 'm' | 'k', event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  const grid = { ...props.practice.grid, [axis]: value }
  emit('divisions', grid.n, grid.m, grid.k)
}

function onIndex(axis: 'i' | 'j' | 'l', event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return
  const cell = { ...props.practice.cell }
  cell[axis] = Math.round(raw) - 1
  emit('go', cell.i, cell.j, cell.l)
}

function onTokenGo() {
  const cell = parseCellToken(token.value, props.practice.grid)
  if (!cell) {
    tokenError.value = '请输入 1 到 n,m,k 范围内的三个序号，例如 3,2,1'
    return
  }
  tokenError.value = ''
  emit('go', cell.i, cell.j, cell.l)
}

function onK(l: number) {
  emit('go', props.practice.cell.i, props.practice.cell.j, l)
}

function onCell(i: number, j: number) {
  emit('go', i, j, props.practice.cell.l)
}
</script>

<template>
  <section class="practice">
    <h2>胸锁练习</h2>
    <p class="hint">
      绿环水平转（n），红环上下转（m），蓝环画面倾斜（k）。拖动环边旋转；点刻度或下方格子跳到该分段。
    </p>

    <label class="check">
      <input type="checkbox" v-model="girdleOnly" />
      只看胸腔、脊椎、锁骨、肩胛骨
    </label>
    <label class="check">
      <input type="checkbox" v-model="gimbalVisible" />
      显示正交导轨
    </label>

    <div class="row labels">
      <span class="y">n 水平</span>
      <span class="x">m 上下</span>
      <span class="z">k 倾斜</span>
    </div>
    <div class="row">
      <input
        type="number"
        :min="VIEW_GRID_MIN"
        :max="VIEW_GRID_MAX"
        :value="practice.grid.n"
        @change="onDiv('n', $event)"
      />
      <input
        type="number"
        :min="VIEW_GRID_MIN"
        :max="VIEW_GRID_MAX"
        :value="practice.grid.m"
        @change="onDiv('m', $event)"
      />
      <input
        type="number"
        :min="VIEW_GRID_MIN"
        :max="VIEW_GRID_MAX"
        :value="practice.grid.k"
        @change="onDiv('k', $event)"
      />
    </div>

    <p class="meta">当前视角 {{ practice.linear + 1 }} / {{ practice.total }}（序号从 1 起）</p>
    <div class="row">
      <input
        type="number"
        min="1"
        :max="practice.grid.n"
        :value="practice.cell.i + 1"
        @change="onIndex('i', $event)"
      />
      <input
        type="number"
        min="1"
        :max="practice.grid.m"
        :value="practice.cell.j + 1"
        @change="onIndex('j', $event)"
      />
      <input
        type="number"
        min="1"
        :max="practice.grid.k"
        :value="practice.cell.l + 1"
        @change="onIndex('l', $event)"
      />
    </div>

    <div class="token">
      <input
        v-model="token"
        type="text"
        placeholder="例如 3,2,1"
        @keydown.enter="onTokenGo"
      />
      <button type="button" @click="onTokenGo">转到</button>
    </div>
    <p v-if="tokenError" class="error">{{ tokenError }}</p>

    <div class="nav">
      <button type="button" @click="emit('step', -1)">上一视角</button>
      <button type="button" @click="emit('random')">随机视角</button>
      <button type="button" @click="emit('snap')">吸附网格</button>
      <button type="button" @click="emit('step', 1)">下一视角</button>
    </div>

    <p class="meta">倾斜 k</p>
    <div class="krow">
      <button
        v-for="l in practice.grid.k"
        :key="l"
        type="button"
        :class="{ on: practice.cell.l === l - 1 }"
        @click="onK(l - 1)"
      >
        {{ l }}
      </button>
    </div>

    <p class="meta">水平 n × 上下 m</p>
    <div
      class="grid"
      :style="{ gridTemplateColumns: `repeat(${practice.grid.n}, minmax(0, 1fr))` }"
    >
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        :class="{ on: practice.cell.i === cell.i && practice.cell.j === cell.j }"
        :title="`${cell.i + 1},${cell.j + 1},${practice.cell.l + 1}`"
        @click="onCell(cell.i, cell.j)"
      >
        {{ cell.i + 1 }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.practice {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint,
.meta,
.error {
  margin: 0;
  font-size: 12px;
  color: #8f8a82;
  line-height: 1.45;
}

.error {
  color: #c9897a;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #d7d3cc;
}

.row,
.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.token,
.krow {
  display: flex;
  gap: 4px;
}

.row input,
.token input {
  width: 0;
  flex: 1;
  min-width: 0;
  background: #1b1c22;
  border: 1px solid #32343d;
  color: #ece7de;
  border-radius: 6px;
  padding: 6px 8px;
  font: 12px/1.2 inherit;
}

.labels span {
  flex: 1;
  font-size: 11px;
}

.labels .y {
  color: #6fbf7a;
}
.labels .x {
  color: #d46565;
}
.labels .z {
  color: #6a9ee8;
}

button {
  border: 0;
  background: #2a2c34;
  color: #ece7de;
  border-radius: 6px;
  padding: 6px 8px;
  font: 12px inherit;
  cursor: pointer;
}

button:hover,
button.on {
  background: #3d4a3a;
  color: #e7f0d8;
}

.nav button,
.token button {
  flex: 1;
}

.krow {
  flex-wrap: wrap;
}

.krow button {
  min-width: 28px;
}

.grid {
  display: grid;
  gap: 3px;
  max-height: 220px;
  overflow: auto;
}

.grid button {
  padding: 5px 0;
  font-size: 11px;
  border-radius: 4px;
}
</style>
