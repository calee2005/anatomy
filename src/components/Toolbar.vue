<script setup lang="ts">
import type { BackgroundId, CameraKind, ViewPreset } from '../three/createScene'
import type { BodySex } from '../data/bodySex'

defineProps<{
  cameraKind: CameraKind
  background: BackgroundId
  gizmoMode: 'rotate' | 'translate'
  canTranslate: boolean
  practice: boolean
  sex: BodySex
}>()

const emit = defineEmits<{
  view: [preset: ViewPreset]
  camera: [kind: CameraKind]
  background: [id: BackgroundId]
  gizmo: [mode: 'rotate' | 'translate']
  zoomIn: []
  zoomOut: []
  reset: []
  save: []
  load: []
  photo: []
  practice: []
  sexChange: [sex: BodySex]
}>()
</script>

<template>
  <header class="bar">
    <div class="brand">
      <strong>艺用骨骼</strong>
      <span>3D 参考</span>
    </div>

    <div class="group">
      <button
        type="button"
        :class="{ on: sex === 'male' }"
        title="男性骨骼"
        :aria-pressed="sex === 'male'"
        @click="emit('sexChange', 'male')"
      >
        男
      </button>
      <button
        type="button"
        :class="{ on: sex === 'female' }"
        title="女性骨骼"
        :aria-pressed="sex === 'female'"
        @click="emit('sexChange', 'female')"
      >
        女
      </button>
    </div>

    <div class="group">
      <button type="button" @click="emit('view', 'front')">前</button>
      <button type="button" @click="emit('view', 'left')">左侧</button>
      <button type="button" @click="emit('view', 'right')">右侧</button>
      <button type="button" @click="emit('view', 'back')">后</button>
      <button type="button" @click="emit('view', 'top')">顶</button>
      <button type="button" @click="emit('view', 'threeQuarter')">3/4</button>
    </div>

    <div class="group">
      <button type="button" :class="{ on: practice }" @click="emit('practice')">
        胸锁练习
      </button>
    </div>

    <div class="group">
      <button type="button" @click="emit('zoomIn')">拉近</button>
      <button type="button" @click="emit('zoomOut')">推远</button>
    </div>

    <div class="group">
      <button
        type="button"
        :class="{ on: cameraKind === 'perspective' }"
        @click="emit('camera', 'perspective')"
      >
        透视
      </button>
      <button
        type="button"
        :class="{ on: cameraKind === 'orthographic' }"
        @click="emit('camera', 'orthographic')"
      >
        正交
      </button>
    </div>

    <div class="group">
      <button
        type="button"
        :class="{ on: background === 'dark' }"
        @click="emit('background', 'dark')"
      >
        深
      </button>
      <button
        type="button"
        :class="{ on: background === 'gray' }"
        @click="emit('background', 'gray')"
      >
        灰
      </button>
      <button
        type="button"
        :class="{ on: background === 'white' }"
        @click="emit('background', 'white')"
      >
        白
      </button>
    </div>

    <div class="group">
      <button
        type="button"
        :class="{ on: gizmoMode === 'rotate' }"
        @click="emit('gizmo', 'rotate')"
      >
        旋转
      </button>
      <button
        type="button"
        :disabled="!canTranslate"
        :class="{ on: gizmoMode === 'translate' }"
        @click="emit('gizmo', 'translate')"
      >
        平移肩胛
      </button>
    </div>

    <div class="group">
      <button type="button" @click="emit('reset')">重置姿势</button>
      <button type="button" @click="emit('save')">保存</button>
      <button type="button" @click="emit('load')">读取</button>
      <button type="button" @click="emit('photo')">从照片</button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 8px 12px;
  background: #121318;
  border-bottom: 1px solid #2a2c34;
  color: #d7d3cc;
  user-select: none;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-right: 8px;
}

.brand strong {
  font-size: 15px;
  font-weight: 650;
  color: #f3efe6;
}

.brand span {
  font-size: 12px;
  color: #8b8680;
}

.group {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: #1b1c22;
  border-radius: 8px;
}

button {
  appearance: none;
  border: 0;
  background: transparent;
  color: #c9c4bb;
  font: 12px/1.2 inherit;
  padding: 6px 9px;
  border-radius: 6px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #2a2c34;
  color: #fff;
}

button.on {
  background: #3d4a3a;
  color: #e7f0d8;
}

button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
