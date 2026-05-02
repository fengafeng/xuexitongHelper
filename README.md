# 学习通助手 — xuexitongHelper

> **版本**: v1.0（正式版）  
> **作者**: suifeng  
> **项目地址**: https://github.com/fengafeng/xuexitongHelper  
> **Copyright © 2026 suifeng**  
> 本脚本仅供学习交流使用，禁止商业用途。使用请遵守相关平台规定，使用者需自行承担使用风险。

---

## 📋 目录

- [快速使用](#-快速使用)
- [功能详解](#-功能详解)
- [文件说明](#-文件说明)
- [版本沿革](#-版本沿革)
- [开发指南](#-开发指南)
- [常见问题](#-常见问题)

---

## 🚀 快速使用

### 方式一：Tampermonkey 安装（推荐）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. [点此安装](https://github.com/fengafeng/xuexitongHelper/raw/main/xuexitongHelper.user.js)（或打开 `xuexitongHelper.user.js` 文件，Tampermonkey 会自动识别）
3. 访问学习通课程页面，脚本自动在右下角显示悬浮控制面板

### 方式二：控制台粘贴

1. 打开学习通课程**学习页面**（地址栏包含 `studentstudy`）
2. 按 `F12` → `Console` 选项卡
3. 打开 `xuexitongHelper.console.js`，全选复制粘贴并回车

> ⚠️ **注意**：要在**主页面**（`studentstudy`）的 F12 控制台粘贴，不要在视频/音频播放器 iframe 里粘贴。

---

## 🎯 功能详解

### 悬浮控制面板

页面右下角的控制面板提供：

| 功能 | 说明 |
|------|------|
| **速度调节** | 预设 0.5x ~ 3.0x 按钮 + 自定义输入 |
| **播放模式** | 🔁 整课循环（全部播完重头开始） / 📋 正常模式（跳过已完成章节） |
| **暂停/播放** | ⏸️ 暂停媒体 / ▶️ 恢复播放 |
| **调试日志** | 📋 显示/隐藏调试日志面板（含复制功能） |
| **拖拽** | 按住面板标题栏可拖动 |

### 自动化流程

```
课程列表页 (i.chaoxing.com/base)
  └─ ❌ 跳过，不执行任何操作

章节列表页 (/mycourse/studentcourse)
  └─ 🔍 自动检测未完成章节（.orange 标记）
      └─ 🖱️ 自动点击进入未完成章节

学习页面 (/mycourse/studentstudy)
  ├─ 🎯 检测媒体类型（音频/视频）
  ├─ ▶️ 自动播放
  ├─ 📊 检测播放进度，无进度7秒自动恢复
  ├─ ⏭️ 播放完毕自动切换到下一节
  ├─ 📝 章节测验自动跳过
  └─ 🔄 用户手动切换章节时自动重新初始化
```

### 播放模式

- **正常模式（📋）**：已完成的章节自动跳过，只播未完成的。切换到此模式时立即检测当前章节是否已完成。
- **整课循环（🔁）**：全部章节播完后从第一章重新开始。忽略"已完成"标记，强制播放所有内容。

### 章节测验

脚本自动检测当前步骤是否为"章节测验"，如果是则调用 `_navigateToNextSection()` 跳过。检测基于父页面的 `prev_title` 元素（通过三层iframe查找：当前页 → parent → top）。

### 屏幕防休眠

- 使用 **Screen Wake Lock API** 请求系统保持屏幕唤醒
- 浏览器不支持时自动降级（依靠媒体播放保持唤醒）
- 唤醒锁被系统释放后自动重新申请
- 每30秒保活定时器

---

## 📁 文件说明

### 主文件

| 文件 | 用途 |
|------|------|
| `xuexitongHelper.user.js` | ⭐ Tampermonkey 安装版（推荐） |
| `xuexitongHelper.js` | JavaScript 引用版 |
| `xuexitongHelper.console.js` | F12 控制台粘贴版 |

### 三个版本的关系

```
xuexitongHelper.user.js  (完整注释版)
  └─ 去掉 @match 头
     xuexitongHelper.js  (完整逻辑，可引用)
       └─ 压缩为 ES5 单行格式
          xuexitongHelper.console.js  (控制台粘贴版)
```

### 文档

| 文件 | 用途 |
|------|------|
| `README.md` | 本文件：使用说明 + 开发文档 |

---

## 📜 版本沿革

| 版本 | 代号 | 说明 |
|------|------|------|
| **v1.0** | 学习通助手 | **当前版本**。音视频混合、悬浮面板、整课循环、章节列表自动化、屏幕防休眠、暂停守卫 |
| **v0.5** | V5（内部版） | 自动检测音频/视频、三层iframe穿透、暂停/播放按钮、调试日志面板 |
| **v0.4** | V4（音频版） | 纯音频播放、悬浮速度面板、多音频支持 |
| **v0.3** | V3（音频增强） | 智能iframe检测、增强的音频查找策略、全自动化流程 |
| **v0.2** | V2（原始版） | 视频播放 + 自动翻页、课程树导航 |
| **v0.1** | 实验版 | 最早期的实验性脚本 |

> `v3_optimized.js` / `v3_optimized.user.js` 已移除（功能被 v1.0 完全覆盖）。

---

## 🔧 开发指南

### 环境要求

- Node.js ≥ 18（用于语法检查：`node --check file.js`）
- 浏览器: Chrome / Edge（最新版）
- Tampermonkey（可选，用于测试 user.js）

### 架构概览

#### 页面层级

```
studentstudy (kcnrsp.html)
  └── #iframe → knowledge/cards
        ├── iframe.ans-insertaudio → audio 播放器
        │     └── <audio id="audio_html5_api">
        └── iframe.ans-insertvideo-online → video 播放器
              └── <video id="video_html5_api">
```

#### 核心执行流程

```
run()
 ├─ _detectPageType() → 识别 4 种页面
 ├─ _detectMediaType() → 5 层策略检测媒体（含延迟重试×10）
 │
 ├─ audio → _runContentPageAudio()
 │    ├─ _phaseInitSequence() 统一初始化
 │    └─ play() → 播放 + _startAudioMonitoring()
 │
 ├─ video → _runContentPageVideo()
 │    ├─ _findAllVideoIframes() → 3层来源
 │    └─ _playVideoAtIndex() → 逐视频播放 + 3次重试
 │
 ├─ chapter_list → _runChapterListAuto()
 │    └─ 检测 .orange → 点击进入未完成章节
 │
 └─ course_list → 跳过
```

#### 导航流程

```
媒体播完 → _playVideoAtIndex 完成 或 ended 事件
  → nextUnit()
    → 课程树有节点？ → 树内导航
    → 课程树不存在？ → _navigateToNextSection() 找 #right1
      → 点击 #right1 → _waitForNextSectionReady() 轮询
        → 新节有媒体？ → 播放
        → 新节已做完？ → 跳过
        → 循环模式？ → 到最后一章→从第一章重来
```

### 关键方法速查

| 方法 | 功能 |
|------|------|
| `_detectPageType()` | 根据 URL 识别 `course_list` / `chapter_list` / `study_page` / `content_page` |
| `_detectMediaType()` | 5 层策略检测：video 标签 → 音频 iframe → #iframe 内 video → #iframe 内 audio |
| `_findAllVideoIframes()` | 3 来源：local → #iframe → parent |
| `_getVideoElByIndex(idx)` | 获取视频元素（优先 `video_html5_api` → `video` → `.vjs-tech`） |
| `_playVideoAtIndex(idx)` | 逐视频播放（含 3 次重试，每次 2s），全部播完调 `nextUnit()` |
| `_startVideoMonitoring()` | 视频进度监控：7s 无进度变化自动恢复 |
| `_getAudioEl()` | 评分制查找音频元素（优先 `audio_html5_api`） |
| `_getTreeContainer()` | 3 层查找课程树：当前页 → parent → top |
| `_initCellData()` | 解析课程树结构（新旧格式兼容） |
| `nextUnit()` | 课程树导航到下一节 |
| `_navigateToNextSection()` | 通过 `#right1` 按钮跳转（3层查找） |
| `_advanceLearningStep()` | 切换到视频/音频步骤（含章节测验检测和跳过） |
| `_detectTaskCompleted()` | 检测 `[aria-label="任务点已完成"]` |
| `_runChapterListAuto()` | 章节列表页自动检测 `.orange` 并进入 |
| `toggleLoopMode()` | 切换整课循环/正常模式 |
| `togglePause()` | 暂停/恢复（静音+seek 冻结法） |
| `setPlaybackRate(rate)` | 设置播放速度 |
| `_requestWakeLock()` | 屏幕防休眠（Wake Lock API） |

### 跨 iframe 开发注意事项

所有跨页面的 DOM 操作都使用 `try/catch` 防护，按 当前页 → `window.parent` → `window.top` 三级递进：

| 操作 | 查找方式 |
|------|---------|
| 课程树 `#coursetree` | 3 级递进 |
| `#right1` 按钮 | 3 级递进 |
| `#prevNextFocusNext` | 3 级递进 |
| `prev_title` 标题 | 3 级递进 |
| `[aria-label="任务点已完成"]` | 本地 + iframe |
| 视频 iframe `ans-insertvideo-online` | local → #iframe → parent |
| 音频 iframe `ans-insertaudio` | 5 策略选择器 + 嵌套搜索 |

### 调试方法

1. **点击面板的「📋 日志」按钮**显示调试日志面板（带时间戳、可复制）
2. **启动日志**显示页面类型、是否是顶层窗口、iframe 数量
3. **媒体检测日志**显示 5 层策略的结果
4. **视频查找日志**显示 iframe 来源和数量
5. **元素诊断**：找不到视频时自动输出 iframe 内 HTML 片段

### 暂停机制

使用**静音+seek冻结法**（而不是调用 `pause()`），避免页面JS检测到暂停后自动恢复播放：

```
点击 ⏸️ →
  ├─ volume=0, muted=true（页面感知不到暂停事件）
  ├─ 记下 _pausedAt（当前时间位置）
  └─ 每300ms 守卫 →
      ├─ 确保 volume=0
      └─ seek 回 _pausedAt（视觉/进度冻结）

点击 ▶️ →
  ├─ seek 到 _pausedAt
  ├─ volume=1 → play()
  └─ 清除守卫
```

### 添加新功能的标准流程

1. 在 `window.app` 中添加状态变量和 `configs` 配置项
2. 实现核心方法
3. 在 `run()` 中添加调用或绑定
4. 同步到三个文件（user.js → .js → console.js）
5. 验证语法：`node --check xuexitongHelper.js`

---

## ❓ 常见问题

### Q: 面板不显示 / 脚本无反应

1. 检查是否在 `studentstudy` 主页的控制台粘贴（不是 `ananas/modules/video` 子页面）
2. Tampermonkey 用户检查 `@match` 规则是否匹配当前 URL
3. 刷新页面重试

### Q: 视频不播放，显示"已完成"

正常模式下已完成章节会被跳过。切换到"整课循环"模式可强制播放。

### Q: 暂停后过几秒又自动播放

脚本使用静音+seek冻结法，但如果页面JS仍然能恢复播放：
1. 确保使用的是最新版本
2. 检查调试日志面板中 `_pauseWatcher` 是否在运行（每300ms输出）

### Q: 章节列表不进

需要在 `/mycourse/studentcourse` 页面，脚本自动检测 `.orange` 标记的未完成章节并点击进入。

### Q: 切章节后脚本失灵

确保脚本粘贴在主页而非 iframe 内。v1.0 新增 `_bindStepNavigation()` 监听用户手动切章节，2.5秒后自动重初始化。

### Q: 一直跳转不播放

检查调试日志中 `_detectMediaType()` 的输出。如果显示 `unknown` 说明没检测到媒体；显示 `unknown (尝试10)` 后走的音频兜底。

---

## 项目文件结构

```
xuexitongHelper/
├── xuexitongHelper.user.js         ⭐ 主脚本 - Tampermonkey版
├── xuexitongHelper.js              主脚本 - JS引用版
├── xuexitongHelper.console.js      主脚本 - 控制台版
└── README.md                      本文件
```
