# 艺用骨骼 3D 参考

在线使用：[https://calee2005.github.io/anatomy/](https://calee2005.github.io/anatomy/)

本地网页工具：观察、点选、摆人体骨骼姿势，当作画画时的第二屏参考。

第一版只开放**骨骼**。肌肉网格仍在模型文件里，暂不显示。顶栏可在**男性 / 女性**骨骼之间切换：男性为 Z-Anatomy 原模型；女性在同一套网格上按两性骨骼比例变形（更宽骨盆、更窄肩带、膝外翻、头骨略小），方便艺用对照。

## 运行

```bash
npm install
npm run dev
```

浏览器打开终端里提示的地址（默认 `http://localhost:5173`）。

操作：

- 左键拖动：球形轨道旋转（可越过头顶、在三个正交面上转）；Shift / 右键 / 中键拖动：平移画面；滚轮或顶栏「拉近 / 推远」：缩放
- 点击关节：整组高亮并显示中文 / 拉丁名（胸廓、头骨等已按艺用单元合并；下颌单独可动）
- 出现坐标轴后拖动：旋转该关节。抬臂时肩胛和锁骨会跟着动；肩胛可切到「平移肩胛」
- 顶栏：男/女骨骼、前/侧/后/顶/3-4 视角、透视/正交、深/灰/白背景
- 重置姿势、保存 / 读取 JSON 姿势文件
- 从照片：上传一张全身或大半身参考图，自动摆出大致姿势后再手动微调

## 模型与许可

程序代码为 MIT。三维网格来自：

- BodyParts3D © The Database Center for Life Science（CC BY 4.0）
- [Z-Anatomy](https://www.z-anatomy.com/)（CC BY-SA 4.0）
- 浏览器优化 GLB：[hpfrei/body-anatomy-3d-viewer](https://github.com/hpfrei/body-anatomy-3d-viewer)（CC BY-SA 4.0）

详见 [NOTICE](NOTICE)。

若缺少 `public/models/body.glb`，从上述 hpfrei 仓库的 `public/body.glb` 下载到该路径。

## GitHub Pages

在线地址：[https://calee2005.github.io/anatomy/](https://calee2005.github.io/anatomy/)

推送到 `master` 后由 GitHub Actions 构建 `dist` 并发布。仓库 **Settings → Pages** 的 Source 需选 **GitHub Actions**（不要选 `master` 根目录，否则会去请求 `/src/main.ts` 并 404）。
