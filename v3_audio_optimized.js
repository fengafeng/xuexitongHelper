/*
 * 学习通自动学习脚本 - xuexitongScript
 * Copyright (c) 2026 suifeng
 * 
 * 作者: suifeng
 * 项目地址: https://github.com/fengafeng/xuexitongScript
 * 
 * 本脚本仅供学习交流使用，禁止商业用途。
 * 使用请遵守相关平台规定，使用者需自行承担使用风险。
 */
(function () {
    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log("jQuery loaded.");
            initializePlayer();
        };
        document.head.appendChild(script);
    } else {
        initializePlayer();
    }

    function initializePlayer() {
        window.app = {
            // ======== 阶段日志辅助 ========
            _logPhase(phaseName, detail = '') {
                const prefix = `【${phaseName}】`;
                const msg = detail ? `${prefix} ${detail}` : prefix;
                console.log(`%c${msg}`, "color:#FF9800;font-weight:bold;font-size:13px");
                if (detail) {
                    console.log(`%c  └─ 详情:`, "color:#9E9E9E", detail);
                }
            },
            configs: {
                playbackRate: 1.0, // 1倍速播放（可通过悬浮窗调节）
                autoplay: true,
                mutePageAudio: true,
                retryInterval: 2000,
                maxRetries: 10,
                audioCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
            },
            _audioEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _nextSectionPending: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentAudioTitle: "",
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                this._logPhase("run-启动", "学习通自动刷音频脚本 V3（调试增强版 + 全自动版）");
                console.log(`%c  页面URL: ${window.location.href}`, "color:#607D8B");
                console.log(`%c  页面标题: "${document.title}"`, "color:#607D8B");
                console.log(`%c  document.readyState: ${document.readyState}`, "color:#607D8B");
                
                // 检测页面类型
                const pageType = this._detectPageType();
                this._logPhase("run-页面类型", `检测结果: ${pageType}`);
                
                switch (pageType) {
                    case 'course_list':
                        this._runCourseListAuto();
                        break;
                    case 'chapter_list':
                        this._runChapterListAuto();
                        break;
                    case 'study_page':
                        this._runStudyPageAuto();
                        break;
                    case 'content_page':
                        this._runContentPageAudio();
                        break;
                    default:
                        console.log("%c未知页面类型，尝试执行音频播放逻辑...", "color:#FF9800");
                        this._runContentPageAudio();
                }
            },

            /**
             * 自动识别当前页面类型
             */
            _detectPageType() {
                const url = window.location.href;
                
                // 课程列表页面
                if (url.includes('i.chaoxing.com/base') || 
                    url.includes('/studyApp/studying') ||
                    url.includes('/studyApp/studied') ||
                    url.includes('/studyApp/getXskc')) {
                    return 'course_list';
                }
                
                // 章节列表页面（studentcourse）
                if (url.includes('/mycourse/studentcourse')) {
                    return 'chapter_list';
                }
                
                // 学习页面（studentstudy - 有 #coursetree + #iframe）
                if (url.includes('/mycourse/studentstudy')) {
                    return 'study_page';
                }
                
                // 知识卡片内容页面（knowledge/cards - 当前脚本的运行页面）
                if (url.includes('/knowledge/cards')) {
                    return 'content_page';
                }
                
                return 'unknown';
            },

            /**
             * 课程列表页面自动化
             * 检测课程进度，点击未完成的课程
             */
            _runCourseListAuto() {
                this._logPhase("课程列表-开始", "检测课程进度...");
                console.log("%c提示: 课程数据可能在 iframe 内，等待 DOM 加载...", "color:#FF9800");
                
                setTimeout(() => {
                    this._detectAndEnterCourse();
                }, 3000);
            },
            
            _detectAndEnterCourse() {
                this._logPhase("课程列表-检测", "查找未完成课程...");
                
                // 检测所有 iframe
                const iframes = document.querySelectorAll('iframe');
                for (let i = 0; i < iframes.length; i++) {
                    try {
                        const idoc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
                        if (!idoc) continue;
                        
                        // 在 iframe 中查找进度元素
                        const progressEls = idoc.querySelectorAll('[class*="progress"], [class*="rate"], [class*="percent"], [class*="进度"], [class*="deg"]');
                        if (progressEls.length === 0) continue;
                        
                        this._logPhase("课程列表-检测", `在 iframe[${i}] 中找到 ${progressEls.length} 个进度元素`);
                        
                        for (const pEl of progressEls) {
                            const text = pEl.textContent.trim();
                            const num = parseFloat(text);
                            console.log(`%c  ├─ 进度: "${text}" → ${isNaN(num) ? '无法解析' : num}`, "color:#607D8B");
                            
                            if (!isNaN(num) && num < 100) {
                                this._logPhase("课程列表-检测", `✅ 找到未完成课程 (进度: ${num}%)`);
                                
                                // 从进度元素向上回溯，找包含"进入学习"的容器
                                let card = pEl.closest('li, [class*="card"], [class*="item"], .w_main > div, .course-item, tr');
                                if (!card) card = pEl.parentElement;
                                while (card && card.children.length < 3) {
                                    card = card.parentElement;
                                }
                                
                                // 多种方式找"进入学习"按钮
                                let enterBtn = null;
                                
                                // 方式1: a标签 href 包含 studentcourse
                                enterBtn = card.querySelector('a[href*="studentcourse"]');
                                
                                // 方式2: 文本包含"进入学习"的链接
                                if (!enterBtn) {
                                    const allLinks = card.querySelectorAll('a, button, span, div');
                                    for (const link of allLinks) {
                                        if (link.textContent.trim().includes('进入学习') || 
                                            link.textContent.trim().includes('继续学习') ||
                                            link.textContent.trim().includes('开始学习')) {
                                            enterBtn = link;
                                            break;
                                        }
                                    }
                                }
                                
                                // 方式3: 类名包含 enter / study / 学习
                                if (!enterBtn) {
                                    enterBtn = card.querySelector('[class*="enter"], [class*="study"], [class*="学习"], [class*="btn"], [class*="button"]');
                                }
                                
                                // 方式4: 直接在 iframe 中搜索所有链接
                                if (!enterBtn) {
                                    const allAnchors = idoc.querySelectorAll('a');
                                    for (const a of allAnchors) {
                                        if (a.href && (a.href.includes('studentcourse') || a.href.includes('studentstudy'))) {
                                            enterBtn = a;
                                            break;
                                        }
                                    }
                                }
                                
                                if (enterBtn) {
                                    this._logPhase("课程列表-检测", `✅ 找到"进入学习"按钮，点击: ${enterBtn.textContent.trim()}`);
                                    enterBtn.click();
                                    return;
                                } else {
                                    this._logPhase("课程列表-检测", `⚠️ 找到未完成课程但找不到进入按钮，尝试直接导航`);
                                    // 输出卡片HTML帮助调试
                                    console.log(`%c  └─ 卡片 HTML 前300字符: ${card.innerHTML.substring(0,300)}`, "color:#FF9800");
                                }
                            }
                        }
                    } catch (e) {
                        console.log(`%c  ├─ iframe[${i}] 访问出错: ${e.message}`, "color:#FF9800");
                        continue;
                    }
                }
                
                // 直接在当前页面查找课程进入链接
                const courseLinks = document.querySelectorAll('a[href*="studentcourse"]');
                if (courseLinks.length > 0) {
                    this._logPhase("课程列表-检测", `✅ 在当前页面找到 ${courseLinks.length} 个课程链接，点击第一个`);
                    courseLinks[0].click();
                } else {
                    this._logPhase("课程列表-检测", "❌ 未找到任何可点击的课程入口");
                }
            },

            /**
             * 章节列表页面自动化（studentcourse）
             * 检测章节完成状态，点击未完成小节
             * 页面结构: .main > .left > .content1 > .timeline > .units > .leveltwo > h3 > a
             * 完成: <em class="openlock"></em>  未完成: <em class="orange">N</em>
             */
            _runChapterListAuto() {
                this._logPhase("章节列表-开始", "检测章节完成状态...");
                
                const checkChapters = () => {
                    this._logPhase("章节列表-检测", "查找 .timeline .leveltwo ...");
                    
                    // 直接在 document 中查找章节节点（studentcourse 页面不使用 #coursetree）
                    let levelTwoNodes = document.querySelectorAll('.timeline .leveltwo, .content1 .leveltwo, .main .leveltwo');
                    
                    // 如果还没找到，说明可能 AJAX 还没加载完，等一会儿
                    if (!levelTwoNodes || levelTwoNodes.length === 0) {
                        // 也尝试在 iframe 中查找（课程列表的 iframe 可能包含章节树）
                        const iframes = document.querySelectorAll('iframe');
                        for (let i = 0; i < iframes.length; i++) {
                            try {
                                const idoc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
                                if (!idoc) continue;
                                levelTwoNodes = idoc.querySelectorAll('.timeline .leveltwo, .leveltwo');
                                if (levelTwoNodes.length > 0) {
                                    this._logPhase("章节列表-检测", `✅ 在 iframe[${i}] 中找到章节节点`);
                                    break;
                                }
                            } catch(e) { continue; }
                        }
                    }
                    
                    if (!levelTwoNodes || levelTwoNodes.length === 0) {
                        // 还尝试找任意含 openlock 或 orange 的节点
                        const fallbackNodes = document.querySelectorAll('.openlock, .orange');
                        if (fallbackNodes.length > 0) {
                            this._logPhase("章节列表-检测", `通过 .openlock/.orange 找到 ${fallbackNodes.length} 个状态标记，尝试解析`);
                            // 从这些标记反推父级 leveltwo 或 h3
                            for (const marker of fallbackNodes) {
                                const parentA = marker.closest('a');
                                const parentH3 = marker.closest('h3');
                                const parentLevel = marker.closest('.leveltwo');
                                const clickTarget = parentA || parentH3?.querySelector('a');
                                if (clickTarget && marker.classList.contains('orange')) {
                                    const count = marker.textContent.trim();
                                    this._logPhase("章节列表-检测", `▶️ 未完成任务点 (剩余 ${count})，点击: "${clickTarget.getAttribute('aria-label') || clickTarget.textContent.trim().substring(0,40)}"`);
                                    clickTarget.click();
                                    return;
                                }
                            }
                        }
                        
                        this._logPhase("章节列表-检测", "⏳ 章节树尚未加载，3秒后重试...");
                        setTimeout(checkChapters, 3000);
                        return;
                    }
                    
                    this._logPhase("章节列表-检测", `✅ 找到 ${levelTwoNodes.length} 个章节节点，逐一检测状态`);
                    
                    for (const node of levelTwoNodes) {
                        // 检测任务完成状态
                        const orange = node.querySelector('.orange');
                        const openlock = node.querySelector('.openlock');
                        const jobCount = node.querySelector('.knowledgeJobCount');
                        
                        if (orange) {
                            const count = orange.textContent.trim();
                            const link = node.querySelector('h3 a, a[href*="studentstudy"]');
                            const title = link ? (link.getAttribute('aria-label') || link.textContent.trim()) : '未知';
                            this._logPhase("章节列表-检测", `▶️ 未完成任务点: "${title}" (剩余 ${count} 个)`);
                            
                            if (link) {
                                this._logPhase("章节列表-检测", `✅ 点击链接进入: "${title}"`);
                                link.click();
                                return;
                            }
                        } else if (openlock) {
                            const link = node.querySelector('h3 a, a[href*="studentstudy"]');
                            const title = link ? (link.getAttribute('aria-label') || link.textContent.trim().substring(0, 50)) : '未知';
                            console.log(`%c  ├─ ✅ 已完成: ${title}`, "color:#4CAF50");
                        } else if (jobCount) {
                            const count = jobCount.value;
                            if (count !== '0') {
                                const link = node.querySelector('h3 a, a[href*="studentstudy"]');
                                if (link) {
                                    this._logPhase("章节列表-检测", `⏳ 有 ${count} 个任务点，进入: "${link.getAttribute('aria-label')}"`);
                                    link.click();
                                    return;
                                }
                            }
                        }
                    }
                    
                    // 所有已完成
                    this._logPhase("章节列表-检测", "✅ 所有章节已完成！");
                };
                
                // 等待 DOM 加载
                setTimeout(checkChapters, 2000);
            },

            /**
             * 学习页面自动化（studentstudy）
             * 有 #coursetree（左）和 #iframe（右），需要等待 iframe 加载内容
             */
            _runStudyPageAuto() {
                this._logPhase("学习页面-开始", "检测 #coursetree 和 #iframe...");
                
                // 等待 #iframe 加载完成，然后在其内容中执行音频播放
                const checkIframe = () => {
                    const iframe = document.getElementById('iframe');
                    if (!iframe) {
                        this._logPhase("学习页面-检测", "⏳ 未找到 #iframe，等待...");
                        setTimeout(checkIframe, 2000);
                        return;
                    }
                    
                    this._logPhase("学习页面-检测", "✅ 找到 #iframe，等待内容加载...");
                    
                    // 监听 iframe load 事件
                    iframe.addEventListener('load', () => {
                        this._logPhase("学习页面-检测", "✅ #iframe 已加载，触发音频播放");
                        this._runContentPageAudio();
                    });
                    
                    // 如果已经加载完成
                    try {
                        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (idoc && idoc.readyState === 'complete') {
                            this._logPhase("学习页面-检测", "✅ #iframe 内容已就绪");
                            this._runContentPageAudio();
                        }
                    } catch(e) {
                        this._logPhase("学习页面-检测", `⚠️ iframe 访问受限: ${e.message}`);
                    }
                };
                
                setTimeout(checkIframe, 1000);
            },
            /**
             * 内容页面音频播放（原有逻辑）
             */
            _runContentPageAudio() {
                this._logPhase("内容页-启动", "启动音频播放逻辑...");
                
                // 检测核心元素 #coursetree 是否存在（提前诊断）
                const coursetreeExists = document.getElementById('coursetree');
                console.log(`%c  $('#coursetree') 是否存在: ${coursetreeExists ? '✅ 存在' : '❌ 不存在'}`, coursetreeExists ? "color:#4CAF50" : "color:#F44336");
                if (!coursetreeExists) {
                    // 尝试在父页面找
                    try {
                        if (window.parent && window.parent.document.getElementById('coursetree')) {
                            console.log(`%c  └─ 但父页面中存在 #coursetree`, "color:#4CAF50");
                        }
                    } catch(e) {}
                    console.log(`%c  └─ 将使用卡片级导航`, "color:#FF9800");
                    const allIds = Array.from(document.querySelectorAll('[id]')).map(el => el.id).slice(0, 30);
                    console.log(`%c  └─ 页面现有 id 列表(前30):`, "color:#9E9E9E", allIds);
                }
                
                // 检测 iframe 数量
                const iframeCount = document.querySelectorAll('iframe').length;
                console.log(`%c  页面 iframe 数量: ${iframeCount}`, "color:#607D8B");

                this._logPhase("内容页-任务检测", "检查任务是否已完成...");
                
                // 添加DOM变化监听器来实时检测任务完成
                const taskCompletionObserver = new MutationObserver((mutations) => {
                    for (let mutation of mutations) {
                        if (mutation.type === 'childList') {
                            const addedNodes = mutation.addedNodes;
                            for (let node of addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const completedElements = node.querySelectorAll('[aria-label="任务点已完成"]');
                                    if (completedElements.length > 0) {
                                        console.log("%c✓ DOM监听器: 检测到任务完成图标被添加", "color:#4CAF50;font-weight:bold");
                                        this._navigateToNextSection();
                                        return;
                                    }
                                }
                            }
                        } else if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
                            const target = mutation.target;
                            if (target.getAttribute('aria-label') === '任务点已完成') {
                                console.log("%c✓ 属性监听器: 检测到aria-label变为任务完成", "color:#4CAF50;font-weight:bold");
                                this._navigateToNextSection();
                                return;
                            }
                        }
                    }
                });
                
                taskCompletionObserver.observe(document.body, { 
                    childList: true, 
                    subtree: true, 
                    attributes: true, 
                    attributeFilter: ['aria-label'] 
                });
                
                const checkTaskCompletion = () => {
                    return this._detectTaskCompleted();
                };

                const detectOnLoad = () => {
                    if (checkTaskCompletion()) {
                        this._navigateToNextSection();
                        return true;
                    }
                    return false;
                };
                
                const loadDetected = detectOnLoad();
                this._logPhase("内容页-立即检测", loadDetected ? "✅ 任务已完成，跳过播放" : "⏳ 任务未完成，继续初始化");
                if (loadDetected) {
                    return;
                }
                
                if (document.readyState === 'loading') {
                    this._logPhase("内容页-加载等待", "document 仍在 loading，挂载 DOMContentLoaded 事件");
                    document.addEventListener('DOMContentLoaded', () => {
                        this._logPhase("内容页-DOMContentLoaded", "触发！");
                        setTimeout(() => {
                            if (detectOnLoad()) {
                                this._logPhase("内容页-DOMContentLoaded检测", "✅ 任务已完成");
                                return;
                            }
                            this._logPhase("内容页-DOMContentLoaded检测", "⏳ 未完成，开始初始化");
                            this._startTaskCompletionMonitor();
                            this._startAudioInitialization();
                        }, 1000);
                    });
                } else {
                    this._logPhase("内容页-dom就绪", `DOM 已就绪 (readyState=${document.readyState})，延迟1秒后初始化`);
                    setTimeout(() => {
                        if (detectOnLoad()) {
                            this._logPhase("内容页-延迟检测", "✅ 任务已完成");
                            return;
                        }
                        this._logPhase("内容页-延迟检测", "⏳ 未完成，开始初始化");
                        this._startTaskCompletionMonitor();
                        this._startAudioInitialization();
                    }, 1000);
                }
            },
            _startAudioInitialization() {
                this._logPhase("音频初始化-开始", "开始智能查找音频 iframe...");
                
                // 智能查找音频iframe - 支持多种选择器和嵌套查找
                const findAudioIframe = () => {
                    this._logPhase("音频初始化-findIframe", "第1阶段：尝试 CSS 选择器直接匹配");
                    // 第一阶段：尝试直接选择器查找
                    const selectors = [
                        "iframe.ans-insertaudio",           // 标准class
                        "iframe[class*='audio']",           // 包含audio的class
                        "iframe[name*='audio']",            // 包含audio的name属性
                        "iframe[title*='audio']",           // 包含audio的title
                        "div[id*='ans-insertaudio'] iframe", // 嵌套在div中的iframe
                        "iframe[src*='audio']",             // src包含audio
                        ".ans-insertaudio iframe",          // ans-insertaudio class下的iframe
                    ];
                    
                    for (const selector of selectors) {
                        const found = $(selector);
                        console.log(`%c  ├─ 选择器 "${selector}": ${found.length > 0 ? `✅ 命中 ${found.length} 个` : '❌ 未命中'}`, found.length > 0 ? "color:#4CAF50" : "color:#9E9E9E");
                        if (found.length > 0) {
                            this._logPhase("音频初始化-findIframe", `✅ 第1阶段通过选择器 "${selector}" 找到 ${found.length} 个iframe`);
                            return found.eq(0);
                        }
                    }
                    
                    // 第二阶段：遍历所有iframe
                    this._logPhase("音频初始化-findIframe", "第2阶段：遍历页面所有 iframe");
                    const allIframes = $("iframe");
                    console.log(`%c  ├─ 页面中共有 ${allIframes.length} 个 iframe`, "color:#9C27B0");
                    
                    for (let i = 0; i < allIframes.length; i++) {
                        const iframe = allIframes.eq(i);
                        const src = iframe.attr('src') || '';
                        const className = iframe.attr('class') || '';
                        const id = iframe.attr('id') || '';
                        const name = iframe.attr('name') || '';
                        
                        const candidate = src.includes('audio') || className.includes('audio') || 
                            id.includes('audio') || name.includes('audio') ||
                            src.includes('insert') || className.includes('ans');
                        const skip = src.includes('video') || className.includes('video') || 
                            id.includes('video') || name.includes('video');
                        
                        const marker = skip ? '⏭️跳过' : candidate ? '🎯候选' : '   ';
                        console.log(`%c  iframe[${i}] ${marker} src="${src.substring(0,80)}" class="${className}" id="${id}" name="${name}"`, 
                            candidate ? "color:#4CAF50" : skip ? "color:#FF9800" : "color:#9C27B0");
                        
                        // 排除明显是视频的iframe
                        if (skip) {
                            continue;
                        }
                        
                        // 寻找音频相关的iframe
                        if (candidate) {
                            this._logPhase("音频初始化-findIframe", `✅ 第2阶段在 iframe[${i}] 匹配到音频特征`);
                            return iframe;
                        }
                    }
                    
                    // 第三阶段：检查嵌套的iframe内容
                    this._logPhase("音频初始化-findIframe", "第3阶段：检查嵌套 iframe 内容");
                    for (let i = 0; i < allIframes.length; i++) {
                        const parentIframe = allIframes.eq(i);
                        try {
                            const iframeDoc = parentIframe.contents();
                            if (!iframeDoc || iframeDoc.length === 0) {
                                console.log(`%c  iframe[${i}]: 无法获取内容（跨域或未加载）`, "color:#FF9800");
                                continue;
                            }
                            
                            const nestedIframes = iframeDoc.find("iframe");
                            if (nestedIframes.length > 0) {
                                this._logPhase("音频初始化-嵌套", `iframe[${i}] 内部发现 ${nestedIframes.length} 个嵌套 iframe`);
                                
                                for (let j = 0; j < nestedIframes.length; j++) {
                                    const nestedIframe = $(nestedIframes[j]);
                                    const nestedSrc = nestedIframe.attr('src') || '';
                                    const nestedClass = nestedIframe.attr('class') || '';
                                    const nestedId = nestedIframe.attr('id') || '';
                                    
                                    const isVideo = nestedSrc.includes('video') || nestedClass.includes('video');
                                    console.log(`%c  └─ 嵌套[${i}][${j}]: src="${nestedSrc.substring(0,80)}" class="${nestedClass}" id="${nestedId}" ${isVideo ? '⏭️视频' : '检查中'}`, 
                                        isVideo ? "color:#FF9800" : "color:#9C27B0");
                                    
                                    // 检查嵌套iframe是否是音频
                                    if (!isVideo) {
                                        if (nestedSrc.includes('audio') || nestedClass.includes('audio') || 
                                            nestedId.includes('audio') || nestedSrc.includes('insert')) {
                                            this._logPhase("音频初始化-嵌套", `✅ 在iframe[${i}]内找到音频iframe[${j}]`);
                                            return nestedIframe;
                                        }
                                    }
                                }
                            } else {
                                console.log(`%c  iframe[${i}]: 内容可访问，但无嵌套 iframe`, "color:#9E9E9E");
                            }
                        } catch (e) {
                            console.log(`%c  iframe[${i}]: ❌ 访问内容出错: ${e.message}`, "color:#F44336");
                            // 跳过无法访问的iframe（跨域）
                            continue;
                        }
                    }
                    
                    this._logPhase("音频初始化-findIframe", "❌ 所有阶段均未找到音频 iframe");
                    return null;  // 没找到
                };
                
                // 等待音频iframe加载完成
                const waitForAudioFrame = () => {
                    const frameObj = findAudioIframe();
                    if (!frameObj || frameObj.length === 0) {
                        console.log("%c音频iframe还未加载，2秒后重试...", "color:#FF9800");
                        setTimeout(waitForAudioFrame, 2000);
                        return;
                    }
                    
                    const iframe = frameObj[0];  // frameObj是jQuery对象或null
                    this._logPhase("音频初始化-waitFrame", `✅ 找到音频 iframe，src: ${(iframe.src || '').substring(0,80)}`);
                    console.log(`%c  class: ${iframe.className}, id: ${iframe.id}, name: ${iframe.name}`, "color:#607D8B");
                    
                    // 如果iframe已经加载完成，直接检查内容
                    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                        this._logPhase("音频初始化-waitFrame", "▶️ 分支A: iframe 已完全加载 (readyState=complete)，直接初始化");
                        setTimeout((() => {
                            this._phaseInitSequence("分支A-direct");
                        }).bind(this), 500);
                        return;
                    }
                    
                    // 监听iframe加载事件
                    this._logPhase("音频初始化-waitFrame", "▶️ 分支B: iframe 尚未完成加载，挂载 load 事件 + 轮询");
                    const onIframeLoad = (() => {
                        this._logPhase("音频初始化-onLoad", "✅ iframe load 事件触发！");
                        iframe.removeEventListener('load', onIframeLoad);
                        setTimeout((() => {
                            this._phaseInitSequence("分支B-onLoad");
                        }).bind(this), 1000); // 给内容加载一点额外时间
                    }).bind(this);
                    
                    iframe.addEventListener('load', onIframeLoad);
                    
                    // 同时也启动定期检查，以防load事件不触发
                    const checkIframeContent = (() => {
                        try {
                            const iframeDoc = iframe.contentDocument;
                            if (!iframeDoc) {
                                console.log(`%c  ├─ 轮询: 无法访问iframe内容 (可能跨域或未加载)`, "color:#FF9800");
                                setTimeout(checkIframeContent, 500);
                                return;
                            }
                            
                            // 检查文档readyState
                            const docReady = iframeDoc.readyState === 'complete' || 
                                           iframeDoc.readyState === 'interactive';
                            if (!docReady) {
                                console.log(`%c  ├─ 轮询: iframe文档状态=${iframeDoc.readyState}，等待完成`, "color:#FF9800");
                                setTimeout(checkIframeContent, 500);
                                return;
                            }
                            
                            this._logPhase("音频初始化-轮询", `✅ iframe 文档状态=${iframeDoc.readyState}，开始初始化`);
                            iframe.removeEventListener('load', onIframeLoad); // 移除监听器
                            this._phaseInitSequence("分支C-poll");
                        } catch (e) {
                            console.log(`%c  ├─ 轮询: ❌ 出错 ${e.message}，500ms后重试`, "color:#F44336");
                            setTimeout(checkIframeContent, 500);
                        }
                    }).bind(this);
                    
                    setTimeout(checkIframeContent, 1000);
                };
                
                setTimeout(waitForAudioFrame, 2000);
            },
            /**
             * 统一的初始化序列（带阶段日志和异常兜底）
             */
            _phaseInitSequence(source) {
                this._logPhase("初始化序列", `来源: ${source}`);
                const steps = [
                    { name: '_getTreeContainer', fn: () => this._getTreeContainer() },
                    { name: '_initCellData',      fn: () => this._initCellData() },
                    { name: '重置_audioEl',       fn: () => { this._audioEl = null; } },
                    { name: '_getAudioEl',         fn: () => this._getAudioEl() },
                    { name: '_clearCheckInterval', fn: () => this._clearCheckInterval() },
                    { name: '_bindStepNavigation', fn: () => this._bindStepNavigation() },
                    { name: 'play',                fn: () => this.play() },
                ];
                for (const step of steps) {
                    try {
                        this._logPhase(`init-${step.name}`, `开始执行...`);
                        const result = step.fn();
                        if (result === null || result === false) {
                            console.log(`%c  └─ 返回: null/false（正常）`, "color:#9E9E9E");
                        } else if (result !== undefined) {
                            console.log(`%c  └─ 返回:`, "color:#9E9E9E", result);
                        }
                    } catch (e) {
                        console.log(`%c⚠️ init-${step.name} 抛出异常: ${e.message}`, "color:#F44336;font-weight:bold");
                        console.log(`%c  └─ 继续执行下一步...`, "color:#FF9800");
                    }
                }
                this._logPhase("初始化序列", "✅ 所有步骤执行完毕");
            },
            nextUnit() {
                this._logPhase("导航-nextUnit", `当前: 第${this._cellData.currentCellIndex + 1}章 第${this._cellData.currentNCellIndex + 1}节`);
                
                // 尝试获取课程树
                const el = this._getTreeContainer();
                
                // 如果没有课程树，使用卡片级导航
                if (!el) {
                    this._logPhase("导航-nextUnit", "ℹ️ 无课程树，尝试卡片级导航（#right1）");
                    const nextBtn = document.getElementById('right1');
                    if (nextBtn) {
                        this._logPhase("导航-nextUnit", "✅ 找到 #right1，模拟点击下一节");
                        nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        this._audioEl = null;
                        this._isPlaying = false;
                        this._nextSectionPending = false;
                        setTimeout(() => {
                            try {
                                this._initCellData();
                                this.play();
                            } catch (e) {
                                this._logPhase("导航-nextUnit", `❌ 卡片导航重播失败: ${e.message}`);
                            }
                        }, 3000);
                    } else {
                        this._logPhase("导航-nextUnit", "❌ 无可用的导航方式（无 #coursetree、无 #right1）");
                        console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        console.log("%c==============当前小节播放完成==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                        console.log("%c==========请手动切换到下一章节=============", "color:#FF9800;font-size:16px;font-weight:bold");
                        console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                    }
                    this._clearCheckInterval();
                    return;
                }
                
                // 有课程树，用树结构导航
                const cells = el.children("ul").children("li");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                
                console.log(`%c  ├─ 当前章节共有 ${nCells.length} 个音频节点`, "color:#607D8B");
                console.log(`%c  ├─ 当前节点索引: ${this._cellData.currentNCellIndex + 1}/${nCells.length}`, "color:#607D8B");

                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    const nextNIndex = this._cellData.currentNCellIndex + 1;
                    this._logPhase("导航-nextUnit", `▶️ 同章节下一个音频: ${nextNIndex + 1}/${nCells.length}`);
                    this.playCurrentIndex(nCells.get(nextNIndex));
                } else {
                    const nextIndex = this._cellData.currentCellIndex + 1;
                    if (nextIndex >= cells.length) {
                        this._logPhase("导航-nextUnit", "✅ 当前章节已完成，尝试点击下一节按钮");
                        
                        // 尝试点击下一节按钮
                        const nextBtn = document.getElementById('right1');
                        if (nextBtn) {
                            this._logPhase("导航-nextUnit", `✅ 找到下一节按钮(#right1)，模拟点击`);
                            nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                            this._audioEl = null;
                            this._isPlaying = false;
                            setTimeout(() => {
                                try {
                                    this._initCellData();
                                    this.play();
                                } catch (e) {
                                    this._logPhase("导航-nextUnit", `❌ 切换下一节失败: ${e.message}`);
                                }
                            }, 3000);
                        } else {
                            this._logPhase("导航-nextUnit", "❌ 未找到 #right1 按钮（可能已完成所有课程）");
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                            console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        }
                        
                        this._clearCheckInterval();
                        return;
                    }
                    this._logPhase("导航-nextUnit", `▶️ 切换到下一章节: ${nextIndex + 1}/${cells.length}`);
                    this._cellData.currentCellIndex = nextIndex;
                    this._cellData.currentNCellIndex = 0;
                    this.playCurrentIndex();
                }
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _startAudioMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkAudioStatus();
                }, this.configs.audioCheckInterval);
            },
            _tryResumePlayback(reason) {
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
                    return;
                }
                this._guardLastResumeTs = now;

                const audio = this._getAudioEl();
                if (!audio || !this._isPlaying) return;

                console.log(`%c触发音频保活恢复(${reason})`, "color:#607D8B");
                audio.play().catch((e) => {
                    console.warn("直接恢复播放失败，尝试静音恢复:", e);
                    audio.muted = true;
                    audio.play().catch((err) => {
                        console.error("静音恢复播放失败:", err);
                    });
                });
            },
            _checkAudioStatus() {
                try {
                    const audio = this._getAudioEl();
                    if (!audio) return;

                    if (audio.paused && this._isPlaying) {
                        console.log("%c检测到音频暂停，尝试恢复播放...", "color:#FF5722");
                        this._tryResumePlayback("paused");
                    } else if (this._isPlaying && !audio.ended) {
                        const now = Date.now();
                        const current = Number(audio.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                this._tryResumePlayback("no-progress");
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(audio.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }

                    if (audio.ended && this._isPlaying) {
                        console.log("%c检测到音频结束，准备切换下一个...", "color:#9C27B0");
                        this._isPlaying = false;
                        setTimeout(() => this.nextUnit(), 1000);
                    }
                } catch (e) {
                    console.error("音频状态检查失败:", e);
                }
            },
            _tryTimes: 0,
            _stepAdvanceTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,
            _delayedNextUnitTimer: null,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            async play() {
                this._logPhase("play", `尝试播放 (重试 #${this._tryTimes}/${this.configs.maxRetries})`);
                try {
                    const el = this._getAudioEl();
                    if (el == null) {
                        this._logPhase("play", "_getAudioEl 返回 null，尝试切换学习步骤");
                        if (this._advanceLearningStep()) {
                            console.log("%c当前不在音频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
                            setTimeout(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        console.log("%c===========跳过章节测验，2秒后继续播放==============", "color:#607D8B");
                        $("#prevNextFocusNext").click();
                        setTimeout(() => {
                            this.play();
                        }, 2000);
                        return;
                    }

                    this._logPhase("play", `✅ 找到音频元素: <${el.tagName}> id="${el.id}"`);
                    this._tryTimes = 0;
                    this._isPlaying = true;
                    this._audioEventHandle();
                    el.playbackRate = this.configs.playbackRate;
                    if (this.configs.mutePageAudio) {
                        el.muted = true;
                        console.log("%c已静音当前页面的音频播放", "color:#607D8B");
                    }

                    try {
                        console.log("%c尝试播放音频...", "color:#FF9800");
                        await el.play();
                        this._logPhase("play", `✅ 音频开始播放，倍速: ${el.playbackRate}x`);
                        this._startAudioMonitoring();
                    } catch (playError) {
                        this._logPhase("play", `❌ 直接播放失败: ${playError.message}`);
                        console.log("%c尝试静音播放...", "color:#FF9800");
                        // 尝试静音播放
                        el.muted = true;
                        try {
                            await el.play();
                            this._logPhase("play", "✅ 静音播放成功");
                            this._startAudioMonitoring();
                        } catch (mutedError) {
                            this._logPhase("play", `❌ 静音播放也失败: ${mutedError.message}`);
                            this._handlePlayError(playError);
                        }
                    }
                } catch (e) {
                    this._logPhase("play", `❌ 播放尝试异常: ${e.message}`);
                    if (this._tryTimes > this.configs.maxRetries) {
                        this._logPhase("play", `❌ 已达到最大重试次数 (${this.configs.maxRetries})，停止`, "color:#F44336;font-weight:bold");
                        this._clearCheckInterval();
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
                    setTimeout(() => {
                        this.play();
                    }, this.configs.retryInterval);
                }
            },
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
                    this._logPhase("_advanceLearningStep", "⏳ 冷却期内，跳过 (4秒内)");
                    return true;
                }

                const prevTitle = document.getElementsByClassName("prev_title")[0];
                const currentStepTitle = prevTitle ? (prevTitle.title || prevTitle.textContent || "").trim() : "";
                this._logPhase("_advanceLearningStep", `当前步骤标题: "${currentStepTitle}"`);

                if (currentStepTitle === "章节测验" || currentStepTitle === "音频") {
                    this._logPhase("_advanceLearningStep", `✅ 当前已是 "${currentStepTitle}" 页，无需切换`);
                    return false;
                }

                const clickElement = (el, label) => {
                    if (!el) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    console.log(`%c尝试点击${label}`, "color:#2196F3");
                    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                    return true;
                };

                this._logPhase("_advanceLearningStep", "查找「音频」页签...");
                const audioTab = $(".prev_white:visible").filter((_, el) => {
                    const text = ($(el).text() || "").replace(/\s+/g, "");
                    return text === "2音频" || text === "音频";
                }).get(0);
                if (audioTab) {
                    this._logPhase("_advanceLearningStep", "✅ 找到「音频」页签，点击");
                    clickElement(audioTab, "“音频”页签");
                    return true;
                } else {
                    this._logPhase("_advanceLearningStep", "❌ 未找到「音频」页签");
                }

                return false;
            },
            _bindStepNavigation() {
                if (this._stepNavigationBound) {
                    return;
                }
                this._stepNavigationBound = true;

                const reenterAudioMode = () => {
                    this._audioEl = null;
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    setTimeout(() => {
                        try {
                            this._initCellData();
                        } catch (e) {}
                        this.play();
                    }, 1800);
                };

                $(document).on("click", ".prev_white", (e) => {
                    const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
                    if (text.includes("音频")) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管音频页`, "color:#607D8B");
                        reenterAudioMode();
                    }
                });
            },
            _navigateToNextSection() {
                if (this._nextSectionPending) {
                    console.log("%c已在切换下一节中，忽略重复导航请求", "color:#FFC107");
                    return;
                }

                const nextBtn = document.getElementById('right1');
                if (!nextBtn) {
                    this._logPhase("_navigateToNextSection", "❌ 找不到 #right1 下一节按钮");
                    return;
                }

                this._nextSectionPending = true;
                this._logPhase("_navigateToNextSection", "模拟点击 #right1 下一节按钮");
                nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                this._resetForNavigation();
                this._waitForNextSectionReady();
            },
            _resetForNavigation() {
                this._logPhase("_resetForNavigation", "重置: audioEl=null, treeContainerEl=null, isPlaying=false");
                this._audioEl = null;
                this._treeContainerEl = null;
                this._isPlaying = false;
                this._stepSwitchPending = false;
                this._clearCheckInterval();
            },
            _waitForNextSectionReady(attempt = 0) {
                if (attempt > 20) {
                    this._nextSectionPending = false;
                    this._logPhase("_waitForNextSectionReady", "❌ 超过20次重试，超时停止");
                    return;
                }

                try {
                    this._initCellData();
                    const audio = this._getAudioEl();
                    if (audio) {
                        this._logPhase("_waitForNextSectionReady", `✅ 第${attempt + 1}次尝试: 下一节已准备，开始播放`);
                        audio.playbackRate = this.configs.playbackRate;
                        this._bindStepNavigation();
                        if (this.configs.autoplay) {
                            this.play();
                        }
                        this._nextSectionPending = false;
                        return;
                    } else {
                        console.log(`%c  ├─ 第${attempt + 1}次尝试: 下一节未就绪`, "color:#607D8B");
                    }
                } catch (e) {
                    console.log(`%c  ├─ 第${attempt + 1}次尝试: ${e.message}`, "color:#FF9800");
                }

                setTimeout(() => this._waitForNextSectionReady(attempt + 1), 2000);
            },
            _detectTaskCompleted() {
                const methods = [];
                
                // 方法1: aria-label
                let completedLabels = document.querySelectorAll('[aria-label="任务点已完成"]');
                if (completedLabels.length === 0) {
                    const allIframes = document.querySelectorAll('iframe');
                    for (let iframe of allIframes) {
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                                const iframeLabels = iframeDoc.querySelectorAll('[aria-label="任务点已完成"]');
                                if (iframeLabels.length > 0) {
                                    completedLabels = iframeLabels;
                                    console.log("%c✓ 在iframe中找到任务完成元素", "color:#4CAF50");
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
                methods.push({ name: "方法1: aria-label", result: completedLabels.length > 0, count: completedLabels.length });

                // 方法2: 文本内容
                let textFound = false;
                const completedTextElements = document.querySelectorAll('*');
                for (let el of completedTextElements) {
                    if (el.textContent && el.textContent.includes('任务点已完成')) {
                        textFound = true;
                        break;
                    }
                }
                methods.push({ name: "方法2: 文本内容", result: textFound });

                // 方法3: CSS类
                const completedElements = document.querySelectorAll('.ans-job-finished, .task-completed, [data-status="completed"]');
                methods.push({ name: "方法3: CSS类", result: completedElements.length > 0, count: completedElements.length });

                // 方法4: 页面标题
                const pageTitle = document.title || '';
                methods.push({ name: "方法4: 页面标题", result: pageTitle.includes('已完成') || pageTitle.includes('完成') });

                // 方法5: URL
                const currentUrl = window.location.href;
                methods.push({ name: "方法5: URL", result: currentUrl.includes('completed') || currentUrl.includes('finish') || currentUrl.includes('done') });

                // 方法6: 弹窗元素
                const completionPopups = document.querySelectorAll('.completion-popup, .task-finished, .finished-modal, [class*="complete"]');
                methods.push({ name: "方法6: 弹窗元素", result: completionPopups.length > 0, count: completionPopups.length });

                // 输出所有方法的结果
                this._logPhase("_detectTaskCompleted", `检测任务完成状态 (${methods.length}种方法):`);
                methods.forEach(m => {
                    const icon = m.result ? '✅' : '❌';
                    const extra = m.count !== undefined ? ` (数量: ${m.count})` : '';
                    console.log(`%c  ${icon} ${m.name}${extra}`, m.result ? "color:#4CAF50" : "color:#9E9E9E");
                });

                const overall = methods.some(m => m.result);
                if (overall) {
                    this._logPhase("_detectTaskCompleted", "✅ 综合判定: 任务已完成");
                }
                return overall;
            },
            _startTaskCompletionMonitor() {
                // 每120秒检查一次任务完成状态
                setInterval(() => {
                    this._checkTaskCompletion();
                }, 120000);
            },
            _checkTaskCompletion() {
                try {
                    if (this._detectTaskCompleted()) {
                        this._navigateToNextSection();
                    }
                } catch (e) {
                    console.error("检查任务完成状态失败:", e);
                }
            },
            _handlePlayError(error) {
                console.error("播放错误详情:", error);
                const audio = this._getAudioEl();
                if (audio) {
                    audio.muted = true;
                    audio.play().then(() => {
                        console.log("%c静音播放成功", "color:#4CAF50");
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                            this._delayedNextUnitTimer = null;
                        }
                    }).catch(e => {
                        console.error("静音播放也失败:", e);
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                        }
                        this._delayedNextUnitTimer = setTimeout(() => {
                            this._delayedNextUnitTimer = null;
                            this.nextUnit();
                        }, 3000);
                    });
                }
            },
            playCurrentIndex(nCell) {
                this._logPhase("导航-playCurrentIndex", "进入");
                if (!nCell) {
                    const el = this._getTreeContainer();
                    if (!el) {
                        this._logPhase("导航-playCurrentIndex", "❌ 无课程树，无法定位当前节点");
                        this.nextUnit(); // 回到 nextUnit 走卡片导航兜底
                        return;
                    }
                    const cells = el.children("ul").children("li");
                    if (!cells || cells.length === 0) {
                        this._logPhase("导航-playCurrentIndex", "❌ 课程树无章节数据");
                        this.nextUnit();
                        return;
                    }
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex);
                    this._logPhase("导航-playCurrentIndex", `自动定位: 章节[${this._cellData.currentCellIndex}] 节点[${this._cellData.currentNCellIndex}]`);
                }

                const $nCell = $(nCell);
                const clickableSpan = $nCell.find(".posCatalog_name")[0];
                if (!clickableSpan) {
                    this._logPhase("导航-playCurrentIndex", "❌ 找不到可点击的 .posCatalog_name");
                    setTimeout(() => this.nextUnit(), 2000);
                    return;
                }

                const title = $(clickableSpan).attr('title') || '未知标题';
                this._logPhase("导航-playCurrentIndex", `▶️ 点击切换到: "${title}"`);
                $(clickableSpan).click();
                this._audioEl = null;
                this._isPlaying = false;

                console.log("%c等待音频加载（3秒）...", "color:#FF9800");
                setTimeout(() => {
                    try {
                        this._initCellData();
                    } catch(e) {
                        this._logPhase("导航-playCurrentIndex", `⚠️ 重新初始化 _initCellData 失败: ${e.message}`);
                    }
                    if (this.configs.autoplay) {
                        this.play();
                    }
                }, 3000);
            },
            _initCellData() {
                this._logPhase("_initCellData", "解析课程目录树...");
                const el = this._getTreeContainer();
                if (!el) {
                    this._logPhase("_initCellData", "⚠️ _getTreeContainer 返回 null，跳过初始化（将使用卡片级导航）");
                    return;
                }
                
                // 检测树结构类型：新式(.cells > .ncells) 还是旧式(ul > li > .posCatalog_select)
                const newStyleCells = el.find('.cells > .ncells');
                const oldStyleCells = el.find('.posCatalog_select:not(.firstLayer)');
                const useNewStyle = newStyleCells.length > oldStyleCells.length;
                
                this._logPhase("_initCellData", `树结构检测: 新式节点 ${newStyleCells.length} 个, 旧式节点 ${oldStyleCells.length} 个 → 使用${useNewStyle ? '新式' : '旧式'}解析`);
                
                if (useNewStyle) {
                    // 新式结构解析: .cells(章) > .ncells(节) > h4/h5(可点击)
                    const chapters = el.find('.cells');
                    this._cellData.cells = chapters.length;
                    this._logPhase("_initCellData", `新式解析: ${chapters.length} 个章节`);
                    
                    let nCellCounts = 0;
                    let foundCurrent = false;
                    
                    chapters.each((i, chapter) => {
                        const $chapter = $(chapter);
                        const chapterTitle = $chapter.find('.cells_top').text().trim() || `章节${i+1}`;
                        const sections = $chapter.find('.ncells');
                        nCellCounts += sections.length;
                        
                        // 找当前激活章节
                        let hasCurrent = false;
                        sections.each((j, section) => {
                            const $section = $(section);
                            const isCurrent = $section.find('h4.currents, h5.currents').length > 0;
                            if (isCurrent && !hasCurrent) {
                                this._cellData.currentCellIndex = i;
                                this._cellData.currentNCellIndex = j;
                                foundCurrent = true;
                                hasCurrent = true;
                                this._cellData.currentAudioTitle = $section.find('h4, h5').first().text().trim();
                            }
                        });
                        
                        console.log(`%c  ├─ 章节[${i}]: "${chapterTitle}" → 含 ${sections.length} 个音频节点`, "color:#607D8B");
                    });
                    
                    this._cellData.nCells = nCellCounts;
                    this._logPhase("_initCellData", `新式统计: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`);
                } else {
                    // 旧式结构解析: ul > li > .posCatalog_select
                    const cells = el.children("ul").children("li");
                    this._cellData.cells = cells.length;
                    this._logPhase("_initCellData", `旧式解析: ${cells.length} 个顶层章节`);
                    
                    let nCellCounts = 0;
                    let foundCurrent = false;

                    cells.each((i, v) => {
                        const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                        nCellCounts += nCells.length;
                        const chapterTitle = $(v).find('.posCatalog_name').first().attr('title') || `章节${i+1}`;
                        console.log(`%c  ├─ 章节[${i}]: "${chapterTitle}" → 含 ${nCells.length} 个音频节点`, "color:#607D8B");
                        
                        nCells.each((j, e) => {
                            const _el = $(e);
                            if (_el.hasClass("posCatalog_active")) {
                                this._cellData.currentCellIndex = i;
                                this._cellData.currentNCellIndex = j;
                                foundCurrent = true;
                                const titleSpan = _el.find('.posCatalog_name')[0];
                                if (titleSpan) {
                                    this._cellData.currentAudioTitle = $(titleSpan).attr('title');
                                }
                                console.log(`%c  └─ ▶️ 当前激活: 章节[${i}] 音频[${j}]: "${this._cellData.currentAudioTitle}"`, "color:#2196F3;font-weight:bold");
                            }
                        });
                    });

                    this._cellData.nCells = nCellCounts;
                    this._logPhase("_initCellData", `旧式统计: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`);
                }

                if (!foundCurrent && this._cellData.nCells > 0) {
                    console.warn(`%c  ⚠️ 未找到当前激活的音频节点，共 ${this._cellData.nCells} 个节点`, "color:#FF9800;font-weight:bold");
                }
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    // 策略1: 在当前页面查找
                    this._logPhase("_getTreeContainer", "策略1: 查找当前页面的 $('#coursetree')...");
                    let el = $('#coursetree');
                    if (el.length > 0) {
                        this._treeContainerEl = el;
                        this._logPhase("_getTreeContainer", `✅ 策略1 成功: 本地 #coursetree，子元素: ${el.children().length} 个`);
                        return this._treeContainerEl;
                    }
                    
                    // 策略2: 尝试在父页面查找
                    try {
                        if (window.parent && window.parent.document !== window.document) {
                            this._logPhase("_getTreeContainer", "策略2: 尝试在 parent.document 查找...");
                            const parentDoc = window.parent.document;
                            const parentEl = parentDoc.getElementById('coursetree');
                            if (parentEl) {
                                this._treeContainerEl = $(parentEl);
                                this._logPhase("_getTreeContainer", "✅ 策略2 成功: 在父页面找到 #coursetree");
                                return this._treeContainerEl;
                            }
                        }
                    } catch (e) {
                        console.log(`%c  ├─ 策略2 访问 parent.document 失败: ${e.message}`, "color:#FF9800");
                    }
                    
                    // 策略3: 尝试在 top.document 查找
                    try {
                        if (window.top && window.top.document !== window.document) {
                            this._logPhase("_getTreeContainer", "策略3: 尝试在 top.document 查找...");
                            const topDoc = window.top.document;
                            const topEl = topDoc.getElementById('coursetree');
                            if (topEl) {
                                this._treeContainerEl = $(topEl);
                                this._logPhase("_getTreeContainer", "✅ 策略3 成功: 在 top.document 找到 #coursetree");
                                return this._treeContainerEl;
                            }
                        }
                    } catch (e) {
                        console.log(`%c  ├─ 策略3 访问 top.document 失败: ${e.message}`, "color:#FF9800");
                    }
                    
                    // 所有策略都失败
                    console.log(`%c  ❌ 所有查找 #coursetree 的策略均失败！`, "color:#F44336;font-weight:bold");
                    // 诊断输出
                    if (typeof document !== 'undefined' && document.querySelectorAll) {
                        const allIds = Array.from(document.querySelectorAll('[id]')).map(e => e.id);
                        console.log(`%c  ├─ 当前页面所有 id 元素:`, "color:#FF9800", allIds);
                    }
                    this._logPhase("_getTreeContainer", "返回 null（页面上可能没有课程树，将使用卡片级导航兜底）");
                    return null;
                }
                return this._treeContainerEl;
            },
            _getAudioEl() {
                if (!this._audioEl) {
                    this._logPhase("_getAudioEl", "开始查找音频元素...");
                    try {
                        // 复用智能查找逻辑 - 先定义findAudioIframe函数
                        const findAudioIframe = () => {
                            // 第一阶段：尝试直接选择器查找
                            const selectors = [
                                "iframe.ans-insertaudio",
                                "iframe[class*='audio']",
                                "iframe[name*='audio']",
                                "iframe[title*='audio']",
                                "div[id*='ans-insertaudio'] iframe",
                                "iframe[src*='audio']",
                                ".ans-insertaudio iframe",
                            ];
                            
                            for (const selector of selectors) {
                                const found = $(selector);
                                if (found.length > 0) {
                                    return found.eq(0);
                                }
                            }
                            const allIframes = $("iframe");
                            for (let i = 0; i < allIframes.length; i++) {
                                const iframe = allIframes.eq(i);
                                const src = iframe.attr('src') || '';
                                const className = iframe.attr('class') || '';
                                const id = iframe.attr('id') || '';
                                
                                if (src.includes('video') || className.includes('video') || 
                                    id.includes('video')) {
                                    continue;
                                }
                                
                                if (src.includes('audio') || className.includes('audio') || 
                                    id.includes('audio') || src.includes('insert') || 
                                    className.includes('ans')) {
                                    return iframe;
                                }
                            }
                            
                            // 检查嵌套iframe
                            for (let i = 0; i < allIframes.length; i++) {
                                const parentIframe = allIframes.eq(i);
                                try {
                                    const iframeDoc = parentIframe.contents();
                                    if (!iframeDoc || iframeDoc.length === 0) continue;
                                    
                                    const nestedIframes = iframeDoc.find("iframe");
                                    for (let j = 0; j < nestedIframes.length; j++) {
                                        const nestedIframe = $(nestedIframes[j]);
                                        const nestedSrc = nestedIframe.attr('src') || '';
                                        const nestedClass = nestedIframe.attr('class') || '';
                                        const nestedId = nestedIframe.attr('id') || '';
                                        
                                        if (!nestedSrc.includes('video') && !nestedClass.includes('video')) {
                                            if (nestedSrc.includes('audio') || nestedClass.includes('audio') || 
                                                nestedId.includes('audio') || nestedSrc.includes('insert')) {
                                                return nestedIframe;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                            
                            return null;
                        };

                        // 使用智能查找获取iframe
                        const frameObj = findAudioIframe();
                        
                        if (!frameObj || frameObj.length === 0) {
                            this._logPhase("_getAudioEl", "❌ findAudioIframe 返回 null，未找到音频 iframe");
                            return null;
                        }
                        this._logPhase("_getAudioEl", `✅ findAudioIframe 找到 iframe`);

                        const iframe = frameObj[0] || frameObj;
                        console.log(`%c  └─ iframe.src: ${(iframe.src || '').substring(0,100)}`, "color:#9C27B0");

                        // 等待iframe内容加载
                        let iframeDoc;
                        try {
                            iframeDoc = frameObj.contents ? frameObj.contents() : $(iframe).contents();
                            this._logPhase("_getAudioEl-iframeDoc", `iframe 文档可访问，子元素数: ${iframeDoc.length || 0}`);
                        } catch (e) {
                            this._logPhase("_getAudioEl-iframeDoc", `❌ 无法访问 iframe 内容 (跨域限制): ${e.message}`);
                            return null;
                        }

                        if (!iframeDoc || iframeDoc.length === 0) {
                            this._logPhase("_getAudioEl-iframeDoc", "❌ iframe 内容未加载（空文档）");
                            return null;
                        }

                        // 策略1: 直接查找audio标签
                        this._logPhase("_getAudioEl-策略1", "查找 <audio> 标签");
                        let audioEl = iframeDoc.find("audio").get(0);
                        console.log(`%c  └─ ${audioEl ? '✅ 找到' : '❌ 未找到'}`, audioEl ? "color:#4CAF50" : "color:#F44336");

                        // 策略2: 查找VideoJS播放器容器
                        if (!audioEl) {
                            this._logPhase("_getAudioEl-策略2", "查找 .video-js / .audio-player 容器");
                            const videoJsContainer = iframeDoc.find(".video-js, #audio.video-js, .audio-player");
                            console.log(`%c  └─ 找到 ${videoJsContainer.length} 个 VideoJS 容器`, "color:#607D8B");
                            if (videoJsContainer.length > 0) {
                                audioEl = videoJsContainer.find("audio").get(0);
                                console.log(`%c  └─ ${audioEl ? '✅ 容器内找到 <audio>' : '❌ 容器内无 <audio>'}`, audioEl ? "color:#4CAF50" : "color:#F44336");
                            }
                        }

                        // 策略3: 通过VideoJS API查找
                        if (!audioEl) {
                            this._logPhase("_getAudioEl-策略3", "尝试 VideoJS API");
                            try {
                                const iframeWindow = (frameObj[0] || iframe).contentWindow;
                                if (iframeWindow) {
                                    const hasVideojs = !!(iframeWindow.videojs);
                                    console.log(`%c  └─ iframeWindow.videojs 存在: ${hasVideojs}`, "color:#607D8B");

                                    if (hasVideojs && iframeWindow.videojs.players) {
                                        const playerKeys = Object.keys(iframeWindow.videojs.players);
                                        console.log(`%c  └─ VideoJS players: ${playerKeys.length > 0 ? playerKeys.join(', ') : '无'}`, "color:#607D8B");
                                        
                                        for (const id of playerKeys) {
                                            const player = iframeWindow.videojs.players[id];
                                            if (player && player.el_) {
                                                audioEl = player.el_.querySelector('audio');
                                                if (audioEl) {
                                                    this._logPhase("_getAudioEl-策略3", `✅ 通过 VideoJS player["${id}"] 找到 <audio>`);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log(`%c  └─ ❌ VideoJS API 访问失败: ${e.message}`, "color:#F44336");
                            }
                        }

                        // 策略4: 查找所有媒体元素
                        if (!audioEl) {
                            this._logPhase("_getAudioEl-策略4", "查找所有 <audio> / <video>");
                            const allMedia = iframeDoc.find("audio, video");
                            console.log(`%c  └─ 找到 ${allMedia.length} 个媒体元素`, "color:#607D8B");
                            if (allMedia.length > 0) {
                                audioEl = allMedia.get(0);
                                console.log(`%c  └─ 取第一个: <${audioEl.tagName}> id="${audioEl.id}"`, "color:#4CAF50");
                            }
                        }

                        if (audioEl) {
                            this._logPhase("_getAudioEl-结果", `✅ 成功! <${audioEl.tagName}> id="${audioEl.id}" className="${audioEl.className}"`);
                            this._audioEl = audioEl;
                        } else {
                            this._logPhase("_getAudioEl-结果", "❌ 所有策略均未找到音频元素");
                        }
                    } catch (e) {
                        this._logPhase("_getAudioEl-异常", `❌ 获取音频元素时出错: ${e.message}`);
                        return null;
                    }
                }
                if (!this._audioEl) {
                    console.log(`%c  └─ _audioEl 仍为 null（iframe 可能未加载完）`, "color:#FF9800");
                }
                return this._audioEl;
            },
            _audioEventHandle() {
                const el = this._audioEl;
                if (!el) {
                    console.log("audioEl未加载");
                    return;
                }

                el.removeEventListener("ended", this._handleAudioEnded);
                el.removeEventListener("loadedmetadata", this._handleAudioLoaded);
                el.removeEventListener("play", this._handleAudioPlay);
                el.removeEventListener("pause", this._handleAudioPause);

                el.addEventListener("ended", this._handleAudioEnded.bind(this));
                el.addEventListener("loadedmetadata", this._handleAudioLoaded.bind(this));
                el.addEventListener("play", this._handleAudioPlay.bind(this));
                el.addEventListener("pause", this._handleAudioPause.bind(this));
            },
            _handleAudioEnded(e) {
                const title = this._cellData.currentAudioTitle;
                console.warn(`%c============'${title}' 播放完成=============`, "color:#4CAF50;font-weight:bold");
                this._isPlaying = false;
                this._clearCheckInterval();
                setTimeout(() => this.nextUnit(), 1000);
            },
            _handleAudioLoaded(e) {
                console.log(`%c============音频加载完成=============`, "color:#2196F3");
                if (this.configs.autoplay && !this._isPlaying) {
                    this.play();
                }
            },
            _handleAudioPlay(e) {
                const title = this._cellData.currentAudioTitle;
                console.info(`%c============'${title}' 开始播放=============`, "color:#4CAF50");
                this._isPlaying = true;
                this._stepSwitchPending = false;
                const audio = this._getAudioEl();
                this._guardLastTime = Number(audio?.currentTime || 0);
                this._guardLastWallTs = Date.now();
                if (this._delayedNextUnitTimer) {
                    clearTimeout(this._delayedNextUnitTimer);
                    this._delayedNextUnitTimer = null;
                }
            },
            _handleAudioPause(e) {
                console.log(`%c============音频暂停=============`, "color:#FF9800");
            },
            /**
             * 设置播放速度（同时更新配置和当前音频元素）
             */
            setPlaybackRate(rate) {
                const validRate = Math.max(0.1, Math.min(16, rate));
                this.configs.playbackRate = validRate;
                const audio = this._getAudioEl();
                if (audio) {
                    audio.playbackRate = validRate;
                }
                console.log(`%c播放速度已设为: ${validRate}x`, "color:#4CAF50;font-weight:bold");
                return validRate;
            },
            /**
             * 创建悬浮速度控制面板
             */
            _createSpeedControlPanel() {
                const panel = document.createElement('div');
                panel.id = 'fq-speed-panel';
                panel.innerHTML = `
                    <style>
                        #fq-speed-panel {
                            position: fixed;
                            bottom: 30px;
                            right: 30px;
                            z-index: 999999;
                            background: rgba(30, 30, 30, 0.88);
                            backdrop-filter: blur(16px);
                            border: 1px solid rgba(255,255,255,0.12);
                            border-radius: 14px;
                            padding: 12px 14px;
                            min-width: 200px;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                            font-family: -apple-system, 'Segoe UI', sans-serif;
                            user-select: none;
                            cursor: move;
                            transition: opacity 0.2s;
                        }
                        #fq-speed-panel:hover { opacity: 1 !important; }
                        #fq-speed-panel .fq-header {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            margin-bottom: 8px;
                            cursor: move;
                        }
                        #fq-speed-panel .fq-title {
                            color: #aaa;
                            font-size: 12px;
                            font-weight: 600;
                            letter-spacing: 1px;
                            text-transform: uppercase;
                        }
                        #fq-speed-panel .fq-close {
                            cursor: pointer;
                            color: #666;
                            font-size: 16px;
                            line-height: 1;
                            padding: 0 4px;
                            transition: color 0.15s;
                            background: none;
                            border: none;
                        }
                        #fq-speed-panel .fq-close:hover { color: #fff; }
                        #fq-speed-panel .fq-current {
                            color: #fff;
                            font-size: 28px;
                            font-weight: 700;
                            text-align: center;
                            margin: 4px 0 10px 0;
                            font-variant-numeric: tabular-nums;
                        }
                        #fq-speed-panel .fq-current span { color: #4CAF50; }
                        #fq-speed-panel .fq-buttons {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 5px;
                            justify-content: center;
                        }
                        #fq-speed-panel .fq-btn {
                            background: rgba(255,255,255,0.07);
                            border: 1px solid rgba(255,255,255,0.10);
                            color: #ccc;
                            border-radius: 8px;
                            padding: 4px 10px;
                            font-size: 13px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.15s;
                            min-width: 42px;
                            text-align: center;
                        }
                        #fq-speed-panel .fq-btn:hover {
                            background: rgba(76,175,80,0.25);
                            border-color: rgba(76,175,80,0.5);
                            color: #fff;
                        }
                        #fq-speed-panel .fq-btn.active {
                            background: rgba(76,175,80,0.35);
                            border-color: #4CAF50;
                            color: #4CAF50;
                            box-shadow: 0 0 12px rgba(76,175,80,0.25);
                        }
                        #fq-speed-panel .fq-custom {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            margin-top: 8px;
                            padding-top: 8px;
                            border-top: 1px solid rgba(255,255,255,0.08);
                        }
                        #fq-speed-panel .fq-custom input {
                            flex: 1;
                            background: rgba(255,255,255,0.08);
                            border: 1px solid rgba(255,255,255,0.12);
                            border-radius: 6px;
                            padding: 4px 8px;
                            color: #fff;
                            font-size: 13px;
                            outline: none;
                            min-width: 0;
                        }
                        #fq-speed-panel .fq-custom input:focus {
                            border-color: #4CAF50;
                        }
                        #fq-speed-panel .fq-custom button {
                            background: #4CAF50;
                            border: none;
                            color: #fff;
                            border-radius: 6px;
                            padding: 4px 12px;
                            font-size: 13px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: background 0.15s;
                            white-space: nowrap;
                        }
                        #fq-speed-panel .fq-custom button:hover { background: #388E3C; }
                    </style>
                    <div class="fq-header">
                        <span class="fq-title">🎵 播放速度</span>
                        <button class="fq-close">✕</button>
                    </div>
                    <div class="fq-current">× <span id="fq-speed-value">1.0</span></div>
                    <div class="fq-buttons" id="fq-speed-buttons"></div>
                    <div class="fq-custom">
                        <input type="number" id="fq-speed-input" step="0.05" min="0.1" max="16" value="1.0" placeholder="0.1~16">
                        <button id="fq-speed-apply">应用</button>
                    </div>
                `;
                document.body.appendChild(panel);

                const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
                const btnContainer = panel.querySelector('#fq-speed-buttons');
                const speedValue = panel.querySelector('#fq-speed-value');
                const speedInput = panel.querySelector('#fq-speed-input');
                const self = this;

                // 创建预设按钮
                speeds.forEach(s => {
                    const btn = document.createElement('button');
                    btn.className = 'fq-btn';
                    btn.textContent = s + 'x';
                    btn.dataset.speed = s;
                    if (Math.abs(s - this.configs.playbackRate) < 0.001) {
                        btn.classList.add('active');
                    }
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const rate = parseFloat(this.dataset.speed);
                        self.setPlaybackRate(rate);
                        updateUI(rate);
                    });
                    btnContainer.appendChild(btn);
                });

                // 更新UI
                function updateUI(rate) {
                    const display = rate.toFixed(2).replace(/\.?0+$/, '');
                    speedValue.textContent = display;
                    speedInput.value = rate;
                    const btns = btnContainer.querySelectorAll('.fq-btn');
                    btns.forEach(b => {
                        const s = parseFloat(b.dataset.speed);
                        b.classList.toggle('active', Math.abs(s - rate) < 0.01);
                    });
                }

                // 自定义输入
                speedInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.stopPropagation();
                        applyCustomSpeed();
                    }
                });
                panel.querySelector('#fq-speed-apply').addEventListener('click', function(e) {
                    e.stopPropagation();
                    applyCustomSpeed();
                });

                function applyCustomSpeed() {
                    const val = parseFloat(speedInput.value);
                    if (isNaN(val) || val < 0.1 || val > 16) {
                        speedInput.value = self.configs.playbackRate;
                        return;
                    }
                    const rounded = Math.round(val * 100) / 100;
                    self.setPlaybackRate(rounded);
                    updateUI(rounded);
                }

                // 拖拽
                let isDragging = false, startX, startY, origX, origY;
                const onStart = function(e) {
                    if (e.target.closest('.fq-close') || e.target.closest('.fq-btn') ||
                        e.target.closest('.fq-custom') || e.target.tagName === 'INPUT') {
                        return;
                    }
                    isDragging = true;
                    const rect = panel.getBoundingClientRect();
                    startX = e.clientX;
                    startY = e.clientY;
                    origX = rect.left;
                    origY = rect.top;
                    panel.style.transition = 'none';
                    panel.style.opacity = '0.85';
                };
                const onMove = function(e) {
                    if (!isDragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    panel.style.left = (origX + dx) + 'px';
                    panel.style.top = (origY + dy) + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                };
                const onEnd = function() {
                    if (!isDragging) return;
                    isDragging = false;
                    panel.style.transition = '';
                    panel.style.opacity = '';
                };
                panel.addEventListener('mousedown', onStart);
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onEnd);

                // 关闭按钮
                panel.querySelector('.fq-close').addEventListener('click', function(e) {
                    e.stopPropagation();
                    panel.style.opacity = '0.3';
                });

                // 点击恢复透明度
                panel.addEventListener('click', function() {
                    panel.style.opacity = '1';
                });

                console.log("%c✓ 悬浮速度控制面板已创建", "color:#4CAF50;font-weight:bold");
            },
        };

        try {
            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
            console.log("%c  window.app 初始化完成，开始执行 run()", "color:#4CAF50;font-size:14px;font-weight:bold");
            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
            window.app.run();

            // 创建悬浮速度控制面板（仅内容页/学习页面需要）
            const pageType = window.app && window.app._detectPageType ? window.app._detectPageType() : 'unknown';
            if (pageType === 'content_page' || pageType === 'study_page' || pageType === 'unknown') {
                console.log("%c[面板] 准备创建悬浮速度控制面板...", "color:#FF9800");
                window.app._createSpeedControlPanel();
            } else {
                console.log("%c[面板] 当前页面类型 " + pageType + "，不创建速度控制面板", "color:#9E9E9E");
            }

            const preventPause = (e) => {
                e.stopPropagation();
                e.preventDefault();
            };

            const resumePlaybackNow = () => {
                if (window.app && typeof window.app._tryResumePlayback === "function") {
                    window.app._tryResumePlayback("page-event");
                }
            };

            document.addEventListener("mouseleave", preventPause);
            window.addEventListener("mouseleave", preventPause);
            document.addEventListener("mouseout", preventPause);
            window.addEventListener("mouseout", preventPause);

            window.addEventListener("blur", (e) => {
                console.log("%c[防暂停] 页面失去焦点，保持播放状态", "color:#607D8B");
                resumePlaybackNow();
            });

            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    console.log("%c[防暂停] 页面切到后台，尝试保持播放状态", "color:#607D8B");
                }
                resumePlaybackNow();
            });

            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
            console.log("%c  ✅ 所有事件监听器已注册", "color:#4CAF50;font-size:13px;font-weight:bold");
            console.log("%c  ✅ 脚本启动流程完成，等待执行...", "color:#4CAF50;font-size:13px");
            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
        } catch (error) {
            console.error("%c═══════ 脚本启动失败 ═══════", "color:#F44336;font-size:16px;font-weight:bold");
            console.error(`%c  错误: ${error.message}`, "color:#F44336");
            console.error(`%c  堆栈: ${error.stack}`, "color:#FF5722");
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();
