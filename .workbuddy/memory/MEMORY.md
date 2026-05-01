# 长期记忆

## 项目：学习通脚本（xuexitongScript）
- GitHub 仓库：https://github.com/fengafeng/xuexitongScript（私有仓库）
- 主脚本文件：`v3_audio_optimized.js` & `v3_audio_optimized.user.js`
- 默认播放速度：1.0x（可通过悬浮窗调节）
- 浮动速度控制面板功能（`_createSpeedControlPanel`）：支持拖拽、预设速度按钮、自定义输入
- **调试增强**（2026-05-01）：所有关键执行阶段添加了 `_logPhase` 调试日志，包括启动诊断、iframe搜索详程、初始化序列（`_phaseInitSequence` 统一异常兜底）、`_getTreeContainer` 诊断输出
- **全自动化增强**（2026-05-01）：`_detectPageType()` 识别4种页面类型；`_getTreeContainer` 3层查找策略；章节列表自动检测 `orange`/`openlock`；学习页面通过 `#iframe` 监听加载后触发播放；`@match` 规则覆盖完整流程
- 已知问题修复：`_getTreeContainer()` 不再 throw Error，查找失败时返回 null 并走卡片导航兜底

## GitHub 配置
- 用户名：fengafeng
- 使用了 fine-grained PAT 进行 API 操作
