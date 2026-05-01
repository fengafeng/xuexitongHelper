# 学习通自动刷音频脚本 V3 音频版

基于 v3_optimized.js 修改的音频自动播放脚本，专门用于学习通平台的音频课程。

## 功能特性

- 自动播放音频课程
- 自动切换到下一节音频
- 自动跳过章节测验
- 播放状态监控和恢复
- 支持后台播放保持

## 文件说明

- `v3_audio_optimized.js` - 普通JavaScript脚本，可直接在浏览器控制台运行
- `v3_audio_optimized.user.js` - 用户脚本版本，适用于Tampermonkey等用户脚本管理器

## 使用方法

### 方法1：用户脚本（推荐）

1. 安装 Tampermonkey 浏览器扩展
2. 导入 `v3_audio_optimized.user.js` 文件
3. 访问学习通音频课程页面，脚本会自动运行

### 方法2：控制台运行

1. 打开学习通音频课程页面
2. 按 F12 打开开发者工具
3. 复制 `v3_audio_optimized.js` 的内容到控制台运行

## 主要修改

相比视频版本，主要修改包括：

- **播放倍速**：将 `playbackRate` 设为 1.0（音频通常不需要加速播放）
- **元素选择器**：从查找视频 iframe `ans-insertvideo-online` 改为音频 iframe `ans-insertaudio`
- **音频元素**：从 `video#video_html5_api` 改为 `audio#audio_html5_api`
- **变量和函数名**：所有相关变量从 `_videoEl` 改为 `_audioEl`，函数名相应调整
- **日志消息**：所有提示信息改为音频相关
- **加载等待**：添加了等待音频iframe完全加载的机制，避免启动过早的问题
- **错误处理**：改进了元素查找失败时的处理逻辑，添加了调试信息
- **多重查找策略**：尝试多种方式查找音频元素，包括直接查找、VideoJS API等
- **播放控制**：改进了播放失败时的静音播放逻辑
- **iframe监听**：添加了iframe加载事件监听，确保内容完全加载后再初始化
- **跨域处理**：改进了iframe内容访问的错误处理，添加了跨域限制检测
- **调试增强**：增加了详细的控制台日志，包括iframe状态、查找策略结果等

## 最新更新 (2026)

### V3.3 - 智能iframe检测
- **改进的iframe查找**: 支持多种iframe选择器和属性检测
  - 标准class选择器: `iframe.ans-insertaudio`
  - 包含audio的属性: class、name、title、src
  - 嵌套在div中的iframe: `div[id*='ans-insertaudio'] iframe`
  - 全面遍历所有iframe，智能排除视频iframe
  - 详细的日志输出显示页面中所有iframe的属性信息
- **增强的iframe加载检测**:
  - 支持load事件监听
  - 检查contentDocument.readyState
  - 优雅处理跨域iframe访问错误
- **更详细的调试信息**:
  - 显示查找过程中尝试的选择器
  - 输出所有iframe的属性信息（src、class、id、name）
  - 识别并排除视频iframe
  - 彩色标记成功和失败的步骤

### V3.2 - 原始iframe和音频查找改进
- 修复了iframe内容访问问题，添加了更详细的加载状态检查
- 改进了音频元素查找策略，支持多种VideoJS播放器配置
- 添加了iframe加载事件监听，确保初始化时机正确
- 增强了调试信息，帮助诊断播放器检测问题

## 注意事项

- 请确保在正确的学习通音频课程页面使用
- 脚本会自动处理播放控制，请勿手动干预
- 如果页面结构发生变化，可能需要相应调整脚本
- 脚本会等待音频iframe加载完成后再开始工作
- 控制台会显示详细的调试信息，帮助诊断问题
- 如果音频仍然无法播放，请检查浏览器是否阻止了自动播放