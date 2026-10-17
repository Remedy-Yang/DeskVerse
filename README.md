# DeskVerse Studio · 三维桌搭工作台

在浏览器中导入 GLB，校准真实尺寸、移动 / 旋转 / 缩放物品，检查桌面摆放，操作柜门、抽屉和椅子，并导出布局 JSON 或高清效果图。界面采用 Atelier 工作台风格，支持三套主题、二维俯视图和 A/B 独立方案。

**`dist/` 同时是前端源码和交付目录，不是可删除的构建缓存。项目没有 bundler，也不需要构建。** Three.js r180、模型解码器与简体中文 OCR 资源已放入仓库，不依赖 CDN；基础摆放和尺寸图 OCR 可在本机 HTTP 服务下离线使用。

**场景不会自动保存。** 刷新或强制刷新会清空 A/B 物品、尺寸规格和撤销记录。请按需下载 JSON / PNG 并保留原始 GLB；当前没有导入布局 JSON 的界面，下载 JSON 不等于可以自动恢复编辑会话。

## 快速启动

需要 Python 3；本机代理只使用标准库，无需安装 Python 第三方依赖。浏览器推荐启用硬件加速的 Chrome 或 Edge。

Windows：双击 `启动_Windows.bat`，或在仓库根目录运行：

```powershell
py start.py
```

macOS / Linux：

```bash
python3 start.py
```

打开 <http://127.0.0.1:8000>。服务只监听 `127.0.0.1`；终端按 Ctrl+C 停止。端口被占用可使用 `--port 8002`，不自动打开浏览器可加 `--no-browser`，例如 Windows 下运行 `py start.py --port 8002 --no-browser`。

- 不要直接双击 `dist/index.html`，ES 模块和解码器需要 HTTP。
- 运行页面不需要 npm。`npm start` 等价于 `python3 start.py`；Windows 若只有 `py` 启动器，使用上面的 Windows 命令。
- 普通静态 HTTP 服务也能托管 `dist/`，但不提供照片生成接口；照片生成需要 `start.py`。
- 本文以当前仓库 `main` 为准；合并仓库不会自动更新此前的在线演示部署。

## 默认场景与真实尺寸

首次打开自动载入实木上床桌柜、独立椅子和显示器。桌柜交付文件为 `dist/assets/desk-real.glb`，来源是用户提供的 `agentic_0005_pack_glb_model_material_realwood_upper_bed_200x90.glb`；显示器使用 `dist/assets/monitor-real.glb`。

| 项目 | 当前设置 |
| --- | --- |
| 床框 / 固定主体标称尺寸 | 宽 X 200 × 深 Z 90 × 总高 Y 210 cm |
| 桌板 | 离地 76 cm，约宽 X 134.5 × 深 Z 89.5 cm，工作面为世界 Y=0 |
| 地面 | 世界 Y=-76；椅子默认贴地 |
| 显示器 | 宽 X 53.9 × 高 Y 40.7 × 深 Z 16.3 cm，初始放在桌面有效区域 |
| 首屏观察距离 | 560 cm；默认宿舍白天布光，辅助网格关闭 |

床框标称宽深不包含柜门展开、扶梯外伸或独立椅子的总占用范围，不能把整套模型的包围盒重新压成标称尺寸。文件原始最高点约为 249.3 cm，运行时校准到表中的总高，同时保留桌板高度和床框宽深；交付 GLB 的原始字节与嵌入纹理不改写。桌面轮廓、运动部件和世界包围盒以实际模型几何为准。

椅子的命名部件会被提取成独立对象；无需额外导入。`deskmodels/` 中保留旧模型、杯子 / 键盘 / 鼠标素材及商品尺寸图，不会自动载入全部素材；示例台灯和示例显示器可通过「载入示例模型」另行添加。

## 基本工作流程

