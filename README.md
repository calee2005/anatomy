# 艺用骨骼 3D 参考

在线使用：[https://calee2005.github.io/anatomy/](https://calee2005.github.io/anatomy/)

本地网页工具：观察、点选、摆人体骨骼姿势，当作画画时的第二屏参考。

第一版只开放**骨骼**。肌肉网格仍在模型文件里，暂不显示。

## 运行

```bash
npm install
npm run dev
```

浏览器打开终端里提示的地址（默认 `http://localhost:5173`）。

操作：

- 左键拖动：旋转视角；右键/中键拖动：平移；滚轮：缩放
- 点击骨头：高亮并显示中文 / 拉丁名
- 出现坐标轴后拖动：旋转该关节（肩胛可切到「平移肩胛」）
- 顶栏：前/侧/后/3-4 视角、透视/正交、深/灰/白背景
- 重置姿势、保存 / 读取 JSON 姿势文件

## 模型与许可

程序代码为 MIT。三维网格来自：

- BodyParts3D © The Database Center for Life Science（CC BY 4.0）
- [Z-Anatomy](https://www.z-anatomy.com/)（CC BY-SA 4.0）
- 浏览器优化 GLB：[hpfrei/body-anatomy-3d-viewer](https://github.com/hpfrei/body-anatomy-3d-viewer)（CC BY-SA 4.0）

详见 [NOTICE](NOTICE)。

若缺少 `public/models/body.glb`，从上述 hpfrei 仓库的 `public/body.glb` 下载到该路径。
