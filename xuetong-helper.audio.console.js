/*
 * 学习通自动学习脚本 - xuexitongScript / V4 控制台版
 * Copyright (c) 2026 suifeng
 * 
 * 作者: suifeng
 * 项目地址: https://github.com/fengafeng/xuexitongScript
 * 
 * 用法：复制整个脚本，在浏览器控制台（F12 → Console）粘贴执行
 * 
 * 本脚本仅供学习交流使用，禁止商业用途。
 * 使用请遵守相关平台规定，使用者需自行承担使用风险。
 */
(function(){
    const loadJQ = function(cb) {
        if (typeof jQuery !== 'undefined') { cb(); return; }
        var s = document.createElement('script');
        s.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        s.onload = cb;
        document.head.appendChild(s);
    };
    loadJQ(function(){
        window.app = {
            _logPhase: function(n,d){console.log('%c【'+n+'】'+(d?' '+d:''),'color:#FF9800;font-weight:bold;font-size:13px')},
            configs:{playbackRate:1,autoplay:true,mutePageAudio:true,retryInterval:2000,maxRetries:10,audioCheckInterval:1000,guardNoProgressMs:7000,guardResumeCooldownMs:1500},
            _audioEls:[],_audioIndex:0,_treeContainerEl:null,_isPlaying:false,_nextSectionPending:false,_currentRetryCount:0,_checkInterval:null,
            _cellData:{cells:0,nCells:0,currentCellIndex:0,currentNCellIndex:0,currentAudioTitle:''},
            _tryTimes:0,_stepSwitchPending:false,_stepSwitchAt:0,_skipCount:0,

            run:function(){this._runContentPageAudio();this._createSpeedControlPanel();},

            _runContentPageAudio:function(){
                this._skipCount=0;
                this._logPhase("控制台版","启动音频播放");
                // 预检：如果任务已完成，直接跳转下节
                if(this._detectTaskCompleted()){
                    this._logPhase("控制台版","✅ 任务已完成，跳转下一节");
                    this._navigateToNextSection();
                    return;
                }
                this._logPhase("控制台版","⏳ 任务未完成，开始初始化");
                (document.readyState==='loading'
                    ?document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{this._startTaskCompletionMonitor();this._startAudioInitialization()},1000)})
                    :setTimeout(()=>{this._startTaskCompletionMonitor();this._startAudioInitialization()},1000));
            },

            _phaseInitSequence:function(src){
                var self=this;
                self._logPhase("初始化序列","来源: "+src);
                var steps=[{n:'_findAllAudioEls',f:function(){return self._findAllAudioEls()}},
                    {n:'_initCellData',f:function(){return self._initCellData()}},
                    {n:'_clearCheckInterval',f:function(){return self._clearCheckInterval()}},
                    {n:'_bindStepNavigation',f:function(){return self._bindStepNavigation()}},
                    {n:'play',f:function(){return self.play()}}];
                for(var i=0;i<steps.length;i++){
                    try{steps[i].f()}catch(e){console.log('%c⚠️ '+steps[i].n+': '+e.message,'color:#F44336')}
                }
            },

            _startAudioInitialization:function(){
                var self=this;
                var find=function(){
                    var sel=["iframe.ans-insertaudio","iframe[class*='audio']","iframe[name*='audio']","iframe[title*='audio']","div[id*='ans-insertaudio'] iframe","iframe[src*='audio']",".ans-insertaudio iframe"];
                    for(var i=0;i<sel.length;i++){var f=$(sel[i]);if(f.length>0)return f.eq(0)}
                    var a=$("iframe");
                    for(var i=0;i<a.length;i++){var f=a.eq(i),s=f.attr('src')||'',c=f.attr('class')||'',d=f.attr('id')||'';if(!s.includes('video')&&!c.includes('video')&&!d.includes('video')&&(s.includes('audio')||c.includes('audio')||d.includes('audio')||s.includes('insert')||c.includes('ans')))return f}
                    for(var i=0;i<a.length;i++){try{var d=a.eq(i).contents();if(!d||!d.length)continue;var n=d.find("iframe");for(var j=0;j<n.length;j++){var f=$(n[j]),s=f.attr('src')||'',c=f.attr('class')||'';if(!s.includes('video')&&!c.includes('video')&&(s.includes('audio')||c.includes('audio')||s.includes('insert')))return f}}catch(e){}}
                    return null
                };
                var wait=function(){
                    var f=find();
                    if(!f||!f.length){setTimeout(wait,2000);return}
                    var ifr=f[0];
                    if(ifr.contentDocument&&ifr.contentDocument.readyState==='complete'){setTimeout(function(){self._phaseInitSequence("分支A")},500);return}
                    var onL=function(){ifr.removeEventListener('load',onL);setTimeout(function(){self._phaseInitSequence("分支B")},1000)};
                    ifr.addEventListener('load',onL);
                    setTimeout(function(){
                        try{var d=ifr.contentDocument;if(!d||!(d.readyState==='complete'||d.readyState==='interactive')){setTimeout(onL,500);return}ifr.removeEventListener('load',onL);self._phaseInitSequence("分支C")}catch(e){setTimeout(onL,500)}
                    },1000)
                };
                setTimeout(wait,2000)
            },

            _getTreeContainer:function(){
                if(this._treeContainerEl)return this._treeContainerEl;
                var el=$('#coursetree');if(el.length>0){this._treeContainerEl=el;return el}
                try{if(window.parent&&window.parent.document!==window.document){var p=window.parent.document.getElementById('coursetree');if(p){this._treeContainerEl=$(p);return this._treeContainerEl}}}catch(e){}
                try{if(window.top&&window.top.document!==window.document){var t=window.top.document.getElementById('coursetree');if(t){this._treeContainerEl=$(t);return this._treeContainerEl}}}catch(e){}
                return null
            },

            _initCellData:function(){
                var el=this._getTreeContainer();if(!el)return;
                var ns=el.find('.cells>.ncells'),os=el.find('.posCatalog_select:not(.firstLayer)'),useN=ns.length>os.length;
                if(useN){
                    var chs=el.find('.cells');this._cellData.cells=chs.length;var nc=0,fd=false;
                    chs.each(function(i,ch){var ss=$(ch).find('.ncells');nc+=ss.length;ss.each(function(j,s){if($(s).find('h4.currents,h5.currents').length>0){this._cellData.currentCellIndex=i;this._cellData.currentNCellIndex=j;fd=true;this._cellData.currentAudioTitle=$(s).find('h4,h5').first().text().trim()}}.bind(this))}.bind(this));
                    this._cellData.nCells=nc
                }else{
                    var cs=el.children("ul").children("li");this._cellData.cells=cs.length;var nc=0,fd=false;
                    cs.each(function(i,v){var ns=$(v).find('.posCatalog_select:not(.firstLayer)');nc+=ns.length;ns.each(function(j,e){if($(e).hasClass("posCatalog_active")){this._cellData.currentCellIndex=i;this._cellData.currentNCellIndex=j;fd=true;var ts=$(e).find('.posCatalog_name')[0];if(ts)this._cellData.currentAudioTitle=$(ts).attr('title')}}.bind(this))}.bind(this));
                    this._cellData.nCells=nc
                }
            },

            _findAllAudioEls:function(){
                this._logPhase("多音频","查找页面中所有音频...");
                this._audioEls=[];this._audioIndex=0;
                var self=this;
                // 从iframe中提取audio元素的辅助函数
                var extractAudio=function(iframeEl,label){
                    try{
                        var doc=$(iframeEl).contents();
                        if(!doc||doc.length===0)return null;
                        var a=doc.find("audio").get(0);
                        if(!a){var vc=doc.find(".video-js,#audio.video-js,.audio-player");if(vc.length>0)a=vc.find("audio").get(0)}
                        if(!a){var al=doc.find("audio,video");if(al.length>0)a=al.get(0)}
                        if(a){
                            var nm=iframeEl.getAttribute('name')||iframeEl.getAttribute('title')||label;
                            console.log('%c  ├─ '+nm+' <'+a.tagName+'> id="'+a.id+'"','color:#4CAF50');
                            self._audioEls.push(a);
                            return a;
                        }
                    }catch(e){console.log('%c  ├─ '+label+' ❌ 无法访问: '+e.message,'color:#FF9800')}
                    return null;
                };
                // 第1层：CSS选择器
                var found=$("iframe.ans-insertaudio, iframe[class*='audio'], iframe[name*='audio'], iframe[title*='audio'], iframe[src*='audio']");
                if(found&&found.length>0){
                    this._logPhase("多音频","第1层: CSS选择器找到 "+found.length+" 个");
                    for(var i=0;i<found.length;i++){extractAudio(found[i],'选择器['+i+']')}
                    if(this._audioEls.length>0)return this._audioEls;
                }
                // 第2层：遍历所有iframe，检查属性
                var all=$("iframe");
                this._logPhase("多音频","第2层: 遍历 "+all.length+" 个iframe");
                for(var i=0;i<all.length;i++){
                    var f=all[i],s=f.getAttribute('src')||'',c=f.getAttribute('class')||'',d=f.getAttribute('id')||'',nm=f.getAttribute('name')||'';
                    if(!s.includes('video')&&!c.includes('video')&&!d.includes('video')&&!nm.includes('video')&&(s.includes('audio')||c.includes('audio')||d.includes('audio')||nm.includes('audio')||s.includes('insert')||c.includes('ans'))){
                        extractAudio(f,'iframe['+i+']');
                    }
                }
                if(this._audioEls.length>0)return this._audioEls;
                // 第3层：检查嵌套iframe（父iframe内的子iframe）
                this._logPhase("多音频","第3层: 检查嵌套iframe...");
                for(var i=0;i<all.length;i++){
                    try{
                        var doc=$(all[i]).contents();
                        if(!doc||doc.length===0)continue;
                        var nested=doc.find("iframe");
                        for(var j=0;j<nested.length;j++){
                            var nf=nested[j],ns=nf.getAttribute('src')||'',nc=nf.getAttribute('class')||'';
                            if(!ns.includes('video')&&!nc.includes('video')&&(ns.includes('audio')||nc.includes('audio')||ns.includes('insert')||nc.includes('ans'))){
                                this._logPhase("多音频",`在父iframe[${i}]内找到嵌套音频iframe[${j}]`);
                                extractAudio(nf,'嵌套['+i+']['+j+']');
                            }
                        }
                    }catch(e){}
                }
                if(this._audioEls.length>0){
                    this._logPhase("多音频","✅ 共提取到 "+this._audioEls.length+" 个音频元素");
                }else{
                    this._logPhase("多音频","❌ 所有策略均未找到音频元素");
                }
                return this._audioEls;
            },
            _getAudioEl:function(){
                return this._audioEls[this._audioIndex]||null;
            },

            play:async function(){
                var self=this;
                try{
                    var el=self._getAudioEl();
                    if(el==null){
                        if(self._advanceLearningStep()){setTimeout(function(){self.play()}.bind(self),2000);return}
                        $("#prevNextFocusNext").click();setTimeout(function(){self.play()}.bind(self),2000);return
                    }
                    self._tryTimes=0;self._isPlaying=true;
                    el.playbackRate=self.configs.playbackRate;if(self.configs.mutePageAudio)el.muted=true;
                    // 移除旧监听器
                    el.removeEventListener('ended',self._onAudioEnded);
                    el.removeEventListener('error',self._onAudioError);
                    self._onAudioEnded=function(){self._onSingleAudioEnd()};
                    self._onAudioError=function(){console.log('%c❌ 音频['+self._audioIndex+']错误','color:#F44336')};
                    el.addEventListener('ended',self._onAudioEnded);
                    el.addEventListener('error',self._onAudioError);
                    // 启动监控
                    self._clearCheckInterval();
                    self._checkInterval=setInterval(function(){
                        if(!el||el.paused){if(self._tryResumePlayback("监控"))return}
                    },self.configs.audioCheckInterval);
                    try{
                        await el.play();
                        console.log('%c✅ 音频['+(self._audioIndex+1)+'/'+self._audioEls.length+'] 播放中，倍速: '+el.playbackRate+'x','color:#4CAF50')
                    }catch(pe){
                        el.muted=true;
                        try{await el.play();console.log('%c✅ 音频['+(self._audioIndex+1)+'/'+self._audioEls.length+'] 静音播放','color:#4CAF50')}
                        catch(me){self._handlePlayError(pe)}
                    }
                }catch(e){if(self._tryTimes>self.configs.maxRetries){self._clearCheckInterval();return}self._tryTimes++;setTimeout(function(){self.play()}.bind(self),self.configs.retryInterval)}
            },
            _onSingleAudioEnd:function(){
                this._clearCheckInterval();
                this._audioIndex++;
                if(this._audioIndex<this._audioEls.length){
                    this._logPhase("多音频","▶️ 播放下一个音频 ["+(this._audioIndex+1)+'/'+this._audioEls.length+']');
                    setTimeout(function(){this.play()}.bind(this),500)
                }else{
                    this._logPhase("多音频","✅ 所有音频播放完毕，跳转下一节");
                    this._nextSectionPending=false;
                    setTimeout(function(){this._navigateToNextSection()}.bind(this),1000)
                }
            },

            nextUnit:function(){
                var el=this._getTreeContainer();
                if(!el){var btn=document.getElementById('right1');if(btn){btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));this._audioEls=[];this._audioIndex=0;this._isPlaying=false;this._nextSectionPending=false;setTimeout(function(){try{this._initCellData();this.play()}catch(e){}}.bind(this),3000)}this._clearCheckInterval();return}
                var cells=el.children("ul").children("li");
                var nCells=$(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                if(nCells.length>this._cellData.currentNCellIndex+1){this.playCurrentIndex(nCells.get(this._cellData.currentNCellIndex+1))}
                else{var ni=this._cellData.currentCellIndex+1;if(ni>=cells.length){var btn=document.getElementById('right1');if(btn){btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));this._audioEls=[];this._audioIndex=0;this._isPlaying=false;setTimeout(function(){try{this._initCellData();this.play()}catch(e){}}.bind(this),3000)}this._clearCheckInterval();return}this._cellData.currentCellIndex=ni;this._cellData.currentNCellIndex=0;this.playCurrentIndex()}
            },

            playCurrentIndex:function(nc){
                if(!nc){var el=this._getTreeContainer();if(!el){this.nextUnit();return}var cells=el.children("ul").children("li");if(!cells||!cells.length){this.nextUnit();return}nc=$(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)').get(this._cellData.currentNCellIndex)}
                var sn=$(nc).find(".posCatalog_name")[0];if(!sn){setTimeout(function(){this.nextUnit()}.bind(this),2000);return}
                $(sn).click();this._audioEls=[];this._audioIndex=0;this._isPlaying=false;
                setTimeout(function(){try{this._initCellData()}catch(e){}if(this.configs.autoplay)this.play()}.bind(this),3000)
            },

            _startAudioMonitoring:function(){},
            _handleAudioPlay:function(){},
            _tryResumePlayback:function(src){
                var el=this._getAudioEl();
                if(!el||!this._isPlaying)return false;
                if(el.ended){this._clearCheckInterval();setTimeout(function(){this._onSingleAudioEnd()}.bind(this),500);return true}
                if(el.paused&&!el.ended&&el.currentTime>0){el.play()["catch"](function(){});return true}
                return false
            },
            _clearCheckInterval:function(){if(this._checkInterval){clearInterval(this._checkInterval);this._checkInterval=null}},
            _bindStepNavigation:function(){},

            _startTaskCompletionMonitor:function(){
                var self=this;var obs=new MutationObserver(function(muts){for(var m=0;m<muts.length;m++){if(muts[m].type==='childList'){for(var n=0;n<muts[m].addedNodes.length;n++){var nd=muts[m].addedNodes[n];if(nd.nodeType===Node.ELEMENT_NODE&&nd.querySelectorAll('[aria-label="任务点已完成"]').length>0){self._navigateToNextSection();return}}}else if(muts[m].type==='attributes'&&muts[m].attributeName==='aria-label'&&muts[m].target.getAttribute('aria-label')==='任务点已完成'){self._navigateToNextSection();return}}});
                obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label']})
            },

            _detectTaskCompleted:function(){if(document.querySelectorAll('[aria-label="任务点已完成"]').length>0)return true;var ifs=document.querySelectorAll('iframe');for(var i=0;i<ifs.length;i++){try{var d=ifs[i].contentDocument||ifs[i].contentWindow?.document;if(d&&d.querySelectorAll('[aria-label="任务点已完成"]').length>0)return true}catch(e){}}return false},
            _navigateToNextSection:function(){
                if(this._nextSectionPending)return;
                var btn=document.getElementById('right1');
                if(!btn){this._logPhase("导航","❌ 没有 #right1，可能所有小节已完成");alert("🎉 所有小节学习已完成！");return}
                this._nextSectionPending=true;
                this._skipCount=(this._skipCount||0)+1;
                if(this._skipCount>50){this._logPhase("导航","❌ 超过50次连续跳转，终止");alert("⚠️ 检测到循环跳转超过50次，已自动停止\n请检查是否所有任务点都已标记完成。");this._nextSectionPending=false;return}
                btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
                this._audioEls=[];this._audioIndex=0;this._treeContainerEl=null;this._isPlaying=false;this._stepSwitchPending=false;this._clearCheckInterval();
                var self=this;
                setTimeout(function(){self._waitForNextSectionReady(0)},2000)
            },
            _waitForNextSectionReady:function(a){
                var self=this;
                if(a>40){this._nextSectionPending=false;this._skipCount=0;return}
                try{
                    // 先检测新小节是否已完成
                    if(self._detectTaskCompleted()){
                        self._logPhase("导航","✅ 下一节已完成，继续跳过");
                        self._nextSectionPending=false;
                        setTimeout(function(){self._navigateToNextSection()},500);
                        return;
                    }
                    self._initCellData();
                    self._findAllAudioEls();
                    if(self._getAudioEl()){
                        self._nextSectionPending=false;
                        self._skipCount=0;
                        if(self.configs.autoplay)self.play();
                        return;
                    }
                }catch(e){}
                setTimeout(function(){self._waitForNextSectionReady(a+1)}.bind(self),1500)
            },
            _advanceLearningStep:function(){if(this._stepSwitchPending&&Date.now()-this._stepSwitchAt<4000)return true;var pt=document.getElementsByClassName("prev_title")[0];var t=pt?(pt.title||pt.textContent||"").trim():"";if(t==="章节测验"||t==="音频")return false;var tab=$(".prev_white:visible").filter(function(i,el){var txt=($(el).text()||"").replace(/\s+/g,"");return txt==="2音频"||txt==="音频"}).get(0);if(tab){this._stepSwitchPending=true;this._stepSwitchAt=Date.now();tab.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}));return true}return false},
            _audioEventHandle:function(){return this._handleAudioPlay()},
            _handlePlayError:function(e){console.error("播放失败:",e)},
            setPlaybackRate:function(r){r=Math.max(0.1,Math.min(16,r));this.configs.playbackRate=r;for(var i=0;i<this._audioEls.length;i++){if(this._audioEls[i])this._audioEls[i].playbackRate=r}console.log('%c⚡ 播放速度已设为: '+r+'x','color:#FF9800;font-weight:bold')},

            _createSpeedControlPanel:function(){
                if(document.getElementById('fq-speed-panel'))return;
                var st=document.createElement('style');
                st.textContent='#fq-speed-panel{position:fixed;bottom:30px;right:30px;z-index:999999;background:rgba(30,30,40,0.88);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:16px 20px;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,0.45);cursor:move;user-select:none;font-family:"Segoe UI",sans-serif;transition:opacity 0.3s}'+
                    '#fq-speed-panel:hover{opacity:1!important}'+
                    '#fq-speed-panel .fq-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:#e0e0e0;font-size:13px;font-weight:600}'+
                    '#fq-speed-panel .fq-close{cursor:pointer;font-size:18px;color:#999;line-height:1}'+
                    '#fq-speed-panel .fq-close:hover{color:#fff}'+
                    '#fq-speed-panel .fq-speed-display{text-align:center;font-size:28px;font-weight:700;color:#4FC3F7;margin-bottom:12px}'+
                    '#fq-speed-panel .fq-speed-buttons{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px}'+
                    '#fq-speed-panel .fq-speed-buttons button{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#ccc;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:12px;transition:all 0.15s}'+
                    '#fq-speed-panel .fq-speed-buttons button:hover{background:rgba(255,255,255,0.18);color:#fff}'+
                    '#fq-speed-panel .fq-speed-buttons button.active{background:#4FC3F7;color:#fff;border-color:#4FC3F7}'+
                    '#fq-speed-panel .fq-custom-row{display:flex;gap:6px;align-items:center;justify-content:center}'+
                    '#fq-speed-panel .fq-custom-row input{width:70px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:13px;text-align:center}'+
                    '#fq-speed-panel .fq-custom-row button{background:#4FC3F7;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px}'+
                    '#fq-speed-panel .fq-custom-row button:hover{background:#29B6F6}';
                document.head.appendChild(st);
                var p=document.createElement('div');p.id='fq-speed-panel';
                p.innerHTML='<div class="fq-header"><span>⏱ 播放速度</span><span class="fq-close">✕</span></div><div class="fq-speed-display" id="fq-speed-value">'+this.configs.playbackRate+'x</div><div class="fq-speed-buttons" id="fq-speed-buttons"><button data-speed="0.5">0.5x</button><button data-speed="0.75">0.75x</button><button data-speed="1.0" class="active">1.0x</button><button data-speed="1.25">1.25x</button><button data-speed="1.5">1.5x</button><button data-speed="2.0">2.0x</button><button data-speed="3.0">3.0x</button></div><div class="fq-custom-row"><input type="number" id="fq-speed-input" step="0.1" min="0.1" max="16" placeholder="自定义"><button id="fq-speed-apply">设置</button></div>';
                document.body.appendChild(p);
                var self=this,btns=p.querySelectorAll('.fq-speed-buttons button');
                btns.forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var r=parseFloat(b.dataset.speed);self.setPlaybackRate(r);btns.forEach(function(x){x.classList.remove('active')});b.classList.add('active');p.querySelector('#fq-speed-value').textContent=r+'x'})});
                p.querySelector('#fq-speed-apply').addEventListener('click',function(e){e.stopPropagation();var v=parseFloat(p.querySelector('#fq-speed-input').value);if(!isNaN(v)&&v>=0.1&&v<=16){self.setPlaybackRate(v);p.querySelector('#fq-speed-value').textContent=v+'x';btns.forEach(function(b){b.classList.remove('active')})}});
                var isD=false,sX,sY,oX,oY;
                p.querySelector('.fq-header').addEventListener('mousedown',function(e){isD=true;sX=e.clientX;sY=e.clientY;oX=p.offsetLeft;oY=p.offsetTop;p.style.transition='none';e.preventDefault()});
                document.addEventListener('mousemove',function(e){if(!isD)return;p.style.left=(oX+e.clientX-sX)+'px';p.style.top=(oY+e.clientY-sY)+'px';p.style.bottom='auto';p.style.right='auto'});
                document.addEventListener('mouseup',function(){if(!isD)return;isD=false;p.style.transition=''});
                p.querySelector('.fq-close').addEventListener('click',function(e){e.stopPropagation();p.style.opacity='0.3'});
                p.addEventListener('click',function(){p.style.opacity='1'});
                console.log("%c✓ V4 控制台版 - 悬浮速度控制面板已创建","color:#4CAF50;font-weight:bold");
            }
        };

        // 启动
        try{
            window.app.run();
            var pp=function(e){e.stopPropagation();e.preventDefault()};
            var rp=function(){if(window.app&&typeof window.app._tryResumePlayback==="function")window.app._tryResumePlayback("page-event")};
            document.addEventListener("mouseleave",pp);window.addEventListener("mouseleave",pp);
            document.addEventListener("mouseout",pp);window.addEventListener("mouseout",pp);
            window.addEventListener("blur",function(){rp()});
            document.addEventListener("visibilitychange",function(){rp()});
            console.log("%c═══════════════════════════════════════","color:#4CAF50;font-size:14px");
            console.log("%c  ✅ V4 控制台版启动完成","color:#4CAF50;font-size:14px;font-weight:bold");
            console.log("%c═══════════════════════════════════════","color:#4CAF50;font-size:14px");
        }catch(e){console.error("启动失败:",e)}
    });
})();