1. 在资产页导入一个或多个 `.glb`，或将文件拖入页面；通过画布 / 资产列表选中物品。
2. 在属性区输入宽 X、高 Y、深 Z，核对等比选项并确认尺寸。普通导入的自动缩放只是便于观察，不代表实物尺寸已校准。
3. 用底部工具或数值输入摆放物品；右侧二维图可沿 XZ 拖动，保持高度 Y 和尺寸。
4. 核对边界、尺寸和占地冲突提示；这些提示不阻止操作，也不是承重、法规或人体工学认证。
5. 需要对照时切换 A/B 方案；在家具页操作柜门、抽屉、收纳和椅子。
6. 选择光照、观察方向和相机高度，点击「效果图」导出 PNG。需要交接布局时，分别导出各方案 JSON，并同时交付原始 GLB。
7. 更换桌子使用资产页「替换当前桌子 GLB」，不需要先删除固定桌柜。失败保留旧桌，成功后可撤销。

### 操作速查

| 操作 | 使用方法 |
| --- | --- |
| 桌面拖动 | V，直接拖动模型，沿 XZ 移动 |
| 三轴移动（默认） | G，拖动 X/Y/Z 箭头或输入坐标 |
| 旋转 / 缩放 | R / S；属性区可输入角度或真实尺寸 |
| 点击落点 | 底部靶心按钮；悬停查看终点坐标，单击水平桌面 / 架面 / 抽屉底板放置 |
| 环绕 / 平移 / 缩放相机 | 中键拖动 / Shift＋中键或右键拖动 / 滚轮；触屏使用对应手势 |
| 聚焦 / 初始视角 / 俯视 | F / H / T，或画布右上按钮；双击物品也可聚焦 |
| 相机高度 | 底部独立「相机高度」按钮；滑杆或数值输入当前摄像机 Y |
| 删除物品 | Delete / Backspace 或属性区删除；固定桌柜不可直接删除 |
| 撤销 / 重做 | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z，或底部按钮 |
| 吸附 | 属性区主动开启；平移 1 cm、旋转 15°、缩放 0.05，直接拖动只吸附 X/Z |
| 二维图 | 点击或 Enter / Space 选中；拖动移动，Esc 取消；一次拖动一次撤销 |
| 专注 / 窄屏面板 | 顶部「专注」隐藏两侧面板；窄屏用顶部资产 / 属性图标切换互斥面板 |

输入框内的快捷键不会触发三维编辑。物品默认可自由调整 XYZ；开启贴合后，调整 Y 会自动解除贴合，避免高度被锁回桌面。固定桌柜保持 X=0、Z=0，工作面固定为 Y=0；替换桌子才会更换固定资产。

### 视角、相机高度与主题

- **三种视角**：「三维自由」和「透视网格」使用透视相机，后者只替换桌柜材质，其他物品正常着色；「正交俯视」使用真正的正交相机，可缩放、平移与编辑。切回后恢复原材质和阴影。
- **观察与坐姿**：画布右上展开 50–600 cm 控件；透视模式表示观察距离，俯视模式表示短边取景范围。坐姿以实体椅子对齐，按身高估算眼高，支持坐高和前后距离调整；这不是人体测量结果，也不会移动实体椅子。
- **相机高度**：以桌面 Y=0 为基准，不是离地高度。只改变当前摄像机 Y，保留 X/Z、观察点、投影与缩放，不修改模型或布局撤销记录；打开时停止未结束的环绕惯性。支持小数输入，数值随相机同步；俯视高度须高于观察点，改变高度不改变正交画幅。重新调整坐姿参数会重新估算眼高。
- **收起面板**：关闭按钮、点击高度浮层外或 Esc 可收起高度面板；此时 Esc 优先关闭该面板，再继续原有退出坐姿 / 专注等操作。原生照片 / 效果图对话框优先处理自己的 Esc。
- **三套主题**：暖调造物台、暗夜实验室、氰版工程图。主题偏好保存在本机 `localStorage`；存储不可用时仍可在当前页面切换。

### 家具机构与收纳

