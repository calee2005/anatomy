<script setup lang="ts">
import type { BoneInfo } from '../three/AnatomyViewer'

defineProps<{
  joints: { id: string; labelZh: string; labelLa: string; allowTranslate: boolean }[]
  selectedJointId: string | null
  bone: BoneInfo | null
  status: string
}>()

const emit = defineEmits<{
  selectJoint: [id: string]
  hide: []
  isolate: []
  showAll: []
  about: [open: boolean]
}>()
</script>

<template>
  <aside class="panel">
    <slot />
    <section>
      <h2>关节</h2>
      <p class="hint">点选整组关节或从列表选择，拖动 gizmo 摆姿势。抬臂时肩胛会跟着动；肩胛可切换「平移肩胛」。</p>
      <ul>
        <li v-for="joint in joints" :key="joint.id">
          <button
            type="button"
            :class="{ on: selectedJointId === joint.id }"
            @click="emit('selectJoint', joint.id)"
          >
            <span>{{ joint.labelZh }}</span>
            <small>{{ joint.labelLa }}</small>
          </button>
        </li>
      </ul>
    </section>

    <section>
      <h2>当前骨骼</h2>
      <template v-if="bone">
        <p class="name">{{ bone.zh }}</p>
        <p class="latin">{{ bone.latin }}</p>
        <div class="actions">
          <button type="button" @click="emit('hide')">隐藏</button>
          <button type="button" @click="emit('isolate')">只看这块</button>
          <button type="button" @click="emit('showAll')">显示全部</button>
        </div>
      </template>
      <p v-else class="hint">点击模型上的关节查看名称。</p>
    </section>

    <p class="status">{{ status }}</p>
    <button type="button" class="about-btn" @click="emit('about', true)">关于 / 许可</button>
  </aside>
</template>

<style scoped>
.panel {
  width: 280px;
  flex: 0 0 280px;
  background: #16171c;
  border-left: 1px solid #2a2c34;
  color: #d2cec6;
  padding: 12px 12px 16px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h2 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 650;
  color: #f0ece3;
  letter-spacing: 0.04em;
}

.hint,
.meta,
.status,
.latin {
  margin: 0;
  font-size: 12px;
  color: #8f8a82;
  line-height: 1.45;
}

ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

li button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  text-align: left;
  border: 0;
  background: transparent;
  color: #d7d3cc;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font: 13px/1.2 inherit;
}

li button small {
  color: #6f6b66;
  font-size: 10px;
}

li button:hover,
li button.on {
  background: #2a2c34;
}

li button.on {
  color: #e7f0d8;
}

.name {
  margin: 0 0 4px;
  font-size: 16px;
  color: #f6f1e8;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.actions button,
.about-btn {
  border: 0;
  background: #2a2c34;
  color: #ece7de;
  border-radius: 6px;
  padding: 6px 8px;
  font: 12px inherit;
  cursor: pointer;
}

.about-btn {
  margin-top: auto;
}

.status {
  min-height: 1.4em;
}
</style>
