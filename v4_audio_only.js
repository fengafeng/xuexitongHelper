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
                playbackRate: 1.0,
                autoplay: true,
                mutePageAudio: true,
                retryInterval: 2000,
                maxRetries: 10,
                audioCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
            },
            _audioEls: [],
            _audioIndex: 0,
            _treeContainerEl: null,
            _isPlaying: false,
            _nextSectionPending: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _cellData: {
                cells: 0, nCells: 0, currentCellIndex: 0, currentNCellIndex: 0, currentAudioTitle: "",
            },
            get cellData() { return this._cellData; },
            _tryTimes: 0,
            _stepSwitchPending: false,
            _stepSwitchAt: 0,

            run() {
                this._runContentPageAudio();
                this._createSpeedControlPanel();
            },

            /* ==================== 音频播放核心逻辑 ==================== */

            _runContentPageAudio() {
                this._logPhase("内容页-启动", "V4 音频独立播放版");
                
                // 预检任务是否已完成
                if (this._detectTaskCompleted()) {
                    this._logPhase("内容页-启动", "✅ 任务已完成，跳转下一节");
                    this._navigateToNextSection();
                    return;
                }
                this._logPhase("内容页-启动", "⏳ 任务未完成，开始初始化");
                
                const iframeCount = document.querySelectorAll('iframe').length;
                console.log(`%c  页面 iframe 数量: ${iframeCount}`, "color:#607D8B");

                // 任务检测完毕直接开始
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

            // ====== 初始化序列（统一异常兜底） ======
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
                    // 遍历所有iframe
                    const allIframes = $("iframe");
                    for (let i = 0; i < allIframes.length; i++) {
                        const iframe = allIframes.eq(i);
                        const src = iframe.attr('src') || '';
                        const cls = iframe.attr('class') || '';
                        const id = iframe.attr('id') || '';
                        if (src.includes('video') || cls.includes('video') || id.includes('video')) continue;
                        if (src.includes('audio') || cls.includes('audio') || id.includes('audio') || src.includes('insert') || cls.includes('ans')) return iframe;
                    }
                    // 检查嵌套iframe
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
                    setTimeout((() => {
                        try {
                            const doc = iframe.contentDocument;
                            if (!doc || !(doc.readyState === 'complete' || doc.readyState === 'interactive')) {
                                setTimeout(checkContent, 500);
                                return;
                            }
                            iframe.removeEventListener('load', onLoad);
                            this._phaseInitSequence("分支C-poll");
                        } catch (e) {
                            setTimeout(checkContent, 500);
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
                                this._cellData.currentAudioTitle = $(s).find('h4, h5').first().text().trim();
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
                                if (ts) this._cellData.currentAudioTitle = $(ts).attr('title');
                            }
                        });
                    });
                    this._cellData.nCells = nc;
                }
            },

            // ====== 查找音频元素 ======
            _getAudioEl() {
                if (!this._audioEl) {
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
                    let audio = iframeDoc.find("audio").get(0);
                    if (!audio) { const vc = iframeDoc.find(".video-js, #audio.video-js, .audio-player"); if (vc.length > 0) audio = vc.find("audio").get(0); }
                    if (!audio) { const allM = iframeDoc.find("audio, video"); if (allM.length > 0) audio = allM.get(0); }
                    if (audio) this._audioEl = audio;
                }
                return this._audioEl || null;
            },

            // ====== 播放 ======
            async play() {
                try {
                    const el = this._getAudioEl();
                    if (el == null) {
                        if (this._advanceLearningStep()) {
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

            // ====== 下一节导航 ======
            nextUnit() {
                const el = this._getTreeContainer();
                if (!el) {
                    const btn = document.getElementById('right1');
                    if (btn) {
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        this._audioEl = null; this._isPlaying = false; this._nextSectionPending = false;
                        setTimeout(() => { try { this._initCellData(); this.play(); } catch(e) {} }, 3000);
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
                        const btn = document.getElementById('right1');
                        if (btn) { btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); this._audioEl=null; this._isPlaying=false; setTimeout(()=>{try{this._initCellData();this.play();}catch(e){}},3000); }
                        this._clearCheckInterval();
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
                    if (!el) { this.nextUnit(); return; }
                    const cells = el.children("ul").children("li");
                    if (!cells || cells.length === 0) { this.nextUnit(); return; }
                    nCell = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)').get(this._cellData.currentNCellIndex);
                }
                const $n = $(nCell), span = $n.find(".posCatalog_name")[0];
                if (!span) { setTimeout(() => this.nextUnit(), 2000); return; }
                $(span).click();
                this._audioEl = null; this._isPlaying = false;
                setTimeout(() => { try { this._initCellData(); } catch(e){} if (this.configs.autoplay) this.play(); }, 3000);
            },

            // ====== 监控 ======
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

            _tryResumePlayback(source) {
                if (!this._audioEl || !this._isPlaying) return false;
                if (this._audioEl.ended) {
                    this._logPhase("音频监控", `⏹️ 播放结束 -> nextUnit`);
                    this._clearCheckInterval();
                    setTimeout(() => this.nextUnit(), 500);
                    return true;
                }
                if (this._audioEl.paused && !this._audioEl.ended && this._audioEl.currentTime > 0) {
                    this._audioEl.play().catch(() => {});
                    return true;
                }
                return false;
            },

            _clearCheckInterval() {
                if (this._checkInterval) { clearInterval(this._checkInterval); this._checkInterval = null; }
            },

            _bindStepNavigation() { /* 占位 */ },

            // ====== 任务完成监控 ======
            _startTaskCompletionMonitor() {
                const obs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        if (m.type === 'childList') {
                            for (const n of m.addedNodes) {
                                if (n.nodeType === Node.ELEMENT_NODE && n.querySelectorAll('[aria-label="任务点已完成"]').length > 0) {
                                    this._navigateToNextSection(); return;
                                }
                            }
                        } else if (m.type === 'attributes' && m.attributeName === 'aria-label' && m.target.getAttribute('aria-label') === '任务点已完成') {
                            this._navigateToNextSection(); return;
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
                const btn = document.getElementById('right1');
                if (btn) {
                    this._nextSectionPending = true;
                    btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
                    this._audioEl = null; this._treeContainerEl = null; this._isPlaying = false; this._stepSwitchPending = false;
                    this._clearCheckInterval();
                    this._waitForNextSectionReady();
                }
            },

            _waitForNextSectionReady(attempt = 0) {
                if (attempt > 20) { this._nextSectionPending = false; return; }
                try {
                    this._initCellData();
                    if (this._getAudioEl()) {
                        this._audioEl.playbackRate = this.configs.playbackRate;
                        this._nextSectionPending = false;
                        if (this.configs.autoplay) this.play();
                        return;
                    }
                } catch(e) {}
                setTimeout(() => this._waitForNextSectionReady(attempt + 1), 2000);
            },

            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) return true;
                const pt = document.getElementsByClassName("prev_title")[0];
                const title = pt ? (pt.title || pt.textContent || "").trim() : "";
                if (title === "章节测验" || title === "音频") return false;
                const tab = $(".prev_white:visible").filter((i, el) => ($(el).text()||"").replace(/\s+/g,"") === "2音频"||($(el).text()||"").replace(/\s+/g,"") === "音频").get(0);
                if (tab) { this._stepSwitchPending = true; this._stepSwitchAt = Date.now(); tab.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window})); return true; }
                return false;
            },

            _audioEventHandle() { return this._handleAudioPlay(); },
            _handlePlayError(e) { console.error("播放失败:", e); },

            // ====== 设置播放速度 ======
            setPlaybackRate(rate) {
                rate = Math.max(0.1, Math.min(16, rate));
                this.configs.playbackRate = rate;
                if (this._audioEl) {
                    this._audioEl.playbackRate = rate;
                }
                console.log(`%c⚡ 播放速度已设为: ${rate}x`, "color:#FF9800;font-weight:bold");
            },

            // ====== 悬浮速度控制面板 ======
            _createSpeedControlPanel() {
                if (document.getElementById('fq-speed-panel')) return;
                const style = document.createElement('style');
                style.textContent = `
                    #fq-speed-panel {
                        position: fixed; bottom: 30px; right: 30px; z-index: 999999;
                        background: rgba(30, 30, 40, 0.88); backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.15); border-radius: 16px;
                        padding: 16px 20px; min-width: 200px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
                        cursor: move; user-select: none; font-family: 'Segoe UI', sans-serif;
                        transition: opacity 0.3s;
                    }
                    #fq-speed-panel:hover { opacity: 1 !important; }
                    #fq-speed-panel .fq-header {
                        display: flex; justify-content: space-between; align-items: center;
                        margin-bottom: 12px; color: #e0e0e0; font-size: 13px; font-weight: 600;
                    }
                    #fq-speed-panel .fq-close {
                        cursor: pointer; font-size: 18px; color: #999; line-height: 1;
                    }
                    #fq-speed-panel .fq-close:hover { color: #fff; }
                    #fq-speed-panel .fq-speed-display {
                        text-align: center; font-size: 28px; font-weight: 700;
                        color: #4FC3F7; margin-bottom: 12px;
                    }
                    #fq-speed-panel .fq-speed-buttons {
                        display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 10px;
                    }
                    #fq-speed-panel .fq-speed-buttons button {
                        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
                        color: #ccc; padding: 4px 10px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; transition: all 0.15s;
                    }
                    #fq-speed-panel .fq-speed-buttons button:hover { background: rgba(255,255,255,0.18); color: #fff; }
                    #fq-speed-panel .fq-speed-buttons button.active {
                        background: #4FC3F7; color: #fff; border-color: #4FC3F7;
                    }
                    #fq-speed-panel .fq-custom-row {
                        display: flex; gap: 6px; align-items: center; justify-content: center;
                    }
                    #fq-speed-panel .fq-custom-row input {
                        width: 70px; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);
                        background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; text-align: center;
                    }
                    #fq-speed-panel .fq-custom-row button {
                        background: #4FC3F7; color: #fff; border: none; padding: 4px 12px;
                        border-radius: 6px; cursor: pointer; font-size: 12px;
                    }
                    #fq-speed-panel .fq-custom-row button:hover { background: #29B6F6; }
                `;
                document.head.appendChild(style);

                const panel = document.createElement('div');
                panel.id = 'fq-speed-panel';
                panel.innerHTML = `
                    <div class="fq-header">
                        <span>⏱ 播放速度</span>
                        <span class="fq-close">✕</span>
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

                // 关闭按钮
                panel.querySelector('.fq-close').addEventListener('click', (e) => {
                    e.stopPropagation(); panel.style.opacity = '0.3';
                });
                panel.addEventListener('click', () => { panel.style.opacity = '1'; });

                console.log("%c✓ V4 悬浮速度控制面板已创建", "color:#4CAF50;font-weight:bold");
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

            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
            console.log("%c  ✅ V4 音频独立播放脚本启动完成", "color:#4CAF50;font-size:14px;font-weight:bold");
            console.log("%c═══════════════════════════════════════", "color:#4CAF50;font-size:14px");
        } catch (error) {
            console.error("V4脚本启动失败:", error);
        }
    }
})();