- 家具页选择左抽屉或右侧下 / 中 / 上层抽屉，再使用按钮、滑杆或单击真实部件开合。左抽屉沿 +Z、右抽屉沿 -X 平移，不缩放部件。
- 抽屉打开至少一半后，可收纳选中物品或点击抽屉底板落点。内腔优先找空位；尺寸超出或重叠时仍允许放入并提醒，不修改物品尺寸。左抽屉模型内腔约宽 X 54.6 × 高 Y 7.4 × 深 Z 52.4 cm；右侧重建托盘按间隙估算，界面及导出标记 `estimated:true`，不冒充商家实测。
- 收纳物品随所属抽屉移动；取回桌面回到 Y=0，手动移出内腔后解除跟随。柜门最大约 130°；关门先自动收回抽屉，拉抽屉时自动开门。运动面板在运行时按开口留缝，避免穿过隔板或床梁。
- 「拉出椅子」设为相对原位沿 +Z 偏移 35 cm；位置滑杆支持 -30 至 +120 cm。独立椅子仍可自由拖动、输入坐标、旋转和缩放。家具操作及收纳支持撤销 / 重做，碰撞仅提醒。

### 摆放检查、尺寸与 A/B 方案

- 桌面使用模型可信水平顶面的边界环，保留弧形凹口、孔洞和分离区域；缺少可信顶面时明确标为估算范围。物品用保守 XZ 投影凸包，凹形或空腔可能误报重叠；部件 OBB 碰撞提醒独立保留，不是三角面精确物理。
- 边界、尺寸、冲突分别判断。未校准尺寸、未知架面和地面范围不会伪装成安全结论；仅边界接触或垂直完全分离不算占地冲突。越界、穿透、路径障碍或收纳超限都不回退用户变换。
- 常见类别参考尺寸、自动扶正 / 翻转、手工尺寸以及商品尺寸图 OCR / 多规格分别保留。参考值属于估算；选择参考不会覆盖商家规格，OCR 候选仍须人工核对。
- B 首次切换时复制 A，之后物品、尺寸 / 校准、家具开合、收纳、规格图与最多 60 条撤销记录各自独立；加载或拖动时不能切换。主题、灯光和相机是共享预览设置，不随方案隔离。
- 替换桌子仅作用于当前方案：先离线解析并准备几何 / 机构，再切换；保留独立椅子和其他物品，解除旧抽屉收纳，已贴面物品跟随新工作面 / 地面，自由物品 XYZ 与尺寸保留。重新载入内置桌柜会复用已有内置显示器和椅子，不重复添加。

## 导出与数据保存

| 导出 | 内容与边界 |
| --- | --- |
| 布局 JSON | 顶部「导出布局」或出图面板「另存布局 JSON」；只包含当前方案及状态，不嵌入 GLB。A/B 需分别导出；当前不支持回导 JSON |
| 效果图 PNG | 16:9；1080p 为 1920×1080，2K 为 2560×1440，4K 为 3840×2160。只保存画面，不能恢复可编辑布局 |

每次打开「效果图」都默认**当前视角**，即使上次选过其他构图也会重置。它沿用当前相机及刚调整的 Y，只按输出比例扩展视野，不强制改成全景；仍可改选正面、左前、右前或正交俯视。预设按可见模型部件收紧 / 居中，不为整柜空角留白，也不把大地板纳入取景。

预览与 PNG 复用当前光照预设、亮度、冷暖、环境、曝光、地板和阴影，不另套导出灯光。辅助网格开关不移除实体地板；地面已扩展到默认相机可见范围之外，保持木纹尺度。出图隐藏 UI、选框、手柄、落点与网格，线框模式暂用原始材质，结束后恢复现场。导出不改变相机、模型、方案或历史；编码失败可重试，尺寸不支持时明确报错，不偷偷降分辨率。

| 数据 | 保存位置 / 刷新后的行为 |
| --- | --- |
| A/B 场景、撤销历史、规格和尺寸图 | 当前浏览器会话；刷新清空，不自动恢复 |
| 主题、照片类别偏好 | 本机 `localStorage`；浏览器禁用存储时可能不能保留 |
| 照片生成任务和生成模型 | 本机 `.deskverse/`；刷新可恢复任务记录，不恢复完整编辑场景 |
| 下载的 JSON / PNG 和原始 GLB | 由用户自行保存；协作交接应同时保留模型与各方案 JSON |

## 可选：照片生成 GLB

此功能需要联网的本机 `start.py` 代理、Rodin API Key 和账户额度；基础摆放、现有 GLB 和本地 OCR 不需要密钥。

