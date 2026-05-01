# 学习通自动学习脚本 — xuexitongScript

> **作者**: suifeng  
> **项目地址**: https://github.com/fengafeng/xuexitongScript  
> **Copyright © 2026 suifeng**  
> 本脚本仅供学习交流使用，禁止商业用途。使用请遵守相关平台规定，使用者需自行承担使用风险。

---

## 目录

- [项目概述](#项目概述)
- [版本与文件索引](#版本与文件索引)
- [架构概览](#架构概览)
- [快速使用](#快速使用)
- [功能详解](#功能详解)
- [开发指南](#开发指南)
- [常见问题](#常见问题)
- [更新日志](#更新日志)

---

## 项目概述

本项目是一个针对超星学习通（chaoxing.com）课程学习页面的自动化脚本集合，支持**自动检测媒体类型（音频/视频）→ 自动播放 → 自动切换到下一节**，并提供悬浮控制面板（播放速度调节、播放模式切换）。

### 核心能力

| 能力 | 说明 |
|------|------|
| 🎯 自动识别页面类型 | 课程列表页、章节列表页、学习页、内容页自动区分 |
| 🎵 音频自动播放 | 自动查找 `iframe.ans-insertaudio` 并播放 |
| 🎬 视频自动播放 | 支持 3 层嵌套 iframe 穿透，查找 `video#video_html5_api` |
| 🔄 自动翻页 | 通过课程树节点点击或 `#right1` 按钮跳转下一节 |
| ⏱ 悬浮速度面板 | 右下角拖拽面板，预设速度按钮 + 自定义输入 |
| 🔁 整课循环模式 | 全部播完后自动从第一章重新开始 |
| 📋 正常播放模式 | 已完成的章节自动跳过，只播未完成内容 |
| 🛡 停滞恢复 | 7 秒无进度变化自动静音恢复 |
| 🔄 用户切换感知 | 手动点击其他章节时自动重新初始化 |

---

## 版本与文件索引

> 📌 当前推荐使用 **V5 音视频混合版**（最新），其他版本保留作为开发参考。

### V5 — 音视频混合版（⭐ 推荐）

| 文件 | 大小 | 用途 |
|------|------|------|
| `v5_audio_video.user.js` | ~70KB | Tampermonkey 安装版（`@match *://*.chaoxing.com/*`） |
| `v5_audio_video.js` | ~46KB | 可引用 JS 文件版 |
| `v5_audio_video_console.js` | ~43KB | F12 控制台粘贴执行版 |

**关键特性**：
- 自动检测音频/视频媒体类型（5 层策略 + 延迟重试）
- 音频播放 → 沿用 V4 完整逻辑
- 视频播放 → 三层 iframe 穿透 + 3 次重试 + 停滞恢复
- 整课循环模式 + 正常播放模式（面板切换）
- 章节测验自动跳过 | 用户手动切换章节自动重初始化
- 详细的启动诊断日志

### V4 — 音频专用版

| 文件 | 大小 | 用途 |
|------|------|------|
| `v4_audio_only.user.js` | ~35KB | Tampermonkey 安装版 |
| `v4_audio_only.js` | ~35KB | 引用版 |
| `v4_audio_only_console.js` | ~27KB | 控制台版 |

**关键特性**：纯音频播放、悬浮速度面板、多音频支持

### V3 — 音频增强版（V5 开发基础）

| 文件 | 大小 | 用途 |
|------|------|------|
| `v3_audio_optimized.user.js` | ~103KB | Tampermonkey 安装版（含全自动化流程） |
| `v3_audio_optimized.js` | ~103KB | 引用版 |

V3 音频版在 V5 中被拆分为音频和视频两条独立路径，V5 的音频逻辑继承自此版。
> `v3_optimized.js` / `v3_optimized.user.js` 已移除，功能已完全被 V5 覆盖。

### 历史版本

| 文件 | 用途 |
|------|------|
| `v2.js` | 原始版：视频播放 + 自动翻页 |
| `xuexitong.js` | 最早期实验版本 |

### 辅助文件

| 文件 | 用途 |
|------|------|
| `kcnrsp.html` | 视频学习页面 HTML 源码（V5 视频结构参考） |
| `kcnr.html` / `kcnrsp.html` / `kclist.html` / `kczj.html` | 页面结构调试参考 |
| `img/` | 截图（用于历史 README 文档） |
| `TEST_GUIDE.md` | 测试指南 |
| `.workbuddy/` | 工作记忆与技能文件（仅开发环境） |

---

## 架构概览

### 页面层级关系

```
studentstudy 页面 (kcnrsp.html)        ← 外层学习页面
  └── #iframe 加载 knowledge/cards     ← 内容页面
        ├── iframe.ans-insertaudio     ← 音频播放器
        │     └── <audio>
        └── iframe.ans-insertvideo-online ← 视频播放器
              └── <video id="video_html5_api">
```

### 脚本执行流程

```
run()
 ├─ _detectPageType() → 识别 course_list / chapter_list / study_page / content_page
 ├─ _detectMediaType() → 识�� audio / video（5层策略，含延迟重试）
 │
 ├─ 如果是 audio → _runContentPageAudio()
 │    ├─ _startAudioInitialization() → 查找音频 iframe
 │    ├─ _phaseInitSequence() → 初始化课程树、音频元素
 │    └─ play() → 播放 + 监控
 │
 ├─ 如果是 video → _runContentPageVideo()
 │    ├─ _startVideoInitialization() → 查找视频 iframe
 │    ├─ _findAllVideoIframes() → 3层来源查找（local → #iframe → parent）
 │    ├─ _playVideoAtIndex() → 逐视频播放（含3次重试）
 │    └─ 全部播完 → nextUnit()
 │
 ├─ _createControlPanel() → 悬浮面板
 └─ 全局防暂停事件绑定
```

### 导航流程

```
视频/音频播完
  → _playVideoAtIndex 完成 或 ended 事件
    → nextUnit()
      → 课程树有节点？ → 切换同章下一节 / 切换下一章
      → 课程树不存在？ → 找 #right1 按钮（本地→parent→top）
        → 点击 #right1 → _waitForNextSectionReady() 轮询
          → 新节有媒体？ → 播放
          → 新节已做完？ → 再跳过
          → 循环模式？  → 到最后一章→从第一章重来
```

### 关键方法索引

| 方法 | 所在版本 | 功能 |
|------|---------|------|
| `_detectPageType()` | V3+, V4, V5 | 根据 URL path 识别页面类型 |
| `_detectMediaType()` | V5 | 5层策略检测音频/视频 |
| `_findAllVideoIframes()` | V5 | 3来源查找视频 iframe |
| `_getVideoElByIndex()` | V5 | 获取视频元素（含 `.vjs-tech` 兜底） |
| `_playVideoAtIndex()` | V5 | 播放指定索引的视频（含3次重试） |
| `_doPlayVideo()` | V5 | 实际播放逻辑（点击播放按钮 + `video.play()`） |
| `_startVideoMonitoring()` | V3, V5 | 视频停滞检测（7秒无进度→恢复） |
| `_getAudioEl()` | V4, V5 | 5种策略查找音频元素 |
| `_getTreeContainer()` | 所有版本 | 查找课程树容器（3层：本地→parent→top） |
| `_initCellData()` | 所有版本 | 解析课程树结构（新旧两种格式兼容） |
| `nextUnit()` | 所有版本 | 切换到下一节 |
| `playCurrentIndex()` | 所有版本 | 播放课程树中指定章节 |
| `_navigateToNextSection()` | V3+, V4, V5 | 通过 `#right1` 按钮跳转下一节 |
| `_advanceLearningStep()` | V3+, V4, V5 | 切换到视频/音频页签（含"章节测验"跳过） |
| `_detectTaskCompleted()` | V4, V5 | 检测任务点是否已完成 |
| `_bindStepNavigation()` | V5 | 监听用户手动切换章节 |
| `toggleLoopMode()` | V5 | 切换整课循环/正常模式 |
| `setPlaybackRate()` | V3+, V4, V5 | 设置播放速度 |

---

## 快速使用

### 方式一：Tampermonkey 安装（推荐）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开 `v5_audio_video.user.js` 文件
3. Tampermonkey 会自动识别并提示安装
4. 访问学习通课程页面，脚本自动运行

### 方式二：控制台粘贴

1. 打开学习通课程**学习页面**（地址栏包含 `studentstudy`）
2. 按 `F12` 打开开发者工具
3. 切换到 `Console` 选项卡
4. 打开 `v5_audio_video_console.js`，全选复制
5. 在控制台粘贴并回车

> ⚠️ 注意：要粘贴到**主页**（`studentstudy`）的控制台，不要粘贴到视频播放器 iframe 里！

### 方式三：HTML 引用

```html
<script src="v5_audio_video.js"></script>
```

---

## 功能详解

### 悬浮控制面板

面板默认出现在页面右下角，包含：

```
┌─────────────────────┐
│ 🎮 V5 控制面板   ✕  │  ← 拖拽手柄 / 关闭(最小化)
│                     │
│ 顺序播放 [🔁 整课循环]│  ← 点击切换播放模式
│                     │
│      1.0x           │  ← 当前速度
│                     │
│ 0.5x 0.75x 1.0x     │  ← 预设速度按钮
│ 1.25x 1.5x 2.0x 3.0x│
│                     │
│ [___] [设置]        │  ← 自定义速度
└─────────────────────┘
```

点击关闭按钮将面板最小化为半透明状态，再次点击恢复。

### 播放模式

- **正常模式（📋）**：已完成的任务点自动跳过，只播放未完成内容。切到该模式时立即检测当前任务是否已完成。
- **整课循环（🔁）**：全部章节播完后从第一章重新开始。忽略"已完成"标记，强制播放所有内容。

### 章节测试处理

当检测到当前步骤为"章节测验"时：
1. 脚本自动调用 `_navigateToNextSection()` 跳过
2. 从父页面 / top 窗口查找 `prev_title` 确认类型
3. 从父页面 / top 窗口查找 `#prevNextFocusNext` 按钮备选

### 用户手动切换章节

当用户点击课程树中的其他章节或卡片页签时：
- `_bindStepNavigation()` 监听 `.posCatalog_name` 和 `.prev_white` 的 click 事件
- 2.5 秒后自动重新初始化（`_resetState()` → `_initCellData()` → `_detectMediaType()` → 播放）
- 在子页面中也通过 parent/top 绑定

---

## 开发指南

### 开发环境

| 工具 | 版本 |
|------|------|
| Node.js | v24.14.1 |
| jQuery | 3.6.0（运行时加载） |
| Tampermonkey | 最新版 |
| 浏览器 | Chrome / Edge 最新版 |

### 代码结构规范

```javascript
(function() {
    // 1. jQuery 加载（如未加载）
    if (typeof jQuery === 'undefined') { ... }
    
    function initializePlayer() {
        window.app = {
            // 2. 配置项
            configs: { ... },
            
            // 3. 状态变量
            _videoEl: null,
            
            // 4. 入口
            run() { ... },
            
            // 5. 核心功能（按执行顺序）
            _detectMediaType() { ... },
            _runContentPageVideo() { ... },
            
            // 6. 辅助方法
            _getTreeContainer() { ... },
        };
        
        // 7. 启动执行
        try { window.app.run(); } catch(e) { ... }
    }
})();
```

### 三个版本的关系

```
v5_audio_video.user.js  (完整注释版 ≈ 60KB)
  ↓ 去掉 @match 头
v5_audio_video.js       (完整逻辑 ≈ 42KB)
  ↓ 压缩为兼容 ES5 的单行格式
v5_audio_video_console.js (控制台粘贴版 ≈ 35KB)
```

修改时先改 `user.js`，再用工具同步到 `.js` 和 `console.js`。

### 调试技巧

1. **看启动日志**：
   ```
   【V5诊断】页面类型: study_page, 子页面: false, iframes: 5, #iframe: true
   ```

2. **看媒体检测**：
   ```
   【媒体检测】#iframe存在但contentDocument=null（未加载）→ unknown
   ```
   说明 `#iframe` 还没加载完，脚本会自动重试。

3. **看视频查找**：
   ```
   【视频查找】#iframe内: 1
   【视频元素】iframe[0] ✅ 找到 video
   ```

4. **看元素诊断**：如果找不到 video，会输出 iframe 内 HTML 片段

### 跨 iframe 开发注意事项

| 场景 | 本地 | parent | top |
|------|------|--------|-----|
| 课程树查找 | `#coursetree` | ✅ | ✅ |
| `#right1` 按钮 | ✅ | ✅ | ✅ |
| `#prevNextFocusNext` | ✅ | ✅ | ✅ |
| `[aria-label="任务点已完成"]` | ✅ | ✅ | ✅ |
| `prev_title` 标题 | ✅ | ✅ | ✅ |
| `iframe.ans-insertvideo-online` | ✅ | ✅ | ✅ |
| 课程树点击监听 | `.posCatalog_name` | ✅ | ✅ |

所有跨页面的 DOM 操作都包含 `try/catch` 防护，防止跨域错误。

### iframe 内容访问

从外层页面访问内层 iframe 内容：
```javascript
// #iframe 内容
const doc = document.getElementById('iframe').contentDocument;
doc.querySelector('iframe.ans-insertvideo-online');

// 内层视频 iframe 内容
const videoDoc = iframe.contentDocument;
videoDoc.getElementById('video_html5_api');
```

从内层 iframe 访问外层：
```javascript
window.parent.document.getElementById('coursetree');
window.top.document.getElementById('right1');
```

### 视频元素选择器

```javascript
// V5 目前使用的选择器链
const video = doc.getElementById('video_html5_api')   // Video.js 标准 ID
            || doc.querySelector('video')              // 原生 video 标签
            || doc.querySelector('.vjs-tech');          // Video.js 备选类
```

### 添加新功能的标准流程

1. 在 `window.app` 中添加状态变量和 `configs` 配置项
2. 实现核心方法
3. 在 `run()` 中添加调用或绑定
4. 同步到三个文件（user.js → .js → console.js）
5. 验证语法：`node --check file.js`

---

## 常见问题

### Q: 面板不显示 / 脚本无反应

1. 确认粘贴到了正确的页面（`studentstudy` 主页，不是 `ananas/modules/video`）
2. 检查控制台是否有报错
3. 确认是否误点了其他页面标签

### Q: 视频不播放，显示"已完成"

- 在正常模式下，已完成的任务点会被跳过
- 切换到"整课循环"模式可强制播放

### Q: "Maximum call stack size exceeded"

- 之前是因为 `playCurrentIndex()` 同步调用 `nextUnit()` 导致递归
- V5 已改为 `setTimeout(()=>this.nextUnit(), 500)` 修复

### Q: 一直跳转下一节，视频不播

- 检查 `_detectMediaType()` 输出，确认是否成功检测到媒体类型
- 如果显示 `iframe[0]内无video`，可能是 iframe 未加载完成（V5 已加重试）
- 如果显示 `默认音频`，说明没找到任何媒体，脚本走音频兜底

### Q: 切换章节后脚本失效

- 确保脚本粘贴在主页（`studentstudy`）而非 iframe 内
- 确认 `_bindStepNavigation()` 已绑定（V5 新增功能）

---

## 更新日志

### 2026-05-01 — V5 音视频混合版

- **新功能**: `_detectMediaType()` — 自动检测音频/视频
- **新功能**: 视频播放逻辑（基于 V3，含 3 次重试）
- **新功能**: 整课循环模式（面板切换）
- **新功能**: 用户手动切换章节自动重初始化
- **修复**: `_getVideoElByIndex()` contentDocument 取错位置
- **修复**: `_playVideoAtIndex()` 同步递归导致栈溢出
- **修复**: `_detectTaskCompleted()` 误判父页面完成标记
- **修复**: `_advanceLearningStep()` 在 iframe 内找不到 parent 元素
- **改进**: 启动诊断日志 + 详细调试输出
- **改进**: `#right1` 三层查找（本地→parent→top）
- **改进**: 子页面粘贴提示

### 2026-04-30 — V4 音频版

- 纯音频播放脚本
- 多音频支持
- 悬浮速度面板
- 控制台粘贴版

### 2026 前期 — V3 及之前版本

- V3: 视频优化 + 自动化流程
- V2: 原始视频播放 + 翻页
- V1/xuexitong.js: 实验版本
