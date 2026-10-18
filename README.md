# DeskVerse Studio v1.4 — 温馨简约资产工作台

## 仓库与分支关系

本项目与 [Remedy-Yang/DeskVerse](https://github.com/Remedy-Yang/DeskVerse) 仓库中的其他项目同属黑客松比赛作品，在 `hackathon/web-studio-v14` 分支独立并行维护。该分支具有独立的根提交，不继承 `main` 或其他分支的提交历史；本分支仓库根目录即本项目目录。

单独获取本项目：

```bash
git clone --single-branch --branch hackathon/web-studio-v14 https://github.com/Remedy-Yang/DeskVerse.git DeskVerse-Web-Studio-v14
```

仓库包含前后端源码、测试、安装脚本及预览图，不包含本地虚拟环境、缓存、密钥和 `backend/data/` 中上传或生成的运行数据。首次运行时后端会自动创建数据目录，资产库初始为空。

## 项目概览

在**现有、已经跑通的 Stage 12 FastAPI 后端**上直接升级网页 UI，不改 PICO RuntimeCatalog / 现有 glTFast 接口。

## 实现了什么

- 首页：奶油白 + 鼠尾草绿，温馨极简，自适应电脑/手机屏幕。
- 资产库：**已生成 GLB + 待生成图片**统一展示，按分类、搜索、排序；历史资产无需迁移。
- 一键预览：点击 GLB 资产的「一键预览」打开 3D 交互弹窗，可旋转、缩放、下载。
- 管理：删除 GLB 与待生成图片；删除 GLB 后，**已加载的 PICO 物体需要重启应用**才会消失。
- 上传：图片文件、公开 HTTPS 图片 URL / 部分带公开主图元数据的商品页、GLB 文件三种入口。
- Rodin：在待生成图片卡片点击「生成 3D」，显示任务进度，完成后自动添加到 `/api/manifest`，PICO 原有同步流程不变。
- 新增 `GET /api/tasks` （任务列表）和 `DELETE /api/sources/{source_id}` （删待生成图片）；**保留原来的全部 Stage 9 / 10 / 12 API**。

**注意**：京东、淘宝商品详情页可能需要登录、重定向、动态渲染或开放平台授权；当前版本不会绕过这些限制，不保证从商品链接直接提取主图。若解析失败，改成上传商品图片即可。Rodin API 额度可能收费。

## 第一步：在 Unity 删除旧蓝色 UI

1. 打开现在成功运行的 `DeskVerse_Stage12` 场景，`File → Save As` 备份为 `DeskVerse_Stage14.unity`。
2. Hierarchy 中**仅禁用或删除 `FreeInputPanelManager`**。如果你之前还留下 `FloatingShopPanelManager` 等旧版悬浮输入面板，也一并禁用。
3. **保留**唯一工作的 PICO Video Seethrough XR Origin、`TableManager`、`MultiObjectManager`、`RuntimeCatalogManager`。
4. 保存，再 **Build And Run** 更新头显。网页后续添加 GLB 不再需要重新构建 APK。

不要因为删掉蓝色 UI 就删除 `DeskVerseFreeInputPanel.cs`、`RuntimeCatalogManager` 或现有抓取脚本；C# 文件可留在项目中作为备份。

## 第二步：安全升级网站（保留全部已有资产）

**重要：你当前正在运行的后端文件夹里可能有 `data/`（包括 `catalog.json`、`sources.json`、GLB 与图片）。不要直接删除、移动或覆盖这个 `data/` 文件夹。**

1. 停止旧 FastAPI：在运行它的 PowerShell 窗口按 `Ctrl+C`。
2. 解压本包，例如解压到 `D:\DeskVerse_Web_Studio_v14`。
3. 找到**原来的 Stage 12 后端文件夹**，即含 `app.py`、`web` 和既有 `data` 的文件夹。假设路径：`D:\DeskVerse_Stage12_FreeNativeUI\backend`。
4. 打开 PowerShell，执行（修改成自己电脑的实际路径）：

```powershell
cd "D:\DeskVerse_Web_Studio_v14"
.\install_to_existing_backend.ps1 -BackendPath "D:\DeskVerse_Stage12_FreeNativeUI\backend"
```

如果 PowerShell 拦截本地脚本，可只对当前命令使用：

```powershell
powershell -ExecutionPolicy Bypass -File ".\install_to_existing_backend.ps1" -BackendPath "D:\DeskVerse_Stage12_FreeNativeUI\backend"
```

安装器会先备份原有 `app.py`、网页文件到 `backend\_webstudio_backup_时间戳`，再替换这四个文件：

```text
backend/app.py
backend/web/index.html
backend/web/style.css
backend/web/app.js
```

安装器**不会**修改 `data/`、`.venv/`、API Key、Unity 项目。其他旧 API 仍按原路径工作。

## 第三步：重新启动原服务器

在你原来的 backend 文件夹打开 PowerShell：

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
```

如果旧进程用了会话级 `RODIN_API_KEY`，请在同一个 PowerShell 进程里重新设置环境变量后再启动；不要把真实密钥写进网页或源码：

```powershell
$env:RODIN_API_KEY="你的 API Key"
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
```

访问：

- 网页：`http://127.0.0.1:8000`（**Ctrl+F5 强制刷新缓存**）
- 资产清单：`http://127.0.0.1:8000/api/manifest`
- 健康检查：`http://127.0.0.1:8000/health`
- 手机网页：同局域网内访问 `http://电脑IPv4:8000`，不得使用手机自己的 `127.0.0.1`。

**手机/PC 上传成功后**，`RuntimeCatalogManager` 仍会从原 `/api/manifest` 下载 GLB，因此戴上 PICO、三点标定完成后模型会自行加载。你之前修复的 Unity `Allow downloads over HTTP = Always Allowed` 设置保留不变（仅用于受信任的局域网开发）。

## 资产库功能说明

**添加商品照片**：点击「导入新物品 → 商品图片」，上传 PNG/JPG/WebP、填写商品真实占地宽、深、模型外观宽，点「保存到待生成区」。这一步不调用 Rodin。

**Rodin 图生 3D**：在资产库的待生成图片卡片点击「生成 3D」；系统二次确认，以避免意外消耗额度。进度显示在「生成任务」，完成后 GLB 自动出现在「3D 模型」资产库。任务只保存在本次服务进程内，**重启 FastAPI 不会恢复之前正在进行的 Rodin 任务**（延续原后端行为）。

**商品链接**：仅接受公开 HTTPS 链接；商品网页需要公开的 OpenGraph/Twitter 图片元信息且不需要重定向、登录。京东、淘宝通常无法保证成功，失败时会有提示，用户可改上传图片。

**现成 GLB**：上传 GLB 文件，填尺寸，直接进入资产库和 PICO 下载清单。

**一键预览**：采用开源 `<model-viewer>` Web Component，允许旋转、缩放和下载；浏览器需能联网加载 CDN 的 `@google/model-viewer` 脚本。当前版本优先 jsDelivr 4.3.1，备用 cdnjs 4.0.0。**若校园网络拦截外部 CDN，3D 预览可能不可用，但资产上传、管理和 PICO 加载仍可工作；GLB 也可以下载到本地查看**。

**删除 GLB**：从资产库删除会永久删除服务器端文件并更新清单。由于现有 `RuntimeCatalogManager` 只自动新增，**删除已经出现在 PICO 场景的模型需要退出并重新启动 DeskVerse 应用**。

## 安全与部署范围

- 这是**可信局域网 MVP**，没有账号登录、鉴权或使用配额，**不要开放 8000 端口到公网**。
- 未来要做成公开手机 App：需要 HTTPS、账户、对象存储、任务队列/持久化、API 限流、权限隔离和授权商品接口；这不是已经实现的功能。
- 3D 预览与真实 PICO 视觉呈现可能有材质差异；图片生成的隐藏面及实际尺寸请由用户核对。

## 回滚

若要恢复旧网页，停止服务后，把 `backend\_webstudio_backup_时间戳\app.py` 复制回 `backend\app.py`，同目录的 `index.html` 等复制回 `backend\web\`，再重启服务。`data/` 不会受到影响。

## 开发测试

```powershell
py -3 -m pip install -r backend/requirements.txt
py -3 -m pip install pytest httpx
py -3 -m pytest -q tests
```

开发容器中已完成 **12 项后端自动化测试** 和前端页面加载、搜索、预览开关的浏览器模拟测试。真实 Rodin API（费用）和 PICO 同步更新仍需在你的环境里验证。

## 资料

- 3D 模型浏览器：https://modelviewer.dev/docs/index.html
- Rodin API 文档：https://docs.hyper3d.ai/zh/get-started/quick-start