Windows 下首次配置：

```powershell
py scripts/configure-rodin.py
py start.py
```

macOS / Linux 将 `py` 换成 `python3`。配置脚本隐藏密钥输入，写入被 Git 忽略的 `.env`；也可使用优先级更高的 `RODIN_API_KEY` 环境变量。配置后重启服务，不把密钥放进前端、命令行参数或 Git；本机文件权限还应按操作系统策略管理。

1. 选择 PNG / JPG / WebP 单物品照片，大小不超过 20 MiB。
2. 核对名称 / 类别，确认云端上传和积分消耗，再提交。当前使用 Rodin Regular / PBR / GLB，不自动启用额外付费选项。
3. 当前标签页提交的任务完成后自动放入当时正在编辑的方案；历史任务可「放入场景」或「下载 GLB」，不会因此重新付费生成。
4. 超时 / 重启不自动重新提交付费任务。提交状态不明时先在 Rodin 控制台核对；同一照片的进行中 / 已完成任务会复用，下载失败仅重试下载。
5. 生成结果不保证类别、朝向、真实尺寸或质量；导入后仍需核对朝向与实物尺寸。

`py scripts/check-rodin.py`（其他平台用 `python3`）只读验证密钥和余额，不上传照片或创建任务。API Key 和任务订阅凭据不返回浏览器。本机代理只供本地使用，不是可直接公网部署的多用户服务；只有明确提交的照片会上传到 Rodin，普通 GLB 及尺寸图 OCR 在本机处理。

## 目录与开发

| 路径 | 用途 |
| --- | --- |
| `dist/index.html`、`dist/app.js`、`dist/style.css`、`dist/feature.css` | 手写前端入口、交互与样式；HTML importmap 直接解析模块 |
| `dist/core.js`、`dist/drawers.js`、`dist/collision.js`、`dist/placement.js` | 尺寸 / 状态、家具机构、部件碰撞与摆放计算 |
| `dist/plan-view.js`、`dist/workspaces.js`、`dist/desk-view.js`、`dist/render-export.js` | 二维图、方案快照、线框和出图 |
| `dist/assets/`、`dist/vendor/` | 必须随仓库交付的 GLB、Three.js / 解码器 / OCR 资源 |
| `deskmodels/` | 原始素材、尺寸图与旧模型备份，不全部自动载入 |
| `start.py`、`rodin_service.py` | 标准库本机 HTTP 服务及可选 Rodin 代理 |
| `scripts/`、`tests/` | 依赖整理、验收工具与 Node / Python 测试 |

开发测试使用 Node.js 与 npm，沿用 `package-lock.json`：

```bash
npm ci
npm test
node scripts/check-static.mjs
```

后端测试为 `npm run test:server`；Windows 若无 `python3` 命令，可运行 `py -B -m unittest discover -s tests -p 'test_*.py'`。只改文档不要求安装依赖或重跑无关测试。

`npm run vendor`、`npm run vendor:ocr` 整理本地浏览器依赖；`node scripts/demo-assets.mjs` 只生成示例 GLB。不要手改 vendor、覆盖用户提供的真实模型，或把 `dist/` 整体忽略。代码 / 文档均通过独立分支和 PR 合入 `main`，协作规则见 [AGENTS.md](AGENTS.md)。

## 资源与功能边界

- 单个 GLB 上限 80 MiB，会话累计载入上限 240 MiB；删除 / 替换后的资源为撤销和 A/B 保留，不能据此认为额度立即释放。
- 支持嵌入几何 / 贴图的 glTF 2.0 GLB，已接入本地 Draco、Meshopt、KTX2；具体压缩资产仍需验收。不加载外部图片 / `.bin`，不播放 GLB 骨骼动画。
- 普通物品导入最大边默认 32 cm，普通桌子默认 140 cm；照片物品按类别参考值初始化，未知类别用通用参考。所有自动参考都不代表真实尺寸已测量。
- 检查是几何辅助，不模拟承重、精确接触动力学或人体工学；没有 PICO / VR 支持。主动开启的贴面 / 吸附仍会按其规则执行，与碰撞不拦截是两回事。

