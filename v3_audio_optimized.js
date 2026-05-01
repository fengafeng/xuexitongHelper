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
                console.log("%c=== 学习通自动刷音频脚本 V3 音频版启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                console.log("%c等待页面完全加载并检测任务状态...", "color:#FF9800");
                
                // 添加DOM变化监听器来实时检测任务完成
                const taskCompletionObserver = new MutationObserver((mutations) => {
                    for (let mutation of mutations) {
                        if (mutation.type === 'childList') {
                            const addedNodes = mutation.addedNodes;
                            for (let node of addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    // 检查新添加的节点及其子节点
                                    const completedElements = node.querySelectorAll('[aria-label="任务点已完成"]');
                                    if (completedElements.length > 0) {
                                        console.log("%c✓ DOM监听器: 检测到任务完成图标被添加", "color:#4CAF50;font-weight:bold");
                                        this._navigateToNextSection();
                                        return;
                                    }
                                }
                            }
                        } else if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
                            // 检查属性变化
                            const target = mutation.target;
                            if (target.getAttribute('aria-label') === '任务点已完成') {
                                console.log("%c✓ 属性监听器: 检测到aria-label变为任务完成", "color:#4CAF50;font-weight:bold");
                                this._navigateToNextSection();
                                return;
                            }
                        }
                    }
                });
                
                // 开始监听整个文档的变化
                taskCompletionObserver.observe(document.body, { 
                    childList: true, 
                    subtree: true, 
                    attributes: true, 
                    attributeFilter: ['aria-label'] 
                });
                
                // 加强的任务完成检测函数
                const checkTaskCompletion = () => {
                    return this._detectTaskCompleted();
                };

                // 页面加载完成后立即检测
                const detectOnLoad = () => {
                    if (checkTaskCompletion()) {
                        this._navigateToNextSection();
                        return true;  // 任务已完成，停止播放初始化
                    }
                    return false;
                };
                
                // 立即检测一次
                if (detectOnLoad()) {
                    return;
                }
                
                // 如果立即检测失败，等待DOM完全加载后再次检测
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(() => {
                            if (detectOnLoad()) {
                                return;
                            }
                            // 继续初始化播放
                            this._startTaskCompletionMonitor();
                            this._startAudioInitialization();
                        }, 1000);
                    });
                } else {
                    // DOM已加载，延迟检测
                    setTimeout(() => {
                        if (detectOnLoad()) {
                            return;
                        }
                        // 继续初始化播放
                        this._startTaskCompletionMonitor();
                        this._startAudioInitialization();
                    }, 1000);
                }
            },
            _startAudioInitialization() {
                // 智能查找音频iframe - 支持多种选择器和嵌套查找
                const findAudioIframe = () => {
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
                        if (found.length > 0) {
                            console.log(`%c✓ 通过选择器 "${selector}" 找到 ${found.length} 个iframe`, "color:#4CAF50");
                            return found.eq(0);
                        }
                    }
                    
                    // 第二阶段：遍历所有iframe
                    console.log("%c尝试遍历所有iframe...", "color:#607D8B");
                    const allIframes = $("iframe");
                    console.log(`%c页面中共有 ${allIframes.length} 个iframe`, "color:#9C27B0");
                    
                    for (let i = 0; i < allIframes.length; i++) {
                        const iframe = allIframes.eq(i);
                        const src = iframe.attr('src') || '';
                        const className = iframe.attr('class') || '';
                        const id = iframe.attr('id') || '';
                        const name = iframe.attr('name') || '';
                        
                        console.log(`%ciframe ${i}: src="${src}", class="${className}", id="${id}", name="${name}"`, "color:#9C27B0");
                        
                        // 排除明显是视频的iframe
                        if (src.includes('video') || className.includes('video') || 
                            id.includes('video') || name.includes('video')) {
                            console.log(`%c  → 跳过，识别为视频iframe`, "color:#FF9800");
                            continue;
                        }
                        
                        // 寻找音频相关的iframe
                        if (src.includes('audio') || className.includes('audio') || 
                            id.includes('audio') || name.includes('audio') ||
                            src.includes('insert') || className.includes('ans')) {
                            console.log(`%c  → 找到可能的音频iframe`, "color:#4CAF50");
                            return iframe;
                        }
                    }
                    
                    // 第三阶段：检查嵌套的iframe内容
                    console.log("%c尝试检查嵌套的iframe内容...", "color:#607D8B");
                    for (let i = 0; i < allIframes.length; i++) {
                        const parentIframe = allIframes.eq(i);
                        try {
                            const iframeDoc = parentIframe.contents();
                            if (!iframeDoc || iframeDoc.length === 0) continue;
                            
                            const nestedIframes = iframeDoc.find("iframe");
                            if (nestedIframes.length > 0) {
                                console.log(`%c  iframe ${i} 内部有 ${nestedIframes.length} 个嵌套iframe`, "color:#607D8B");
                                
                                for (let j = 0; j < nestedIframes.length; j++) {
                                    const nestedIframe = $(nestedIframes[j]);
                                    const nestedSrc = nestedIframe.attr('src') || '';
                                    const nestedClass = nestedIframe.attr('class') || '';
                                    const nestedId = nestedIframe.attr('id') || '';
                                    
                                    console.log(`%c    嵌套iframe ${j}: src="${nestedSrc}", class="${nestedClass}", id="${nestedId}"`, "color:#9C27B0");
                                    
                                    // 检查嵌套iframe是否是音频
                                    if (!nestedSrc.includes('video') && !nestedClass.includes('video')) {
                                        if (nestedSrc.includes('audio') || nestedClass.includes('audio') || 
                                            nestedId.includes('audio') || nestedSrc.includes('insert')) {
                                            console.log(`%c  ✓ 在iframe ${i}内找到音频iframe`, "color:#4CAF50");
                                            return nestedIframe;
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // 跳过无法访问的iframe（跨域）
                            continue;
                        }
                    }
                    
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
                    console.log(`%c✓ 找到音频iframe，src: ${iframe.src}`, "color:#4CAF50");
                    console.log(`%c  class: ${iframe.className}, id: ${iframe.id}, name: ${iframe.name}`, "color:#607D8B");
                    
                    // 如果iframe已经加载完成，直接检查内容
                    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                        console.log("%ciframe已完全加载，直接初始化", "color:#4CAF50");
                        setTimeout((() => {
                            this._getTreeContainer();
                            this._initCellData();
                            this._audioEl = null;
                            this._getAudioEl();
                            this._clearCheckInterval();
                            this._bindStepNavigation();
                            this.play();
                        }).bind(this), 500);
                        return;
                    }
                    
                    // 监听iframe加载事件
                    const onIframeLoad = (() => {
                        console.log("%ciframe加载事件触发", "color:#4CAF50");
                        iframe.removeEventListener('load', onIframeLoad);
                        setTimeout((() => {
                            this._getTreeContainer();
                            this._initCellData();
                            this._audioEl = null;
                            this._getAudioEl();
                            this._clearCheckInterval();
                            this._bindStepNavigation();
                            this.play();
                        }).bind(this), 1000); // 给内容加载一点额外时间
                    }).bind(this);
                    
                    iframe.addEventListener('load', onIframeLoad);
                    
                    // 同时也启动定期检查，以防load事件不触发
                    const checkIframeContent = (() => {
                        try {
                            const iframeDoc = iframe.contentDocument;
                            if (!iframeDoc) {
                                console.log("%c无法访问iframe内容 (可能跨域或未加载)，500ms后重试", "color:#FF9800");
                                setTimeout(checkIframeContent, 500);
                                return;
                            }
                            
                            // 检查文档readyState
                            const docReady = iframeDoc.readyState === 'complete' || 
                                           iframeDoc.readyState === 'interactive';
                            if (!docReady) {
                                console.log(`%ciframe文档状态: ${iframeDoc.readyState}，等待完成`, "color:#FF9800");
                                setTimeout(checkIframeContent, 500);
                                return;
                            }
                            
                            console.log("%c✓ iframe内容已完全加载，开始初始化", "color:#4CAF50");
                            iframe.removeEventListener('load', onIframeLoad); // 移除监听器
                            this._getTreeContainer();
                            this._initCellData();
                            this._audioEl = null;
                            this._getAudioEl();
                            this._clearCheckInterval();
                            this._bindStepNavigation();
                            this.play();
                        } catch (e) {
                            console.log(`%c检查iframe内容时出错: ${e.message}，500ms后重试`, "color:#F44336");
                            setTimeout(checkIframeContent, 500);
                        }
                    }).bind(this);
                    
                    setTimeout(checkIframeContent, 1000);
                };
                
                setTimeout(waitForAudioFrame, 2000);
            },
            nextUnit() {
                console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');

                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    const nextNIndex = this._cellData.currentNCellIndex + 1;
                    console.log(`%c切换到同章节下一个音频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
                    this.playCurrentIndex(nCells.get(nextNIndex));
                } else {
                    const nextIndex = this._cellData.currentCellIndex + 1;
                    if (nextIndex >= cells.length) {
                        console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        console.log("%c当前章节已完成，尝试点击下一节按钮", "color:#FF9800;font-size:14px");
                        console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        
                        // 尝试点击下一节按钮
                        const nextBtn = document.getElementById('right1');
                        if (nextBtn) {
                            console.log("%c找到下一节按钮，模拟点击跳转", "color:#4CAF50");
                            nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                            this._audioEl = null;
                            this._isPlaying = false;
                            setTimeout(() => {
                                try {
                                    this._initCellData();
                                    this.play();
                                } catch (e) {
                                    console.error("切换下一节失败:", e);
                                }
                            }, 3000);
                        } else {
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                            console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        }
                        
                        this._clearCheckInterval();
                        return;
                    }
                    console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
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
                try {
                    const el = this._getAudioEl();
                    if (el == null) {
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

                    console.log(`%c找到音频元素: ${el.tagName} id=${el.id}`, "color:#2196F3");
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
                        console.log(`%c音频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startAudioMonitoring();
                    } catch (playError) {
                        console.error("音频播放失败:", playError);
                        console.log("%c尝试静音播放...", "color:#FF9800");
                        // 尝试静音播放
                        el.muted = true;
                        try {
                            await el.play();
                            console.log("%c静音播放成功", "color:#4CAF50");
                            this._startAudioMonitoring();
                        } catch (mutedError) {
                            console.error("静音播放也失败:", mutedError);
                            this._handlePlayError(playError);
                        }
                    }
                } catch (e) {
                    if (this._tryTimes > this.configs.maxRetries) {
                        console.error("%c音频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
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
                    return true;
                }

                const prevTitle = document.getElementsByClassName("prev_title")[0];
                const currentStepTitle = prevTitle ? (prevTitle.title || prevTitle.textContent || "").trim() : "";

                if (currentStepTitle === "章节测验" || currentStepTitle === "音频") {
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

                const audioTab = $(".prev_white:visible").filter((_, el) => {
                    const text = ($(el).text() || "").replace(/\s+/g, "");
                    return text === "2音频" || text === "音频";
                }).get(0);
                if (clickElement(audioTab, "“音频”页签")) {
                    return true;
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
                    console.log("%c找不到下一节按钮", "color:#F44336");
                    return;
                }

                this._nextSectionPending = true;
                console.log("%c模拟点击下一节按钮", "color:#FF9800");
                nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                this._resetForNavigation();
                this._waitForNextSectionReady();
            },
            _resetForNavigation() {
                this._audioEl = null;
                this._treeContainerEl = null;
                this._isPlaying = false;
                this._stepSwitchPending = false;
                this._clearCheckInterval();
            },
            _waitForNextSectionReady(attempt = 0) {
                if (attempt > 20) {
                    this._nextSectionPending = false;
                    console.log("%c下一节加载超时，停止等待", "color:#F44336");
                    return;
                }

                try {
                    this._initCellData();
                    const audio = this._getAudioEl();
                    if (audio) {
                        console.log("%c下一节已准备，开始播放", "color:#4CAF50");
                        audio.playbackRate = this.configs.playbackRate;
                        this._bindStepNavigation();
                        if (this.configs.autoplay) {
                            this.play();
                        }
                        this._nextSectionPending = false;
                        return;
                    }
                } catch (e) {
                    console.log("%c等待下一节准备中，重试...", "color:#607D8B");
                }

                setTimeout(() => this._waitForNextSectionReady(attempt + 1), 2000);
            },
            _detectTaskCompleted() {
                console.log("%c正在检测任务完成状态...", "color:#FF9800");
                
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

                console.log(`%c方法1: 找到 ${completedLabels.length} 个 [aria-label="任务点已完成"] 元素`, "color:#607D8B");
                if (completedLabels.length > 0) {
                    console.log("%c✓ 方法1: 检测到任务完成图标", "color:#4CAF50;font-weight:bold");
                    return true;
                }

                const completedTextElements = document.querySelectorAll('*');
                for (let el of completedTextElements) {
                    if (el.textContent && el.textContent.includes('任务点已完成')) {
                        console.log("%c✓ 方法2: 检测到任务完成文本", "color:#4CAF50;font-weight:bold");
                        return true;
                    }
                }

                const completedElements = document.querySelectorAll('.ans-job-finished, .task-completed, [data-status="completed"]');
                if (completedElements.length > 0) {
                    console.log("%c✓ 方法3: 检测到任务完成状态类", "color:#4CAF50;font-weight:bold");
                    return true;
                }

                const pageTitle = document.title || '';
                if (pageTitle.includes('已完成') || pageTitle.includes('完成')) {
                    console.log("%c✓ 方法4: 检测到页面标题包含完成状态", "color:#4CAF50;font-weight:bold");
                    return true;
                }

                const currentUrl = window.location.href;
                if (currentUrl.includes('completed') || currentUrl.includes('finish') || currentUrl.includes('done')) {
                    console.log("%c✓ 方法5: 检测到URL包含完成状态", "color:#4CAF50;font-weight:bold");
                    return true;
                }

                const completionPopups = document.querySelectorAll('.completion-popup, .task-finished, .finished-modal, [class*="complete"]');
                if (completionPopups.length > 0) {
                    console.log("%c✓ 方法6: 检测到完成提示元素", "color:#4CAF50;font-weight:bold");
                    return true;
                }

                console.log("%c✗ 未检测到任务完成状态", "color:#F44336");
                return false;
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
                if (!nCell) {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex);
                }

                const $nCell = $(nCell);
                const clickableSpan = $nCell.find(".posCatalog_name")[0];
                if (!clickableSpan) {
                    console.error("%c===========找不到可点击的课程节点，播放下一个音频失败==============", "color:#F44336");
                    setTimeout(() => this.nextUnit(), 2000);
                    return;
                }

                console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
                $(clickableSpan).click();
                this._audioEl = null;
                this._isPlaying = false;

                console.log("%c等待音频加载...", "color:#FF9800");
                setTimeout(() => {
                    this._initCellData();
                    if (this.configs.autoplay) {
                        this.play();
                    }
                }, 3000);
            },
            _initCellData() {
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                this._cellData.cells = cells.length;
                let nCellCounts = 0;
                let foundCurrent = false;

                cells.each((i, v) => {
                    const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                    nCellCounts += nCells.length;
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
                        }
                    });
                });

                this._cellData.nCells = nCellCounts;

                if (!foundCurrent && nCellCounts > 0) {
                    console.warn("%c未找到当前激活的音频节点，可能需要手动选择", "color:#FF9800");
                }

                console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, "color:#607D8B");
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error("找不到音频列表");
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _getAudioEl() {
                if (!this._audioEl) {
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
                            
                            // 第二和三阶段：遍历并检查嵌套
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
                        console.log(`%c在_getAudioEl中查找iframe: ${frameObj ? '找到' : '未找到'}`, frameObj ? "color:#4CAF50" : "color:#FF9800");
                        
                        if (!frameObj || frameObj.length === 0) {
                            console.log("%c未找到音频iframe", "color:#FF9800");
                            return null;
                        }

                        const iframe = frameObj[0] || frameObj;
                        console.log(`%ciframe src: ${iframe.src}`, "color:#9C27B0");

                        // 等待iframe内容加载
                        let iframeDoc;
                        try {
                            iframeDoc = frameObj.contents ? frameObj.contents() : $(iframe).contents();
                        } catch (e) {
                            console.log(`%c无法访问iframe内容 (跨域限制): ${e.message}`, "color:#F44336");
                            return null;
                        }

                        if (!iframeDoc || iframeDoc.length === 0) {
                            console.log("%ciframe内容还未加载", "color:#FF9800");
                            return null;
                        }

                        // 尝试多种方式查找音频元素
                        console.log("%c开始查找音频元素...", "color:#2196F3");

                        // 策略1: 直接查找audio标签
                        let audioEl = iframeDoc.find("audio").get(0);
                        if (audioEl) {
                            console.log("%c策略1成功: 找到audio标签", "color:#4CAF50");
                        }

                        // 策略2: 查找VideoJS播放器容器
                        if (!audioEl) {
                            const videoJsContainer = iframeDoc.find(".video-js, #audio.video-js, .audio-player");
                            console.log(`%c策略2: 找到 ${videoJsContainer.length} 个VideoJS容器`, "color:#607D8B");
                            if (videoJsContainer.length > 0) {
                                audioEl = videoJsContainer.find("audio").get(0);
                                if (audioEl) {
                                    console.log("%c策略2成功: 在VideoJS容器中找到audio元素", "color:#4CAF50");
                                }
                            }
                        }

                        // 策略3: 通过VideoJS API查找
                        if (!audioEl) {
                            try {
                                const iframeWindow = (frameObj[0] || iframe).contentWindow;
                                if (iframeWindow) {
                                    console.log("%c策略3: 尝试通过VideoJS API查找", "color:#607D8B");

                                    const possibleIds = ['audio', 'video', 'player'];
                                    for (const id of possibleIds) {
                                        if (iframeWindow.videojs && iframeWindow.videojs.players[id]) {
                                            const player = iframeWindow.videojs.players[id];
                                            if (player && player.el_) {
                                                audioEl = player.el_.querySelector('audio');
                                                if (audioEl) {
                                                    console.log(`%c策略3成功: 通过VideoJS API找到音频元素 (ID: ${id})`, "color:#4CAF50");
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if (!audioEl && iframeWindow.videojs && iframeWindow.videojs.players) {
                                        const players = Object.values(iframeWindow.videojs.players);
                                        for (const player of players) {
                                            if (player && player.el_) {
                                                audioEl = player.el_.querySelector('audio');
                                                if (audioEl) {
                                                    console.log("%c策略3成功: 通过VideoJS players枚举找到音频元素", "color:#4CAF50");
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log(`%c策略3失败: VideoJS API查找出错: ${e.message}`, "color:#F44336");
                            }
                        }

                        // 策略4: 查找所有媒体元素
                        if (!audioEl) {
                            const allMedia = iframeDoc.find("audio, video");
                            console.log(`%c策略4: 找到 ${allMedia.length} 个媒体元素`, "color:#607D8B");
                            if (allMedia.length > 0) {
                                audioEl = allMedia.get(0);
                                console.log("%c策略4成功: 找到媒体元素", "color:#4CAF50");
                            }
                        }

                        console.log(`%c最终结果: ${audioEl ? '成功找到音频元素' : '未找到音频元素'}`, audioEl ? "color:#4CAF50" : "color:#F44336");
                        if (audioEl) {
                            console.log(`%c音频元素类型: ${audioEl.tagName}, ID: ${audioEl.id}, 类名: ${audioEl.className}`, "color:#9C27B0");
                            this._audioEl = audioEl;
                        }
                    } catch (e) {
                        console.error("获取音频元素失败:", e);
                        return null;
                    }
                }
                if (!this._audioEl) {
                    console.log("%c音频元素未加载完成", "color:#FF9800");
                    return null;
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
            window.app.run();

            // 创建悬浮速度控制面板
            window.app._createSpeedControlPanel();

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
                console.log("%c页面失去焦点，保持播放状态", "color:#607D8B");
                resumePlaybackNow();
            });

            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    console.log("%c页面切到后台，尝试保持播放状态", "color:#607D8B");
                }
                resumePlaybackNow();
            });
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();
