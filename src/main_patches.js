function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanJsContent(content, signatureStart, signatureEnd) {
    const regex = new RegExp("(?:\\r?\\n;)?\\r?\\n?" + escapeRegExp(signatureStart) + "[\\s\\S]*?" + escapeRegExp(signatureEnd), "g");
    return content.replace(regex, "");
}

function cleanMenuJsContent(content) {
    content = content.replace(/\n?\s*\/\* --- MENU TRANSLATION START --- \*\/[\s\S]*?\/\* --- MENU TRANSLATION END --- \*\//g, '');
    const startMark = "// ==========================================\n    // Antigravity Native Menu Chinese Translation";
    const endMark = "translateMenu(menu.items);";
    const startIdx = content.indexOf(startMark);
    const endIdx = content.indexOf(endMark);
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        return content.substring(0, startIdx) + content.substring(endIdx + endMark.length);
    }
    return content;
}

function cleanTrayJsContent(content) {
    content = content.replace(/\n\s*\/\* --- TRAY TRANSLATION START --- \*\/[\s\S]*?\/\* --- TRAY TRANSLATION END --- \*\//g, '');
    content = content.replace(/\n\s*\/\* --- TRAY DOUBLE CLICK START --- \*\/[\s\S]*?\/\* --- TRAY DOUBLE CLICK END --- \*\//g, '');
    content = content.replace(/\n\s*\/\* --- TRAY INSERT TRANSLATION START --- \*\/[\s\S]*?\/\* --- TRAY INSERT TRANSLATION END --- \*\//g, '');
    content = content.replace(/\/\* --- TRAY COUNT START:([A-Za-z0-9+/=]+) --- \*\/[\s\S]*?\/\* --- TRAY COUNT END --- \*\//g, (_m, b64) => Buffer.from(b64, 'base64').toString('utf8'));
    return content;
}

function cleanUtilsJsContent(content) {
    return content.replace(/\n?\s*\/\* --- SIDECAR TRANSLATION START --- \*\/[\s\S]*?\/\* --- SIDECAR TRANSLATION END --- \*\//g, '');
}

function patchUtilsJs(utilsContent, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 汉化钩子...`);
    const cleaned = cleanUtilsJsContent(utilsContent);
    const targetStr = "hubContents.on('will-navigate', guardExternalNavigation);";
    const idx = cleaned.indexOf(targetStr);
    if (idx === -1) {
        console.warn(`[警告] 未能在 utils.js 中找到 Sidecar 钩子插入点。`);
        return cleaned;
    }

    const sidecarHookJs = `/* --- SIDECAR TRANSLATION START --- */
    const getSidecarLocalizationScript = () => {
        const preloadFile = typeof path_1 !== 'undefined' && path_1 && path_1.default
            ? path_1.default.join(__dirname, 'preload.js')
            : require('path').join(__dirname, 'preload.js');
        const cacheKey = '__agSidecarLocalizationScript:' + preloadFile;
        if (typeof globalThis[cacheKey] === 'string') {
            return globalThis[cacheKey];
        }
        try {
            const fsMod = typeof fs !== 'undefined' && fs && typeof fs.readFileSync === 'function' ? fs : require('fs');
            const preloadSrc = fsMod.readFileSync(preloadFile, 'utf8');
            const sIdx = preloadSrc.indexOf(${JSON.stringify(signatureStart)});
            const eIdx = sIdx !== -1 ? preloadSrc.indexOf(${JSON.stringify(signatureEnd)}, sIdx + ${signatureStart.length}) : -1;
            if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
                const extracted = preloadSrc.slice(sIdx, eIdx + ${signatureEnd.length});
                globalThis[cacheKey] = extracted;
                return extracted;
            }
        } catch (_err) {}
        return '';
    };
    const resolveSidecarSubframe = (event, frameProcessId, frameRoutingId) => {
        if (event && event.frame) return event.frame;
        if (typeof frameProcessId === 'number' && typeof frameRoutingId === 'number') {
            return electron_1.webFrameMain?.fromId?.(frameProcessId, frameRoutingId) ?? null;
        }
        return null;
    };
    const checkSidecarIframeInHub = (targetUrl) => {
        try {
            const target = new URL(targetUrl);
            const iframes = document.querySelectorAll('iframe[data-testid="sidecar-iframe"]');
            for (const el of iframes) {
                const raw = el.getAttribute('src') || el.src || '';
                if (!raw) continue;
                const u = new URL(raw, location.href);
                if (u.origin !== target.origin) continue;
                const baseDir = u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1);
                if (u.origin !== location.origin || target.pathname === u.pathname || target.pathname.startsWith(baseDir)) {
                    return true;
                }
            }
        } catch (_e) {}
        return false;
    };
    const injectSidecarSubframe = (frame) => {
        try {
            const winDestroyed = typeof win !== 'undefined' && win && win.isDestroyed?.();
            if (!frame || frame.isDestroyed?.() || winDestroyed || hubContents.isDestroyed?.()) return;
            const mainFrame = hubContents.mainFrame;
            if (!mainFrame || frame === mainFrame || frame.parent !== mainFrame) return;
            const frameUrl = String(frame.url || '');
            if (!/^(?:https?|plugin):\\/\\//i.test(frameUrl)) return;
            const frameOrigin = String(frame.origin || '');
            if (!frameOrigin || frameOrigin === 'null') return;
            const script = getSidecarLocalizationScript();
            if (!script) return;
            const checkExpr = '(' + checkSidecarIframeInHub.toString() + ')(' + JSON.stringify(frameUrl) + ')';
            Promise.resolve(mainFrame.executeJavaScript(checkExpr))
                .then((isSidecar) => {
                    if (!isSidecar) return;
                    const winDestroyedLater = typeof win !== 'undefined' && win && win.isDestroyed?.();
                    if (frame.isDestroyed?.() || winDestroyedLater || hubContents.isDestroyed?.()) return;
                    return frame.executeJavaScript(script);
                })
                .catch((err) => {
                    console.warn('[汉化] Sidecar 注入失败:', err && err.message ? err.message : err);
                });
        } catch (_err) {}
    };
    const onSidecarFrameNavigate = (event, _url, _httpResponseCode, _httpStatusText, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        injectSidecarSubframe(resolveSidecarSubframe(event, frameProcessId, frameRoutingId));
    };
    const onSidecarFrameFinishLoad = (event, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        injectSidecarSubframe(resolveSidecarSubframe(event, frameProcessId, frameRoutingId));
    };
    hubContents.on('did-frame-navigate', onSidecarFrameNavigate);
    hubContents.on('did-frame-finish-load', onSidecarFrameFinishLoad);
    if (typeof win !== 'undefined' && win && typeof win.on === 'function') {
        win.on('closed', () => {
            hubContents.off?.('did-frame-navigate', onSidecarFrameNavigate);
            hubContents.off?.('did-frame-finish-load', onSidecarFrameFinishLoad);
        });
    }
    /* --- SIDECAR TRANSLATION END --- */`;

    console.log(`[修改] 伴生面板 (Sidecar) 汉化钩子注入成功！`);
    return cleaned.substring(0, idx) + sidecarHookJs + "\n    " + cleaned.substring(idx);
}

function patchPreloadJs(content, translationJs, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 preload.js 注入汉化代码...`);
    const cleanedContent = cleanJsContent(content, signatureStart, signatureEnd);
    const newContent = cleanedContent + "\n;\n" + translationJs;
    console.log(`[修改] 注入成功！`);
    return newContent;
}

function patchMenuJs(menuContent) {
    console.log(`[修改] 正在向 menu.js 注入菜单汉化代码...`);
    const menuCleaned = cleanMenuJsContent(menuContent);

    const menuTranslationJs = `
    /* --- MENU TRANSLATION START --- */
    // ==========================================
    // Antigravity Native Menu Chinese Translation
    // ==========================================
    const translations = ${`{
        'File': '文件',
        'Edit': '编辑',
        'View': '视图',
        'Window': '窗口',
        'Help': '帮助',
        'New Window': '新建窗口',
        'Create Project': '创建项目',
        'Command Palette': '命令面板',
        'Docs': '文档',
        'Check for Updates': '检查更新',
        'Checking for Updates...': '正在检查更新...',
        'Downloading Update...': '正在下载更新...',
        'Restart to Update': '重启以更新',
        'Toggle Developer Tools': '切换开发者工具',
        'Undo': '撤销',
        'Redo': '重做',
        'Cut': '剪切',
        'Copy': '复制',
        'Paste': '粘贴',
        'Select All': '全选',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '关闭',
        'Zoom': '缩放',
        'Reset Zoom': '重置缩放',
        'Actual Size': '实际大小',
        'Zoom In': '放大',
        'Zoom Out': '缩小',
        'Toggle Full Screen': '切换全屏',
        'Toggle Between Light/Dark Themes': '切换浅色/深色主题',
        'Split Terminal': '拆分终端',
        'Split Conversation Horizontally': '水平拆分会话',
        'Split Conversation Vertically': '垂直拆分会话',
        'Split': '拆分',
        'Split Right': '向右拆分',
        'Split Down': '向下拆分',
        'Replace With New': '替换为新会话',
        'Show in File Explorer': '在文件资源管理器中显示',
        'Reveal in Finder': '在访达中显示',
        'Find in conversation': '在会话中查找',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'About Antigravity': '关于 Antigravity',
        'Settings...': '设置...',
        'Preferences...': '首选项...',
        'Services': '服务',
        'Hide Antigravity': '隐藏 Antigravity',
        'Hide Others': '隐藏其他',
        'Show All': '全部显示',
        'Quit Antigravity': '退出 Antigravity',
        'Quit': '退出',
        'Paste and Match Style': '粘贴并匹配样式',
        'Delete': '删除',
        'Bring All to Front': '前置全部窗口',
        'Close Window': '关闭窗口',
        'Version': '版本',
        'Reload': '重新加载',
        'Force Reload': '强制重新加载',
        'Substitutions': '替换',
        'Show Substitutions': '显示替换',
        'Smart Quotes': '智能引号',
        'Smart Dashes': '智能破折号',
        'Text Replacement': '文本替换',
        'Speech': '语音',
        'Start Speaking': '开始朗读',
        'Stop Speaking': '停止朗读',
        'Reload Window': '重新加载窗口',
        'Toggle Fullscreen': '切换全屏',
        'Toggle Full-Screen': '切换全屏',
        'Enter Full Screen': '进入全屏',
        'Exit Full Screen': '退出全屏',
        'Appearance': '外观',
        'Select Theme': '选择主题',
        'Toggle Sidebar': '切换侧边栏',
        'Customize Sidebar': '自定义侧边栏',
        'Toggle Aux Pane': '切换辅助面板',
        'Toggle Terminal': '切换终端',
        'Toggle Secondary Side Bar': '切换次侧边栏',
        'Open Command Palette': '打开命令面板',
        'Open Launchpad': '打开启动台',
        'Open Project Picker': '打开项目选择器',
        'Open Conversation History': '打开会话历史',
        'Open Keyboard Shortcuts': '打开键盘快捷键',
        'Keyboard Shortcuts': '键盘快捷键',
        'Remove From Split': '退出拆分',
        'Remove from Split': '从拆分视图中移除',
        'Equalize Split Panes': '均分拆分面板',
        'Next Aux Pane Tab': '下一个辅助面板标签页',
        'Previous Aux Pane Tab': '上一个辅助面板标签页',
        'Collapse All Folders': '折叠所有文件夹',
        'Expand All Folders': '展开所有文件夹',
        'Word Wrap': '自动换行',
        'Toggle Word Wrap': '切换自动换行',
        'Front': '前置全部窗口',
        'Show Previous Tab': '显示上一个标签页',
        'Show Next Tab': '显示下一个标签页',
        'Move Tab to New Window': '将标签页移至新窗口',
        'Merge All Windows': '合并所有窗口',
        'Tile Window to Left of Screen': '将窗口拼贴到屏幕左侧',
        'Tile Window to Right of Screen': '将窗口拼贴到屏幕右侧',
        'Move Window to Left Side of Screen': '将窗口移到屏幕左侧',
        'Move Window to Right Side of Screen': '将窗口移到屏幕右侧',
        'Fill': '填充',
        'Center': '居中',
        'Move & Resize': '移动并调整大小',
        'New Conversation': '新建会话',
        'New Remote Window': '新建远程窗口',
        'New Editor Window': '新建编辑器窗口',
        'New Tab': '新建标签页',
        'New Terminal Tab': '新建终端标签页',
        'Open...': '打开...',
        'Open Folder...': '打开文件夹...',
        'Open Folder': '打开文件夹',
        'Open Workspace...': '打开工作区...',
        'Open Workspace': '打开工作区',
        'Open Recent': '打开最近项',
        'Clear Menu': '清除菜单',
        'Clear Recently Opened': '清除最近打开记录',
        'Save': '保存',
        'Save As...': '另存为...',
        'Save All': '全部保存',
        'Revert File': '恢复文件',
        'Close Tab': '关闭标签页',
        'Close Editor': '关闭编辑器',
        'Close Folder': '关闭文件夹',
        'Close Project': '关闭项目',
        'Connect to Remote...': '连接到远程...',
        'Connect to Remote Workspace': '连接到远程工作区',
        'Connect to SSH...': '连接到 SSH...',
        'Show in File Manager': '在文件管理器中显示',
        'Open in Editor': '在编辑器中打开',
        'Exit': '退出',
        'Find': '查找',
        'Find...': '查找...',
        'Find in Conversation': '在会话中查找',
        'Find Next': '查找下一个',
        'Find Previous': '查找上一个',
        'Replace': '替换',
        'Replace...': '替换...',
        'Spelling and Grammar': '拼写和语法',
        'Show Spelling and Grammar': '显示拼写和语法',
        'Check Document Now': '立即检查文稿',
        'Check Spelling While Typing': '键入时检查拼写',
        'Check Grammar With Spelling': '检查拼写和语法',
        'Correct Spelling Automatically': '自动纠正拼写',
        'Smart Copy/Paste': '智能拷贝/粘贴',
        'Smart Links': '智能链接',
        'Data Detectors': '数据检测器',
        'Transformations': '转换',
        'Make Upper Case': '变为大写',
        'Make Lower Case': '变为小写',
        'Capitalize': '首字母大写',
        'Start Dictation...': '开始听写...',
        'Emoji & Symbols': '表情与符号',
        'Copy conversation markdown': '复制会话 Markdown',
        'Copy Conversation Markdown': '复制会话 Markdown',
        'Check for Updates...': '检查更新...',
        'Download Update': '下载更新',
        'Restart to Update...': '重启以更新...',
        'Settings': '设置',
        'Preferences': '首选项',
        'Open Settings': '打开设置',
        'Hide': '隐藏',
        'Sign In': '登录',
        'Sign Out': '退出登录',
        'Sign out': '退出登录',
        'Install Shell Command': '安装命令行工具',
        'Install IDE': '安装 IDE',
        'Documentation': '文档',
        'Release Notes': '发行说明',
        'Report Issue': '报告问题',
        'Send Feedback': '发送反馈',
        'Provide Feedback': '提供反馈',
        'Download Diagnostics': '下载诊断信息',
        'Show Logs': '显示日志',
        'Open Logs Folder': '打开日志文件夹',
        'About': '关于',
        'Privacy Policy': '隐私政策',
        'Terms of Service': '服务条款',
        'License': '许可证',
        'Developer': '开发者',
        'Developer: Reset NUX': '开发者：重置新用户引导',
        'Developer: Reset Onboarding': '开发者：重置初始引导',
        'Restart Main Language Server': '重启主语言服务器',
        'Clear Cache': '清除缓存',
        'View Usage': '查看用量'
    }`};
    const lowerTranslations = Object.create(null);
    for (const [k, v] of Object.entries(translations)) {
        lowerTranslations[k.toLowerCase()] = v;
    }
    function translateMenu(items) {
        for (const item of items) {
            let label = item.label || '';
            let mnemonic = '';
            let cleanLabel = label;
            const m = label.match(/&([a-zA-Z])/);
            if (m) {
                mnemonic = "(&" + m[1] + ")";
                cleanLabel = label.replace('&', '');
            }
            const normLabel = cleanLabel.replace(/…/g, '...').trim();
            if (!item._origLabel) item._origLabel = label;
            if (!item._origCleanLabel) item._origCleanLabel = cleanLabel;
            const hit = translations[cleanLabel] || translations[normLabel] || translations[label] || lowerTranslations[normLabel.toLowerCase()];
            if (hit) {
                item.label = hit + mnemonic;
            } else if (/^Version\\s*([\\d\\.]*)$/i.test(cleanLabel)) {
                item.label = cleanLabel.replace(/^Version\\s*([\\d\\.]*)$/i, (match, v) => v ? "版本 " + v : "版本");
            }
            if (item.submenu && item.submenu.items) {
                translateMenu(item.submenu.items);
            }
        }
    }
    if (menu && Array.isArray(menu.items) && !menu.items._cnFindHooked) {
        menu.items._cnFindHooked = true;
        const origFind = menu.items.find.bind(menu.items);
        menu.items.find = function(pred, thisArg) {
            return origFind((it, idx, arr) => {
                if (pred.call(thisArg, it, idx, arr)) return true;
                if (it && it._origLabel && pred.call(thisArg, { ...it, label: it._origLabel }, idx, arr)) return true;
                if (it && it._origCleanLabel && pred.call(thisArg, { ...it, label: it._origCleanLabel }, idx, arr)) return true;
                return false;
            });
        };
    }
    if (!electron_1.Menu._cnHooked) {
        electron_1.Menu._cnHooked = true;
        const origSetAppMenu = electron_1.Menu.setApplicationMenu.bind(electron_1.Menu);
        electron_1.Menu.setApplicationMenu = function(m) {
            if (m && m.items) translateMenu(m.items);
            return origSetAppMenu(m);
        };
    }
    translateMenu(menu.items);
    /* --- MENU TRANSLATION END --- */`;

    const targetStr = "electron_1.Menu.setApplicationMenu(menu);";
    const idx = menuCleaned.indexOf(targetStr);
    if (idx !== -1) {
        console.log(`[修改] 菜单汉化注入成功！`);
        return menuCleaned.substring(0, idx) + menuTranslationJs + "\n    " + menuCleaned.substring(idx);
    } else {
        console.warn(`[警告] 未能在 menu.js 中找到设定的插入点。`);
        return menuCleaned;
    }
}

function patchTrayJs(trayContent) {
    console.log(`[修改] 正在向 tray.js 注入任务栏菜单汉化...`);
    let trayCleaned = cleanTrayJsContent(trayContent);
    const trayTranslationsJson = JSON.stringify({
        'No agents running': '无运行中的智能体',
        'Open Antigravity': '打开 Antigravity',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'Quit': '退出'
    });
    const openPrefix = '打开 ';

    const targetCreate = /function\s+createTray\s*\(([^)]*)\)\s*\{/;
    const replacementCreate = (match, args) => `function createTray(${args}) {
    /* --- TRAY TRANSLATION START --- */
    const translations = ${trayTranslationsJson};
    if (typeof actions !== 'undefined' && Array.isArray(actions)) {
        for (const item of actions) {
            if (!item || !item.label) continue;
            if (translations[item.label]) {
                item.label = translations[item.label];
            } else if (item.label.startsWith('Open ')) {
                item.label = ${JSON.stringify(openPrefix)} + item.label.slice(5);
            }
        }
    }
    /* --- TRAY TRANSLATION END --- */`;

    let hitCount = 0;
    let trayPatched = trayCleaned.replace(targetCreate, (...m) => {
        hitCount++;
        return replacementCreate(...m);
    });
    if (hitCount === 0) {
        console.warn(`[警告] 未能在 tray.js 中找到 createTray 函数插入点。`);
    }

    const dblClickTarget = /tray\.setContextMenu\(contextMenu\);/;
    const dblClickReplacement = `tray.setContextMenu(contextMenu);
    /* --- TRAY DOUBLE CLICK START --- */
    if (typeof actions !== 'undefined' && Array.isArray(actions) && typeof tray !== 'undefined' && tray && typeof tray.on === 'function') {
        const openAction = actions.find(item => item && typeof item.click === 'function' && !['Quit', '退出', '結束'].includes(item.label));
        if (openAction) {
            tray.on('double-click', () => {
                const wins = electron_1.BrowserWindow.getAllWindows();
                if (wins.length > 0 && wins[0].isMinimized()) {
                    wins[0].restore();
                }
                openAction.click();
            });
        }
    }
    /* --- TRAY DOUBLE CLICK END --- */`;
    trayPatched = trayPatched.replace(dblClickTarget, () => {
        hitCount++;
        return dblClickReplacement;
    });

    const countRegex = /countItem\.label\s*=\s*\([^;]{0,300}' running';/g;
    const replacementCount = "countItem.label = count > 0 ? `${count} 个智能体运行中` : '无运行中的智能体';";
    trayPatched = trayPatched.replace(countRegex, (match) => {
        hitCount++;
        return `/* --- TRAY COUNT START:${Buffer.from(match, 'utf8').toString('base64')} --- */ ${replacementCount} /* --- TRAY COUNT END --- */`;
    });

    const targetInsert = /function\s+insertTrayMenuItem\s*\(\s*position\s*,\s*options\s*\)\s*\{/;
    const replacementInsert = `function insertTrayMenuItem(position, options) {
    /* --- TRAY INSERT TRANSLATION START --- */
    const insertTranslations = ${trayTranslationsJson};
    if (options && options.label) {
        if (insertTranslations[options.label]) {
            options = { ...options, label: insertTranslations[options.label] };
        } else if (options.label.startsWith('Open ')) {
            options = { ...options, label: ${JSON.stringify(openPrefix)} + options.label.slice(5) };
        }
    }
    /* --- TRAY INSERT TRANSLATION END --- */`;
    trayPatched = trayPatched.replace(targetInsert, () => {
        hitCount++;
        return replacementInsert;
    });

    if (hitCount > 0) {
        console.log(`[修改] 任务栏菜单汉化注入成功（${hitCount} 处）！`);
    } else {
        console.warn(`[警告] 未能在 tray.js 中命中任何任务栏注入点。`);
    }
    return trayPatched;
}

function patchLoadingOverlayJs(loadingContent) {
    if (!loadingContent.includes('<div class="text">')) {
        return loadingContent;
    }
    console.log(`[修改] 正在向 loadingOverlay.js 注入加载页汉化...`);
    const replacementText = '<div class="text">正在加载 Antigravity…</div>';

    const out = loadingContent
        .replace('<div class="text">Loading Antigravity</div>', replacementText)
        .replace('<div class="text">反重力引擎已啟動，正在努力擺脫地心引力...</div>', replacementText)
        .replace('<div class="text">反重力引擎已启动，正在努力摆脱地心引力...</div>', replacementText);

    if (out !== loadingContent) {
        console.log(`[修改] 加载页汉化注入成功！`);
    } else {
        console.warn(`[警告] 未能在 loadingOverlay.js 中找到加载页文本插入点。`);
    }
    return out;
}

function patchUpdaterJs(updaterContent) {
    console.log(`[修改] 正在向 updater.js 注入更新弹窗汉化...`);
    const targetOptions = `                title: 'Check for Updates',
                message: 'No updates available',
                buttons: ['OK'],`;
    const replacementOptions = `                title: '检查更新',
                message: '暂无可用更新',
                buttons: ['确定'],`;

    const out = updaterContent
        .replace(targetOptions, replacementOptions)
        .replace('MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', `MenuUpdateStep["CheckForUpdates"] = ${'"检查更新"'};`)
        .replace('MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', `MenuUpdateStep["CheckingForUpdates"] = ${'"正在检查更新..."'};`)
        .replace('MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', `MenuUpdateStep["DownloadingUpdate"] = ${'"正在下载更新..."'};`)
        .replace('MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', `MenuUpdateStep["RestartToUpdate"] = ${'"重启以更新"'};`);
    if (out !== updaterContent) {
        console.log(`[修改] 更新弹窗汉化注入成功！`);
    } else {
        console.warn(`[警告] 未能在 updater.js 中找到更新弹窗插入点。`);
    }
    return out;
}

const MAIN_PROCESS_TEXT_TABLES = {
    'dist/main.js': [
        ["buttons: ['Cancel', 'Quit'],", "buttons: ['取消', '退出'],"],
        ["title: 'Confirm Quit',", "title: '确认退出',"],
        ["message: 'Are you sure you want to quit?',", "message: '确定要退出吗？',"],
        [
            "detail: 'There may be agents or background tasks running.',",
            "detail: '当前可能有智能体或后台任务正在运行。',"
        ],
        ["label: 'New Window',", "label: '新建窗口',"],
        ["showErrorBox('Binary not found', msg)", "showErrorBox('未找到可执行文件', msg)"],
        ["showErrorBox('WSL setup failed', msg)", "showErrorBox('WSL 初始化失败', msg)"],
        ["showErrorBox('Startup failed', msg)", "showErrorBox('启动失败', msg)"],
        ["title: 'WSL distro not found',", "title: '未找到 WSL 发行版',"],
        [
            'message: `The WSL distro "${WSL_DISTRO}" is no longer installed.`,',
            'message: `WSL 发行版 "${WSL_DISTRO}" 已不再安装。`,'
        ],
        [
            "detail: 'Antigravity opened on Windows instead.',",
            "detail: 'Antigravity 已改为在 Windows 上打开。',"
        ],
        [
            '`Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`',
            '`无法将服务器安装到 WSL 发行版“${WSL_DISTRO}”：\\n${err.message}`'
        ]
    ],
    'dist/ipcHandlers.js': [
        [
            "showErrorBox('Cannot open folder', t.error)",
            "showErrorBox('无法打开文件夹', t.error)"
        ],
        [
            "message: 'Folder is on the Windows filesystem',",
            "message: '文件夹位于 Windows 文件系统中',"
        ],
        ["title: 'Open workspace',", "title: '打开工作区',"],
        ["title: 'Open workspaces',", "title: '打开工作区',"],
        ["title: 'Select Download Folder',", "title: '选择下载文件夹',"]
    ],
    'dist/remote/remoteManager.js': [
        ["title: 'Choose an SSH config file',", "title: '选择 SSH 配置文件',"],
        ["buttons: ['Stop Server', 'Cancel'],", "buttons: ['停止服务', '取消'],"],
        ["title: 'Stop SSH server',", "title: '停止 SSH 服务器',"],
        [
            "message: `Stop the Antigravity server on ${entry.label}?`,",
            "message: `停止 ${entry.label} 上的 Antigravity 服务？`,"
        ],
        [
            "'Agents running on this host will stop and its window will close. '",
            "'此主机上运行的智能体将停止，其窗口也将关闭。'"
        ],
        ["'The server starts again the next time you connect.'", "'下次连接时将重新启动服务。'"],
        ["message: `Not connected to ${label}`,", "message: `尚未连接到 ${label}`,"],
        [
            "detail: 'Reconnect first, then stop its server.',",
            "detail: '请先重新连接，然后再停止其服务。',"
        ],
        ["title: 'SSH connection failed',", "title: 'SSH 连接失败',"],
        ["buttons: ['Sign In', 'Cancel'],", "buttons: ['登录', '取消'],"],
        ["title: 'Sign in',", "title: '登录',"],
        [
            "message: `Sign in to your organization for ${entry.label}?`,",
            "message: `是否登录 ${entry.label} 所在的组织？`,"
        ],
        [
            "'Continue only if you just chose to sign in with your organization '",
            "'仅当您刚才主动选择通过组织登录时才继续。'"
        ],
        [
            "`in this window. ${entry.label} will get access to your `",
            "`继续后，${entry.label} 将获得访问权限，可访问您的`"
        ],
        [
            '"organization\'s Google Cloud account.\\n"',
            '"所属组织的 Google Cloud 账户。\\n"'
        ],
        [
            "`Workforce pool: ${names[1]}  Provider: ${names[2]}`",
            "`Workforce 池：${names[1]}  提供方：${names[2]}`"
        ],
        ["`Identity provider: ${provider}`", "`身份提供方：${provider}`"],
        [
            "message: `${name} can't be the SSH config file`,",
            "message: `${name} 无法作为 SSH 配置文件`,"
        ],
        ["title: 'Choose another SSH config file',", "title: '选择其他 SSH 配置文件',"],
        [
            "buttons: ['Choose Another File…', 'Cancel'],",
            "buttons: ['选择其他文件…', '取消'],"
        ],
        ["title: 'Could not restart the SSH server',", "title: '无法重启 SSH 服务器',"],
        [
            "message: `${entry.label} still runs Antigravity server ${running}.`,",
            "message: `${entry.label} 仍在运行 Antigravity 服务器 ${running}。`,"
        ],
        ["buttons: ['Allow', \"Don't Allow\"],", "buttons: ['允许', '不允许'],"],
        ["title: 'Microphone access',", "title: '麦克风权限',"],
        [
            "message: `Allow ${label} to use your microphone?`,",
            "message: `允许 ${label} 使用您的麦克风吗？`,"
        ],
        [
            "detail: `The page in this window comes from ${label}. If you allow it, that ` +",
            "detail: `此窗口中的页面来自 ${label}。如果您允许，只要其任意` +"
        ],
        [
            "\"host can use this computer's microphone for voice whenever one of \" +",
            "\"主机窗口处于打开状态，该主机即可使用此电脑的麦克风进行语音输入。\" +"
        ],
        [
            "'its windows is open. Antigravity asks again after you quit it.',",
            "'退出 Antigravity 后，下次将重新询问。',"
        ],
        ["buttons: ['Continue', 'Cancel'],", "buttons: ['继续', '取消'],"],
        [
            "message: `Finish this sign-in on ${entry.label}?`,",
            "message: `要在 ${entry.label} 上完成此次登录吗？`,"
        ],
        [
            "detail: `Continue only if you just chose to sign in from the ${entry.label} ` +",
            "detail: `仅当您刚才主动选择从 ${entry.label} 窗口登录时才继续。` +"
        ],
        [
            "'window. Your browser opens the sign-in page; once you sign in, ' +",
            "'您的浏览器将打开登录页面；完成登录后，' +"
        ],
        [
            "`${entry.label} gets access to that account.\\n` +",
            "`${entry.label} 将获得该账户的访问权限。\\n` +"
        ],
        [
            "`Sign-in page: ${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,",
            "`登录页面：${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,"
        ],
        ["buttons: ['Take Over', 'Cancel'],", "buttons: ['接管', '取消'],"],
        ["title: 'Shared home directory',", "title: '共享主目录',"],
        [
            "? `This window's Antigravity server runs on ${host}, another machine that shares your home directory.`",
            "? `此窗口的 Antigravity 服务器正在 ${host} 上运行（另一台共享您主目录的机器）。`"
        ],
        [
            "? `Your Antigravity server runs on ${host}, another machine that shares your home directory.`",
            "? `您的 Antigravity 服务器正在 ${host} 上运行（另一台共享您主目录的机器）。`"
        ],
        [
            ": `${host}, another machine that shares your home directory, started your Antigravity server.`,",
            ": `${host}（另一台共享您主目录的机器）启动了您的 Antigravity 服务器。`,"
        ],
        [
            "? `${label} reached ${here} this time. Cancel and reconnect to try again for ${host}, or take over to stop the server on ${host}, and its agents, and run it on ${here} instead.`",
            "? `${label} 本次连接到了 ${here}。您可以取消并重新连接以再次尝试连接 ${host}，或选择“接管”以停止 ${host} 上的服务器及其智能体，改为在 ${here} 上运行。`"
        ],
        [
            "? `${label} reached ${here}. Take over to stop the server on ${host}, and its agents, and run it on ${here} instead. To keep it running, connect to ${host}.`",
            "? `${label} 已连接到 ${here}。选择“接管”将停止 ${host} 上的服务器及其智能体，改为在 ${here} 上运行。若需保持其运行，请连接到 ${host}。`"
        ],
        [
            ": `${label} reached ${here}. Take over only if that server no longer runs, for example if ${host} was shut down or replaced: if it still runs, both servers would write the same files. To check, connect to ${host}.`,",
            ": `${label} 已连接到 ${here}。仅在确认该服务器已停止运行（例如 ${host} 已关机或被替换）时才选择“接管”：若它仍在运行，两个服务器将同时写入同一批文件。如需确认，请连接到 ${host}。`,"
        ],
        [
            "const what = terminals === 0 ? 'agent or task' : 'agent, task or terminal';",
            "const what = terminals === 0 ? '智能体或任务' : '智能体、任务或终端';"
        ],
        ["buttons: ['Restart', 'Later'],", "buttons: ['重启', '稍后'],"],
        ["title: 'Restart SSH server',", "title: '重启 SSH 服务器',"],
        [
            "message: `${label} is running server ${running}; this app is ${expected}. Restart the server now?`,",
            "message: `${label} 正在运行服务器 ${running}，当前应用版本为 ${expected}。是否立即重启服务器？`,"
        ],
        [
            "detail: `Any ${what} still running on it stops. The server starts again with this app's version.`,",
            "detail: `其上仍在运行的任何${what}都将停止。服务器将以当前应用版本重新启动。`,"
        ],
        // reportError() 以参数传入的对话框标题（须排在上面的 title 列之后）
        ["'Could not restart the SSH server'", "'无法重启 SSH 服务器'"],
        ["'Could not stop the SSH server'", "'无法停止 SSH 服务器'"],
        ["'Sign-in failed'", "'登录失败'"],
        ["'Connection cancelled.'", "'连接已取消。'"]
    ],
    'dist/remote/sshPrompts.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"'],
        [
            "message: confirm ? `${label} asks:` : 'Touch your security key',",
            "message: confirm ? `${label} 询问：` : '请轻触您的安全密钥',"
        ],
        [
            "const TOUCH_TITLE = 'Touch your security key';",
            "const TOUCH_TITLE = '请轻触您的安全密钥';"
        ],
        [
            "<p class=\"context\">Connecting to <span id=\"label\"></span></p>",
            "<p class=\"context\">正在连接到 <span id=\"label\"></span></p>"
        ],
        [
            "buttons: confirm ? ['Yes', 'No'] : ['Cancel'],",
            "buttons: confirm ? ['是', '否'] : ['取消'],"
        ],
        [
            ">Asked again: your last answer may not have worked.<",
            ">再次询问：您上次的回答可能未生效。<"
        ],
        [">That's too long.<", ">输入内容过长。<"],
        ['>Cancel</button>', '>取消</button>'],
        ['>Continue</button>', '>继续</button>'],
        [
            "(who) => (isAccount(who) ? ['Password', who] : undefined),",
            "(who) => (isAccount(who) ? ['密码', who] : undefined),"
        ],
        [
            "(who) => (isAccount(who) ? ['Current password', who] : undefined),",
            "(who) => (isAccount(who) ? ['当前密码', who] : undefined),"
        ],
        [
            "(who) => (isAccount(who) ? ['New password', who] : undefined),",
            "(who) => (isAccount(who) ? ['新密码', who] : undefined),"
        ],
        [
            "(who) => (isAccount(who) ? ['Confirm new password', who] : undefined),",
            "(who) => (isAccount(who) ? ['确认新密码', who] : undefined),"
        ],
        ["['Passphrase', baseName(key)]", "['密钥口令', baseName(key)]"],
        [
            "? `${asked[0]} for ${hostPromptsMarked ? asked[1] : label}`",
            "? `${hostPromptsMarked ? asked[1] : label} 的${asked[0]}`"
        ],
        [
            "? `Trust ${hostName(host.split(' (')[0])}?`",
            "? `信任 ${hostName(host.split(' (')[0])}？`"
        ],
        ["? `Connect to ${hostName(host)} anyway?`", "? `仍要连接到 ${hostName(host)}？`"],
        ["return 'Accept updated host keys?';", "return '接受更新的主机密钥？';"],
        [
            "return key ? `Add ${baseName(key.split(' (')[0])} to ssh-agent?` : undefined;",
            "return key ? `将 ${baseName(key.split(' (')[0])} 添加到 ssh-agent？` : undefined;"
        ],
        ["return `Question from ${who}`;", "return `来自 ${who} 的询问`;"],
        ["return `Verification code for ${who}`;", "return `${who} 的验证码`;"],
        ["return `Password for ${who}`;", "return `${who} 的密码`;"],
        [
            "return /\\bpin\\b/i.test(text) ? `PIN for ${who}` : `Sign in to ${who}`;",
            "return /\\bpin\\b/i.test(text) ? `${who} 的 PIN` : `登录到 ${who}`;"
        ]
    ],
    'dist/deviceChooser.js': [
        ["hid: 'HID device',", "hid: 'HID 设备',"],
        ["usb: 'USB device',", "usb: 'USB 设备',"],
        ["serial: 'serial port',", "serial: '串口设备',"],
        ["'Unknown device'", "'未知设备'"],
        ["title: 'Connect a device',", "title: '连接设备',"],
        [
            "message: `${origin} wants to connect to a ${KIND_NOUNS[kind]}`,",
            "message: `${origin} 请求连接到 ${KIND_NOUNS[kind]}`,"
        ],
        ["? 'Select a device:'", "? '请选择设备：'"],
        [": 'No compatible devices found.',", ": '未找到兼容设备。',"],
        [
            "buttons: [...snapshot.map(({ label }) => label), 'Cancel'],",
            "buttons: [...snapshot.map(({ label }) => label), '取消'],"
        ]
    ],
    'dist/webauthn.js': [
        [
            "details.relyingPartyId || 'this site'",
            "details.relyingPartyId || '当前站点'"
        ],
        ["title: 'Choose a Passkey',", "title: '选择通行密钥 (Passkey)',"],
        ["message: `Sign in to ${rpLabel}`,", "message: `登录 ${rpLabel}`,"],
        [
            "detail: 'Select a passkey account to continue:',",
            "detail: '请选择一个通行密钥账户以继续：',"
        ],
        [
            "buttons: [...accountLabels, 'Cancel'],",
            "buttons: [...accountLabels, '取消'],"
        ]
    ],
    'dist/webviewPopupSecurity.js': [
        ["insecure: 'Not secure',", "insecure: '不安全',"],
        ["dangerous: '⚠ Not secure',", "dangerous: '⚠ 不安全',"],
        ["'Your connection to this site is not secure',", "'您与此网站的连接不安全',"],
        [
            "'You should not enter any sensitive information on this site (for '",
            "'请勿在此网站输入任何敏感信息（例如'"
        ],
        [
            "'example, passwords or credit cards), because it could be stolen by '",
            "'密码或信用卡信息），因为这些信息可能会被'"
        ],
        ["'attackers.',", "'攻击者窃取。',"],
        ["'Connection is secure',", "'连接安全',"],
        [
            "'Your information (for example, passwords or credit card numbers) is '",
            "'您的信息（例如密码或信用卡号）在发送至此网站时'"
        ],
        ["'private when it is sent to this site.',", "'会受到私密保护。',"],
        [
            "['Connection security information is not available for this page']",
            "['无法获取此页面的连接安全信息']"
        ],
        [": 'unknown'", ": '未知'"],
        ["'Certificate is valid' : 'Certificate details'", "'证书有效' : '证书详情'"],
        ["`Error: ${state.certificateError}`", "`错误：${state.certificateError}`"],
        [
            "`Issued to: ${certificate.subjectName}`",
            "`颁发给：${certificate.subjectName}`"
        ],
        ["`Issued by: ${certificate.issuer}`", "`颁发者：${certificate.issuer}`"],
        [
            "`Valid from: ${formatDate(certificate.validFromMs)}`",
            "`生效时间：${formatDate(certificate.validFromMs)}`"
        ],
        [
            "`Valid until: ${formatDate(certificate.validToMs)}`",
            "`过期时间：${formatDate(certificate.validToMs)}`"
        ],
        ["`Protocol: ${certificate.protocol}`", "`协议：${certificate.protocol}`"],
        ["(state.url || 'This page')", "(state.url || '当前页面')"],
        ["label: 'Connection info…',", "label: '连接信息…',"],
        ["title: 'Connection info',", "title: '连接信息',"],
        ["buttons: ['OK'],", "buttons: ['确定'],"]
    ],
    'dist/provisionSplash.js': [
        [
            "<div>Setting up WSL: ${escapeHtml(distro)}</div>",
            "<div>正在初始化 WSL：${escapeHtml(distro)}</div>"
        ]
    ],
    'dist/ideInstall/wizardHtml.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"'],
        ["<title>Welcome to Antigravity</title>", "<title>欢迎使用 Antigravity</title>"],
        [">Setting up…</div>", ">正在设置…</div>"],
        ["<h1>Welcome to the new Antigravity!</h1>", "<h1>欢迎使用全新 Antigravity！</h1>"],
        [
            "<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>",
            "<p>Antigravity 经过全新设计，以智能体为核心并带来了全新能力。如果您仍需要代码编辑器，可将其作为名为 <b>Antigravity IDE</b> 的独立应用下载。</p>"
        ],
        [
            "<span>Download the Antigravity IDE</span>",
            "<span>下载 Antigravity IDE</span>"
        ],
        [">Explore the new Antigravity</button>", ">探索全新 Antigravity</button>"]
    ],
    'dist/remote/disconnectedPage.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"'],
        ["reconnect: 'Reconnect',", "reconnect: '重新连接',"],
        ["stop: 'Stop Server',", "stop: '停止服务',"],
        ["close: 'Close',", "close: '关闭',"],
        ["? 'Restarting…'", "? '正在重启…'"],
        ["? 'Reconnecting…'", "? '正在重新连接…'"],
        [": 'Disconnected';", ": '已断开连接';"],
        [
            "? `Restarting the Antigravity server on ${host}…`",
            "? `正在重启 ${host} 上的 Antigravity 服务…`"
        ],
        ["? `Reconnecting to ${host}…`", "? `正在重新连接到 ${host}…`"],
        [": `Disconnected from ${host}`;", ": `已断开与 ${host} 的连接`;"],
        [
            "? 'This window opens it again once it has started.'",
            "? '服务启动完成后，此窗口将自动重新打开。'"
        ],
        [
            "? `Its server on ${host} stopped, and its agents with it.`",
            "? `其在 ${host} 上的服务已停止，相关的智能体也已随之停止。`"
        ],
        [": `Agents keep running on ${host}.`", ": `智能体仍在 ${host} 上继续运行。`"],
        ["? `Its agents on ${host} stopped with it.`", "? `其在 ${host} 上的智能体已随之停止。`"],
        [
            ": `Agents keep running on ${host} unless its server stopped.`;",
            ": `除非其服务已停止，否则智能体仍在 ${host} 上继续运行。`;"
        ]
    ],
    'dist/remote/signInCallback.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"'],
        [
            "const SIGNED_IN = page('You have successfully authenticated.', 'You can close this tab and return to Antigravity.');",
            "const SIGNED_IN = page('您已成功完成身份验证。', '您可以关闭此标签页并返回 Antigravity。');"
        ],
        [
            "return page(\"Sign-in didn't finish\", `Antigravity couldn't reach ${host} to finish signing in. ` +",
            "return page('登录未完成', `Antigravity 无法连接到 ${host} 以完成登录。` +"
        ],
        [
            "return page(\"Sign-in didn't finish\", 'This sign-in came back from another server than the sign-in page you ' +",
            "return page('登录未完成', '此登录回调来自与您此前同意的登录页不同的服务器，' +"
        ],
        [
            "`agreed to, so Antigravity didn't pass it on to ${host}.`);",
            "`因此 Antigravity 未将其传递给 ${host}。`);"
        ],
        [
            "return page(\"Sign-in didn't finish\", `Antigravity on ${host} couldn't finish signing in (HTTP ${status}). ` +",
            "return page('登录未完成', `${host} 上的 Antigravity 无法完成登录 (HTTP ${status})。` +"
        ],
        ["'Sign in again from Antigravity.');", "'请从 Antigravity 重新发起登录。');"]
    ],
    'dist/browserStream/capturePage.js': [
        ["<title>Browser Stream Capture</title>", "<title>浏览器串流捕获</title>"],
        ["'Capture session failed'", "'捕获会话失败'"]
    ],
    // v2.35.1：SSH 错误对话框的说明与详情栏标签
    'dist/remote/sshErrorText.js': [
        ["'The connection was closed before it finished.'", "'连接在完成前被关闭。'"],
        [
            "`Windows SSH hosts aren't supported yet. ${sshArgs_1.LINUX_HOST_NEEDED}`",
            "`暂不支持 Windows SSH 主机。${sshArgs_1.LINUX_HOST_NEEDED}`"
        ],
        [
            "`Error code: ${err.code}\\nLogs: ${logPath()}`",
            "`错误代码：${err.code}\\n日志：${logPath()}`"
        ],
        ["`${text}\\nLogs: ${logPath()}`", "`${text}\\n日志：${logPath()}`"],
        ["`${label} reported: ${text}`", "`${label} 报告：${text}`"]
    ],
    // 通行密钥扫码窗口
    'dist/cablev2.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ["<html lang=\"en\">", "<html lang=\"en\">"],
        ["<title>Passkeys</title>", "<title>通行密钥</title>"],
        [
            "<h1 class=\"sheet-title\">Passkeys</h1>",
            "<h1 class=\"sheet-title\">通行密钥</h1>"
        ],
        [
            "<p class=\"mechanism-header\">Use your phone or tablet</p>",
            "<p class=\"mechanism-header\">使用手机或平板电脑</p>"
        ],
        [
            ">Scan this QR code with the camera on the device that has your passkey for ${safeRpId}</p>",
            ">请使用存有 ${safeRpId} 通行密钥的设备，用摄像头扫描此二维码</p>"
        ],
        [
            "onclick=\"window.close()\">Cancel</button>",
            "onclick=\"window.close()\">取消</button>"
        ],
        ["title: 'Passkeys'", "title: '通行密钥'"],
        ["updateStatus('Connecting to your device…')", "updateStatus('正在连接到您的设备…')"],
        [
            "updateStatus('Verify on your device to continue…')",
            "updateStatus('请在您的设备上完成验证以继续…')"
        ]
    ],
    'dist/qrEncoder.js': [
        ["aria-label=\"Passkey QR code\"", "aria-label=\"通行密钥二维码\""]
    ],
    // SSH 连接失败对话框与断开页面的错误说明（给 AI 代理的错误码消息、只写入日志的字符串保留英文）
    'dist/remote/sshArgs.js': [
        [
            "'Antigravity needs a Linux host on x64 or arm64 with glibc 2.26 or newer.'",
            "'Antigravity 需要使用 glibc 2.26 或更高版本、x64 或 arm64 架构的 Linux 主机。'"
        ],
        [
            "`Couldn't connect to the SSH host (${String(code)}).`",
            "`无法连接到 SSH 主机（${String(code)}）。`"
        ],
        [
            "'SSH authentication failed. Check your password, code or keys, then try again.'",
            "'SSH 身份验证失败。请检查密码、验证码或密钥，然后重试。'"
        ],
        [
            "'SSH authentication failed. Click Reconnect to sign in again.'",
            "'SSH 身份验证失败。请点击“重新连接”再次登录。'"
        ],
        [
            "\"SSH authentication failed. Antigravity can't answer password or code prompts on Windows yet: set up key-based login with ssh-agent, then try again.\"",
            "'SSH 身份验证失败。Antigravity 目前在 Windows 上还无法应答密码或验证码提示：请用 ssh-agent 设置密钥登录，然后重试。'"
        ],
        [
            "\"That SSH host isn't valid. Enter an alias from your SSH config or a host like user@host or user@host:2222.\"",
            "'该 SSH 主机无效。请输入 SSH 配置中的别名，或 user@host、user@host:2222 这类主机。'"
        ],
        [
            "\"The host's SSH key is unknown or has changed. Save it with ssh in a terminal. If it changed, ask the host's owner first: the connection may be intercepted.\"",
            "'主机的 SSH 密钥未知或已更改。请在终端中用 ssh 保存该密钥。如果密钥已更改，请先询问主机所有者：连接可能已被拦截。'"
        ],
        [
            "\"The host's SSH key has changed or isn't trusted. If it changed, ask the host's owner first: the connection may be intercepted.\"",
            "'主机的 SSH 密钥已更改或不受信任。如果密钥已更改，请先询问主机所有者：连接可能已被拦截。'"
        ],
        [
            "`Couldn't connect to the SSH host. Check its name, your network and ssh config (e.g. a ProxyCommand), and that ssh to it works in a terminal${prompts === 'no' ? ' without a prompt' : ''}.`",
            "`无法连接到 SSH 主机。请检查主机名、网络和 ssh 配置（例如 ProxyCommand），并确认在终端中${prompts === 'no' ? '无需任何提示即可' : '可以'}用 ssh 连接到该主机。`"
        ],
        [
            "\"SSH can't use your SSH config file. Fix the problem ssh reports, or choose another config file.\"",
            "'SSH 无法使用您的 SSH 配置文件。请修复 ssh 报告的问题，或选择其他配置文件。'"
        ],
        [
            "'SSH port forwarding failed. Make sure the server allows TCP forwarding (AllowTcpForwarding) for your account, then try again.'",
            "'SSH 端口转发失败。请确认服务器允许您的账户使用 TCP 转发（AllowTcpForwarding），然后重试。'"
        ],
        [
            "`The SSH host isn't supported. ${exports.LINUX_HOST_NEEDED} Windows and macOS hosts aren't supported yet.`",
            "`不支持该 SSH 主机。${exports.LINUX_HOST_NEEDED}目前尚不支持 Windows 和 macOS 主机。`"
        ],
        [
            "'Another host that shares your home directory runs the Antigravity server. Connect to that host, or connect again and choose Take Over.'",
            "'另一台共享您主目录的主机正在运行 Antigravity 服务器。请连接到那台主机，或重新连接并选择“接管”。'"
        ],
        [
            "\"Couldn't install the Antigravity server on the SSH host. Make sure it has free disk space, and that it or this computer can download from the internet.\"",
            "'无法在 SSH 主机上安装 Antigravity 服务器。请确认主机有可用的磁盘空间，并且主机或这台电脑能从互联网下载。'"
        ],
        [
            "`The Antigravity server failed to start on the SSH host. See its log in ~/${types_1.REMOTE_INSTALL_ROOT}/data on that host.`",
            "`Antigravity 服务器无法在 SSH 主机上启动。请查看该主机 ~/${types_1.REMOTE_INSTALL_ROOT}/data 中的日志。`"
        ],
        [
            "'The Antigravity server on the SSH host stopped. Reconnect to start it again.'",
            "'SSH 主机上的 Antigravity 服务器已停止。请重新连接以再次启动。'"
        ],
        [
            "'The SSH connection closed. Check your network connection, then reconnect.'",
            "'SSH 连接已关闭。请检查网络连接，然后重新连接。'"
        ],
        ["'The connection was cancelled.'", "'连接已取消。'"],
        [
            "\"Couldn't connect to the SSH host. Try ssh to it in a terminal, and see the Antigravity log for details.\"",
            "'无法连接到 SSH 主机。请在终端中尝试用 ssh 连接，并查看 Antigravity 日志了解详情。'"
        ]
    ],
    // 连接画面的进度状态与对话框显示的错误消息
    'dist/remote/sshConnection.js': [
        ["`Connecting to ${this.label}…`", "`正在连接到 ${this.label}…`"],
        ["'Waiting for your answer…'", "'正在等待您的回答…'"],
        [
            "`Uploading the Antigravity server to ${this.label}…`",
            "`正在将 Antigravity 服务器上传到 ${this.label}…`"
        ],
        [
            "`Connecting to the Antigravity server on ${this.label}…`",
            "`正在连接 ${this.label} 上的 Antigravity 服务器…`"
        ],
        ["`Checking ${label}…`", "`正在检查 ${label}…`"],
        [
            "`Waiting for another window to finish installing on ${label}…`",
            "`正在等待另一个窗口在 ${label} 上完成安装…`"
        ],
        [
            "`Replacing an invalid server binary on ${label}…`",
            "`正在替换 ${label} 上无效的服务器程序…`"
        ],
        [
            "`Downloading the Antigravity server on ${label}…`",
            "`正在 ${label} 上下载 Antigravity 服务器…`"
        ],
        [
            "`Installed the Antigravity server on ${label}.`",
            "`已在 ${label} 上安装 Antigravity 服务器。`"
        ],
        [
            "`Starting the Antigravity server on ${label}…`",
            "`正在 ${label} 上启动 Antigravity 服务器…`"
        ],
        [
            "`Connecting to the running server on ${label}…`",
            "`正在连接 ${label} 上运行中的服务器…`"
        ],
        [
            "`Restarting the Antigravity server on ${label}…`",
            "`正在重启 ${label} 上的 Antigravity 服务器…`"
        ],
        [
            "`Checking whether another host still runs your Antigravity server…`",
            "`正在检查是否还有其他主机在运行您的 Antigravity 服务器…`"
        ],
        [
            "`Moving the Antigravity server to ${label}…`",
            "`正在将 Antigravity 服务器移至 ${label}…`"
        ],
        ["`Timed out connecting to ${this.label}.`", "`连接 ${this.label} 超时。`"],
        ["'Connection cancelled.'", "'连接已取消。'"],
        ["'Not connected.'", "'未连接。'"],
        [
            "exports.PROMPT_CANCELLED = 'Sign-in cancelled.';",
            "exports.PROMPT_CANCELLED = '已取消登录。';"
        ],
        [
            "`The Antigravity server on ${this.label} has no HTTP port to stop it through.`",
            "`${this.label} 上的 Antigravity 服务器没有可用于停止它的 HTTP 端口。`"
        ],
        [
            "`The Antigravity server on ${this.label} refused to stop (HTTP ${status}).`",
            "`${this.label} 上的 Antigravity 服务器拒绝停止（HTTP ${status}）。`"
        ],
        [
            "`Could not confirm that the Antigravity server on ${this.label} stopped` +",
            "`无法确认 ${this.label} 上的 Antigravity 服务器已停止` +"
        ],
        [
            "(rpcError ? ` (${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}).` : '.')",
            "(rpcError ? `（${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}）。` : '。')"
        ],
        ["why = 'it has no HTTP port';", "why = '它没有 HTTP 端口';"],
        ["why = 'an invalid answer';", "why = '响应无效';"],
        [
            "`The Antigravity server on ${this.label} didn't give this window a sign-in token (${why}).`",
            "`${this.label} 上的 Antigravity 服务器没有给此窗口登录令牌（${why}）。`"
        ],
        [
            "`${this.label} did not start the setup within ${Math.round(firstLineMs / 1000)} s. ` +",
            "`${this.label} 未在 ${Math.round(firstLineMs / 1000)} 秒内开始设置。` +"
        ],
        [
            "'ssh (e.g. a ProxyCommand or ProxyJump login) or a command in ' +",
            "'可能是 ssh（例如 ProxyCommand 或 ProxyJump 登录）或 ' +"
        ],
        [
            "'your shell startup files (e.g. ~/.bashrc) may be waiting for input.'",
            "'shell 启动文件（例如 ~/.bashrc）中的命令正在等待输入。'"
        ],
        ["\"Couldn't answer ssh's prompt.\"", "'无法应答 ssh 的提示。'"],
        [
            "`Could not run \"${sshBin}\". Install OpenSSH or set ANTIGRAVITY_SSH_BIN.`",
            "`无法运行“${sshBin}”。请安装 OpenSSH 或设置 ANTIGRAVITY_SSH_BIN。`"
        ],
        ["`Could not run ssh: ${err.message}`", "`无法运行 ssh：${err.message}`"],
        [
            "`ssh could not listen on its SOCKS port ${this.socksPort}.`",
            "`ssh 无法监听其 SOCKS 端口 ${this.socksPort}。`"
        ],
        [
            "`${this.label} asked for an upload it can't need.`",
            "`${this.label} 请求了不必要的上传。`"
        ],
        [
            "`${this.label} sent a line longer than ${MAX_LINE_CHARS} characters.`",
            "`${this.label} 发送的单行超过 ${MAX_LINE_CHARS} 个字符。`"
        ],
        [
            "`Neither ${this.label} nor this computer could download the Antigravity server: ${errorMessage(err)}`",
            "`${this.label} 和这台电脑都无法下载 Antigravity 服务器：${errorMessage(err)}`"
        ],
        [
            "`The Antigravity server on ${this.label} stopped.`",
            "`${this.label} 上的 Antigravity 服务器已停止。`"
        ],
        [
            "`The connection to ${this.label} was lost: ${describeExit(code, signal, this.stderrTail)}`",
            "`与 ${this.label} 的连接已中断：${describeExit(code, signal, this.stderrTail)}`"
        ],
        [
            "'The SSH server does not allow port forwarding (AllowTcpForwarding).'",
            "'SSH 服务器不允许端口转发（AllowTcpForwarding）。'"
        ],
        [
            "`The Antigravity server on ${this.label} did not respond through the SSH tunnel (${(0, types_1.sanitizeRemoteText)(lastErr, 200)}).`",
            "`${this.label} 上的 Antigravity 服务器未通过 SSH 隧道响应（${(0, types_1.sanitizeRemoteText)(lastErr, 200)}）。`"
        ],
        [
            "`${this.label} asked to open a sign-in at ${origin} that can't finish on that host, so it was not opened.`",
            "`${this.label} 要求打开 ${origin} 的登录，但该登录无法在那台主机上完成，因此未打开。`"
        ],
        [
            "`The sign-in request of the Antigravity server on ${this.label} doesn't match what this app expects, so it was not opened. ` +",
            "`${this.label} 上的 Antigravity 服务器发出的登录请求与此应用的预期不符，因此未打开。` +"
        ],
        [
            "'Update Antigravity, or restart the server on that host.'",
            "'请更新 Antigravity，或重启那台主机上的服务器。'"
        ],
        [
            "`Local port ${port} is in use, so the sign-in callback can't ` +",
            "`本地端口 ${port} 已被占用，登录回调无法` +"
        ],
        [
            "`reach ${this.label}. Close the program using it and sign in again. ` +",
            "`到达 ${this.label}。请关闭占用该端口的程序，然后重新登录。` +"
        ],
        ["'The connection was closed.'", "'连接已关闭。'"],
        ["'Could not get a free loopback port.'", "'无法取得可用的回环端口。'"],
        [
            "const how = signal ? `signal ${signal}` : `exit code ${code}`;",
            "const how = signal ? `信号 ${signal}` : `退出代码 ${code}`;"
        ],
        [
            "? `ssh exited (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`",
            "? `ssh 已退出（${how}）：${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`"
        ],
        [": `ssh exited (${how}).`", ": `ssh 已退出（${how}）。`"]
    ],
    // SSH 主机输入框的格式校验
    'dist/remote/sshDestination.js': [
        ["'The user name before \"@\" is missing.'", "'缺少“@”前面的用户名。'"],
        ["'The user name must not start with \"-\".'", "'用户名不能以“-”开头。'"],
        ["`\"${shown}\" isn't a valid user name.`", "`“${shown}”不是有效的用户名。`"],
        ["'The host name is missing.'", "'缺少主机名。'"],
        ["'The host name must not start with \"-\".'", "'主机名不能以“-”开头。'"],
        ["`\"${host}\" isn't a valid host name.`", "`“${host}”不是有效的主机名。`"],
        [
            "`Invalid port \"${port}\": use a number from 1 to 65535.`",
            "`端口“${port}”无效：请使用 1 到 65535 之间的数字。`"
        ],
        [
            "`\"${addr}\" isn't a valid IPv6 address. Write an IPv6 address with a port in brackets, for example [::1]:2222.`",
            "`“${addr}”不是有效的 IPv6 地址。带端口的 IPv6 地址请用方括号括起，例如 [::1]:2222。`"
        ],
        [
            "`Missing \"]\" after the IPv6 address in \"${hostPort}\".`",
            "`“${hostPort}”中的 IPv6 地址后缺少“]”。`"
        ],
        [
            "`Invalid percent-encoding in the user name \"${s}\".`",
            "`用户名“${s}”中的百分号编码无效。`"
        ],
        [
            "'Write \"@\" inside the user name of an ssh:// URI as %40.'",
            "'ssh:// URI 的用户名中如有“@”，请写成 %40。'"
        ],
        [
            "'Write an IPv6 address in an ssh:// URI in brackets, for example ssh://[::1]:2222.'",
            "'ssh:// URI 中的 IPv6 地址请用方括号括起，例如 ssh://[::1]:2222。'"
        ],
        [
            "'Enter an SSH host, for example \"devbox\" or \"user@host:2222\".'",
            "'请输入 SSH 主机，例如“devbox”或“user@host:2222”。'"
        ],
        [
            "`The SSH host is too long (at most ${MAX_DESTINATION_LENGTH} characters).`",
            "`SSH 主机过长（最多 ${MAX_DESTINATION_LENGTH} 个字符）。`"
        ],
        ["'The SSH host must not start with \"-\".'", "'SSH 主机不能以“-”开头。'"],
        [
            "'The SSH host must not contain spaces or control characters.'",
            "'SSH 主机不能包含空格或控制字符。'"
        ],
        [
            "`The SSH host must not contain ${describeChar(bad[0])}.`",
            "`SSH 主机不能包含 ${describeChar(bad[0])}。`"
        ]
    ],
    // SSH 配置文件检查结果（按中文语序改写句式）
    'dist/remote/sshConfigHosts.js': [
        ["`The SSH config file ${problem}`", "`SSH 配置文件${problem}`"],
        ["`${shown} isn't a file.`", "`（${shown}）不是文件。`"],
        [
            "`${shown} can be changed by others: it must be yours or root's, and not group- or world-writable.`",
            "`（${shown}）可被他人修改：它必须属于您或 root，且不能允许用户组或所有人写入。`"
        ],
        [
            "const NOT_CONFIG = \"isn't an SSH config file\";",
            "const NOT_CONFIG = '不是 SSH 配置文件';"
        ],
        [
            "const CHOOSE_CONFIG = 'Choose a file of ssh settings, such as ~/.ssh/config.';",
            "const CHOOSE_CONFIG = '请选择 ssh 配置文件，例如 ~/.ssh/config。';"
        ],
        [
            "const UNREADABLE = \"is saved in a way ssh can't read\";",
            "const UNREADABLE = '的保存格式 ssh 无法读取';"
        ],
        [
            "const SAVE_AS_UTF8 = 'Save it as UTF-8 without a byte-order mark.';",
            "const SAVE_AS_UTF8 = '请另存为不带字节顺序标记（BOM）的 UTF-8。';"
        ],
        ["notConfig(\"it's a binary file\")", "notConfig('这是二进制文件')"],
        ["notConfig('it holds a key or certificate')", "notConfig('其中包含密钥或证书')"],
        [
            "notConfig('it holds SSH public keys, like a .pub or authorized_keys file')",
            "notConfig('其中包含 SSH 公钥，例如 .pub 或 authorized_keys 文件')"
        ],
        [
            "notConfig('it lists SSH host keys, like known_hosts')",
            "notConfig('其中列出 SSH 主机密钥，例如 known_hosts')"
        ],
        ["why: 'it starts with a byte-order mark',", "why: '它以字节顺序标记（BOM）开头',"],
        ["why: \"it's saved as UTF-16\",", "why: '它以 UTF-16 保存',"],
        [
            "return `${file} ${what}: ${why}. ${fix}`;",
            "return `${file} ${what}：${why}。${fix}`;"
        ],
        ["invalid('must be a path on one line.')", "invalid('必须是单行路径。')"],
        ["`must be an absolute path (got ${shown}).`", "`必须是绝对路径（当前为 ${shown}）。`"],
        [
            "`must be on one of this computer's drives (got ${shown}).`",
            "`必须位于这台电脑的磁盘上（当前为 ${shown}）。`"
        ],
        ["`can't be on a network share (${shown}).`", "`不能位于网络共享上（${shown}）。`"],
        ["`${shown} doesn't exist or can't be read.`", "`（${shown}）不存在或无法读取。`"],
        [
            "`${shown} is now a link: choose the file again.`",
            "`（${shown}）现在是链接：请重新选择文件。`"
        ],
        ["`${shown} is over 4 MiB.`", "`（${shown}）超过 4 MiB。`"]
    ],
    // 连接前的主机与配置文件路径检查
    'dist/remote/sshBridge.js': [
        [
            "'The SSH config file must be a path of at most 4 KiB.'",
            "'SSH 配置文件路径最长 4 KiB。'"
        ],
        [
            "'Enter an SSH host, for example \"devbox\" or \"user@host\".'",
            "'请输入 SSH 主机，例如“devbox”或“user@host”。'"
        ]
    ],
    // Windows：在 WSL 中打开文件夹时的提示
    'dist/wsl.js': [
        [
            "`This folder belongs to the WSL distro \"${unc[1]}\", but this window is connected to \"${distro}\".`",
            "`此文件夹属于 WSL 发行版“${unc[1]}”，但此窗口连接的是“${distro}”。`"
        ],
        [
            "'This folder is on the Windows filesystem. Accessing it from WSL (via /mnt) can be slow — for best performance keep projects inside the WSL filesystem.'",
            "'此文件夹位于 Windows 文件系统中。从 WSL（通过 /mnt）访问可能较慢；为获得最佳性能，请将项目放在 WSL 文件系统中。'"
        ],
        [
            "`This location cannot be opened in WSL: ${winPath}`",
            "`无法在 WSL 中打开此位置：${winPath}`"
        ]
    ]
};

const MAIN_PROCESS_PATCH_TARGETS = Object.keys(MAIN_PROCESS_TEXT_TABLES);

function patchMainProcessModule(relPath, content) {
    const pairs = MAIN_PROCESS_TEXT_TABLES[relPath];
    if (!pairs) return content;
    let out = content;
    let hitCount = 0;
    for (const [needle, sc] of pairs) {
        const replacement = sc;
        if (out.includes(needle)) {
            out = out.split(needle).join(replacement);
            hitCount++;
        }
    }
    if (hitCount > 0) {
        console.log(`[修改] 已向 ${relPath} 注入原生弹窗/界面汉化（${hitCount} 处）`);
    }
    return out;
}

module.exports = {
    patchPreloadJs,
    patchUtilsJs,
    patchMenuJs,
    patchTrayJs,
    patchLoadingOverlayJs,
    patchUpdaterJs,
    patchMainProcessModule,
    MAIN_PROCESS_PATCH_TARGETS
};