## 集成接口：`window.deskverse`

入口见 [dist/app.js](dist/app.js)，对象状态由同一组 Three.js 对象产生，没有第二套位置数据。以下示例在工作台和模型加载完成后执行：

```js
const api = window.deskverse;
const state = api.getState();
const movable = state.objects.find(object => !object.locked);

if (movable) {
  api.select(movable.id);
  const result = api.setTransform(movable.id, {
    position: [20, 0, -30], // X/Y/Z，厘米
    rotation: [0, 45, 0], // 度，Euler XYZ
    grounded: false // 示例保持自由位置，不自动贴面
  });
  console.log(result.accepted, result.collision);
}

window.addEventListener('deskverse:change', event => {
  console.log(event.detail.workspace, event.detail.objects);
});
```

### 方法与更新规则

| 方法 | 契约 |
| --- | --- |
| `getState()` | 当前方案与全局预览状态的副本；修改返回值不会移动场景 |
| `select(id)` | 选择当前方案对象；`null` 取消选择 |
| `setTransform(id, patch)` | 可传 `position` / `rotation` / `scale` 的三项有限数值数组，以及 `grounded` 布尔值；只作用于可移动对象 |
| `importFiles(files, role='item')` | 异步导入 File 集合；`role='table'` 原子准备并替换当前方案桌子，不必先删除旧桌 |

`setTransform` 对合法输入返回 `{accepted:true,collision}`，重叠也保留变换；不存在的 ID、固定资产、非法输入或加载 / 二维拖动期间按异常通道报错。位置 / 角度绝对值不超过 100000，缩放各项大于 0 且不超过 100000。修改 Y 且未显式指定 `grounded` 时会解除贴面；缩放会清除校准 / 参考尺寸标记。

导入沿用逐文件提示与错误处理；失败保留原桌。加载或二维拖动未结束时，`importFiles` 不执行，`setTransform` 不排队重试。物品编辑、导入、删除、回放和方案切换通过 `deskverse:change` 发布与导出相同结构的状态；相机环绕 / 高度等纯视图变化不保证发出此事件，读取镜头时应主动调用 `getState().view`。没有新增公开的相机 / 出图修改方法。

### 坐标与顶层状态

`schemaVersion:1`，`units:'cm'`；右手系、Y 向上，X 左右、Z 前后。向量统一为 `[X,Y,Z]`，旋转单位为度、顺序 `XYZ`，根节点 pivot 约定为旋转前底部中心。桌面高度与整柜最高点不同；初始参考桌面为 X∈[-70,70]、Z∈[-37.5,37.5]，不能将它当作真实桌板范围。

| 字段 | 含义 |
| --- | --- |
| `coordinateSystem` | 坐标轴、手性、旋转单位 / 顺序及 pivot 约定 |
| `workspace` | `{id:'a'或'b',label}`，当前编辑 / 导出的方案 |
| `appearance` | 全局主题 `theme`：`atelier` / `obsidian` / `blueprint` |
| `view` | `{mode,cameraType,position,target,zoom}`；模式为 `perspective` / `top` / `wireframe`，线框仍为透视相机 |
| `surface` | `{type,heightCm,tableId,referenceSizeCm}`；`model-work-surface` 或 `reference-plane`，参考尺寸不等于真实桌板轮廓 |
| `lighting` | `preset` 为 `dorm-day` / `window-side` / `dorm-night` / `desk-lamp` / `studio`，`intensity` 为 0.5–1.5，`warmth` 为 -100–100 |
| `objects` / `drawers` / `doors` | 当前方案对象、抽屉及柜门状态；无对应机构时数组为空 |
| `placement` | 当前物品专属的二维边界、尺寸与占地判断 |
| `collision` | 全场景 / 最近路径提醒；`enabled:true`、`mode:'warn'`、`method:'per-part-obb'`，兼容字段 `blocked:false` |

### 对象、机构与摆放数据

