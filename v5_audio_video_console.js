/*
 * 学习通自动学习脚本 - xuexitongScript / V5 控制台版
 * Copyright (c) 2026 suifeng
 * 项目地址: https://github.com/fengafeng/xuexitongScript
 * 
 * 用法：复制整个脚本，在浏览器控制台（F12 → Console）粘贴执行
 * 
 * 功能：自动识别音频/视频页面 → 播放 → 下一节
 *       支持悬浮速度面板 + 整课循环模式
 * 
 * 本脚本仅供学习交流使用，禁止商业用途。
 * 使用请遵守相关平台规定，使用者需自行承担使用风险。
 */
(function(){
    var loadJQ=function(cb){if(typeof jQuery!=='undefined'){cb();return}var s=document.createElement('script');s.src='https://code.jquery.com/jquery-3.6.0.min.js';s.onload=cb;document.head.appendChild(s)};
    loadJQ(function(){
        window.app={
            _logPhase:function(n,d){console.log('%c【'+n+'】'+(d?' '+d:''),'color:#FF9800;font-weight:bold;font-size:13px')},
            configs:{playbackRate:1,autoplay:true,mutePageAudio:true,retryInterval:2000,maxRetries:10,audioCheckInterval:1000,videoCheckInterval:1000,guardNoProgressMs:7000,guardResumeCooldownMs:1500,loopMode:false,mediaType:'unknown'},
            _audioEls:[],_audioIndex:0,_videoEl:null,_treeContainerEl:null,_isPlaying:false,_nextSectionPending:false,_currentRetryCount:0,_checkInterval:null,_stepSwitchPending:false,_stepSwitchAt:0,_tryTimes:0,_skipCount:0,
            _videoIframes:[],_videoIframeIndex:0,_guardLastTime:0,_guardLastWallTs:0,_guardLastResumeTs:0,
            _wakeLock:null,
            _cellData:{cells:0,nCells:0,currentCellIndex:0,currentNCellIndex:0,currentTitle:''},

            run:function(){
                this._logPhase("V5","控制台版 - URL: "+location.href.substring(0,80));
                var inIframe=window.self!==window.top;
                if(inIframe){this._logPhase("V5","⚠️ 当前在 iframe 子页面内")}
                var pt=this._detectPageType();
                this._logPhase("V5诊断","页面类型: "+pt+", 子页面: "+inIframe+", iframes: "+document.querySelectorAll('iframe').length+", #iframe: "+!!document.getElementById('iframe'));
                if(pt==='course_list'||pt==='chapter_list'){this._logPhase("V5","列表页跳过");return}
                this._createControlPanel();
                this._requestWakeLock();
                if(inIframe){this._logPhase("V5","💡 建议在主页(studentstudy)粘贴")}
                var self=this;
                var doDetect=function(attempt){
                    self._detectMediaType();
                    self._logPhase("V5","媒体类型: "+self.configs.mediaType+" (尝试"+(attempt+1)+")");
                    if(self.configs.mediaType==='unknown'&&attempt<10){
                        self._logPhase("V5","媒体未就绪，2秒后重试("+(attempt+1)+"/10)");
                        setTimeout(function(){doDetect(attempt+1)},2000);
                        return;
                    }
                    if(self.configs.mediaType==='video'){self._runContentPageVideo()}
                    else if(self.configs.mediaType==='audio'){self._runContentPageAudio()}
                    else{self._logPhase("V5","重试10次后仍未知，走音频兜底");self._runContentPageAudio()}
                };
                setTimeout(function(){doDetect(0)},500)
            },

            _detectPageType:function(){var u=window.location.pathname;if(u.includes('/mycourse/studentcourse'))return'course_list';if(u.includes('/mycourse/studentstudy'))return'study_page';if(u.includes('/knowledge/cards'))return'content_page';return'unknown'},

            _detectMediaType:function(){
                this._logPhase("媒体检测","检测...");
                if(document.querySelectorAll('iframe.ans-insertaudio').length>0){this.configs.mediaType='audio';this._logPhase("媒体检测","直接音频");return}
                if(document.querySelectorAll('iframe.ans-insertvideo-online').length>0){this.configs.mediaType='video';this._logPhase("媒体检测","直接视频");return}
                try{var mi=document.getElementById('iframe');
                    if(mi){
                        if(!mi.contentDocument){this._logPhase("媒体检测","#iframe存在但contentDocument=null→unknown");this.configs.mediaType='unknown';return}
                        var d=mi.contentDocument;
                        if(d.querySelector('iframe.ans-insertaudio')){this.configs.mediaType='audio';this._logPhase("媒体检测","#iframe内音频");return}
                        if(d.querySelector('iframe.ans-insertvideo-online')){this.configs.mediaType='video';this._logPhase("媒体检测","#iframe内视频");return}
                        this._logPhase("媒体检测","#iframe内无媒体iframe，检查video/audio标签");
                        var ia=d.querySelectorAll('audio');if(ia.length>0){this.configs.mediaType='audio';this._logPhase("媒体检测","#iframe内audio元素");return}
                        var iv=d.querySelectorAll('video');if(iv.length>0){this.configs.mediaType='video';this._logPhase("媒体检测","#iframe内video元素");return}
                    }}catch(e){}
                var as=document.querySelectorAll('audio'),vs=document.querySelectorAll('video');
                if(as.length>0&&vs.length===0){this.configs.mediaType='audio';this._logPhase("媒体检测","audio元素");return}
                if(vs.length>0){this.configs.mediaType='video';this._logPhase("媒体检测","video元素");return}
                try{if(window.parent&&window.parent.document!==window.document){var pd=window.parent.document;if(pd.querySelector('iframe.ans-insertaudio')){this.configs.mediaType='audio';this._logPhase("媒体检测","父页面音频");return}if(pd.querySelector('iframe.ans-insertvideo-online')){this.configs.mediaType='video';this._logPhase("媒体检测","父页面视频");return}}}catch(e){}
                var fs=document.querySelectorAll('iframe');for(var i=0;i<fs.length;i++){var s=(fs[i].src||'').toLowerCase(),c=(fs[i].className||'').toLowerCase();if(s.includes('audio')||c.includes('audio')){this.configs.mediaType='audio';this._logPhase("媒体检测","属性音频");return}if(s.includes('video')||c.includes('video')){this.configs.mediaType='video';this._logPhase("媒体检测","属性视频");return}}
                this.configs.mediaType='unknown';this._logPhase("媒体检测","未找到任何媒体")
            },

            // 音频逻辑
            _runContentPageAudio:function(){
                this._skipCount=0;this._logPhase("音频","启动");
                if(!this.configs.loopMode&&this._detectTaskCompleted()){this._logPhase("音频","已完成");this._navigateToNextSection();return}
                this._logPhase("音频","初始化");
                (document.readyState==='loading'?document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){this._startTaskCompletionMonitor();this._startAudioInitialization()}.bind(this),1000)}.bind(this)):setTimeout(function(){this._startTaskCompletionMonitor();this._startAudioInitialization()}.bind(this),1000))
            },

            _phaseInitSequence:function(src){
                var self=this;self._logPhase("初始化","来源: "+src);
                var steps=[{n:'_getTreeContainer',f:function(){return self._getTreeContainer()}},{n:'_initCellData',f:function(){return self._initCellData()}},{n:'重置_audioEl',f:function(){self._audioEl=null}},{n:'_getAudioEl',f:function(){return self._getAudioEl()}},{n:'_clearCheckInterval',f:function(){return self._clearCheckInterval()}},{n:'_bindStepNavigation',f:function(){return self._bindStepNavigation()}},{n:'play',f:function(){return self.play()}}];
                for(var i=0;i<steps.length;i++){try{steps[i].f()}catch(e){console.log('%c⚠️ '+steps[i].n+': '+e.message,'color:#F44336')}}
                self._logPhase("初始化","完毕")
            },

            _startAudioInitialization:function(){
                var self=this;
                var find=function(){
                    var sel=["iframe.ans-insertaudio","iframe[class*='audio']","iframe[name*='audio']","iframe[title*='audio']","div[id*='ans-insertaudio'] iframe","iframe[src*='audio']",".ans-insertaudio iframe"];
                    for(var i=0;i<sel.length;i++){var f=$(sel[i]);if(f.length>0)return f.eq(0)}
                    var a=$("iframe");for(var i=0;i<a.length;i++){var f=a.eq(i),s=f.attr('src')||'',c=f.attr('class')||'',d=f.attr('id')||'';if(s.includes('video')||c.includes('video')||d.includes('video'))continue;if(s.includes('audio')||c.includes('audio')||d.includes('audio')||s.includes('insert')||c.includes('ans'))return f}
                    for(var i=0;i<a.length;i++){try{var d=a.eq(i).contents();if(!d||!d.length)continue;var n=d.find("iframe");for(var j=0;j<n.length;j++){var f=$(n[j]),ns=f.attr('src')||'',nc=f.attr('class')||'';if(!ns.includes('video')&&!nc.includes('video')&&(ns.includes('audio')||nc.includes('audio')||ns.includes('insert')))return f}}catch(e){}}
                    return null
                };
                var wait=function(){
                    var f=find();if(!f||!f.length){setTimeout(wait,2000);return}
                    var ifr=f[0];self._logPhase("音频初始化-frame","找到");
                    if(ifr.contentDocument&&ifr.contentDocument.readyState==='complete'){setTimeout(function(){self._phaseInitSequence("A")},500);return}
                    var onL=function(){ifr.removeEventListener('load',onL);setTimeout(function(){self._phaseInitSequence("B")},1000)};
                    ifr.addEventListener('load',onL);
                    setTimeout(function(){try{var d=ifr.contentDocument;if(!d||!(d.readyState==='complete'||d.readyState==='interactive'))return;ifr.removeEventListener('load',onL);self._phaseInitSequence("C")}catch(e){}},1000)
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
                    var chs=el.find('.cells');this._cellData.cells=chs.length;var nc=0;
                    chs.each(function(i,ch){var ss=$(ch).find('.ncells');nc+=ss.length;ss.each(function(j,s){if($(s).find('h4.currents,h5.currents').length>0){this._cellData.currentCellIndex=i;this._cellData.currentNCellIndex=j;this._cellData.currentTitle=$(s).find('h4,h5').first().text().trim()}}.bind(this))}.bind(this));
                    this._cellData.nCells=nc
                }else{
                    var cs=el.children("ul").children("li");this._cellData.cells=cs.length;var nc=0;
                    cs.each(function(i,v){var ns=$(v).find('.posCatalog_select:not(.firstLayer)');nc+=ns.length;ns.each(function(j,e){if($(e).hasClass("posCatalog_active")){this._cellData.currentCellIndex=i;this._cellData.currentNCellIndex=j;var ts=$(e).find('.posCatalog_name')[0];if(ts)this._cellData.currentTitle=$(ts).attr('title')}}.bind(this))}.bind(this));
                    this._cellData.nCells=nc
                }
            },

            _getAudioEl:function(){
                if(!this._audioEl){
                    var findFrame=function(){
                        var sel=["iframe.ans-insertaudio","iframe[class*='audio']","iframe[name*='audio']","iframe[title*='audio']","div[id*='ans-insertaudio'] iframe","iframe[src*='audio']",".ans-insertaudio iframe"];
                        for(var i=0;i<sel.length;i++){var f=$(sel[i]);if(f.length>0)return f.eq(0)}
                        var a=$("iframe");for(var i=0;i<a.length;i++){var f=a.eq(i),s=f.attr('src')||'',c=f.attr('class')||'',d=f.attr('id')||'';if(s.includes('video')||c.includes('video')||d.includes('video'))continue;if(s.includes('audio')||c.includes('audio')||d.includes('audio')||s.includes('insert')||c.includes('ans'))return f}
                        for(var i=0;i<a.length;i++){try{var d=a.eq(i).contents();if(!d||!d.length)continue;var n=d.find("iframe");for(var j=0;j<n.length;j++){var f=$(n[j]),ns=f.attr('src')||'',nc=f.attr('class')||'';if(!ns.includes('video')&&!nc.includes('video')&&(ns.includes('audio')||nc.includes('audio')||ns.includes('insert')))return f}}catch(e){}}
                        return null
                    };
                    var frameObj=findFrame();if(!frameObj||frameObj.length===0)return null;
                    var iframeDoc;try{iframeDoc=frameObj.contents?frameObj.contents():$(frameObj[0]).contents()}catch(e){return null}
                    if(!iframeDoc||iframeDoc.length===0)return null;
                    var audio=iframeDoc.find("audio").get(0);
                    if(!audio){var vc=iframeDoc.find(".video-js,#audio.video-js,.audio-player");if(vc.length>0)audio=vc.find("audio").get(0)}
                    if(!audio){var am=iframeDoc.find("audio,video");if(am.length>0)audio=am.get(0)}
                    if(audio)this._audioEl=audio
                }
                return this._audioEl||null
            },

            play:async function(){
                var self=this;
                try{
                    var el=self._getAudioEl();
                    if(el==null){if(self._advanceLearningStep()){setTimeout(function(){self.play()}.bind(self),2000);return}$("#prevNextFocusNext").click();setTimeout(function(){self.play()}.bind(self),2000);return}
                    self._tryTimes=0;self._isPlaying=true;self._audioEventHandle();
                    el.playbackRate=self.configs.playbackRate;if(self.configs.mutePageAudio)el.muted=true;
                    try{await el.play();console.log('%c✅ 音频','color:#4CAF50');self._startAudioMonitoring()}
                    catch(pe){el.muted=true;try{await el.play();self._startAudioMonitoring()}catch(me){self._handlePlayError(pe)}}
                }catch(e){if(self._tryTimes>self.configs.maxRetries){self._clearCheckInterval();return}self._tryTimes++;setTimeout(function(){self.play()}.bind(self),self.configs.retryInterval)}
            },

            _startAudioMonitoring:function(){
                this._clearCheckInterval();
                this._checkInterval=setInterval((function(){if(!this._audioEl){this._clearCheckInterval();return}if(this._audioEl.ended||this._audioEl.paused)this._tryResumePlayback("监控")}).bind(this),this.configs.audioCheckInterval)
            },

            _handleAudioPlay:function(){
                this._audioEl.addEventListener('ended',(function(){this._logPhase("音频","⏹️");this._clearCheckInterval();setTimeout((function(){this.nextUnit()}).bind(this),1000)}).bind(this));
                this._audioEl.addEventListener('error',(function(){}).bind(this))
            },

            // 视频逻辑
            _runContentPageVideo:function(){
                this._skipCount=0;this._logPhase("视频","启动");
                if(!this.configs.loopMode&&this._detectTaskCompleted()){this._logPhase("视频","已完成");this._navigateToNextSection();return}
                this._logPhase("视频","初始化");
                (document.readyState==='loading'?document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){this._startTaskCompletionMonitor();this._startVideoInitialization()}.bind(this),1000)}.bind(this)):setTimeout(function(){this._startTaskCompletionMonitor();this._startVideoInitialization()}.bind(this),1000))
            },

            _startVideoInitialization:function(){
                this._logPhase("视频初始化","查找视频...");
                var self=this;
                var wait=function(){
                    self._findAllVideoIframes();
                    if(self._videoIframes.length===0){setTimeout(wait,2000);return}
                    self._logPhase("视频初始化",self._videoIframes.length+"个视频");
                    self._videoIframeIndex=0;
                    try{self._getTreeContainer()}catch(e){}
                    try{self._initCellData()}catch(e){}
                    self._clearCheckInterval();self._bindStepNavigation();
                    self._playVideoAtIndex(0)
                };
                setTimeout(wait,2000)
            },

            _findAllVideoIframes:function(){
                this._videoIframes=[];var self=this;
                self._logPhase("视频查找","搜索视频iframe...");
                try{
                    var local=document.querySelectorAll('iframe.ans-insertvideo-online');
                    self._logPhase("视频查找","本地 ans-insertvideo-online: "+local.length);
                    for(var i=0;i<local.length;i++)this._videoIframes.push({iframe:local[i],from:'local'});
                    var mi=document.getElementById('iframe');
                    if(mi){
                        self._logPhase("视频查找","#iframe存在, contentDocument: "+(mi.contentDocument?'✅可用':'null'));
                        if(mi.contentDocument){
                            var n=mi.contentDocument.querySelectorAll('iframe.ans-insertvideo-online');
                            self._logPhase("视频查找","#iframe内: "+n.length);
                            for(var i=0;i<n.length;i++)this._videoIframes.push({iframe:n[i],from:'nested'});
                        }
                    }else{self._logPhase("视频查找","#iframe不存在")}
                    try{if(window.parent&&window.parent.document!==window.document){var pn=window.parent.document.querySelectorAll('iframe.ans-insertvideo-online');if(pn.length>0)self._logPhase("视频查找","父页面: "+pn.length);for(var i=0;i<pn.length;i++)this._videoIframes.push({iframe:pn[i],from:'parent'})}}catch(e){}
                    if(this._videoIframes.length===0){var vs=document.querySelectorAll('video');self._logPhase("视频查找","直接video标签: "+vs.length);for(var i=0;i<vs.length;i++)this._videoIframes.push({iframe:null,videoEl:vs[i],from:'direct'})}
                }catch(e){console.error("视频查找失败:",e)}
                var seen={};this._videoIframes=this._videoIframes.filter(function(item){var key=item.iframe?(item.iframe.src||item.iframe.id||''):(item.videoEl?(item.videoEl.id||''):('v_'+Math.random()));if(!key||seen[key])return false;seen[key]=true;return true});
                self._logPhase("视频查找","去重后: "+this._videoIframes.length)
            },

            _getVideoElByIndex:function(idx){
                var item=this._videoIframes[idx];if(!item)return null;
                if(item.videoEl)return item.videoEl;if(!item.iframe)return null;
                try{var doc=item.iframe.contentDocument||item.iframe.contentWindow?.document;if(!doc){this._logPhase("视频元素","iframe["+idx+"].contentDocument不可用");return null}var v=doc.getElementById('video_html5_api')||doc.querySelector('video')||doc.querySelector('.vjs-tech');if(v){this._logPhase("视频元素","iframe["+idx+"] ✅ 找到video");return v}this._logPhase("视频元素","iframe["+idx+"]内无video，检查页面HTML");var htmlSnippet=(doc.body?doc.body.innerHTML.substring(0,200):'无body')+(doc.documentElement?doc.documentElement.outerHTML.substring(0,100):'');this._logPhase("视频元素","iframe["+idx+"] HTML片段: "+htmlSnippet.replace(/\s+/g,' ').substring(0,150));return null}catch(e){this._logPhase("视频元素","iframe["+idx+"]异常: "+e.message);return null}
            },

            _playVideoAtIndex:function(idx){
                var self=this;
                if(idx>=this._videoIframes.length){this._logPhase("视频","全部播完→nextUnit");this._isPlaying=false;setTimeout(function(){self.nextUnit()},1000);return}
                this._videoIframeIndex=idx;this._videoEl=this._getVideoElByIndex(idx);
                if(!this._videoEl){
                    this._logPhase("视频","第"+idx+"个视频不可用，启动重试");
                    var doRetry=function(n){
                        if(n>=3){self._logPhase("视频","第"+idx+"个重试"+n+"次放弃");self._playVideoAtIndex(idx+1);return}
                        setTimeout(function(){
                            self._videoEl=self._getVideoElByIndex(idx);
                            if(self._videoEl){self._logPhase("视频","第"+idx+"个重试成功");self._doPlayVideo(idx)}
                            else{self._logPhase("视频","第"+idx+"个重试"+(n+1)+"/3");doRetry(n+1)}
                        },2000)
                    };
                    doRetry(0);
                    return
                }
                this._doPlayVideo(idx)
            },
            _doPlayVideo:function(idx){
                var self=this;
                this._logPhase("视频","▶️ 第"+(idx+1)+"/"+this._videoIframes.length);
                try{var item=this._videoIframes[idx];if(item.iframe){var id=item.iframe.contentDocument||item.iframe.contentWindow?.document;if(id){var btn=id.querySelector('.vjs-big-play-button');if(btn)btn.click()}}}catch(e){}
                this._tryTimes=0;this._isPlaying=true;var v=this._videoEl;
                v.playbackRate=this.configs.playbackRate;v.muted=true;
                var onEnded=function(){self._logPhase("视频","⏹️ 第"+(idx+1)+"个");v.removeEventListener('ended',onEnded);self._isPlaying=false;self._clearCheckInterval();setTimeout(function(){self._playVideoAtIndex(idx+1)},500)};
                v.addEventListener('ended',onEnded);
                v.play().then(function(){console.log('%c✅ 视频','color:#4CAF50');self._startVideoMonitoring()})["catch"](function(){v.muted=true;v.play().then(function(){console.log('%c✅ 视频静音','color:#4CAF50');self._startVideoMonitoring()})["catch"](function(e){console.error('视频失败:',e);if(self._tryTimes<self.configs.maxRetries){self._tryTimes++;setTimeout(function(){self._playVideoAtIndex(idx)},self.configs.retryInterval)}})})
            },

            _startVideoMonitoring:function(){
                this._clearCheckInterval();this._guardLastTime=0;this._guardLastWallTs=0;this._guardLastResumeTs=0;
                this._checkInterval=setInterval((function(){this._checkVideoStatus()}).bind(this),this.configs.videoCheckInterval)
            },

            _checkVideoStatus:function(){
                try{var v=this._videoEl;if(!v||!this._isPlaying)return
                    if(v.paused&&!v.ended){this._tryResumePlayback("pause")}else if(!v.ended){var n=Date.now(),c=Number(v.currentTime||0);if(this._guardLastWallTs===0){this._guardLastWallTs=n;this._guardLastTime=c}else{var st=Math.abs(c-this._guardLastTime)<0.01,ms=n-this._guardLastWallTs;if(st&&ms>=this.configs.guardNoProgressMs){this._tryResumePlayback("stall");this._guardLastWallTs=n;this._guardLastTime=Number(v.currentTime||0)}else if(!st){this._guardLastWallTs=n;this._guardLastTime=c}}}}catch(e){}
            },

            _tryResumePlayback:function(src){
                if(this.configs.mediaType!=='video'&&this._audioEl){if(this._audioEl.ended){this._clearCheckInterval();setTimeout((function(){this.nextUnit()}).bind(this),500);return true}if(this._audioEl.paused&&!this._audioEl.ended&&this._audioEl.currentTime>0){this._audioEl.play()["catch"](function(){});return true}return false}
                var v=this._videoEl;if(!v||!this._isPlaying)return false;if(v.ended)return false;
                var n=Date.now();if(n-this._guardLastResumeTs<this.configs.guardResumeCooldownMs)return false;this._guardLastResumeTs=n;
                v.play()["catch"](function(){v.muted=true;v.play()["catch"](function(){})});return true
            },

            _clearCheckInterval:function(){if(this._checkInterval){clearInterval(this._checkInterval);this._checkInterval=null}},
            _bindStepNavigation:function(){
                if(this._navBound)return;this._navBound=true;var self=this;
                var onSectionChange=function(){
                    self._logPhase("导航","用户切换章节→重新初始化");
                    self._resetState();self._treeContainerEl=null;
                    clearTimeout(self._navTimer);
                    self._navTimer=setTimeout(function(){
                        try{self._initCellData()}catch(e){}
                        self._detectMediaType();
                        if(self.configs.mediaType==='video'){self._startVideoInitialization()}
                        else if(self.configs.mediaType==='audio'){self._audioEl=null;self.play()}
                    },2500)
                };
                // 监听课程树节点点击（用户手动切换章节）
                var bindTree=function(root){
                    if(!root)return;
                    try{$(root).on('click','.posCatalog_name',onSectionChange)}catch(e){}
                    try{$(root).on('click','.prev_white',onSectionChange)}catch(e){}
                };
                bindTree(document);try{bindTree(window.parent.document)}catch(e){}try{bindTree(window.top.document)}catch(e){}
            },
            _audioEventHandle:function(){return this._handleAudioPlay()},
            _handlePlayError:function(e){console.error("播放失败:",e)},

            // 导航
            _findR1:function(){var b=document.getElementById('right1');try{if(!b&&window.parent&&window.parent.document!==window.document)b=window.parent.document.getElementById('right1')}catch(e){}try{if(!b&&window.top&&window.top.document!==window.document)b=window.top.document.getElementById('right1')}catch(e){}return b},

            nextUnit:function(){
                var el=this._getTreeContainer();
                if(!el){var btn=this._findR1();if(btn){btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));this._resetState();setTimeout(function(){try{this._initCellData();this._playCurrent()}catch(e){}}.bind(this),3000)}this._clearCheckInterval();return}
                var cells=el.children("ul").children("li");
                var nCells=$(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                if(nCells.length>this._cellData.currentNCellIndex+1){this.playCurrentIndex(nCells.get(this._cellData.currentNCellIndex+1))}
                else{var ni=this._cellData.currentCellIndex+1;if(ni>=cells.length){if(this.configs.loopMode){this._logPhase("导航","🔁 整课循环");this._cellData.currentCellIndex=0;this._cellData.currentNCellIndex=0;this._resetState();this.playCurrentIndex()}else{this._logPhase("导航","完成");var btn=this._findR1();if(btn){btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));this._resetState();setTimeout(function(){try{this._initCellData();this._playCurrent()}catch(e){}}.bind(this),3000)}this._clearCheckInterval()}return}this._cellData.currentCellIndex=ni;this._cellData.currentNCellIndex=0;this.playCurrentIndex()}
            },

            playCurrentIndex:function(nc){
                if(!nc){var el=this._getTreeContainer();if(!el){var self=this;setTimeout(function(){self.nextUnit()},500);return}var cells=el.children("ul").children("li");if(!cells||!cells.length){var self=this;setTimeout(function(){self.nextUnit()},500);return}nc=$(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)').get(this._cellData.currentNCellIndex)}
                var sn=$(nc).find(".posCatalog_name")[0];if(!sn){setTimeout(function(){this.nextUnit()}.bind(this),2000);return}
                $(sn).click();this._resetState();
                setTimeout(function(){try{this._initCellData()}catch(e){}if(this.configs.autoplay)this._playCurrent()}.bind(this),3000)
            },

            _playCurrent:function(){if(this.configs.mediaType==='video'){this._videoIframes=[];this._videoIframeIndex=0;this._startVideoInitialization()}else{this._audioEl=null;this.play()}},

            _resetState:function(){this._audioEl=null;this._audioEls=[];this._audioIndex=0;this._videoEl=null;this._videoIframes=[];this._videoIframeIndex=0;this._treeContainerEl=null;this._isPlaying=false;this._nextSectionPending=false;this._stepSwitchPending=false;this._clearCheckInterval()},

            _advanceLearningStep:function(){
                if(this._stepSwitchPending&&Date.now()-this._stepSwitchAt<4000)return true;
                // 从当前页面 + 父页面 + top 查找 prev_title
                var findTitle=function(){
                    var el=document.getElementsByClassName("prev_title")[0];
                    try{if(!el&&window.parent&&window.parent.document!==window.document)el=window.parent.document.getElementsByClassName("prev_title")[0]}catch(e){}
                    try{if(!el&&window.top&&window.top.document!==window.document)el=window.top.document.getElementsByClassName("prev_title")[0]}catch(e){}
                    return el?(el.title||el.textContent||"").trim():"";
                };
                var t=findTitle();
                if(t==="章节测验"){
                    this._logPhase("步骤","章节测验→跳转到下一节");
                    this._navigateToNextSection();
                    return true
                }
                var target=this.configs.mediaType==='video'?"视频":"音频";
                if(t===target)return false;
                var tab=$(".prev_white:visible").filter(function(i,el){var txt=($(el).text()||"").replace(/\s+/g,"");return txt==="2"+target||txt===target}).get(0);
                if(tab){this._stepSwitchPending=true;this._stepSwitchAt=Date.now();tab.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}));return true}
                // 找不到页签时，尝试通过父页面的 #prevNextFocusNext 跳过
                var findNextBtn=function(){
                    var btn=document.getElementById('prevNextFocusNext');
                    try{if(!btn&&window.parent&&window.parent.document!==window.document)btn=window.parent.document.getElementById('prevNextFocusNext')}catch(e){}
                    try{if(!btn&&window.top&&window.top.document!==window.document)btn=window.top.document.getElementById('prevNextFocusNext')}catch(e){}
                    return btn;
                };
                var nextBtn=findNextBtn();
                if(nextBtn){nextBtn.click();this._logPhase("步骤","点击#prevNextFocusNext跳过");return true}
                return false
            },

            // 任务监控
            _startTaskCompletionMonitor:function(){
                var self=this;var obs=new MutationObserver(function(muts){for(var m=0;m<muts.length;m++){if(muts[m].type==='childList'){for(var n=0;n<muts[m].addedNodes.length;n++){var nd=muts[m].addedNodes[n];if(nd.nodeType===Node.ELEMENT_NODE&&nd.querySelectorAll('[aria-label="任务点已完成"]').length>0){self._navigateToNextSection();return}}}else if(muts[m].type==='attributes'&&muts[m].attributeName==='aria-label'&&muts[m].target.getAttribute('aria-label')==='任务点已完成'){self._navigateToNextSection();return}}});
                obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label']})
            },

            _detectTaskCompleted:function(){if(document.querySelectorAll('[aria-label="任务点已完成"]').length>0)return true;var ifs=document.querySelectorAll('iframe');for(var i=0;i<ifs.length;i++){try{var d=ifs[i].contentDocument||ifs[i].contentWindow?.document;if(d&&d.querySelectorAll('[aria-label="任务点已完成"]').length>0)return true}catch(e){}}return false},

            _navigateToNextSection:function(){
                if(this._nextSectionPending)return;var btn=this._findR1();
                if(!btn){this._logPhase("导航","无#right1");if(this.configs.loopMode){this._nextSectionPending=false;this._skipCount=0;this._cellData.currentCellIndex=0;this._cellData.currentNCellIndex=0;this._resetState();setTimeout(function(){this._playCurrent()}.bind(this),2000)}return}
                this._nextSectionPending=true;this._skipCount=(this._skipCount||0)+1;
                if(this._skipCount>50){this._logPhase("导航","超50次");if(this.configs.loopMode){this._skipCount=0;this._nextSectionPending=false;return}alert("⚠️ 跳转超过50次，已停止");this._nextSectionPending=false;return}
                btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));this._resetState();var self=this;setTimeout(function(){self._waitForNextSectionReady(0)},2000)
            },

            _waitForNextSectionReady:function(a){
                var self=this;if(a>40){this._nextSectionPending=false;this._skipCount=0;return}
                try{if(!self.configs.loopMode&&self._detectTaskCompleted()){self._nextSectionPending=false;setTimeout(function(){self._navigateToNextSection()},500);return}self._initCellData();self._detectMediaType();if(self.configs.mediaType==='video'){self._findAllVideoIframes();if(self._videoIframes.length>0){self._nextSectionPending=false;self._skipCount=0;if(self.configs.autoplay)self._playCurrent();return}}else{self._audioEl=null;if(self._getAudioEl()){self._nextSectionPending=false;self._skipCount=0;if(self.configs.autoplay)self._playCurrent();return}}}catch(e){}
                setTimeout(function(){self._waitForNextSectionReady(a+1)}.bind(self),1500)
            },

            // 设置
            setPlaybackRate:function(r){r=Math.max(0.1,Math.min(16,r));this.configs.playbackRate=r;if(this._audioEl)this._audioEl.playbackRate=r;if(this._videoEl)this._videoEl.playbackRate=r;console.log('%c⚡ '+r+'x','color:#FF9800;font-weight:bold')},

            toggleLoopMode:function(){
                this.configs.loopMode=!this.configs.loopMode;this._logPhase("模式",this.configs.loopMode?"🔁 整课循环":"📋 正常");
                var btn=document.getElementById('fq-mode-toggle'),label=document.getElementById('fq-mode-label');
                if(btn&&label){btn.textContent=this.configs.loopMode?'🔁 整课循环':'📋 正常模式';btn.className=this.configs.loopMode?'fq-mode-active':'fq-mode-normal';label.textContent=this.configs.loopMode?'循环中':'顺序播放'}
                // 切换到正常模式时，检测当前任务是否已完成（含父页面/top）
                if(!this.configs.loopMode){
                    var done=this._detectTaskCompleted();
                    try{if(!done&&window.parent&&window.parent.document!==window.document)done=window.parent.document.querySelectorAll('[aria-label="任务点已完成"]').length>0}catch(e){}
                    try{if(!done&&window.top&&window.top.document!==window.document)done=window.top.document.querySelectorAll('[aria-label="任务点已完成"]').length>0}catch(e){}
                    if(done){this._logPhase("模式","当前已完成，跳转下一节");this._navigateToNextSection()}
                }
            },

            // ====== 屏幕防休眠 ======
            _requestWakeLock:function(){
                var self=this;
                if(self._wakeLock)return;
                if(!navigator.wakeLock||!navigator.wakeLock.request){
                    self._logPhase("防休眠","WakeLock API 不支持，使用视频/音频播放保持唤醒");
                    return
                }
                navigator.wakeLock.request('screen').then(function(sentinel){
                    self._wakeLock=sentinel;
                    self._logPhase("防休眠","✅ 屏幕唤醒已锁定");
                    sentinel.addEventListener('release',function(){
                        self._logPhase("防休眠","⚠️ 唤醒被释放（可能被系统收回），10秒后重新申请");
                        self._wakeLock=null;
                        setTimeout(function(){self._requestWakeLock()},10000)
                    })
                })["catch"](function(e){
                    self._logPhase("防休眠","❌ 申请失败: "+e.message+"，10秒后重试");
                    setTimeout(function(){self._requestWakeLock()},10000)
                })
            },

            // 面板
            _createControlPanel:function(){
                if(document.getElementById('fq-control-panel'))return;
                var st=document.createElement('style');
                st.textContent='#fq-control-panel{position:fixed;bottom:30px;right:30px;z-index:999999;background:rgba(30,30,40,0.88);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:16px 20px;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,0.45);cursor:move;user-select:none;font-family:"Segoe UI",sans-serif;transition:opacity 0.3s}'+
                    '#fq-control-panel:hover{opacity:1!important}'+
                    '#fq-control-panel .fq-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#e0e0e0;font-size:13px;font-weight:600}'+
                    '#fq-control-panel .fq-close{cursor:pointer;font-size:18px;color:#999;line-height:1}'+
                    '#fq-control-panel .fq-close:hover{color:#fff}'+
                    '#fq-control-panel .fq-mode-row{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;margin-bottom:10px}'+
                    '#fq-control-panel .fq-mode-label{font-size:12px;color:#b0b0b0}'+
                    '#fq-control-panel .fq-mode-toggle,.fq-mode-normal{font-size:12px;padding:4px 10px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);transition:all 0.15s;background:rgba(255,255,255,0.08);color:#ccc}'+
                    '#fq-control-panel .fq-mode-toggle:hover{background:rgba(255,255,255,0.18);color:#fff}'+
                    '#fq-control-panel .fq-mode-active{background:#FF9800;color:#fff;border-color:#FF9800}'+
                    '#fq-control-panel .fq-speed-display{text-align:center;font-size:28px;font-weight:700;color:#4FC3F7;margin-bottom:10px}'+
                    '#fq-control-panel .fq-speed-buttons{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px}'+
                    '#fq-control-panel .fq-speed-buttons button{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#ccc;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:12px;transition:all 0.15s}'+
                    '#fq-control-panel .fq-speed-buttons button:hover{background:rgba(255,255,255,0.18);color:#fff}'+
                    '#fq-control-panel .fq-speed-buttons button.active{background:#4FC3F7;color:#fff;border-color:#4FC3F7}'+
                    '#fq-control-panel .fq-custom-row{display:flex;gap:6px;align-items:center;justify-content:center}'+
                    '#fq-control-panel .fq-custom-row input{width:70px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:13px;text-align:center}'+
                    '#fq-control-panel .fq-custom-row button{background:#4FC3F7;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px}'+
                    '#fq-control-panel .fq-custom-row button:hover{background:#29B6F6}';
                document.head.appendChild(st);
                var p=document.createElement('div');p.id='fq-control-panel';
                var mt=this.configs.loopMode?'🔁 整课循环':'📋 正常模式',mc=this.configs.loopMode?'fq-mode-active':'fq-mode-normal';
                p.innerHTML='<div class="fq-header"><span>🎮 V5 控制台</span><span class="fq-close">✕</span></div><div class="fq-mode-row"><span class="fq-mode-label" id="fq-mode-label">'+(this.configs.loopMode?'循环中':'顺序播放')+'</span><span class="fq-mode-toggle '+mc+'" id="fq-mode-toggle">'+mt+'</span></div><div class="fq-speed-display" id="fq-speed-value">'+this.configs.playbackRate+'x</div><div class="fq-speed-buttons" id="fq-speed-buttons"><button data-speed="0.5">0.5x</button><button data-speed="0.75">0.75x</button><button data-speed="1.0" class="active">1.0x</button><button data-speed="1.25">1.25x</button><button data-speed="1.5">1.5x</button><button data-speed="2.0">2.0x</button><button data-speed="3.0">3.0x</button></div><div class="fq-custom-row"><input type="number" id="fq-speed-input" step="0.1" min="0.1" max="16" placeholder="自定义"><button id="fq-speed-apply">设置</button></div>';
                document.body.appendChild(p);
                var self=this,btns=p.querySelectorAll('.fq-speed-buttons button');
                btns.forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var r=parseFloat(b.dataset.speed);self.setPlaybackRate(r);btns.forEach(function(x){x.classList.remove('active')});b.classList.add('active');p.querySelector('#fq-speed-value').textContent=r+'x'})});
                p.querySelector('#fq-speed-apply').addEventListener('click',function(e){e.stopPropagation();var v=parseFloat(p.querySelector('#fq-speed-input').value);if(!isNaN(v)&&v>=0.1&&v<=16){self.setPlaybackRate(v);p.querySelector('#fq-speed-value').textContent=v+'x';btns.forEach(function(b){b.classList.remove('active')})}});
                p.querySelector('#fq-mode-toggle').addEventListener('click',function(e){e.stopPropagation();self.toggleLoopMode()});
                var isD=false,sX,sY,oX,oY;
                p.querySelector('.fq-header').addEventListener('mousedown',function(e){isD=true;sX=e.clientX;sY=e.clientY;oX=p.offsetLeft;oY=p.offsetTop;p.style.transition='none';e.preventDefault()});
                document.addEventListener('mousemove',function(e){if(!isD)return;p.style.left=(oX+e.clientX-sX)+'px';p.style.top=(oY+e.clientY-sY)+'px';p.style.bottom='auto';p.style.right='auto'});
                document.addEventListener('mouseup',function(){if(!isD)return;isD=false;p.style.transition=''});
                p.querySelector('.fq-close').addEventListener('click',function(e){e.stopPropagation();p.style.opacity='0.3'});
                p.addEventListener('click',function(){p.style.opacity='1'});
                console.log("%c✓ V5 控制台版 - 面板已创建","color:#4CAF50;font-weight:bold");
            }
        };

        try{
            window.app.run();
            var pp=function(e){e.stopPropagation();e.preventDefault()};
            var rp=function(){if(window.app&&typeof window.app._tryResumePlayback==="function")window.app._tryResumePlayback("page-event")};
            document.addEventListener("mouseleave",pp);window.addEventListener("mouseleave",pp);
            document.addEventListener("mouseout",pp);window.addEventListener("mouseout",pp);
            window.addEventListener("blur",function(){rp()});
            document.addEventListener("visibilitychange",function(){rp()});
            // 每30秒保活：重新申请屏幕唤醒锁 + 尝试恢复播放
            setInterval(function(){
                if(window.app&&window.app._wakeLock===null&&typeof window.app._requestWakeLock==="function")window.app._requestWakeLock();
                if(window.app&&typeof window.app._tryResumePlayback==="function")window.app._tryResumePlayback("keep-alive")
            },30000);
            console.log("%c═══════════════════════════════════════","color:#4CAF50;font-size:14px");
            console.log("%c  ✅ V5 控制台版启动完成","color:#4CAF50;font-size:14px;font-weight:bold");
            console.log("%c═══════════════════════════════════════","color:#4CAF50;font-size:14px");
        }catch(e){console.error("V5启动失败:",e)}
    });
})();
