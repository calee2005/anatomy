<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import SidePanel from './components/SidePanel.vue'
import Toolbar from './components/Toolbar.vue'
import type { BackgroundId, CameraKind, ViewPreset } from './three/createScene'
import {
  AnatomyViewer,
  downloadJson,
  readJsonFile,
  type BoneInfo,
} from './three/AnatomyViewer'

const viewport = ref<HTMLElement | null>(null)
const viewer = shallowRef<AnatomyViewer | null>(null)
const status = ref('正在加载骨骼模型…')
const progress = ref(0)
const joints = ref<AnatomyViewer['jointList']>([])
const selectedJointId = ref<string | null>(null)
const bone = ref<BoneInfo | null>(null)
const cameraKind = ref<CameraKind>('perspective')
const background = ref<BackgroundId>('dark')
const gizmoMode = ref<'rotate' | 'translate'>('rotate')
const aboutOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)

const canTranslate = ref(false)

onMounted(() => {
  if (!viewport.value) return
  const instance = new AnatomyViewer(viewport.value, {
    onProgress: (ratio) => {
      progress.value = ratio
      status.value = `加载模型 ${Math.round(ratio * 100)}%`
    },
    onReady: () => {
      joints.value = instance.jointList
      status.value = '拖动旋转视角；点选整组关节后拖动坐标轴摆姿势'
    },
    onError: (message) => {
      status.value = `加载失败：${message}`
    },
    onSelect: (info) => {
      bone.value = info
    },
    onJointSelect: (id) => {
      selectedJointId.value = id
      const joint = joints.value.find((item) => item.id === id)
      canTranslate.value = Boolean(joint?.allowTranslate)
      if (!canTranslate.value) {
        gizmoMode.value = 'rotate'
        instance.setGizmoMode('rotate')
      }
    },
  })
  viewer.value = instance
})

onBeforeUnmount(() => {
  viewer.value?.dispose()
})

function onView(preset: ViewPreset) {
  viewer.value?.setView(preset)
}

function onCamera(kind: CameraKind) {
  cameraKind.value = kind
  viewer.value?.setCameraKind(kind)
}

function onBackground(id: BackgroundId) {
  background.value = id
  viewer.value?.setBackground(id)
}

function onGizmo(mode: 'rotate' | 'translate') {
  if (mode === 'translate' && !canTranslate.value) return
  gizmoMode.value = mode
  viewer.value?.setGizmoMode(mode)
}

function onReset() {
  viewer.value?.resetPose()
  status.value = '已恢复解剖姿势'
}

function onSave() {
  const pose = viewer.value?.exportPose()
  if (!pose) return
  downloadJson('skeleton-pose.json', pose)
  status.value = '已下载姿势文件'
}

function onLoad() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const pose = await readJsonFile(file)
    viewer.value?.importPose(pose)
    status.value = `已读取 ${file.name}`
  } catch {
    status.value = '姿势文件无法解析'
  }
}

function onPhoto() {
  photoInput.value?.click()
}

async function onPhotoFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !viewer.value) return
  status.value = '正在从照片估计姿势…'
  try {
    await viewer.value.poseFromPhoto(file)
    status.value = '已按照片摆姿势，可用坐标轴再微调'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    status.value = message
  }
}
</script>

<template>
  <div class="app">
    <Toolbar
      :camera-kind="cameraKind"
      :background="background"
      :gizmo-mode="gizmoMode"
      :can-translate="canTranslate"
      @view="onView"
      @camera="onCamera"
      @background="onBackground"
      @gizmo="onGizmo"
      @zoom-in="viewer?.zoomIn()"
      @zoom-out="viewer?.zoomOut()"
      @reset="onReset"
      @save="onSave"
      @load="onLoad"
      @photo="onPhoto"
    />

    <div class="main">
      <div class="stage">
        <div ref="viewport" class="viewport" />
        <div
          v-if="status.startsWith('正在加载') || status.startsWith('加载模型')"
          class="loading"
        >
          {{ status }}
        </div>
      </div>
      <SidePanel
        :joints="joints"
        :selected-joint-id="selectedJointId"
        :bone="bone"
        :status="status"
        @select-joint="(id) => viewer?.selectJoint(id)"
        @hide="viewer?.hideSelected()"
        @isolate="viewer?.isolateSelected()"
        @show-all="viewer?.showAll()"
        @about="aboutOpen = $event"
      />
    </div>

    <input
      ref="fileInput"
      class="file"
      type="file"
      accept="application/json,.json"
      @change="onFile"
    />
    <input
      ref="photoInput"
      class="file"
      type="file"
      accept="image/*"
      @change="onPhotoFile"
    />

    <div v-if="aboutOpen" class="modal" @click.self="aboutOpen = false">
      <div class="sheet">
        <h2>关于与许可</h2>
        <p>这是一个本地运行的艺用人体骨骼 3D 参考工具：观察、点选、摆大关节姿势。肌肉层尚未开放。</p>
        <p>
          三维模型来自
          <a href="https://www.z-anatomy.com/" target="_blank" rel="noreferrer">Z-Anatomy</a>
          （CC BY-SA 4.0），其数据源自
          BodyParts3D © The Database Center for Life Science（CC BY 4.0）。浏览器优化版由
          <a href="https://github.com/hpfrei/body-anatomy-3d-viewer" target="_blank" rel="noreferrer">hpfrei/body-anatomy-3d-viewer</a>
          处理。
        </p>
        <p>本仓库中的程序代码以 MIT 许可发布；网格资产仍遵循上述原许可，详见 NOTICE。</p>
        <button type="button" @click="aboutOpen = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #111214;
}

.main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.stage {
  flex: 1;
  min-width: 0;
  position: relative;
}

.viewport {
  position: absolute;
  inset: 0;
}

.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #d7d3cc;
  background: #111214;
  z-index: 2;
  font-size: 14px;
}

.file {
  display: none;
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 20;
  padding: 24px;
}

.sheet {
  width: min(520px, 100%);
  background: #1c1d23;
  color: #ddd8d0;
  border-radius: 12px;
  padding: 20px 22px;
  border: 1px solid #32343d;
}

.sheet h2 {
  margin: 0 0 12px;
  font-size: 18px;
  color: #f4efe6;
}

.sheet p {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.55;
}

.sheet a {
  color: #c5d4a4;
}

.sheet button {
  margin-top: 8px;
  border: 0;
  background: #2f313a;
  color: #f4efe6;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}
</style>