| `objects[]` 字段 | 含义 |
| --- | --- |
| `id` / `name` / `sourceFile` | 会话 ID、显示名和来源标识；`sourceFile` 不保证与 `dist/assets/` 的交付文件同名，椅子可带 `#chair` 后缀 |
| `role` | `item` 或 `table` |
| `position` / `rotation` / `rotationOrder` | 根节点世界位置、度数旋转及 `XYZ`；位置不是世界包围盒中心 |
| `scale` | 外层归一化根节点缩放，包含导入 / 校准比例；不包含烘焙进几何的预处理，不能统一当作原 GLB 米转厘米系数 |
| `dimensionsCm` | 校准基准的旋转前局部 `[宽X,高Y,深Z]`，不随柜门 / 抽屉开合实时重算，不等于床框标称尺寸或底座占地 |
| `worldBoundsCm` | 当前姿态的世界轴对齐包围盒，`min` / `max` 为 XYZ 数组 |
| `grounded` / `surfaceY` | 是否贴合所属表面、所属表面高度或 `null`；表面可能是桌面、地面或抽屉 |
| `calibrated` / `locked` / `demo` | 是否已校准、是否固定资产、是否示例 |
| `storage` | `null` 或 `{drawerId}`；收纳后的坐标与包围盒仍为世界坐标 |
| `modelOrientation` | 归一化前的朝向修正四元数 `[x,y,z,w]`，与用户旋转独立；没有修正包装时为 `null` |
| `referenceSize` | `{category,index,estimated:true}` 或 `null`，不是实物校准结果 |

`drawers[]` 包含 `id`、`name`、`opening`（0–1）、`travelCm`、世界内腔 `interiorCm:{min,max}` 与 XYZ 内腔 `dimensionsCm`。右抽屉另有 `direction:[-1,0,0]`、`estimated:true`；左抽屉沿 +Z。`doors[]` 包含 `id`、`opening`、`angleDegrees`。`collision` 的 `kind` 可为 `overlap` / `floor` / `capacity` / `path`，其余 `detected`、`message`、`objectId`、`part` 描述提醒，不是阻止变换的许可开关。

| `placement` 字段 | 含义 |
| --- | --- |
| `method` | `projected-convex-hull`，物品占地采用保守投影凸包 |
| `surface` / `supports` | 桌面 / 抽屉，含 `kind,label,min,max,polygon,estimated`；桌面另有 `rings`、`shapeSource`，抽屉另有 `id` |
| `items` | 非桌体物品的 `{id,name,polygon,minY,maxY,scope,selected}`，轮廓点为世界 `[x,z]` |
| `selected` | 未选中时为 `null`；否则含 `id,scope,supportKind,supportId` 及独立的 `boundary,size,conflict` |

各检查含 `state:'ok'或'warning'或'na'` 和中文 `label`，冲突另给 `ids`。`boundary.marginCm` 只是外接矩形 / 内腔余量，正数不证明处于凹形桌板内；最终结论读 `boundary.state`。`scope` 区分桌面、抽屉、地面、未知高度和固定桌体；`placement` 不等于全场景 `collision`。

真实桌板可能偏离整柜中心。越界应使用 `placement.surface.rings` / `polygon`，不能用根节点位置、整柜尺寸或顶层 `surface.referenceSizeCm` 代替；`min/max` 仅为外接范围。`polygon` 保留最大面积环，完整孔洞 / 分离区域使用 `rings` 并按 even-odd 处理。

`shapeSource` 为 `named-top-mesh` / `inferred-top-mesh` / `estimated-footprint` / `reference-footprint`。`estimated` 仍包含实物尺寸未校准的不确定性；模型轮廓真实不等于现实尺寸已确认。

## 验证与已知限制

