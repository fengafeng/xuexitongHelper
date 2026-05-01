# 音频脚本测试指南 - V3.3 智能iframe检测版

## 改进说明

V3.3版本对iframe检测进行了全面改进，支持更多种类的iframe标识方式，使脚本更加智能和通用。

## 新增功能

### 1. 多种iframe选择器支持

脚本现在会依次尝试以下方式查找音频iframe：

```javascript
1. iframe.ans-insertaudio           // 标准class选择器
2. iframe[class*='audio']           // 包含audio的class属性
3. iframe[name*='audio']            // 包含audio的name属性
4. iframe[title*='audio']           // 包含audio的title属性
5. div[id*='ans-insertaudio'] iframe // 嵌套在特殊div中
6. iframe[src*='audio']             // src包含audio
7. .ans-insertaudio iframe          // ans-insertaudio class下的iframe
```

### 2. 全面的iframe遍历和分析

如果上述选择器都不匹配，脚本会：
- 遍历页面中的**所有iframe**
- 显示每个iframe的属性：`src`、`class`、`id`、`name`
- 自动识别并排除视频iframe
- 智能匹配可能的音频iframe

### 3. 增强的日志输出

控制台会显示详细的调试信息：

```
✓ 通过选择器 "..." 找到 1 个iframe
✓ 找到音频iframe，src: ...
  class: ..., id: ..., name: ...
✓ iframe内容已完全加载，开始初始化
```

## 测试方法

### 方法1：使用浏览器控制台

1. **打开学习通音频课程页面**
2. **按F12打开开发者工具**，切换到 **Console** 标签
3. **复制并粘贴 `v3_audio_optimized.js` 的内容到控制台**
4. **观察控制台输出**

### 方法2：使用Tampermonkey用户脚本

1. **安装 Tampermonkey 浏览器扩展**
2. **创建新脚本**，粘贴 `v3_audio_optimized.user.js` 的内容
3. **刷新学习通页面**，脚本应自动运行
4. **查看浏览器控制台输出**

## 预期的控制台输出示例

```
=== 学习通自动刷音频脚本 V3 音频版启动 ===
等待页面完全加载...
尝试遍历所有iframe...
页面中共有 2 个iframe
iframe 0: src="...", class="ans-insertvideo", id="...", name="..."
  → 跳过，识别为视频iframe
iframe 1: src="...", class="ans-insertaudio", id="...", name="..."
  → 找到可能的音频iframe
✓ 找到音频iframe，src: ...
  class: ans-insertaudio, id: ..., name: ...
✓ iframe内容已完全加载，开始初始化
✓ 音频iframe已加载，开始初始化
找到 1 个音频iframe
开始查找音频元素...
策略1成功: 找到audio标签
✓ 最终结果: 成功找到音频元素
...开始播放...
```

## 排错提示

### 问题1：仍然显示"iframe还未加载"

**可能原因**：
- 页面加载时间过长
- iframe在特殊的DOM结构中
- iframe使用了动态加载

**解决方案**：
- 查看控制台中显示的所有iframe信息
- 记下音频iframe的`src`、`class`、`id`、`name`属性
- 提交这些信息用于进一步优化

### 问题2：找到iframe但找不到音频元素

**可能原因**：
- 音频元素还未加载完成
- 音频元素在iframe的shadow DOM中
- VideoJS播放器使用了特殊的初始化方式

**解决方案**：
- 等待几秒后允许iframe完全加载
- 查看调试日志中各种查找策略的结果
- 检查iframe内是否真的有`<audio>`标签

### 问题3：找到音频元素但不播放

**可能原因**：
- 浏览器自动播放策略限制
- 音频需要用户交互
- 加载清单有跳过这个音频

**解决方案**：
- 手动点击一次播放按钮，后续应该自动播放
- 检查浏览器的自动播放设置
- 刷新页面重试

## 反馈信息

如果遇到问题，请收集以下信息：

1. **完整的控制台输出** (复制全部)
2. **使用的浏览器和版本** (如Chrome 120)
3. **学习通的URL** (教师可根据URL优化选择器)
4. **iframe的属性信息**:
   - src
   - class
   - id
   - name
5. **是否使用了代理或VPN** (可能影响iframe加载)

## 性能说明

- 首次检查：立即执行必要的DOM查询
- 重试机制：2秒重试一次，直到找到iframe
- 内容加载：对iframe内容进行500毫秒间隔的轮询检查
- 总初始化时间：通常在3-5秒内完成

## 技术细节

### iframe检测算法

1. **快速路径**：优先尝试标准的jQuery选择器
2. **全面路径**：如果快速路径失败，遍历所有iframe
3. **智能过滤**：
   - 排除包含 "video" 的iframe
   - 优先选择包含 "audio" 的iframe
   - 保留标记为 "ans-insertaudio" 的iframe

### 加载检测机制

1. **事件监听**：监听iframe的load事件
2. **状态轮询**：每500ms检查contentDocument.readyState
3. **容错处理**：支持跨域iframe的访问失败情况

这个设计确保在各种网络条件和iframe加载顺序下都能正确初始化。
