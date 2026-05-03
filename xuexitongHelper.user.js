// ==UserScript==
// @name         学习通助手
// @namespace    https://github.com/fengafeng/xuexitongHelper
// @version      1.1.0
// @description  自动完成学习通课程任务点：音视频自动播放、自动翻页、悬浮控制面板、整课循环
// @author       suifeng
// @match        *://*.chaoxing.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * 学习通助手 v1.0（原 V5）
 * Copyright (c) 2026 suifeng
 * 项目地址: https://github.com/fengafeng/xuexitongHelper
 * 
 * 本脚本仅供学习交流使用，禁止商业用途。
 * 使用请遵守相关平台规定，使用者需自行承担使用风险。
 * 
 * 功能:
 *   - 自动检测音频/视频 → 播放 → 自动翻页
 *   - 悬浮控制面板（速度调节 + 暂停/播放 + 模式切换）
 *   - 整课循环 / 正常播放模式切换
 *   - 章节测验自动跳过
 *   - 章节列表自动进入未完成章节
 *   - 屏幕防休眠
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

            // ======== 配置 ========
            configs: {
                playbackRate: 1.0,
                autoplay: true,
                mutePageAudio: true,
                retryInterval: 2000,
                maxRetries: 10,
                audioCheckInterval: 1000,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                loopMode: false,         // true = 整课循环
                paused: false,            // true = 暂停播放
                mediaType: 'unknown',     // 'audio' | 'video' | 'unknown'
            },

            // ======== 调试日志 ========
            _logBuffer: [],
            _logMax: 100,

            _logPhase(name, detail) {
                const ts = new Date().toLocaleTimeString();
                const msg = `[${ts}] ${name}${detail ? ': ' + detail : ''}`;
                console.log(`%c【${name}】${detail ? ' ' + detail : ''}`, 'color:#FF9800;font-weight:bold;font-size:13px');
                this._logBuffer.push(msg);
                if (this._logBuffer.length > this._logMax) this._logBuffer.shift();
                this._updateDebugPanel();
            },

            // ======== 通用状态 ========
            _audioEls: [],
            _audioIndex: 0,
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _pauseWatcher: null,  // 暂停守卫定时器
            _pausedAt: 0,         // 暂停时保存的 currentTime
            _nextSectionPending: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _stepSwitchPending: false,
            _stepSwitchAt: 0,
            _tryTimes: 0,
            _skipCount: 0,
            _wakeLock: null,

            // ======== 视频专用状态 ========
            _videoIframes: [],
            _videoIframeIndex: 0,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,

            // ======== 课程数据 ========
            _cellData: {
                cells: 0, nCells: 0, currentCellIndex: 0, currentNCellIndex: 0, currentTitle: "",
            },
            get cellData() { return this._cellData; },

            /* ==================== 启动入口 ==================== */

            run() {
                this._logPhase("启动", `学习通助手 v1.0 - ${location.href.substring(0,80)}`);
                const pageType = this._detectPageType();
                const inTop = window.self === window.top;
                this._logPhase("诊断", `页面类型: ${pageType}, 顶层: ${inTop}, iframes: ${document.querySelectorAll('iframe').length}, #iframe: ${!!document.getElementById('iframe')}`);
                
                // 课程列表页 → 跳过
                if (pageType === 'course_list') {
                    this._logPhase("启动", "课程列表页，跳过");
                    return;
                }
                
                // 章节列表页 → 自动检测并进入未完成章节
                if (pageType === 'chapter_list') {
                    this._logPhase("启动", "章节列表页 → 启动章节检测");
                    if (inTop) { this._createControlPanel(); this._createDebugPanel(); }
                    this._runChapterListAuto();
                    return;
                }
                
                // 只在顶层窗口创建面板（子页面不创建，避免重复）
                if (inTop) {
                    this._createControlPanel();
                    this._createDebugPanel();
                    this._requestWakeLock();
                }
                // 延迟检测媒体类型，等待 #iframe 加载完成
                this._delayedMediaDetect(0);
            },

            _delayedMediaDetect(attempt = 0) {
                this._detectMediaType();
                this._logPhase("启动", `媒体类型: ${this.configs.mediaType} (尝试 ${attempt + 1})`);
                if (this.configs.mediaType === 'unknown' && attempt < 10) {
                    this._logPhase("启动", `媒体未就绪，2秒后重试 (${attempt + 1}/10)`);
                    setTimeout(() => this._delayedMediaDetect(attempt + 1), 2000);
                    return;
                }
                if (this.configs.mediaType === 'video') {
                    this._runContentPageVideo();
                } else if (this.configs.mediaType === 'audio') {
                    this._runContentPageAudio();
                } else {
                    this._logPhase("启动", "10次重试后仍未知，走音频兜底");
                    this._runContentPageAudio();
                }
            },

            /* ==================== 页面类型检测 ==================== */

            _detectPageType() {
                const url = window.location.href;
                const path = window.location.pathname;
                // 课程列表页（i.chaoxing.com/base...）
                if (url.includes('i.chaoxing.com/base') || path.includes('/studyApp/')) return 'course_list';
                // 章节列表页（显示课程的所有章节）
                if (path.includes('/mycourse/studentcourse')) return 'chapter_list';
                // 学习页面（有 #coursetree + #iframe）
                if (path.includes('/mycourse/studentstudy')) return 'study_page';
                // 知识卡片内容页面
                if (path.includes('/knowledge/cards')) return 'content_page';
                return 'unknown';
            },

            /* ==================== 章节列表自动化 ==================== */

            _runChapterListAuto() {
                this._logPhase("章节列表", "检测章节完成状态...");
                const checkChapters = () => {
                    let levelNodes = document.querySelectorAll('.timeline .leveltwo, .content1 .leveltwo, .main .leveltwo');
                    if (!levelNodes || levelNodes.length === 0) {
                        // 兜底：找 orange / openlock 标记直接点
                        const fallback = document.querySelectorAll('.orange');
                        if (fallback.length > 0) {
                            this._logPhase("章节列表", `通过 .orange 找到 ${fallback.length} 个未完成标记`);
                            for (const m of fallback) {
                                const link = m.closest('a') || m.closest('h3')?.querySelector('a');
                                if (link) {
                                    this._logPhase("章节列表", `▶️ 进入未完成章节`);
                                    link.click();
                                    return;
                                }
                            }
                        }
                        this._logPhase("章节列表", "章节树未加载，3秒后重试");
                        setTimeout(checkChapters, 3000);
                        return;
                    }
                    this._logPhase("章节列表", `找到 ${levelNodes.length} 个章节`);
                    for (const node of levelNodes) {
                        const orange = node.querySelector('.orange');
                        const openlock = node.querySelector('.openlock');
                        const count = node.querySelector('.knowledgeJobCount');
                        if (orange) {
                            const link = node.querySelector('h3 a, a[href*="studentstudy"]');
                            if (link) {
                                this._logPhase("章节列表", `▶️ 未完成 → 点击进入`);
                                link.click();
                                return;
                            }
                        } else if (openlock) {
                            // 已完成，跳过
                        } else if (count && count.value !== '0') {
                            const link = node.querySelector('h3 a, a[href*="studentstudy"]');
                            if (link) { link.click(); return; }
                        }
                    }
                    this._logPhase("章节列表", "✅ 所有章节已完成");
                };
                setTimeout(checkChapters, 2000);
            },

            /* ==================== 媒体类型检测 ==================== */

            _detectMediaType() {
                this._logPhase("媒体检测", "检测媒体类型...");

                // 策略1：在页面本地查找音频/视频 iframe
                const audioIframes = document.querySelectorAll('iframe.ans-insertaudio');
                const videoIframes = document.querySelectorAll('iframe.ans-insertvideo-online');
                if (audioIframes.length > 0) {
                    this._logPhase("媒体检测", "✅ 直接音频 iframe");
                    this.configs.mediaType = 'audio';
                    return;
                }
                if (videoIframes.length > 0) {
                    this._logPhase("媒体检测", "✅ 直接视频 iframe");
                    this.configs.mediaType = 'video';
                    return;
                }

                // 策略2：在 #iframe 内查找
                try {
                    const mainIframe = document.getElementById('iframe');
                    if (mainIframe) {
                        if (!mainIframe.contentDocument) {
                            this._logPhase("媒体检测", "⚠️ #iframe存在但contentDocument=null（未加载）→ unknown");
                            this.configs.mediaType = 'unknown';
                            return;
                        }
                        const doc = mainIframe.contentDocument;
                        if (doc.querySelector('iframe.ans-insertaudio')) {
                            this._logPhase("媒体检测", "✅ #iframe内音频");
                            this.configs.mediaType = 'audio';
                            return;
                        }
                        if (doc.querySelector('iframe.ans-insertvideo-online')) {
                            this._logPhase("媒体检测", "✅ #iframe内视频");
                            this.configs.mediaType = 'video';
                            return;
                        }
                        // 直接 audio/video 标签
                        const ia = doc.querySelectorAll('audio');
                        const iv = doc.querySelectorAll('video');
                        if (ia.length > 0 && iv.length === 0) {
                            this._logPhase("媒体检测", `✅ #iframe内 ${ia.length} audio`);
                            this.configs.mediaType = 'audio';
                            return;
                        }
                        if (iv.length > 0) {
                            this._logPhase("媒体检测", `✅ #iframe内 ${iv.length} video`);
                            this.configs.mediaType = 'video';
                            return;
                        }
                    }
                } catch (e) {}

                // 策略3：直接查找 audio/video 元素
                const audios = document.querySelectorAll('audio');
                const videos = document.querySelectorAll('video');
                if (audios.length > 0 && videos.length === 0) {
                    this._logPhase("媒体检测", `✅ ${audios.length} audio`);
                    this.configs.mediaType = 'audio';
                    return;
                }
                if (videos.length > 0) {
                    this._logPhase("媒体检测", `✅ ${videos.length} video`);
                    this.configs.mediaType = 'video';
                    return;
                }

                // 策略4：在父页面查找
                try {
                    if (window.parent && window.parent.document !== window.document) {
                        const pd = window.parent.document;
                        if (pd.querySelector('iframe.ans-insertaudio')) {
                            this._logPhase("媒体检测", "✅ 父页面音频");
                            this.configs.mediaType = 'audio';
                            return;
                        }
                        if (pd.querySelector('iframe.ans-insertvideo-online')) {
                            this._logPhase("媒体检测", "✅ 父页面视频");
                            this.configs.mediaType = 'video';
                            return;
                        }
                    }
                } catch (e) {}

                // 策略5：检查 iframe 属性
                const allIframes = document.querySelectorAll('iframe');
                for (const f of allIframes) {
                    const src = (f.src || '').toLowerCase();
                    const cls = (f.className || '').toLowerCase();
                    if (src.includes('audio') || cls.includes('audio')) {
                        this._logPhase("媒体检测", "✅ 属性音频");
                        this.configs.mediaType = 'audio';
                        return;
                    }
                    if (src.includes('video') || cls.includes('video')) {
                        this._logPhase("媒体检测", "✅ 属性视频");
                        this.configs.mediaType = 'video';
                        return;
                    }
                }

                this._logPhase("媒体检测", "⚠️ 未找到任何媒体 → unknown");
                this.configs.mediaType = 'unknown';
            },

            /* ==================== 音频播放核心逻辑（V4） ==================== */

            _runContentPageAudio() {
                this._logPhase("内容页-启动", "V5 音频播放模式");

                if (!this.configs.loopMode && this._detectTaskCompleted()) {
                    this._logPhase("内容页-启动", "✅ 任务已完成，跳转下一节");
                    this._navigateToNextSection();
                    return;
                }
                this._logPhase("内容页-启动", "⏳ 任务未完成，开始初始化");

                const iframeCount = document.querySelectorAll('iframe').length;
                console.log(`%c  页面 iframe 数量: ${iframeCount}`, "color:#607D8B");

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(() => {
                            this._startTaskCompletionMonitor();
                            this._startAudioInitialization();
                        }, 1000);
                    });
                } else {
                    setTimeout(() => {
                        this._startTaskCompletionMonitor();
                        this._startAudioInitialization();
                    }, 1000);
                }
            },

            // ====== 音频初始化序列 ======
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
                        this._logPhase(`init-${step.name}`, `执行...`);
                        const result = step.fn();
                        if (result === null || result === false) {
                            console.log(`%c  └─ 返回: null/false`, "color:#9E9E9E");
                        } else if (result !== undefined) {
                            console.log(`%c  └─ 返回:`, "color:#9E9E9E", result);
                        }
                    } catch (e) {
                        console.log(`%c⚠️ init-${step.name}: ${e.message}`, "color:#F44336");
                        console.log(`%c  └─ 继续下一步`, "color:#FF9800");
                    }
                }
                this._logPhase("初始化序列", "✅ 所有步骤执行完毕");
            },

            // ====== 音频 iframe 查找 ======
            _startAudioInitialization() {
                this._logPhase("音频初始化-开始", "查找音频 iframe...");
                const findAudioIframe = () => {
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
                        if (found.length > 0) return found.eq(0);
                    }
                    const allIframes = $("iframe");
                    for (let i = 0; i < allIframes.length; i++) {
                        const iframe = allIframes.eq(i);
                        const src = iframe.attr('src') || '';
                        const cls = iframe.attr('class') || '';
                        const id = iframe.attr('id') || '';
                        if (src.includes('video') || cls.includes('video') || id.includes('video')) continue;
                        if (src.includes('audio') || cls.includes('audio') || id.includes('audio') || src.includes('insert') || cls.includes('ans')) return iframe;
                    }
                    for (let i = 0; i < allIframes.length; i++) {
                        try {
                            const doc = allIframes.eq(i).contents();
                            if (!doc || doc.length === 0) continue;
                            const nested = doc.find("iframe");
                            for (let j = 0; j < nested.length; j++) {
                                const n = $(nested[j]);
                                const ns = n.attr('src') || '', nc = n.attr('class') || '';
                                if (!ns.includes('video') && !nc.includes('video') && (ns.includes('audio') || nc.includes('audio') || ns.includes('insert'))) return n;
                            }
                        } catch (e) { continue; }
                    }
                    return null;
                };

                const waitForAudioFrame = () => {
                    const frameObj = findAudioIframe();
                    if (!frameObj || frameObj.length === 0) {
                        console.log("%c音频iframe未加载，2秒后重试...", "color:#FF9800");
                        setTimeout(waitForAudioFrame, 2000);
                        return;
                    }
                    const iframe = frameObj[0];
                    this._logPhase("音频初始化-waitFrame", `✅ 找到: ${(iframe.src || '').substring(0,80)}`);

                    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                        setTimeout((() => this._phaseInitSequence("分支A-direct")).bind(this), 500);
                        return;
                    }
                    const onLoad = (() => {
                        iframe.removeEventListener('load', onLoad);
                        setTimeout((() => this._phaseInitSequence("分支B-onLoad")).bind(this), 1000);
                    }).bind(this);
                    iframe.addEventListener('load', onLoad);
                    // 兜底轮询：1秒后检查 iframe 是否已加载
                    setTimeout((() => {
                        try {
                            const doc = iframe.contentDocument;
                            if (!doc || !(doc.readyState === 'complete' || doc.readyState === 'interactive')) {
                                // 还没加载完，等待 onLoad 事件
                                return;
                            }
                            iframe.removeEventListener('load', onLoad);
                            this._phaseInitSequence("分支C-poll");
                        } catch (e) {
                            // 跨域错误，等待 onLoad 事件
                        }
                    }).bind(this), 1000);
                };
                setTimeout(waitForAudioFrame, 2000);
            },

            // ====== 课程树容器 ======
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    let el = $('#coursetree');
                    if (el.length > 0) { this._treeContainerEl = el; return el; }
                    try {
                        if (window.parent && window.parent.document !== window.document) {
                            const pe = window.parent.document.getElementById('coursetree');
                            if (pe) { this._treeContainerEl = $(pe); return this._treeContainerEl; }
                        }
                    } catch(e) {}
                    try {
                        if (window.top && window.top.document !== window.document) {
                            const te = window.top.document.getElementById('coursetree');
                            if (te) { this._treeContainerEl = $(te); return this._treeContainerEl; }
                        }
                    } catch(e) {}
                    return null;
                }
                return this._treeContainerEl;
            },

            // ====== 课程数据初始化 ======
            _initCellData() {
                const el = this._getTreeContainer();
                if (!el) return;
                const newStyle = el.find('.cells > .ncells');
                const oldStyle = el.find('.posCatalog_select:not(.firstLayer)');
                const useNew = newStyle.length > oldStyle.length;

                if (useNew) {
                    const chapters = el.find('.cells');
                    this._cellData.cells = chapters.length;
                    let nc = 0, found = false;
                    chapters.each((i, ch) => {
                        const secs = $(ch).find('.ncells');
                        nc += secs.length;
                        secs.each((j, s) => {
                            if ($(s).find('h4.currents, h5.currents').length > 0) {
                                this._cellData.currentCellIndex = i;
                                this._cellData.currentNCellIndex = j;
                                found = true;
                                this._cellData.currentTitle = $(s).find('h4, h5').first().text().trim();
                            }
                        });
                    });
                    this._cellData.nCells = nc;
                } else {
                    const cells = el.children("ul").children("li");
                    this._cellData.cells = cells.length;
                    let nc = 0, found = false;
                    cells.each((i, v) => {
                        const ns = $(v).find('.posCatalog_select:not(.firstLayer)');
                        nc += ns.length;
                        ns.each((j, e) => {
                            if ($(e).hasClass("posCatalog_active")) {
                                this._cellData.currentCellIndex = i;
                                this._cellData.currentNCellIndex = j;
                                found = true;
                                const ts = $(e).find('.posCatalog_name')[0];
                                if (ts) this._cellData.currentTitle = $(ts).attr('title');
                            }
                        });
                    });
                    this._cellData.nCells = nc;
                }
            },

            // ====== 查找音频元素 ======
            _getAudioEl() {
                if (this._audioEl) return this._audioEl;
                const findFrame = () => {
                    const selectors = ["iframe.ans-insertaudio","iframe[class*='audio']","iframe[name*='audio']","iframe[title*='audio']","div[id*='ans-insertaudio'] iframe","iframe[src*='audio']",".ans-insertaudio iframe"];
                    for (const s of selectors) { const f = $(s); if (f.length > 0) return f.eq(0); }
                    const all = $("iframe");
                    for (let i = 0; i < all.length; i++) {
                        const f = all.eq(i), src = f.attr('src')||'', cls = f.attr('class')||'', id = f.attr('id')||'';
                        if (src.includes('video')||cls.includes('video')||id.includes('video')) continue;
                        if (src.includes('audio')||cls.includes('audio')||id.includes('audio')||src.includes('insert')||cls.includes('ans')) return f;
                    }
                    for (let i = 0; i < all.length; i++) {
                        try { const doc = all.eq(i).contents(); if (!doc||doc.length===0) continue; const n = doc.find("iframe"); for (let j=0;j<n.length;j++) { const f=$(n[j]), ns=f.attr('src')||'', nc=f.attr('class')||''; if (!ns.includes('video')&&!nc.includes('video')&&(ns.includes('audio')||nc.includes('audio')||ns.includes('insert'))) return f; } } catch(e){continue;}
                    }
                    return null;
                };
                const frameObj = findFrame();
                if (!frameObj || frameObj.length === 0) return null;
                let iframeDoc;
                try { iframeDoc = frameObj.contents ? frameObj.contents() : $(frameObj[0]).contents(); } catch(e) { return null; }
                if (!iframeDoc || iframeDoc.length === 0) return null;
                // 优先查找实际播放的音频元素：Video.js创建的 audio_html5_api > 带 currentTime > 0 的 > #audio > audio1_html5_white > 第一个audio
                const candidates = iframeDoc.find("audio#audio_html5_api, #audio_html5_api, audio#audio1_html5_white, audio");
                let best = null, bestScore = -1;
                for (let i = 0; i < candidates.length; i++) {
                    const el = candidates[i];
                    if (!el) continue;
                    const ct = Number(el.currentTime || 0);
                    const dur = Number(el.duration || 0);
                    const ready = el.readyState || 0;
                    const id = el.id || '';
                    // 评分：有播放进度的 > readyState更高的 > 有ID的
                    let score = 0;
                    if (ct > 0) score += 100;
                    if (dur > 0) score += 50;
                    score += ready * 10;
                    if (id === 'audio_html5_api') score += 500;
                    if (id === 'audio' || id === 'audio1_html5_white') score += 20;
                    if (score > bestScore) { bestScore = score; best = el; }
                }
                if (best) {
                    this._audioEl = best;
                    this._logPhase("音频-调试", `✅ 找到音频: id="${best.id}", currentTime=${(best.currentTime||0).toFixed(1)}s, duration=${(best.duration||0).toFixed(1)}s, readyState=${best.readyState}`);
                }
                return this._audioEl || null;
            },

            // ====== 音频播放 ======
            async play() {
                try {
                    const el = this._getAudioEl();
                    if (el == null) {
                        if (this._advanceLearningStep()) {
                            setTimeout(() => this.play(), 2000);
                            return;
                        }
                        // 模式2（全部播放）：不跳转，继续等待音频加载
                        if (this.configs.loopMode) {
                            this._logPhase("音频-调试", "模式2：音频未就绪，等待重试");
                            setTimeout(() => this.play(), 2000);
                            return;
                        }
                        $("#prevNextFocusNext").click();
                        setTimeout(() => this.play(), 2000);
                        return;
                    }
                    this._tryTimes = 0;
                    this._isPlaying = true;
                    this._audioEventHandle();
                    el.playbackRate = this.configs.playbackRate;
                    if (this.configs.mutePageAudio) el.muted = true;
                    try {
                        await el.play();
                        console.log(`%c✅ 音频播放中，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startAudioMonitoring();
                    } catch (playError) {
                        el.muted = true;
                        try { await el.play(); this._startAudioMonitoring(); } catch(mutedError) { this._handlePlayError(playError); }
                    }
                } catch (e) {
                    if (this._tryTimes > this.configs.maxRetries) { this._clearCheckInterval(); return; }
                    this._tryTimes++;
                    setTimeout(() => this.play(), this.configs.retryInterval);
                }
            },

            // ====== 音频监控 ======
            _startAudioMonitoring() {
                this._clearCheckInterval();
                this._checkInterval = setInterval(() => {
                    if (!this._audioEl) { this._clearCheckInterval(); return; }
                    if (this._audioEl.ended || this._audioEl.paused) {
                        if (this._tryResumePlayback("监控")) return;
                    }
                }, this.configs.audioCheckInterval);
            },

            _handleAudioPlay() {
                this._audioEl.addEventListener('ended', () => {
                    this._logPhase("音频监控", "⏹️ 音频播放完毕");
                    this._clearCheckInterval();
                    setTimeout(() => this.nextUnit(), 1000);
                });
                this._audioEl.addEventListener('error', (e) => {
                    this._logPhase("音频监控", "❌ 音频错误");
                });
            },

            /* ==================== 视频播放核心逻辑（基于V3） ==================== */

            _runContentPageVideo() {
                this._logPhase("内容页-启动", "V5 视频播放模式");

                if (!this.configs.loopMode && this._detectTaskCompleted()) {
                    this._logPhase("内容页-启动", "✅ 任务已完成，跳转下一节");
                    this._navigateToNextSection();
                    return;
                }
                this._logPhase("内容页-启动", "⏳ 任务未完成，开始初始化");

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(() => {
                            this._startTaskCompletionMonitor();
                            this._startVideoInitialization();
                        }, 1000);
                    });
                } else {
                    setTimeout(() => {
                        this._startTaskCompletionMonitor();
                        this._startVideoInitialization();
                    }, 1000);
                }
            },

            _startVideoInitialization() {
                this._logPhase("视频初始化", "查找视频 iframe...");
                const waitForVideo = () => {
                    this._findAllVideoIframes();
                    if (this._videoIframes.length === 0) {
                        console.log("%c视频iframe未加载，2秒后重试...", "color:#FF9800");
                        setTimeout(waitForVideo, 2000);
                        return;
                    }
                    this._logPhase("视频初始化", `✅ 找到 ${this._videoIframes.length} 个视频 iframe`);
                    this._videoIframeIndex = 0;
                    // 初始化课程数据
                    try { this._getTreeContainer(); } catch(e) {}
                    try { this._initCellData(); } catch(e) {}
                    this._clearCheckInterval();
                    this._bindStepNavigation();
                    this._playVideoAtIndex(0);
                };
                setTimeout(waitForVideo, 2000);
            },

            // 查找所有视频 iframe
            _findAllVideoIframes() {
                this._videoIframes = [];
                this._logPhase("视频查找", "搜索视频iframe...");
                try {
                    // 本地查找
                    const local = document.querySelectorAll('iframe.ans-insertvideo-online');
                    this._logPhase("视频查找", `本地 ans-insertvideo-online: ${local.length}`);
                    for (const f of local) { this._videoIframes.push({ iframe: f, from: 'local' }); }
                    // #iframe 内查找
                    const mainIframe = document.getElementById('iframe');
                    if (mainIframe) {
                        this._logPhase("视频查找", `#iframe存在, contentDocument: ${mainIframe.contentDocument ? '✅可用' : 'null'}`);
                        if (mainIframe.contentDocument) {
                            const nested = mainIframe.contentDocument.querySelectorAll('iframe.ans-insertvideo-online');
                            this._logPhase("视频查找", `#iframe内: ${nested.length}`);
                            for (const f of nested) { this._videoIframes.push({ iframe: f, from: 'nested' }); }
                        }
                    } else {
                        this._logPhase("视频查找", "#iframe不存在");
                    }
                    // 父页面查找
                    try {
                        if (window.parent && window.parent.document !== window.document) {
                            const pn = window.parent.document.querySelectorAll('iframe.ans-insertvideo-online');
                            if (pn.length > 0) this._logPhase("视频查找", `父页面: ${pn.length}`);
                            for (const f of pn) { this._videoIframes.push({ iframe: f, from: 'parent' }); }
                        }
                    } catch(e) {}
                    // 通用 video 标签查找（兜底）
                    if (this._videoIframes.length === 0) {
                        const videos = document.querySelectorAll('video');
                        this._logPhase("视频查找", `直接video标签: ${videos.length}`);
                        for (const v of videos) { this._videoIframes.push({ iframe: null, videoEl: v, from: 'direct' }); }
                    }
                } catch (e) {
                    console.error("查找视频iframe失败:", e);
                }
                // 去重（基于 src）
                const seen = new Set();
                this._videoIframes = this._videoIframes.filter(item => {
                    const key = item.iframe ? (item.iframe.src || item.iframe.id || '') : (item.videoEl?.id || '');
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                this._logPhase("视频查找", `去重后: ${this._videoIframes.length}`);
            },

            // 获取指定索引的视频元素
            _getVideoElByIndex(index) {
                const item = this._videoIframes[index];
                if (!item) return null;
                if (item.videoEl) return item.videoEl;
                if (!item.iframe) return null;
                try {
                    // 始终使用 item.iframe.contentDocument，与 from 来源无关
                    const doc = item.iframe.contentDocument || item.iframe.contentWindow?.document;
                    if (!doc) {
                        this._logPhase("视频元素", `iframe[${index}].contentDocument 不可用（跨域或未加载）`);
                        return null;
                    }
                    const video = doc.getElementById('video_html5_api') || doc.querySelector('video') || doc.querySelector('.vjs-tech');
                    if (video) {
                        this._logPhase("视频元素", `iframe[${index}] ✅ 找到 video`);
                        return video;
                    }
                    this._logPhase("视频元素", `iframe[${index}] 内未找到 video`);
                    // 输出 HTML 片段辅助诊断
                    try {
                        const html = (doc.body ? doc.body.innerHTML.substring(0, 200) : '无body');
                        this._logPhase("视频元素-诊断", html.replace(/\s+/g,' ').substring(0, 150));
                    } catch(e) {}
                    return null;
                } catch (e) {
                    this._logPhase("视频元素", `iframe[${index}] 访问异常: ${e.message}`);
                    return null;
                }
            },

            // 播放在第 index 的视频
            _playVideoAtIndex(index) {
                if (index >= this._videoIframes.length) {
                    this._logPhase("视频播放", "✅ 所有视频播放完毕，跳转下一步");
                    this._isPlaying = false;
                    setTimeout(() => this.nextUnit(), 1000);
                    return;
                }
                this._videoIframeIndex = index;
                this._videoEl = this._getVideoElByIndex(index);
                if (!this._videoEl) {
                    this._logPhase("视频播放", `第 ${index} 个视频不可用，启动重试（最多3次）`);
                    const doRetry = (attempt) => {
                        if (attempt >= 3) {
                            this._logPhase("视频播放", `第 ${index} 个重试 ${attempt} 次放弃，跳过`);
                            this._playVideoAtIndex(index + 1);
                            return;
                        }
                        setTimeout(() => {
                            this._videoEl = this._getVideoElByIndex(index);
                            if (this._videoEl) {
                                this._logPhase("视频播放", `第 ${index} 个重试成功`);
                                this._doPlayVideo(index);
                            } else {
                                this._logPhase("视频播放", `第 ${index} 个重试 ${attempt + 1}/3`);
                                doRetry(attempt + 1);
                            }
                        }, 2000);
                    };
                    doRetry(0);
                    return;
                }
                this._doPlayVideo(index);
            },

            _doPlayVideo(index) {
                this._logPhase("视频播放", `▶️ 播放第 ${index + 1}/${this._videoIframes.length} 个视频`);
                // 点击播放按钮（Video.js 需要 .vjs-big-play-button 触发）
                try {
                    const item = this._videoIframes[index];
                    if (item.iframe) {
                        const iframeDoc = item.iframe.contentDocument || item.iframe.contentWindow?.document;
                        if (iframeDoc) {
                            const playBtn = iframeDoc.querySelector('.vjs-big-play-button');
                            if (playBtn) playBtn.click();
                        }
                    }
                } catch (e) {}

                this._tryTimes = 0;
                this._isPlaying = true;
                const video = this._videoEl;
                video.playbackRate = this.configs.playbackRate;
                video.muted = true; // 默认静音

                // 绑定事件
                const onEnded = () => {
                    this._logPhase("视频播放", `⏹️ 第 ${index + 1} 个视频播放完毕`);
                    video.removeEventListener('ended', onEnded);
                    this._isPlaying = false;
                    this._clearCheckInterval();
                    setTimeout(() => this._playVideoAtIndex(index + 1), 500);
                };
                video.addEventListener('ended', onEnded);

                video.play().then(() => {
                    console.log(`%c✅ 视频 ${index + 1} 播放中，倍速: ${video.playbackRate}x`, "color:#4CAF50");
                    this._startVideoMonitoring();
                }).catch(() => {
                    video.muted = true;
                    video.play().then(() => {
                        console.log(`%c✅ 视频 ${index + 1} 静音播放`, "color:#4CAF50");
                        this._startVideoMonitoring();
                    }).catch((e) => {
                        console.error("视频播放失败:", e);
                        if (this._tryTimes < this.configs.maxRetries) {
                            this._tryTimes++;
                            setTimeout(() => this._playVideoAtIndex(index), this.configs.retryInterval);
                        }
                    });
                });
            },

            // ====== 视频监控（带停滞检测） ======
            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },

            _checkVideoStatus() {
                try {
                    const video = this._videoEl;
                    if (!video || !this._isPlaying) return;

                    if (video.paused && !video.ended) {
                        console.log("%c检测到视频暂停，尝试恢复...", "color:#FF5722");
                        this._tryResumePlayback("paused-video");
                    } else if (!video.ended) {
                        // 停滞检测：7秒无进度变化
                        const now = Date.now();
                        const current = Number(video.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                console.log("%c检测到视频停滞，尝试恢复...", "color:#FF5722");
                                this._tryResumePlayback("no-progress");
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }
                } catch (e) {}
            },

            _tryResumePlayback(reason) {
                // 用户手动暂停时，不自动恢复
                if (this.configs.paused) return false;
                // 音频恢复
                if (this.configs.mediaType !== 'video' && this._audioEl) {
                    if (this._audioEl.ended) {
                        this._clearCheckInterval();
                        // 模式2：不跳转，重新播放当前音频
                        if (this.configs.loopMode) {
                            this._logPhase("音频-调试", "模式2：音频已结束，重新播放");
                            this._audioEl.currentTime = 0;
                            this._audioEl.play().catch(() => {});
                            this._startAudioMonitoring();
                            return true;
                        }
                        setTimeout(() => this.nextUnit(), 500);
                        return true;
                    }
                    if (this._audioEl.paused && !this._audioEl.ended && this._audioEl.currentTime > 0) {
                        this._audioEl.play().catch(() => {});
                        return true;
                    }
                    return false;
                }
                // 视频恢复
                const video = this._videoEl;
                if (!video || !this._isPlaying) return false;
                if (video.ended) return false; // ended 由事件处理

                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) return false;
                this._guardLastResumeTs = now;

                console.log(`%c触发恢复播放(${reason})`, "color:#607D8B");
                video.play().catch(() => {
                    video.muted = true;
                    video.play().catch((e) => console.warn("静音恢复失败:", e));
                });
                return true;
            },

            // ====== 通用方法 ======
            _clearCheckInterval() {
                if (this._checkInterval) { clearInterval(this._checkInterval); this._checkInterval = null; }
            },

            _bindStepNavigation() {
                if (this._navBound) return;
                this._navBound = true;
                const self = this;
                const onSectionChange = () => {
                    self._logPhase("导航", "用户切换章节 → 重新初始化");
                    self._resetState();
                    self._treeContainerEl = null;
                    clearTimeout(self._navTimer);
                    self._navTimer = setTimeout(() => {
                        try { self._initCellData(); } catch(e) {}
                        self._detectMediaType();
                        if (self.configs.mediaType === 'video') { self._startVideoInitialization(); }
                        else if (self.configs.mediaType === 'audio') { self._audioEl = null; self.play(); }
                    }, 2500);
                };
                // 监听课程树节点和卡片页签的点击（用户手动切换）
                const bindTree = (root) => {
                    if (!root) return;
                    try { $(root).on('click', '.posCatalog_name', onSectionChange); } catch(e) {}
                    try { $(root).on('click', '.prev_white', onSectionChange); } catch(e) {}
                };
                bindTree(document);
                try { bindTree(window.parent.document); } catch(e) {}
                try { bindTree(window.top.document); } catch(e) {}
            },

            _audioEventHandle() { return this._handleAudioPlay(); },
            _handlePlayError(e) { console.error("播放失败:", e); },

            /* ==================== 导航 ==================== */

            // 下一章节/下一小节
            nextUnit() {
                const el = this._getTreeContainer();
                if (!el) {
                    let btn = document.getElementById('right1');
                    if (!btn) { try { if (window.parent && window.parent.document !== window.document) btn = window.parent.document.getElementById('right1'); } catch(e){} }
                    if (!btn) { try { if (window.top && window.top.document !== window.document) btn = window.top.document.getElementById('right1'); } catch(e){} }
                    if (btn) {
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        this._resetState();
                        setTimeout(() => { try { this._initCellData(); this._playCurrent(); } catch(e) {} }, 3000);
                    }
                    this._clearCheckInterval();
                    return;
                }
                const cells = el.children("ul").children("li");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    this.playCurrentIndex(nCells.get(this._cellData.currentNCellIndex + 1));
                } else {
                    const next = this._cellData.currentCellIndex + 1;
                    if (next >= cells.length) {
                        // 已到最后一章最后一节
                        if (this.configs.loopMode) {
                            this._logPhase("导航", "🔁 整课循环：重新从第一章开始");
                            this._cellData.currentCellIndex = 0;
                            this._cellData.currentNCellIndex = 0;
                            this._resetState();
                            this.playCurrentIndex();
                        } else {
                            this._logPhase("导航", "✅ 课程全部完成");
                            let btn = document.getElementById('right1');
                            if (!btn) { try { if (window.parent && window.parent.document !== window.document) btn = window.parent.document.getElementById('right1'); } catch(e){} }
                            if (!btn) { try { if (window.top && window.top.document !== window.document) btn = window.top.document.getElementById('right1'); } catch(e){} }
                            if (btn) {
                                btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
                                this._resetState();
                                setTimeout(()=>{try{this._initCellData();this._playCurrent();}catch(e){}},3000);
                            }
                            this._clearCheckInterval();
                        }
                        return;
                    }
                    this._cellData.currentCellIndex = next;
                    this._cellData.currentNCellIndex = 0;
                    this.playCurrentIndex();
                }
            },

            playCurrentIndex(nCell) {
                if (!nCell) {
                    const el = this._getTreeContainer();
                    if (!el) { setTimeout(() => this.nextUnit(), 500); return; }
                    const cells = el.children("ul").children("li");
                    if (!cells || cells.length === 0) { setTimeout(() => this.nextUnit(), 500); return; }
                    nCell = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)').get(this._cellData.currentNCellIndex);
                }
                const $n = $(nCell), span = $n.find(".posCatalog_name")[0];
                if (!span) { setTimeout(() => this.nextUnit(), 2000); return; }
                $(span).click();
                this._resetState();
                setTimeout(() => {
                    try { this._initCellData(); } catch(e){}
                    if (this.configs.autoplay) this._playCurrent();
                }, 3000);
            },

            // 根据当前 mediaType 选择播放方法
            _playCurrent() {
                if (this.configs.mediaType === 'video') {
                    this._videoIframes = [];
                    this._videoIframeIndex = 0;
                    this._startVideoInitialization();
                } else {
                    this._audioEl = null;
                    this.play();
                }
            },

            _resetState() {
                this._audioEl = null;
                this._audioEls = [];
                this._audioIndex = 0;
                this._videoEl = null;
                this._videoIframes = [];
                this._videoIframeIndex = 0;
                this._treeContainerEl = null;
                this._isPlaying = false;
                this._nextSectionPending = false;
                this._stepSwitchPending = false;
                this._clearCheckInterval();
            },

            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) return true;
                // 从当前页面 + 父页面 + top 查找 prev_title
                const findTitle = () => {
                    let el = document.getElementsByClassName("prev_title")[0];
                    try { if (!el && window.parent && window.parent.document !== window.document) el = window.parent.document.getElementsByClassName("prev_title")[0]; } catch(e) {}
                    try { if (!el && window.top && window.top.document !== window.document) el = window.top.document.getElementsByClassName("prev_title")[0]; } catch(e) {}
                    return el ? (el.title || el.textContent || "").trim() : "";
                };
                const title = findTitle();
                if (title === "章节测验") {
                    this._logPhase("步骤", "章节测验 → 跳转到下一节");
                    this._navigateToNextSection();
                    return true;
                }
                const targetText = this.configs.mediaType === 'video' ? "视频" : "音频";
                if (title === targetText) return false;
                const tab = $(".prev_white:visible").filter((i, el) => {
                    const text = ($(el).text()||"").replace(/\s+/g,"");
                    return text === "2" + targetText || text === targetText;
                }).get(0);
                if (tab) { this._stepSwitchPending = true; this._stepSwitchAt = Date.now(); tab.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window})); return true; }
                // 找不到页签时，尝试通过父页面的 #prevNextFocusNext 跳过
                const findNextBtn = () => {
                    let btn = document.getElementById('prevNextFocusNext');
                    try { if (!btn && window.parent && window.parent.document !== window.document) btn = window.parent.document.getElementById('prevNextFocusNext'); } catch(e) {}
                    try { if (!btn && window.top && window.top.document !== window.document) btn = window.top.document.getElementById('prevNextFocusNext'); } catch(e) {}
                    return btn;
                };
                const nextBtn = findNextBtn();
                if (nextBtn) {
                    // 模式2：不点 #prevNextFocusNext，等待当前媒体加载
                    if (this.configs.loopMode) {
                        this._logPhase("步骤", "模式2：跳过 #prevNextFocusNext，等待媒体加载");
                        return false;
                    }
                    nextBtn.click(); this._logPhase("步骤", "点击 #prevNextFocusNext 跳过"); return true;
                }
                return false;
            },

            /* ==================== 任务完成监控 ==================== */

            _startTaskCompletionMonitor() {
                const obs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        if (m.type === 'childList') {
                            for (const n of m.addedNodes) {
                                if (n.nodeType === Node.ELEMENT_NODE && n.querySelectorAll('[aria-label="任务点已完成"]').length > 0) {
                                    // 模式1（正常）才跳转；模式2（全部播放）忽略已完成标记
                                    if (!this.configs.loopMode) this._navigateToNextSection();
                                    return;
                                }
                            }
                        } else if (m.type === 'attributes' && m.attributeName === 'aria-label' && m.target.getAttribute('aria-label') === '任务点已完成') {
                            if (!this.configs.loopMode) this._navigateToNextSection();
                            return;
                        }
                    }
                });
                obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
            },

            _detectTaskCompleted() {
                if (document.querySelectorAll('[aria-label="任务点已完成"]').length > 0) return true;
                const iframes = document.querySelectorAll('iframe');
                for (const f of iframes) {
                    try { const d = f.contentDocument||f.contentWindow?.document; if (d && d.querySelectorAll('[aria-label="任务点已完成"]').length > 0) return true; } catch(e){}
                }
                return false;
            },

            _navigateToNextSection() {
                if (this._nextSectionPending) return;
                // 查找 #right1：本地 → 父页面 → top
                let btn = document.getElementById('right1');
                if (!btn) {
                    try { if (window.parent && window.parent.document !== window.document) { btn = window.parent.document.getElementById('right1'); } } catch(e) {}
                }
                if (!btn) {
                    try { if (window.top && window.top.document !== window.document) { btn = window.top.document.getElementById('right1'); } } catch(e) {}
                }
                if (!btn) {
                    this._logPhase("导航","❌ 没有 #right1，可能所有小节已完成");
                    if (this.configs.loopMode) {
                        this._logPhase("导航","🔁 整课循环：重新开始");
                        this._nextSectionPending = false;
                        this._skipCount = 0;
                        this._cellData.currentCellIndex = 0;
                        this._cellData.currentNCellIndex = 0;
                        this._resetState();
                        setTimeout(() => { this._playCurrent(); }, 2000);
                    }
                    return;
                }
                this._nextSectionPending = true;
                this._skipCount = (this._skipCount||0) + 1;
                if (this._skipCount > 50) {
                    this._logPhase("导航","❌ 超过50次连续跳转，终止");
                    if (this.configs.loopMode) {
                        this._logPhase("导航","🔁 整课循环：重置跳转计数");
                        this._skipCount = 0;
                        this._nextSectionPending = false;
                        return;
                    }
                    alert("⚠️ 检测到循环跳转超过50次，已自动停止\n请检查是否所有任务点都已标记完成。");
                    this._nextSectionPending = false;
                    return;
                }
                btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
                this._resetState();
                setTimeout(() => this._waitForNextSectionReady(0), 2000);
            },

            _waitForNextSectionReady(attempt = 0) {
                if (attempt > 40) {
                    this._nextSectionPending = false;
                    this._skipCount = 0;
                    return;
                }
                try {
                    if (!this.configs.loopMode && this._detectTaskCompleted()) {
                        this._logPhase("导航","✅ 下一节已完成，继续跳过");
                        this._nextSectionPending = false;
                        setTimeout(() => this._navigateToNextSection(), 500);
                        return;
                    }
                    this._initCellData();
                    // 检测新页面是否有媒体
                    this._detectMediaType();
                    if (this.configs.mediaType === 'video') {
                        this._findAllVideoIframes();
                        if (this._videoIframes.length > 0) {
                            this._nextSectionPending = false;
                            this._skipCount = 0;
                            if (this.configs.autoplay) this._playCurrent();
                            return;
                        }
                    } else {
                        this._audioEl = null;
                        if (this._getAudioEl()) {
                            this._nextSectionPending = false;
                            this._skipCount = 0;
                            if (this.configs.autoplay) this._playCurrent();
                            return;
                        }
                    }
                } catch(e) {}
                setTimeout(() => this._waitForNextSectionReady(attempt + 1), 1500);
            },

            /* ==================== 设置播放速度 ==================== */

            setPlaybackRate(rate) {
                rate = Math.max(0.1, Math.min(16, rate));
                this.configs.playbackRate = rate;
                if (this._audioEl) this._audioEl.playbackRate = rate;
                if (this._videoEl) this._videoEl.playbackRate = rate;
                console.log(`%c⚡ 播放速度已设为: ${rate}x`, "color:#FF9800;font-weight:bold");
            },

            toggleLoopMode() {
                this.configs.loopMode = !this.configs.loopMode;
                this._logPhase("播放模式", this.configs.loopMode ? "🔁 已开启整课循环" : "📋 已切换为正常模式");
                // 更新面板显示
                const modeBtn = document.getElementById('fq-mode-toggle');
                const modeLabel = document.getElementById('fq-mode-label');
                if (modeBtn && modeLabel) {
                    modeBtn.textContent = this.configs.loopMode ? '🔁 整课循环' : '📋 正常模式';
                    modeBtn.className = this.configs.loopMode ? 'fq-mode-active' : 'fq-mode-normal';
                    modeLabel.textContent = this.configs.loopMode ? '循环中' : '顺序播放';
                }
                // 切换到正常模式时，检测当前任务是否已完成（含父页面/top）
                if (!this.configs.loopMode) {
                    let done = this._detectTaskCompleted();
                    try { if (!done && window.parent && window.parent.document !== window.document) done = window.parent.document.querySelectorAll('[aria-label="任务点已完成"]').length > 0; } catch(e) {}
                    try { if (!done && window.top && window.top.document !== window.document) done = window.top.document.querySelectorAll('[aria-label="任务点已完成"]').length > 0; } catch(e) {}
                    if (done) {
                        this._logPhase("播放模式", "当前任务已完成，跳转下一节");
                        this._navigateToNextSection();
                    } else {
                        // 未完成：直接在当前播放
                        this._logPhase("播放模式", "当前未完成，继续播放");
                        if (this.configs.paused) {
                            // 如果之前被暂停，恢复播放
                            this.togglePause();
                        } else {
                            // 尝试恢复当前媒体
                            this._tryResumePlayback("mode-switch");
                        }
                    }
                }
            },

            togglePause() {
                this.configs.paused = !this.configs.paused;
                this._logPhase("播放", this.configs.paused ? "⏸️ 已暂停（静音追踪）" : "▶️ 已恢复播放");

                // 更新按钮UI
                const btn = document.getElementById('fq-pause-btn');
                if (btn) {
                    btn.textContent = this.configs.paused ? '▶️ 播放' : '⏸️ 暂停';
                    btn.className = this.configs.paused ? 'fq-pause-btn fq-paused' : 'fq-pause-btn fq-playing';
                }

                // 获取当前媒体元素
                let target = null;
                if (this.configs.mediaType === 'video') {
                    if (!this._videoEl) {
                        const idx = this._videoIframeIndex;
                        if (idx !== undefined && this._videoIframes && this._videoIframes.length > 0) {
                            this._videoEl = this._getVideoElByIndex(idx);
                        }
                    }
                    target = this._videoEl;
                } else {
                    if (!this._audioEl) {
                        this._audioEl = this._getAudioEl();
                    }
                    target = this._audioEl;
                }

                if (this.configs.paused) {
                    // === 暂停：静音 + seek冻结，不调 pause() ===
                    this._pausedAt = target ? target.currentTime : 0;

                    // 1) 直接操作已知的目标元素（最深层的video/audio）
                    let silencedCount = 0;
                    if (target) {
                        target.volume = 0; target.muted = true;
                        target.currentTime = this._pausedAt;
                        silencedCount++;
                        this._logPhase("播放-调试", `已冻结主目标 id="${target.id || '(无)'}" at ${this._pausedAt.toFixed(1)}s`);
                    } else {
                        this._logPhase("播放-调试", "⚠️ 无可用主目标");
                    }

                    // 2) 兜底：所有层级 iframe 内的 audio/video 全部静音
                    const silenceAndSeek = (root, isTarget) => {
                        if (!root) return;
                        const all = root.querySelectorAll('audio,video');
                        for (const m of all) {
                            m.volume = 0; m.muted = true;
                            if (this._pausedAt > 0 && Math.abs(m.currentTime - this._pausedAt) > 0.5) {
                                m.currentTime = this._pausedAt;
                            }
                            if (!isTarget) silencedCount++;
                        }
                    };
                    try { silenceAndSeek(document); } catch(e) {}
                    try {
                        const f = document.getElementById('iframe');
                        if (f && f.contentDocument) {
                            silenceAndSeek(f.contentDocument);
                            // 3) 再进一层：找 #iframe 内的 ans-insertvideo-online
                            const inner = f.contentDocument.querySelector('iframe.ans-insertvideo-online, iframe.ans-insertaudio');
                            if (inner) {
                                try {
                                    const idoc = inner.contentDocument || inner.contentWindow?.document;
                                    if (idoc) silenceAndSeek(idoc);
                                } catch(e) {}
                            }
                        }
                    } catch(e) {}
                    // 视频额外关闭播放按钮
                    if (this.configs.mediaType === 'video') {
                        try { const f = document.getElementById('iframe'); if (f) { const doc = f.contentDocument || f.contentWindow?.document; if (doc) { const pb = doc.querySelector('.vjs-big-play-button,.vjs-play-control'); if (pb) pb.click(); } } } catch(e) {}
                    }

                    this._logPhase("播放", `⏸️ 已冻结 ${silencedCount} 个元素 (位置 ${this._pausedAt.toFixed(1)}s)`);

                    // 3) 清除监控，停止自动推进
                    this._clearCheckInterval();
                    this._isPlaying = false;

                    // 4) 启动守卫：直接操作已知元素 + 各层级兜底
                    if (!this._pauseWatcher) {
                        this._pauseWatcher = setInterval(() => {
                            if (!this.configs.paused) {
                                clearInterval(this._pauseWatcher);
                                this._pauseWatcher = null;
                                return;
                            }
                            // 直接操作已知的 audioEl / videoEl
                            if (this._videoEl) {
                                this._videoEl.volume = 0; this._videoEl.muted = true;
                                if (this._pausedAt > 0) this._videoEl.currentTime = this._pausedAt;
                            }
                            if (this._audioEl) {
                                this._audioEl.volume = 0; this._audioEl.muted = true;
                                if (this._pausedAt > 0) this._audioEl.currentTime = this._pausedAt;
                            }
                            // 兜底
                            try {
                                document.querySelectorAll('audio,video').forEach(el => {
                                    el.volume = 0; el.muted = true;
                                    if (this._pausedAt > 0 && Math.abs(el.currentTime - this._pausedAt) > 0.3) el.currentTime = this._pausedAt;
                                });
                            } catch(e) {}
                            try {
                                const f = document.getElementById('iframe');
                                if (f && f.contentDocument) {
                                    f.contentDocument.querySelectorAll('audio,video').forEach(el => {
                                        el.volume = 0; el.muted = true;
                                        if (this._pausedAt > 0 && Math.abs(el.currentTime - this._pausedAt) > 0.3) el.currentTime = this._pausedAt;
                                    });
                                }
                            } catch(e) {}
                        }, 300);
                    }

                } else {
                    // === 恢复：seek 回到暂停位置 + 恢复音量 ===
                    if (target) {
                        target.volume = 1;
                        target.muted = true;
                        // seek 回到暂停位置
                        if (this._pausedAt > 0 && Math.abs(target.currentTime - this._pausedAt) > 0.5) {
                            target.currentTime = this._pausedAt;
                            this._logPhase("播放-调试", `seek 到 ${this._pausedAt.toFixed(1)}s (当前 ${target.currentTime.toFixed(1)}s)`);
                        }
                        target.play().catch(() => {
                            target.muted = true;
                            target.play().catch((e) => {
                                this._logPhase("播放-错误", `恢复失败: ${e.message}`);
                            });
                        });
                        // 重启监控
                        if (this.configs.mediaType === 'video') { this._startVideoMonitoring(); }
                        this._logPhase("播放", `▶️ 已恢复 (playbackRate: ${target.playbackRate}x, position: ${this._pausedAt.toFixed(1)}s)`);
                    } else {
                        this._logPhase("播放-调试", "▶️ 恢复: 无可用媒体元素");
                    }

                    this._pausedAt = 0;
                    // 清除暂停守卫
                    if (this._pauseWatcher) {
                        clearInterval(this._pauseWatcher);
                        this._pauseWatcher = null;
                    }
                    this._isPlaying = true;
                }
            },

            // ====== 屏幕防休眠 ======
            _requestWakeLock() {
                if (this._wakeLock) return;
                if (!navigator.wakeLock || !navigator.wakeLock.request) {
                    this._logPhase("防休眠", "WakeLock API 不支持，使用播放保持唤醒");
                    return;
                }
                navigator.wakeLock.request('screen').then((sentinel) => {
                    this._wakeLock = sentinel;
                    this._logPhase("防休眠", "✅ 屏幕唤醒已锁定");
                    sentinel.addEventListener('release', () => {
                        this._logPhase("防休眠", "⚠️ 唤醒被释放，10秒后重新申请");
                        this._wakeLock = null;
                        setTimeout(() => this._requestWakeLock(), 10000);
                    });
                }).catch((e) => {
                    this._logPhase("防休眠", `❌ 申请失败: ${e.message}，10秒后重试`);
                    setTimeout(() => this._requestWakeLock(), 10000);
                });
            },

            /* ==================== 悬浮控制面板 ==================== */

            _createControlPanel() {
                // 只在顶层窗口创建面板（子页面不创建，避免重复）
                if (window.self !== window.top) return;
                if (document.getElementById('fq-control-panel')) return;
                const style = document.createElement('style');
                style.textContent = `
                    #fq-control-panel {
                        position: fixed; bottom: 30px; right: 30px; z-index: 999999;
                        background: rgba(30, 30, 40, 0.88); backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.15); border-radius: 16px;
                        padding: 16px 20px; min-width: 200px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
                        cursor: move; user-select: none; font-family: 'Segoe UI', sans-serif;
                        transition: opacity 0.3s;
                    }
                    #fq-control-panel:hover { opacity: 1 !important; }
                    #fq-control-panel .fq-header {
                        display: flex; justify-content: space-between; align-items: center;
                        margin-bottom: 10px; color: #e0e0e0; font-size: 13px; font-weight: 600;
                    }
                    #fq-control-panel .fq-close {
                        cursor: pointer; font-size: 18px; color: #999; line-height: 1;
                    }
                    #fq-control-panel .fq-close:hover { color: #fff; }
                    /* 模式切换区 */
                    #fq-control-panel .fq-mode-row {
                        display: flex; align-items: center; gap: 6px;
                        background: rgba(255,255,255,0.05); border-radius: 8px;
                        padding: 8px 10px; margin-bottom: 10px;
                    }
                    #fq-control-panel .fq-mode-btn {
                        flex: 1; text-align: center; font-size: 12px; padding: 5px 8px; border-radius: 8px;
                        cursor: pointer; border: 1px solid rgba(255,255,255,0.12);
                        transition: all 0.15s; background: rgba(255,255,255,0.08); color: #ccc;
                    }
                    #fq-control-panel .fq-mode-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
                    #fq-control-panel .fq-mode-btn.fq-mode-active {
                        background: #FF9800; color: #fff; border-color: #FF9800;
                    }
                    /* 暂停/播放按钮 */
                    #fq-control-panel .fq-pause-row {
                        display: flex; align-items: center; justify-content: center;
                        margin-bottom: 10px;
                    }
                    #fq-control-panel .fq-pause-btn {
                        font-size: 14px; padding: 6px 20px; border-radius: 10px;
                        cursor: pointer; border: 1px solid rgba(255,255,255,0.15);
                        transition: all 0.15s; width: 100%; text-align: center;
                    }
                    #fq-control-panel .fq-pause-btn.fq-playing {
                        background: rgba(76,175,80,0.25); color: #81C784; border-color: rgba(76,175,80,0.4);
                    }
                    #fq-control-panel .fq-pause-btn.fq-playing:hover {
                        background: rgba(76,175,80,0.35);
                    }
                    #fq-control-panel .fq-pause-btn.fq-paused {
                        background: rgba(255,152,0,0.25); color: #FFB74D; border-color: rgba(255,152,0,0.4);
                    }
                    #fq-control-panel .fq-pause-btn.fq-paused:hover {
                        background: rgba(255,152,0,0.35);
                    }
                    #fq-control-panel .fq-log-btn {
                        font-size: 12px; padding: 4px 10px; border-radius: 8px;
                        cursor: pointer; border: 1px solid rgba(255,255,255,0.12);
                        transition: all 0.15s; background: rgba(255,255,255,0.08);
                        color: #ccc; flex: 1; text-align: center;
                    }
                    #fq-control-panel .fq-log-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
                    #fq-control-panel .fq-log-btn.fq-log-active {
                        background: #607D8B; color: #fff; border-color: #607D8B;
                    }
                    /* 速度显示 */
                    #fq-control-panel .fq-speed-display {
                        text-align: center; font-size: 28px; font-weight: 700;
                        color: #4FC3F7; margin-bottom: 10px;
                    }
                    #fq-control-panel .fq-speed-buttons {
                        display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 10px;
                    }
                    #fq-control-panel .fq-speed-buttons button {
                        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
                        color: #ccc; padding: 4px 10px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; transition: all 0.15s;
                    }
                    #fq-control-panel .fq-speed-buttons button:hover { background: rgba(255,255,255,0.18); color: #fff; }
                    #fq-control-panel .fq-speed-buttons button.active {
                        background: #4FC3F7; color: #fff; border-color: #4FC3F7;
                    }
                    #fq-control-panel .fq-custom-row {
                        display: flex; gap: 6px; align-items: center; justify-content: center;
                    }
                    #fq-control-panel .fq-custom-row input {
                        width: 70px; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);
                        background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; text-align: center;
                    }
                    #fq-control-panel .fq-custom-row button {
                        background: #4FC3F7; color: #fff; border: none; padding: 4px 12px;
                        border-radius: 6px; cursor: pointer; font-size: 12px;
                    }
                    #fq-control-panel .fq-custom-row button:hover { background: #29B6F6; }
                `;
                document.head.appendChild(style);

                const panel = document.createElement('div');
                panel.id = 'fq-control-panel';
                const modeText = this.configs.loopMode ? '🔁 整课循环' : '📋 正常模式';
                const modeClass = this.configs.loopMode ? 'fq-mode-active' : 'fq-mode-normal';
                const modeStatus = this.configs.loopMode ? '循环中' : '顺序播放';
                panel.innerHTML = `
                    <div class="fq-header">
                        <span>🎮 学习通助手</span>
                        <span class="fq-close">✕</span>
                    </div>
                    <div class="fq-mode-row">
                        <span class="fq-mode-btn ${this.configs.loopMode ? '' : 'fq-mode-active'}" id="fq-mode-1" data-mode="1">模式1 顺序</span>
                        <span class="fq-mode-btn ${this.configs.loopMode ? 'fq-mode-active' : ''}" id="fq-mode-2" data-mode="2">模式2 全部</span>
                    </div>
                    <div class="fq-pause-row">
                        <span class="fq-pause-btn fq-playing" id="fq-pause-btn">⏸️ 暂停</span>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:10px">
                        <span class="fq-log-btn" id="fq-log-toggle">📋 日志</span>
                    </div>
                    <div class="fq-speed-display" id="fq-speed-value">${this.configs.playbackRate}x</div>
                    <div class="fq-speed-buttons" id="fq-speed-buttons">
                        <button data-speed="0.5">0.5x</button>
                        <button data-speed="0.75">0.75x</button>
                        <button data-speed="1.0" class="active">1.0x</button>
                        <button data-speed="1.25">1.25x</button>
                        <button data-speed="1.5">1.5x</button>
                        <button data-speed="2.0">2.0x</button>
                        <button data-speed="3.0">3.0x</button>
                    </div>
                    <div class="fq-custom-row">
                        <input type="number" id="fq-speed-input" step="0.1" min="0.1" max="16" placeholder="自定义">
                        <button id="fq-speed-apply">设置</button>
                    </div>
                `;
                document.body.appendChild(panel);

                // 速度预设按钮
                const btns = panel.querySelectorAll('.fq-speed-buttons button');
                btns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const rate = parseFloat(btn.dataset.speed);
                        this.setPlaybackRate(rate);
                        btns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        panel.querySelector('#fq-speed-value').textContent = rate + 'x';
                    });
                });

                // 自定义输入
                panel.querySelector('#fq-speed-apply').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = parseFloat(panel.querySelector('#fq-speed-input').value);
                    if (!isNaN(val) && val >= 0.1 && val <= 16) {
                        this.setPlaybackRate(val);
                        panel.querySelector('#fq-speed-value').textContent = val + 'x';
                        btns.forEach(b => b.classList.remove('active'));
                    }
                });

                // 模式选择按钮
                const setMode = (mode) => {
                    this.configs.loopMode = (mode === 2);
                    // 更新按钮高亮
                    const m1 = document.getElementById('fq-mode-1');
                    const m2 = document.getElementById('fq-mode-2');
                    if (m1) m1.className = 'fq-mode-btn' + (mode === 1 ? ' fq-mode-active' : '');
                    if (m2) m2.className = 'fq-mode-btn' + (mode === 2 ? ' fq-mode-active' : '');
                    this._logPhase("播放模式", mode === 1 ? "模式1 顺序（已完成跳过）" : "模式2 全部（播完每一节）");

                    if (mode === 1) {
                        // 正常模式：检测当前是否有已完成标记，有则跳过
                        let done = this._detectTaskCompleted();
                        try { if (!done && window.parent && window.parent.document !== window.document) done = window.parent.document.querySelectorAll('[aria-label="任务点已完成"]').length > 0; } catch(e) {}
                        try { if (!done && window.top && window.top.document !== window.document) done = window.top.document.querySelectorAll('[aria-label="任务点已完成"]').length > 0; } catch(e) {}
                        if (done) {
                            this._logPhase("播放模式", "当前任务已完成，跳转下一节");
                            this._navigateToNextSection();
                            return;
                        }
                    }
                    // 未完成或模式2：确保正在播放
                    if (this.configs.paused) { this.togglePause(); }
                    else { this._tryResumePlayback("mode-switch"); }
                };

                panel.querySelector('#fq-mode-1').addEventListener('click', (e) => {
                    e.stopPropagation();
                    setMode(1);
                });
                panel.querySelector('#fq-mode-2').addEventListener('click', (e) => {
                    e.stopPropagation();
                    setMode(2);
                });

                // 暂停/播放按钮
                panel.querySelector('#fq-pause-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.togglePause();
                });

                // 日志面板开关
                panel.querySelector('#fq-log-toggle').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dbg = document.getElementById('fq-debug-panel');
                    const logBtn = panel.querySelector('#fq-log-toggle');
                    if (dbg) {
                        const visible = dbg.style.display !== 'none';
                        dbg.style.display = visible ? 'none' : 'flex';
                        logBtn.className = visible ? 'fq-log-btn' : 'fq-log-btn fq-log-active';
                        this._logPhase("调试", visible ? "📋 隐藏日志面板" : "📋 显示日志面板");
                    } else {
                        this._logPhase("调试", "📋 日志面板未创建，重新创建");
                        this._createDebugPanel();
                        setTimeout(() => {
                            const d2 = document.getElementById('fq-debug-panel');
                            if (d2) { d2.style.display = 'flex'; logBtn.className = 'fq-log-btn fq-log-active'; }
                        }, 100);
                    }
                });

                // 拖拽
                let isDragging = false, startX, startY, origX, origY;
                panel.querySelector('.fq-header').addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX; startY = e.clientY;
                    origX = panel.offsetLeft; origY = panel.offsetTop;
                    panel.style.transition = 'none';
                    e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    panel.style.left = (origX + e.clientX - startX) + 'px';
                    panel.style.top = (origY + e.clientY - startY) + 'px';
                    panel.style.bottom = 'auto'; panel.style.right = 'auto';
                });
                document.addEventListener('mouseup', () => {
                    if (!isDragging) return;
                    isDragging = false; panel.style.transition = '';
                });

                // 关闭按钮（最小化）
                panel.querySelector('.fq-close').addEventListener('click', (e) => {
                    e.stopPropagation(); panel.style.opacity = '0.3';
                });
                panel.addEventListener('click', () => { panel.style.opacity = '1'; });

                console.log("%c✓ 学习通助手控制面板已创建", "color:#4CAF50;font-weight:bold");
            },

            // ====== 调试日志面板（临时，正式版删除） ======
            _createDebugPanel() {
                if (document.getElementById('fq-debug-panel')) return;
                const style = document.createElement('style');
                style.textContent = `
                    #fq-debug-panel {
                        position: fixed; top: 80px; left: 10px; z-index: 999998;
                        width: 320px; max-height: 400px;
                        background: rgba(20,20,30,0.85); backdrop-filter: blur(8px);
                        border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
                        padding: 10px; font-family: "Consolas","Monaco",monospace; font-size: 11px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.4); overflow: hidden;
                        display: flex; flex-direction: column;
                    }
                    #fq-debug-panel .fq-debug-header {
                        display: flex; justify-content: space-between; align-items: center;
                        margin-bottom: 6px; color: #888; font-size: 11px;
                        cursor: move; user-select: none;
                    }
                    #fq-debug-panel .fq-debug-header span { font-family: "Segoe UI",sans-serif; }
                    #fq-debug-panel .fq-debug-copy {
                        cursor: pointer; color: #4FC3F7; font-family: "Segoe UI",sans-serif;
                        padding: 2px 8px; border-radius: 4px; font-size: 11px;
                        background: rgba(79,195,247,0.1);
                    }
                    #fq-debug-panel .fq-debug-copy:hover { background: rgba(79,195,247,0.2); }
                    #fq-debug-panel .fq-debug-body {
                        flex: 1; overflow-y: auto; max-height: 330px;
                        scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
                    }
                    #fq-debug-panel .fq-debug-body::-webkit-scrollbar { width: 3px; }
                    #fq-debug-panel .fq-debug-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
                    #fq-debug-panel .fq-debug-entry {
                        color: #ccc; line-height: 1.5; padding: 1px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.04);
                        word-break: break-all;
                    }
                    #fq-debug-panel .fq-debug-close {
                        cursor: pointer; color: #666; font-size: 16px; line-height: 1; padding: 0 4px;
                    }
                    #fq-debug-panel .fq-debug-close:hover { color: #fff; }
                `;
                document.head.appendChild(style);

                const panel = document.createElement('div');
                panel.id = 'fq-debug-panel';
                panel.style.display = 'none'; // 默认隐藏
                panel.innerHTML = `
                    <div class="fq-debug-header">
                        <span>🐛 调试日志 <span style="color:#666;font-size:10px">(${this._logBuffer.length}条)</span></span>
                        <span style="display:flex;gap:6px;align-items:center">
                            <span class="fq-debug-copy" id="fq-debug-copy">📋 复制</span>
                            <span class="fq-debug-close" id="fq-debug-close">✕</span>
                        </span>
                    </div>
                    <div class="fq-debug-body" id="fq-debug-body"></div>
                `;
                document.body.appendChild(panel);

                // 拖拽
                let isDrag = false, sx, sy, ox, oy;
                const hdr = panel.querySelector('.fq-debug-header');
                hdr.addEventListener('mousedown', (e) => {
                    isDrag = true; sx = e.clientX; sy = e.clientY;
                    ox = panel.offsetLeft; oy = panel.offsetTop;
                    panel.style.transition = 'none'; e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => {
                    if (!isDrag) return;
                    panel.style.left = (ox + e.clientX - sx) + 'px';
                    panel.style.top = (oy + e.clientY - sy) + 'px';
                    panel.style.right = 'auto';
                });
                document.addEventListener('mouseup', () => { isDrag = false; panel.style.transition = ''; });

                // 复制
                panel.querySelector('#fq-debug-copy').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const text = this._logBuffer.join('\n');
                    navigator.clipboard.writeText(text).then(() => {
                        const btn = panel.querySelector('#fq-debug-copy');
                        btn.textContent = '✅ 已复制';
                        setTimeout(() => { btn.textContent = '📋 复制'; }, 2000);
                    }).catch(() => {
                        // 降级：选中文档
                        const ta = document.createElement('textarea');
                        ta.value = text; document.body.appendChild(ta);
                        ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                    });
                });

                // 关闭
                panel.querySelector('#fq-debug-close').addEventListener('click', (e) => {
                    e.stopPropagation(); panel.style.display = 'none';
                });

                console.log("%c✓ 调试日志面板已创建", "color:#607D8B");
            },

            _updateDebugPanel() {
                const body = document.getElementById('fq-debug-body');
                if (!body) return;
                const entries = this._logBuffer.slice(-30);
                body.innerHTML = entries.map(msg =>
                    `<div class="fq-debug-entry">${msg.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`
                ).join('');
                body.scrollTop = body.scrollHeight;
                // 更新计数
                const header = document.querySelector('#fq-debug-panel .fq-debug-header span');
                if (header) {
                    header.innerHTML = `🐛 调试日志 <span style="color:#666;font-size:10px">(${this._logBuffer.length}条)</span>`;
                }
            },
        };

        // ====== 启动 ======
        try {
            window.app.run();

            // 防暂停事件
            const preventPause = (e) => { e.stopPropagation(); e.preventDefault(); };
            const resumePlaybackNow = () => {
                if (window.app && typeof window.app._tryResumePlayback === "function") window.app._tryResumePlayback("page-event");
            };
            document.addEventListener("mouseleave", preventPause);
            window.addEventListener("mouseleave", preventPause);
            document.addEventListener("mouseout", preventPause);
            window.addEventListener("mouseout", preventPause);
            window.addEventListener("blur", () => resumePlaybackNow());
            document.addEventListener("visibilitychange", () => resumePlaybackNow());
            // 每30秒保活
            setInterval(function(){
                if(window.app&&window.app._wakeLock===null&&typeof window.app._requestWakeLock==="function")window.app._requestWakeLock();
                if(window.app&&typeof window.app._tryResumePlayback==="function")window.app._tryResumePlayback("keep-alive")
            },30000);

            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
            console.log("%c  ✅ 学习通助手 v1.0 启动完成", "color:#4CAF50;font-size:14px;font-weight:bold");
            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
        } catch (error) {
            console.error("学习通助手启动失败:", error);
        }
    }
})();