当前功能基线为 [PR #1](https://github.com/Remedy-Yang/DeskVerse/pull/1) 合入的版本。以下是开发验收记录，不代表每次文档更新都重新执行全部流程：

- Node：73 项测试通过，覆盖核心尺寸 / 历史、真实 GLB、家具行程与铰链、碰撞 / 摆放、参考尺寸、A/B、线框与出图相机。
- 静态检查：28 个 JS 模块、172 个 UI ID、GLB / 解码器 / OCR 资源通过；修改后的 JS 语法检查通过。
- 实木模型替换：实际 Chrome 验证家具、抽屉、二维交互、空间方案和高清导出五组流程；几何检查覆盖标称宽深 / 总高、四抽屉行程及 241 个柜门角度。
- 最新相机 / 出图：验证每次打开默认当前视角、小数 / 非法高度、原生失焦后直接出图、环绕惯性、三种视角及坐姿、模型 / 相机其他轴 / 历史保持、三主题、320 / 390 px 控件，以及真实下载解码的当前视角 PNG 和 1080p / 2K / 4K 日夜 / A/B 图片。
- Python：前序 23 项本机代理测试通过，覆盖重复提交、恢复 / 下载重试、凭据隔离与请求 / 下载地址防护；近期纯前端及文档更新没有重跑无关后端流程。

### 浏览器验收脚本

先运行本机 HTTP 服务。脚本需要另外可用的 Playwright 与 Chrome，部分还需 pngjs，**不属于页面运行时依赖**；可用 `PLAYWRIGHT_MODULE` / `PNGJS_MODULE` 指向现有隔离环境中的库，`DESKVERSE_URL` 指定服务地址，不应全局安装工具。

| 脚本（位于 `scripts/`） | 覆盖范围 |
| --- | --- |
| `check-render-export-ui.mjs` | 当前视角默认项、相机高度、真实 PNG / JSON、布光、A/B、失败恢复、键盘和手机布局；无需 pngjs |
| `check-furniture-ui.mjs` / `check-drawer-ui.mjs` | 门屉联动、椅子抽拉 / 拖动、收纳随动、碰撞仅提醒、回放、静止画面与窄屏 |
| `check-plan-interactions-ui.mjs` | 凹形桌面、持续重绘 / CSS 缩放 / 手机拖动、取消 / 撤销、三视角和安全替换桌子 |
| `check-spatial-ui.mjs` | 主题、物品专属检查、二维键盘操作、A/B 物品 / 家具 / 历史 / 规格图隔离、正交编辑和地板 |
| `check-placement-ui.mjs` | 自由变换、照片扶正 / 类别参考、多规格与朝向回放；可用 `PHOTO_MODEL_PATH` 指定本机 GLB |
| `check-photo-ui.mjs` | 模拟照片任务、任务恢复 / 再次放入与导入流程 |
| `check-lighting-ui.mjs` | 五种布光、亮度、冷暖与导出状态 |

脚本按类别生成 `.deskverse/qa/` 证据；开发机另保留 `.deskverse/qa/realwood/`、`.deskverse/qa/camera-controls/`。这些截图 / PNG / JSON 被 Git 忽略，克隆仓库不会自带，重新执行验收才会生成。

生成接口及 OCR 文本在相关浏览器验收中使用隔离模拟，不触发付费生成；模拟通过不代表真实 Rodin 生成质量或 OCR 识别率。静止画面检查只覆盖当时 Chrome 环境，不保证所有显卡表现。真实使用需另行检查当前资产 / 设备 / 网络，不应把几何或参考尺寸提示当作精确物理与实物测量。

### 手动验收建议

1. 启动后确认新床柜、椅子、显示器与材质正常；桌板为 Y=0，床框标称尺寸和全套总高正确。
2. 导入物品、核对尺寸、开关贴面并调整 Y；确认模型可自由移动且碰撞不回退。
3. 在二维图跨过弧形凹口拖动，核对边界提示及一次撤销 / 取消；切换 A/B 验证独立性。
4. 操作四抽屉、柜门和椅子，收纳 / 取回物品并撤销；替换桌子时测试失败保留和成功回放。
5. 底部调节相机 Y，确认模型及镜头 X/Z 不变；打开效果图确认默认当前视角，改过构图后重新打开仍重置。
6. 对照日夜光照与不同分辨率 PNG，确认没有编辑辅助；分别导出 A/B JSON，且明确 JSON 目前不能回导。

技术资料：[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)、[OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)、[PointLight](https://threejs.org/docs/pages/PointLight.html)、[Three.js 截图说明](https://github.com/mrdoob/three.js/blob/dev/manual/pages/tips.html)。仓库使用固定的 Three.js r180；运行时以本地源码为准，不会从这些文档站点下载依赖。
