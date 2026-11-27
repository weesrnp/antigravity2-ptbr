(() => {
    if (typeof window !== 'undefined' && typeof window.__agCnRuntimeStart === 'function') {
        window.__agCnRuntimeStart();
        return;
    }
    const map = new Map(Object.entries(DICT_PLACEHOLDER));
    const lowerMap = new Map();
    const LOWER_WORDS_EXCLUDE = new Set(['on', 'in', 'to', 'at', 'by', 'for', 'with', 'as', 'system', 'review', 'active', 'browser', 'global', 'including', 'and', 'or', 'file', 'files', 'help', 'app', 'plan', 'search', 'coordinator', 'verify', 'applied', 'chosen', 'failed', 'move', 'never', 'resolve', 'self', 'context usage', 'navigation', 'suggestions', 'recommended', 'days', 'arguments', 'output', 'result', 'response', 'input', 'parameters', 'folder', 'drive', 'steps', 'step', 'automation']);
    for (const [k, v] of map.entries()) {
        const lowerK = k.toLowerCase();
        if (LOWER_WORDS_EXCLUDE.has(lowerK) && k !== lowerK) {
            continue;
        }
        lowerMap.set(lowerK, v);
    }

    const longEntries = Array.from(map.entries())
        .filter(([k]) => k.length > 15 && k.includes(' '))
        .sort((a, b) => b[0].length - a[0].length)
        .map(([k, v]) => [k, v, k.toLowerCase()]);
    const translatedValues = new WeakMap();
    const unchangedTextValues = new WeakMap();
    const longMissCache = new WeakMap();
    const originalParentTexts = new WeakMap();
    const dfsParentTexts = new WeakMap();

    // 轻量级安全隔离：跳过脚本、样式、代码块(pre/code)
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'PRE', 'CODE'];

    // 代码、富文本输入框及对话内容隔离选择器：排除 Lexical 输入框、用户消息、AI 响应正文、思考内容、代码块、终端及文件路径
    const CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .code-block, .line-content, [aria-label="File Viewer"], [aria-label="文件查看器"], [aria-label="檔案檢視器"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], .font-mono, [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-row-history"] span.truncate, [translate="no"], .notranslate, .md-divider-spacing, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], [data-testid="thinking-collapsible-trigger"] + div, [data-testid="thinking-collapsible-trigger"] ~ div, .msg-body, .sys-text, .node-label, .raw-meta .path, .o2-mauth, .hv-nm, .o2-wchip.bee > span:last-child, .o2-m[data-o2who]:not(.all) > span:last-child';
    const HARD_CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .line-content, [aria-label="File Viewer"], [aria-label="文件查看器"], [aria-label="檔案檢視器"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-row-history"] span.truncate, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], .msg-body, .sys-text, .node-label, .raw-meta .path, .o2-mauth, .hv-nm, .o2-wchip.bee > span:last-child, .o2-m[data-o2who]:not(.all) > span:last-child';
    const RAW_CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .line-content, [aria-label="File Viewer"], [aria-label="文件查看器"], [aria-label="檔案檢視器"], [class*="diffEditor"], .token, .hljs, [class*="mtk"], [data-testid="planner-response-text"], [data-testid="user-input-step"], [data-testid="conversation-row-sidebar"], [data-testid="conversation-row-history"], .msg-body, .sys-text, .node-label';
    const TOOL_CODE_BOX_SELECTOR = 'pre, code, .code-block, .hljs, .code-line, .line-content, .cm-editor, .monaco-editor, .font-mono, .terminal, .xterm, [class*="language-"], [class*="mtk"]';

    // 字体图标容器：文本内容是图标名称，不是界面文字
    const ICON_FONT_SELECTOR = '.google-symbols, .material-symbols-outlined, .material-symbols-rounded, .material-symbols-sharp, .material-icons';
    // Antigravity 2.35.1 内置 SVG 表缺少、会退回字体渲染的图标（由 main.js 图标组件与 icon 属性比对得出）
    const ICON_FONT_FALLBACK_PATHS = {
        restore_page: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
        comment: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
        format_quote: ['M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z', 'M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z'],
        laptop_shield: ['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16', 'M12 8l3 1.2v1.8c0 1.6-1.3 2.7-3 3.2-1.7-.5-3-1.6-3-3.2V9.2z']
    };
    // 权限预设胶囊按钮短标签 [简体, 繁体]
    const PERMISSION_PILL_LABELS = {
        'Request Review': ['请求审查', '請求審查'],
        'Default': ['默认', '預設'],
        'Auto': ['自动', '自動'],
        'Turbo': ['极速', '極速'],
        // 「Full machine」的短标签；词典里的 Machine 指云端运行环境，不适用于此
        'Machine': ['整机', '全機']
    };
    function isCodeOrEditor(node, forAttribute) {
        try {
            if (!node) return false;
            let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            if (!el && typeof node.getRootNode === 'function') {
                el = node.getRootNode().host || null;
            }
            if (!el) return false;
            const isFormFieldAttr = Boolean(forAttribute && node.nodeType === Node.ELEMENT_NODE && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'));
            if (!isFormFieldAttr && el.isContentEditable) return true;
            if (node.nodeType === Node.TEXT_NODE && el) {
                if (el.tagName === 'TEXTAREA') return true;
                if (el.tagName === 'OPTION' && !el.hasAttribute('value')) return true;
            }
            if (!isFormFieldAttr) {
                const active = document.activeElement;
                if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active.getAttribute && active.getAttribute('data-lexical-editor') === 'true')) && (active === el || active.contains(el))) {
                    return true;
                }
            }
            while (el) {
                if (!(isFormFieldAttr && el === node) && el.isContentEditable) return true;
                if (typeof el.closest === 'function' && el.closest(CODE_ISOLATION_SELECTOR)) {
                    return true;
                }
                const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
                el = (root && root.host) ? root.host : null;
            }
            return false;
        } catch (e) {
            return true;
        }
    }

    function norm(s) {
        if (!s) return '';
        return s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').trim();
    }

    function translateWithShortcut(val) {
        if (!val) return null;
        const match = val.match(/^(.+?)\s*\(((?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+?[^)]*|Enter|Escape|Esc|Space|Tab|Backspace|Delete|⏎|←|→|↑|↓|Aa|ab|\.\*|-|[a-zA-Z])\)$/i);
        if (match) {
            const prefix = match[1].trim();
            const normPref = norm(prefix);
            const lowerPref = normPref.toLowerCase();
            let transPref = null;
            if (map.has(normPref)) {
                transPref = map.get(normPref);
            } else if (lowerMap.has(lowerPref)) {
                transPref = lowerMap.get(lowerPref);
            }
            if (transPref) {
                return transPref + " (" + match[2] + ")";
            }
        }
        return null;
    }

    // ==========================================
    // 原生系统右键菜单 (Native Context Menu) 汉化拦截
    // ==========================================
    const CONTEXT_MENU_EXTRA_MAP = {
        remove: ['移除', '移除'],
        replace: ['替换', '取代'],
        hide: ['隐藏', '隱藏'],
        show: ['显示', '顯示'],
        create: ['创建', '建立'],
        apply: ['应用', '套用'],
        reply: ['回复', '回覆'],
        duplicate: ['创建副本', '建立副本'],
        inspect: ['检查', '檢查'],
        'inspect element': ['检查元素', '檢查元素'],
        find: ['查找', '尋找'],
        cut: ['剪切', '剪下'],
        paste: ['粘贴', '貼上'],
        'paste and match style': ['粘贴并匹配样式', '貼上並符合樣式'],
        'select all': ['全选', '全選'],
        open: ['打开', '開啟'],
        'open in terminal': ['在终端中打开', '在終端機中開啟'],
        'copy relative path': ['复制相对路径', '複製相對路徑'],
        'move to trash': ['移至废纸篓', '移至垃圾桶'],
        'close others': ['关闭其他标签页', '關閉其他分頁'],
        'close all': ['关闭全部', '全部關閉'],
        'close to the right': ['关闭右侧标签页', '關閉右側分頁']
    };

    function translateContextMenuLabel(label) {
        if (!label || typeof label !== 'string') return label;
        let trimmed = norm(label);
        if (!trimmed) return label;

        let isDefault = false;
        if (/\s*\((?:Default|預設|默认)\)$/i.test(trimmed)) {
            trimmed = trimmed.replace(/\s*\((?:Default|預設|默认)\)$/i, '').trim();
            isDefault = true;
        }

        let translated = null;
        const shortcutTrans = translateWithShortcut(trimmed);
        const lowTrimmed = trimmed.toLowerCase();
        if (shortcutTrans) {
            translated = shortcutTrans;
        } else if (map.has(trimmed)) {
            translated = map.get(trimmed);
        } else if (lowerMap.has(lowTrimmed)) {
            translated = lowerMap.get(lowTrimmed);
        } else if (Object.prototype.hasOwnProperty.call(CONTEXT_MENU_EXTRA_MAP, lowTrimmed)) {
            translated = CONTEXT_MENU_EXTRA_MAP[lowTrimmed][0];
        } else {
            translated = translateExactOrDynamic(trimmed);
        }

        if (translated) {
            return isDefault ? (translated + (" (默认)")) : translated;
        } else if (isDefault) {
            return trimmed + (" (默认)");
        }
        return label;
    }

    function translateContextMenuItems(items) {
        if (!Array.isArray(items)) return items;
        return items.map(item => {
            if (!item || typeof item !== 'object') return item;
            const newItem = Object.assign({}, item);
            if (newItem.label) {
                newItem.label = translateContextMenuLabel(newItem.label);
            }
            if (Array.isArray(newItem.submenu)) {
                newItem.submenu = translateContextMenuItems(newItem.submenu);
            }
            if (Array.isArray(newItem.items)) {
                newItem.items = translateContextMenuItems(newItem.items);
            }
            return newItem;
        });
    }

    function hookNativeContextMenu() {
        try {
            const electronModule = typeof electron_1 !== 'undefined' ? electron_1 : (typeof require === 'function' ? require('electron') : null);
            if (electronModule && electronModule.ipcRenderer && !electronModule.ipcRenderer._cnContextMenuHooked) {
                electronModule.ipcRenderer._cnContextMenuHooked = true;
                const origInvoke = electronModule.ipcRenderer.invoke.bind(electronModule.ipcRenderer);
                electronModule.ipcRenderer.invoke = function(channel, ...args) {
                    if (channel === 'window:show-context-menu' && Array.isArray(args[0])) {
                        try {
                            args[0] = translateContextMenuItems(args[0]);
                        } catch (e) {}
                    }
                    return origInvoke(channel, ...args);
                };
            }
        } catch (e) {}

        try {
            if (typeof window !== 'undefined' && window.electronNative && !window.electronNative._cnContextMenuHooked) {
                const origShow = window.electronNative.showContextMenu;
                if (typeof origShow === 'function') {
                    window.electronNative._cnContextMenuHooked = true;
                    window.electronNative.showContextMenu = function(items) {
                        try {
                            items = translateContextMenuItems(items);
                        } catch (e) {}
                        return origShow.call(this, items);
                    };
                }
            }
        } catch (e) {}
    }

    hookNativeContextMenu();

    function isFilePathOrUri(s) {
        if (!s) return false;
        return /^[a-zA-Z]:[\\/]/.test(s) || /^[\\/~].*[\\/]/.test(s) || /[\\/]SKILL\.md/i.test(s) || /[\\/]\.gemini[\\/]/i.test(s) || /^file:\/\//i.test(s);
    }

    const UNIT_MAP = {
        s: ['秒', '秒'],
        m: ['分钟', '分鐘'],
        h: ['小时', '小時'],
        d: ['天', '天'],
        w: ['周', '週'],
        mo: ['个月', '個月'],
        yr: ['年', '年']
    };

    const UNIT_ALIAS_TO_KEY = {
        year: 'yr', years: 'yr', yr: 'yr',
        month: 'mo', months: 'mo', mo: 'mo',
        week: 'w', weeks: 'w', w: 'w',
        day: 'd', days: 'd', d: 'd',
        hour: 'h', hours: 'h', h: 'h',
        minute: 'm', minutes: 'm', min: 'm', m: 'm',
        second: 's', seconds: 's', sec: 's', s: 's'
    };

    function formatUsageDuration(value) {
        const text = value.trim();
        const tokens = /([0-9]+(?:\.[0-9]+)?)\s*(years?|yr|months?|mo|weeks?|w|days?|d|hours?|h|minutes?|min|m|seconds?|sec|s)(?![a-z])/gi;
        const parts = [];
        let end = 0;
        const langIdx = 0;
        for (const match of text.matchAll(tokens)) {
            const gap = text.slice(end, match.index);
            if (!/^[\s,]*$/.test(gap) && !(end === 0 && gap.trim() === '<')) return null;
            const unitKey = UNIT_ALIAS_TO_KEY[match[2].toLowerCase()] || 's';
            const name = UNIT_MAP[unitKey][langIdx];
            parts.push((end === 0 && gap.trim() === '<' ? '<' : '') + match[1] + ' ' + name);
            end = match.index + match[0].length;
        }
        return parts.length && !text.slice(end).trim() ? parts.join(' ') : null;
    }

    function translateLimitLabel(raw) {
        const s = raw.trim();
        if (/^daily\s+limit$/i.test(s)) return '每日限额';
        if (/^weekly\s+limit$/i.test(s)) return '每周限额';
        if (/^monthly\s+limit$/i.test(s)) return '每月限额';
        const m = s.match(/^([0-9]+)(?:[- ]*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|wk|weeks?))\s+limit$/i);
        if (m) {
            const unit = m[2].toLowerCase();
            const unitName = /^(?:w|wk|weeks?)$/.test(unit) ? ('周')
                : /^(?:d|days?)$/.test(unit) ? '天'
                : /^(?:h|hr|hours?)$/.test(unit) ? ('小时')
                : /^(?:m|min|minutes?)$/.test(unit) ? ('分钟') : '秒';
            return m[1] + ' ' + unitName + ('限额');
        }
        return null;
    }

    function translateResetPart(raw) {
        const reset = raw.trim().match(/^(?:Resets|Refreshes)\s+in\s+(.+)$/i);
        if (!reset) return null;
        const duration = formatUsageDuration(reset[1]);
        return duration ? (duration + (' 后重置')) : null;
    }

    function translateUsageText(value) {
        const combo = value.match(/^(.+?),\s*((?:resets|refreshes)\s+in\s+.+)$/i);
        if (combo) {
            const limitPart = translateLimitLabel(combo[1]) || map.get(combo[1].trim()) || lowerMap.get(combo[1].trim().toLowerCase());
            const resetPart = translateResetPart(combo[2]);
            if (limitPart && resetPart) return limitPart + '，' + resetPart;
        }
        const limitLabel = translateLimitLabel(value);
        if (limitLabel) return limitLabel;
        const remaining = value.match(/^([0-9]+(?:\.[0-9]+)?\s*%|%)\s+left$/i);
        if (remaining) return remaining[1] + (' 剩余');
        const reset = translateResetPart(value);
        if (reset) return reset;
        return null;
    }

    function isModelMenuText(node) {
        const el = node.parentElement;
        if (!el || typeof el.closest !== 'function') return false;
        if (el.closest('[data-testid="model-selector-panel"], [data-testid="model-selector-item"], [data-testid="model-selector-custom-item"], [data-testid="model-selector-orchestrator"]')) {
            return true;
        }
        const menu = el.closest('[role="menu"]');
        if (!menu) return false;
        let label = menu.getAttribute('aria-label');
        if (!label) {
            const root = menu.getRootNode();
            label = (menu.getAttribute('aria-labelledby') || '').trim().split(/\s+/).map(id => {
                const target = (root.getElementById && root.getElementById(id)) || document.getElementById(id);
                return target ? (target.getAttribute('aria-label') || target.textContent || '') : '';
            }).join(' ');
        }
        return /^(Select model|选择模型|選擇模型)/i.test(norm(label || ''));
    }

    function refreshMenusLabelledBy(target) {
        if (!target.id) return;
        const roots = new Set([document, target.getRootNode()]);
        for (const root of roots) {
            if (!root.querySelectorAll) continue;
            for (const menu of root.querySelectorAll('[role="menu"][aria-labelledby]')) {
                if ((menu.getAttribute('aria-labelledby') || '').split(/\s+/).includes(target.id)) {
                    translateNode(menu);
                }
            }
        }
    }

    // ==========================================
    // 声明式动态正则规则表 (Table-Driven Dynamic Rules)
    // ==========================================
    function formatCompactDuration(str) {
        const langIdx = 0;
        return String(str || '').trim().replace(/(\d+)\s*(d|h|m|s)\b/gi, (_, num, u) => {
            const pair = UNIT_MAP[u.toLowerCase()];
            return num + ' ' + (pair ? pair[langIdx] : u);
        });
    }

    const SCOPED_SWARM_MAP = {
        'Board': ['看板', '看板'],
        'Graph': ['关系图', '關係圖'],
        'Raw': ['原始数据', '原始資料'],
        'Reconnecting': ['正在重连', '正在重新連線'],
        'Replay': ['回放', '重播'],
        'Follow': ['跟随', '跟隨'],
        'Latest': ['最新', '最新'],
        'Channels': ['频道', '頻道'],
        'Filters': ['筛选', '篩選'],
        'Coordinator': ['协调器', '協調器'],
        'Waiting': ['等待中', '等待中'],
        'Retired': ['已退役', '已退役'],
        'Paused': ['已暂停', '已暫停'],
        'Working...': ['工作中...', '工作中...'],
        'Working': ['工作中', '工作中'],
        'Empty.': ['暂无内容。', '尚無內容。'],
        '(empty)': ['（空）', '（空）'],
        'stale': ['已过期', '已過期'],
        'system:': ['系统：', '系統：'],
        'Goal': ['目标', '目標'],
        'Team': ['团队', '團隊'],
        'Threads': ['工作线', '討論串'],
        'Now': ['当前', '目前'],
        'Progress': ['进度', '進度'],
        'Tasks': ['任务', '任務'],
        'Other': ['其他', '其他'],
        'Moving': ['推进中', '推進中'],
        'Reply': ['回复', '回覆'],
        'Frames': ['画面', '畫面'],
        'All': ['全部', '全部'],
        'all channels': ['全部频道', '全部頻道'],
        'Remote': ['远程', '遠端'],
        'updating': ['更新中', '更新中'],
        'watching': ['监听中', '監聽中'],
        'stopped': ['已停止', '已停止'],
        'Needs you': ['待你处理', '待你處理'],
        'Not started': ['未开始', '尚未開始'],
        'Blocked': ['受阻', '受阻'],
        'Running': ['运行中', '執行中'],
        'Done': ['已完成', '已完成'],
        'Open': ['打开', '開啟'],
        'Active': ['活跃', '執行中'],
        'Killed': ['已终止', '已終止'],
        'queued': ['排队中', '排隊中'],
        'running': ['运行中', '執行中'],
        'blocked': ['受阻', '受阻'],
        'done': ['已完成', '已完成'],
        'active': ['活跃', '執行中'],
        'paused': ['已暂停', '已暫停'],
        'Hive': ['蜂巢', '蜂巢'],
        'Tasks done': ['任务已完成', '任務已完成'],
        'Message just sent': ['刚发送消息', '剛傳送訊息'],
        'Waiting on': ['等待中', '正在等待'],
        'Stuck': ['已卡住', '受阻'],
        'Resting': ['休息中', '休息中'],
        'Latest action': ['最新动作', '最新動作'],
        'Zoom': ['缩放', '縮放']
    };

    const SWARM_UI_SELECTOR = '[data-testid^="swarm-"], .o2, .player, .graph-legend, .raw-toolbar, #tab-overview, #tab-hive, #tab-body-feed, #tab-body-graph, #tab-body-raw, #swarm-title, #replay-label';
    const BUILTIN_SIDECAR_SELECTOR = '[data-testid^="swarm-"], .o2, .graph-legend, .raw-toolbar, #tab-overview, #tab-hive, #tab-body-feed, #tab-body-graph, #tab-body-raw, #swarm-title, #replay-label, #ov-notice, #ov-ack';
    let subframeActivated = false;

    function isSubframeWindow() {
        try {
            return typeof window !== 'undefined' && Boolean(window.top) && window !== window.top;
        } catch (e) {
            return true;
        }
    }

    function isBuiltInSidecarDocument() {
        try {
            if (typeof location !== 'undefined' && location && /^plugin:$/i.test(location.protocol || '') && /^swarm(?:-|$)/i.test(location.hostname || '')) {
                return true;
            }
        } catch (e) {}
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return false;
        if (document.querySelector(BUILTIN_SIDECAR_SELECTOR)) return true;
        const emptyBody = document.querySelector('#empty-body');
        if (emptyBody && /swarm/i.test(emptyBody.textContent || '')) return true;
        return false;
    }

    const TOOL_CALL_SECTION_LABELS = {
        'arguments': ['参数', '參數'],
        'output': ['输出', '輸出'],
        'result': ['结果', '結果'],
        'response': ['响应', '回應'],
        'input': ['输入', '輸入'],
        'parameters': ['参数', '參數'],
        'tool arguments': ['工具参数', '工具參數'],
        'tool output': ['工具输出', '工具輸出'],
        'tool result': ['工具结果', '工具結果'],
        'return value': ['返回值', '傳回值'],
        'tool response': ['工具响应', '工具回應'],
        'command output': ['命令输出', '指令輸出']
    };

    function lookupToolCallSectionLabel(valNorm) {
        if (!valNorm) return null;
        const hasColon = valNorm.endsWith(':');
        const base = (hasColon ? valNorm.slice(0, -1) : valNorm).trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(TOOL_CALL_SECTION_LABELS, base)) return null;
        const pair = TOOL_CALL_SECTION_LABELS[base];
        return pair[0] + (hasColon ? '：' : '');
    }

    function translateTruncatedNotice(valNorm) {
        if (!valNorm) return null;
        const mMore = valNorm.match(/^(\.\.\.\s*)?([\d,]+)\s+more\s+(lines?|characters?|chars?|bytes?|items?),\s*truncated for display\.?$/i);
        if (mMore) {
            const uLow = mMore[3].toLowerCase();
            const uZh = uLow.startsWith('line') ? '行'
                : (uLow.startsWith('char') ? ('个字符')
                : (uLow.startsWith('byte') ? ('个字节')
                : ('项')));
            return (mMore[1] ? '... ' : '') + (('还有 ' + mMore[2] + ' ' + uZh + '，已截断显示。'));
        }
        const mBare = valNorm.match(/^(\.\.\.\s*)?truncated for display\.?$/i);
        if (mBare) {
            return (mBare[1] ? '... ' : '') + ('已截断显示。');
        }
        return null;
    }

    function isInsideActualThinkingBody(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        let cur = el;
        while (cur && typeof document !== 'undefined' && cur !== document.body && cur !== document.documentElement) {
            const prev = cur.previousElementSibling;
            if (cur.tagName === 'DIV' && prev && typeof prev.matches === 'function' && prev.matches('[data-testid="thinking-collapsible-trigger"]')) {
                const trigText = norm(prev.textContent || '');
                if (/^(?:Thought|Thinking|已思考|正在思考)\b/i.test(trigText)) {
                    return true;
                }
            }
            cur = cur.parentElement;
        }
        return false;
    }

    function isCodeBoxNode(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        return (typeof el.matches === 'function' && el.matches(TOOL_CODE_BOX_SELECTOR)) ||
            (typeof el.querySelector === 'function' && Boolean(el.querySelector(TOOL_CODE_BOX_SELECTOR)));
    }

    function hasAdjacentCodeBlock(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        if ((typeof el.closest === 'function' && el.closest(HARD_CODE_ISOLATION_SELECTOR)) || isInsideActualThinkingBody(el)) return false;
        let cur = el;
        for (let d = 0; cur && d < 3 && typeof document !== 'undefined' && cur !== document.body && cur !== document.documentElement; d++, cur = cur.parentElement) {
            if (d > 0) {
                const chCount = cur.children ? cur.children.length : Array.from(cur.childNodes || []).filter(c => c.nodeType === Node.ELEMENT_NODE).length;
                if (isCodeBoxNode(cur) || norm(cur.textContent || '').length > 48 || chCount > 4) break;
            }
            if (isCodeBoxNode(cur.nextElementSibling)) return true;
        }
        const parent = el.parentElement;
        if (parent && typeof document !== 'undefined' && parent !== document.body && parent !== document.documentElement) {
            if ((typeof parent.closest === 'function' && parent.closest(HARD_CODE_ISOLATION_SELECTOR)) || isInsideActualThinkingBody(parent)) return false;
            const siblings = parent.children || Array.from(parent.childNodes || []).filter(c => c.nodeType === Node.ELEMENT_NODE);
            if (siblings.length <= 6) {
                for (const sib of siblings) {
                    if (sib !== el && typeof sib.matches === 'function' && sib.matches('pre, code, .code-block, .hljs, .cm-editor, .monaco-editor')) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function replaceElementTextNodes(el, newText) {
        if (!el || !newText) return false;
        const tNodes = Array.from(el.childNodes || []).filter(c => c.nodeType === Node.TEXT_NODE);
        if (tNodes.length === 0) return false;
        const elChildrenCount = el.children ? el.children.length : Array.from(el.childNodes || []).filter(c => c.nodeType === Node.ELEMENT_NODE).length;
        if (tNodes.length === 1) {
            if (norm(tNodes[0].nodeValue) !== norm(el.textContent || '')) return false;
            if (tNodes[0].nodeValue !== newText) {
                tNodes[0].nodeValue = newText;
                translatedValues.set(tNodes[0], newText);
            }
            return true;
        }
        if (elChildrenCount === 0) {
            for (let i = 0; i < tNodes.length; i++) {
                const targetVal = i === 0 ? newText : '';
                if (tNodes[i].nodeValue !== targetVal) {
                    tNodes[i].nodeValue = targetVal;
                }
                translatedValues.set(tNodes[i], targetVal);
            }
            return true;
        }
        return false;
    }

    function translateIsolatedToolCallChrome(container) {
        if (!container || container.nodeType !== Node.ELEMENT_NODE || container.isContentEditable) return;
        if (typeof container.closest === 'function' && container.closest(RAW_CODE_ISOLATION_SELECTOR)) return;
        if (isInsideActualThinkingBody(container)) return;

        const candidates = [container];
        if (typeof container.querySelectorAll === 'function') {
            for (const sub of container.querySelectorAll('div, span, p, em, i, strong, b, h1, h2, h3, h4, h5, h6, label, summary, button, dt, dd')) {
                candidates.push(sub);
            }
        }
        const strictCodeSel = 'pre, code, .code-block, .hljs, .code-line, .line-content, .cm-editor, .monaco-editor, .terminal, .xterm';
        for (const el of candidates) {
            if (!el || el.isContentEditable) continue;
            if (typeof el.closest === 'function' && el.closest(RAW_CODE_ISOLATION_SELECTOR)) continue;
            if (isInsideActualThinkingBody(el)) continue;
            if (typeof el.querySelector === 'function' && el.querySelector(strictCodeSel)) continue;
            const fullNorm = norm(el.textContent || '');
            if (!fullNorm) continue;
            const truncZh = translateTruncatedNotice(fullNorm);
            if (truncZh) {
                replaceElementTextNodes(el, truncZh);
                continue;
            }
            if (typeof el.closest === 'function' && el.closest(HARD_CODE_ISOLATION_SELECTOR)) continue;
            const secZh = lookupToolCallSectionLabel(fullNorm);
            if (secZh && hasAdjacentCodeBlock(el)) {
                replaceElementTextNodes(el, secZh);
            }
        }
    }

    function isSwarmUiContext(el) {
        try {
            let cur = el && el.nodeType === Node.ELEMENT_NODE ? el : (el && el.parentElement) || null;
            if (!cur && el && typeof el.getRootNode === 'function') {
                cur = el.getRootNode().host || null;
            }
            while (cur) {
                if (typeof cur.closest === 'function' && cur.closest(SWARM_UI_SELECTOR)) {
                    return true;
                }
                const root = typeof cur.getRootNode === 'function' ? cur.getRootNode() : null;
                cur = (root && root.host) ? root.host : null;
            }
        } catch (e) {}
        return false;
    }

    function translateSwarmComposite(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        const edgeMatch = trimmed.match(/^([^\s→]+)\s*→\s*([^\s:]+):\s*(\d+)\s+direct(?:,\s*(\d+)\s+via @all)?$/i);
        if (edgeMatch) {
            return edgeMatch[1] + ' → ' + edgeMatch[2] + '：' + edgeMatch[3] + ' 次直接提及' +
                (edgeMatch[4] ? ('，' + edgeMatch[4] + (' 次通过 @all')) : '');
        }
        const outsiderMatch = trimmed.match(/^(\S+)\s+\(not on the roster\)$/i);
        if (outsiderMatch) {
            return outsiderMatch[1] + ('（不在成员名单中）');
        }
        const sharedBoardMatch = trimmed.match(/^Shared\s+(.+?)\s+board(?:\s+(.*))?$/i);
        if (sharedBoardMatch) {
            return ('共享 ') + sharedBoardMatch[1] + ' 看板' + (sharedBoardMatch[2] ? ' ' + sharedBoardMatch[2] : '');
        }
        const runsOnMatch = trimmed.match(/^Runs on\s+(.+)$/);
        if (runsOnMatch) {
            return ('运行于 ') + runsOnMatch[1];
        }
        const errMatch = trimmed.match(/^Error:\s*(.+)$/i);
        if (errMatch) {
            return ('错误：') + errMatch[1];
        }
        const openMemberMatch = trimmed.match(/^Open\s+(@?[a-z0-9][a-z0-9._-]*)$/);
        if (openMemberMatch) {
            return ('打开 ') + openMemberMatch[1];
        }
        const workingForMatch = trimmed.match(/^Working for\s+(@\S+)$/i);
        if (workingForMatch) {
            return ('正在为 ' + workingForMatch[1] + ' 工作');
        }
        const waitingOnMemberMatch = trimmed.match(/^Waiting on\s+(@\S+)$/i);
        if (waitingOnMemberMatch) {
            return '正在等待 ' + waitingOnMemberMatch[1];
        }
        const waitingOnCountMatch = trimmed.match(/^Waiting on\s+(\d+)$/i);
        if (waitingOnCountMatch) {
            return ('正在等待 ' + waitingOnCountMatch[1] + ' 位成员');
        }
        const waitersChipMatch = trimmed.match(/^(\d+)\s+waiting on\s+(@\S+)$/i);
        if (waitersChipMatch) {
            return waitersChipMatch[1] + ' 位正在等待 ' + waitersChipMatch[2];
        }
        const ofDoneMatch = trimmed.match(/^(\d+)\s+of\s+(\d+)\s+(?:tasks\s+)?done$/i);
        if (ofDoneMatch) {
            return '已完成 ' + ofDoneMatch[1] + ' / ' + ofDoneMatch[2] + (' 项');
        }
        const beeCountMatch = trimmed.match(/^(\d+)\s+bees?$/i);
        if (beeCountMatch) {
            return beeCountMatch[1] + (' 位成员');
        }
        const chipSummaryMatch = trimmed.match(/^(\d+)\s+(stuck|needs?\s+you|in\s+review|active|working|waiting|done|threads?\s+open)$/i);
        if (chipSummaryMatch) {
            const cnt = chipSummaryMatch[1];
            const k = chipSummaryMatch[2].toLowerCase().replace(/\s+/g, ' ');
            if (k === 'stuck') return cnt + (' 项卡住');
            if (k === 'needs you' || k === 'need you') return cnt + (' 项待您处理');
            if (k === 'in review') return cnt + (' 项审查中');
            if (k === 'active') return cnt + (' 项活跃');
            if (k === 'working') return cnt + (' 个工作中');
            if (k === 'waiting') return cnt + (' 个等待中');
            if (k === 'done') return cnt + (' 个已完成');
            return cnt + (' 条工作线进行中');
        }
        const liveTipMatch = trimmed.match(/^(Thinking|Latest action):\s*(.+)$/s);
        if (liveTipMatch) {
            const lbl = liveTipMatch[1] === 'Thinking'
                ? '思考中：'
                : ('最新动作：');
            return lbl + liveTipMatch[2];
        }
        const lastSeenMatch = trimmed.match(/^last seen\s+(.+)\s+ago$/i);
        if (lastSeenMatch) {
            const dur = formatCompactDuration(lastSeenMatch[1]);
            return ('最近活跃于 ') + dur + ' 前';
        }
        const sysAlertMatch = trimmed.match(/^@(\S+)\s+(ran out of quota|looks stuck|hit an error)$/i);
        if (sysAlertMatch) {
            const k = sysAlertMatch[2].toLowerCase();
            const msg = k === 'ran out of quota'
                ? (' 配额已耗尽')
                : k === 'looks stuck' ? ' 似乎卡住了' : (' 发生错误');
            return '@' + sysAlertMatch[1] + msg;
        }
        const exportPctMatch = trimmed.match(/^Exporting\s+(\d+%)$/i);
        if (exportPctMatch) {
            return ('正在导出 ') + exportPctMatch[1];
        }
        const exportFileMatch = trimmed.match(/^(Exporting|Rendering)\s+(.+?)(?:\.\.\.|…)$/i);
        if (exportFileMatch) {
            const verb = exportFileMatch[1].toLowerCase() === 'exporting'
                ? ('正在导出 ')
                : ('正在渲染 ');
            return verb + exportFileMatch[2] + '…';
        }
        const exportedMatch = trimmed.match(/^Exported\s+(.+?)\s+\((.+)\)$/i);
        if (exportedMatch) {
            const meta = translateSwarmComposite(exportedMatch[2]) || exportedMatch[2];
            return ('已导出 ') + exportedMatch[1] + '（' + meta + '）';
        }
        const downloadMatch = trimmed.match(/^Download\s+(.+)$/i);
        if (downloadMatch) {
            return ('下载 ') + downloadMatch[1];
        }
        const replayTitleMatch = trimmed.match(/^(.+?)\s+graph replay$/i);
        if (replayTitleMatch) {
            return replayTitleMatch[1] + (' 关系图回放');
        }
        const narratorFailMatch = trimmed.match(/^The narrator's last step failed:\s*(.+)$/i);
        if (narratorFailMatch) {
            return ('解说员最后一步失败：') + narratorFailMatch[1];
        }
        const noPostsTipMatch = trimmed.match(/^([^:]+):\s*No posts yet$/i);
        if (noPostsTipMatch) {
            return noPostsTipMatch[1] + ('：暂无消息');
        }
        if (!raw.includes('·') && !raw.includes('\n')) return null;
        let changed = false;
        const lines = raw.split('\n').map(line => {
            const ln = norm(line);
            if (map.has(ln)) {
                changed = true;
                return map.get(ln);
            }
            if (!line.includes(' · ')) return line;
            const segs = line.split(' · ').map(seg => {
                const s = seg.trim();
                if (s === 'Coordinator') { changed = true; return '协调器'; }
                if (s === 'Working') { changed = true; return '工作中'; }
                if (s === 'Active') { changed = true; return '活跃'; }
                if (s === 'Waiting') { changed = true; return '等待中'; }
                if (s === 'Killed') { changed = true; return '已终止'; }
                if (s === 'Swarm start') { changed = true; return '蜂群启动'; }
                if (/^\d+\s+posts?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+posts?$/i, (_, n) => n + (' 条消息')); }
                if (/^\d+\s+members?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+members?$/i, (_, n) => n + (' 位成员')); }
                if (/^\d+\s+frames?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+frames?$/i, (_, n) => n + (' 帧')); }
                if (/^\d+\s+steps?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+steps?$/i, '$1 步'); }
                if (/^\d+\s+unaddressed$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unaddressed$/i, (_, n) => n + (' 条未指定对象')); }
                if (/^\d+\s+unread$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unread$/i, (_, n) => n + (' 条未读')); }
                if (/^runs on\s+(.+)$/i.test(s)) { changed = true; return s.replace(/^runs on\s+(.+)$/i, (_, h) => ('运行于 ') + h); }
                if (Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, s)) { changed = true; return SCOPED_SWARM_MAP[s][0]; }
                if (!s.includes('·') && !s.includes('\n')) {
                    const sub = translateSwarmComposite(s);
                    if (sub !== null) { changed = true; return sub; }
                }
                return seg;
            });
            return segs.join(' · ');
        });
        return changed ? lines.join('\n') : null;
    }

    function translatePermissionChoice(value) {
        if (typeof value !== 'string') return null;

        const saveRule = value.match(/^\s*Yes,\s+save rule for\s+('[\s\S]*'|"[\s\S]*")\s+(in this conversation|globally)\s*$/i);
        if (saveRule) {
            const pattern = saveRule[1];
            const isConv = saveRule[2].toLowerCase() === 'in this conversation';
            return isConv ? ('是，在此会话中为 ' + pattern + ' 保存规则') : ('是，全局为 ' + pattern + ' 保存规则');
        }

        const match = value.match(/^\s*Yes,\s+and always allow\s+([\s\S]+)$/i);
        if (!match || /^in this (?:project|conversation)$/i.test(norm(match[1]))) return null;

        // 客户端在命令外层引号之后追加作用域，需先保留命令原文再拼接范围前缀
        const scoped = match[1].match(/^('[\s\S]*'|"[\s\S]*")\s+in this (project|conversation)\s*$/i);
        const command = scoped ? scoped[1] : match[1].trimEnd();
        const scope = scoped && scoped[2] ? scoped[2].toLowerCase() : '';
        if (scope === 'conversation') return '是，且在此会话中始终允许运行 ' + command;
        if (scope === 'project') return '是，且在此项目中始终允许运行 ' + command;
        return '是，且始终允许运行 ' + command;
    }

    function lookupDict(s) {
        const k = norm(s);
        return map.get(k) || lowerMap.get(k.toLowerCase()) || null;
    }

    const ENTITY_NOUN_MAP = {
        project: ['项目', '專案'],
        projects: ['项目', '專案'],
        workspace: ['工作区', '工作區'],
        workspaces: ['工作区', '工作區'],
        folder: ['文件夹', '資料夾'],
        folders: ['文件夹', '資料夾'],
        rule: ['规则', '規則'],
        rules: ['规则', '規則'],
        workflow: ['工作流', '工作流程'],
        workflows: ['工作流', '工作流程'],
        agent: ['智能体', '代理'],
        agents: ['智能体', '代理'],
        subagent: ['子智能体', '子代理'],
        subagents: ['子智能体', '子代理'],
        group: ['分组', '群組'],
        bundle: ['套件', '套件'],
        bundles: ['套件', '套件'],
        plugin: ['插件', '外掛程式'],
        plugins: ['插件', '外掛程式'],
        skill: ['技能', '技能'],
        skills: ['技能', '技能'],
        server: ['服务器', '伺服器'],
        servers: ['服务器', '伺服器'],
        'mcp server': ['MCP 服务器', 'MCP 伺服器'],
        'mcp servers': ['MCP 服务器', 'MCP 伺服器'],
        site: ['网站', '網站'],
        sites: ['网站', '網站'],
        host: ['主机', '主機'],
        hosts: ['主机', '主機'],
        account: ['账户', '帳戶'],
        secret: ['密钥', '密鑰'],
        shortcut: ['快捷键', '快速鍵'],
        shortcuts: ['快捷键', '快速鍵'],
        conversation: ['会话', '對話'],
        conversations: ['会话', '對話'],
        'side question': ['侧边提问', '側邊提問'],
        automation: ['自动化任务', '自動化任務'],
        'scheduled task': ['定时任务', '排程任務'],
        file: ['文件', '檔案'],
        files: ['文件', '檔案'],
        tab: ['标签页', '分頁'],
        window: ['窗口', '視窗'],
        panel: ['面板', '面板'],
        terminal: ['终端', '終端機'],
        recording: ['录音', '錄音'],
        recordings: ['录音', '錄音'],
        voice: ['声音', '聲音'],
        model: ['模型', '模型'],
        models: ['模型', '模型'],
        environment: ['环境', '環境'],
        artifact: ['产物', '成品'],
        plan: ['计划', '計畫'],
        comment: ['评论', '評論'],
        preview: ['预览', '預覽'],
        browser: ['浏览器', '瀏覽器'],
        'virtual machine': ['虚拟机', '虛擬機器'],
        cookies: ['Cookie', 'Cookie'],
        app: ['应用', '應用程式'],
        apps: ['应用', '應用程式'],
        command: ['命令', '指令'],
        commands: ['命令', '指令'],
        result: ['结果', '結果'],
        results: ['结果', '結果'],
        item: ['项目', '項目'],
        items: ['项目', '項目'],
        extension: ['扩展', '擴充功能'],
        extensions: ['扩展', '擴充功能'],
        tool: ['工具', '工具'],
        tools: ['工具', '工具']
    };

    function translateNoun(word) {
        const k = norm(word);
        const low = k.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(ENTITY_NOUN_MAP, low)) {
            return ENTITY_NOUN_MAP[low][0];
        }
        return lookupDict(k) || k;
    }

    const ACTION_VERB_MAP = {
        add: ['添加', '新增'],
        cancel: ['取消', '取消'],
        close: ['关闭', '關閉'],
        configure: ['配置', '設定'],
        connect: ['连接', '連線'],
        delete: ['删除', '刪除'],
        disconnect: ['断开连接', '中斷連線'],
        enable: ['启用', '啟用'],
        install: ['安装', '安裝'],
        new: ['新建', '新增'],
        open: ['打开', '開啟'],
        reconnect: ['重新连接', '重新連線'],
        remove: ['移除', '移除'],
        restart: ['重启', '重新啟動'],
        stop: ['停止', '停止'],
        toggle: ['切换', '切換'],
        view: ['查看', '檢視']
    };

    const MONTH_NAME_TO_NUM = {
        january: 1, jan: 1,
        february: 2, feb: 2,
        march: 3, mar: 3,
        april: 4, apr: 4,
        may: 5,
        june: 6, jun: 6,
        july: 7, jul: 7,
        august: 8, aug: 8,
        september: 9, sept: 9, sep: 9,
        october: 10, oct: 10,
        november: 11, nov: 11,
        december: 12, dec: 12
    };

    /** Format English calendar dates into Chinese YYYY 年 M 月 D 日 (or M 月 D 日) form. */
    function formatEnglishDate(raw) {
        const s = String(raw || '').trim();
        let m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[1].toLowerCase()];
            if (mon) return m[3] + ' 年 ' + mon + ' 月 ' + parseInt(m[2], 10) + ' 日';
        }
        m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{4})$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[2].toLowerCase()];
            if (mon) return m[3] + ' 年 ' + mon + ' 月 ' + parseInt(m[1], 10) + ' 日';
        }
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
            return m[1] + ' 年 ' + parseInt(m[2], 10) + ' 月 ' + parseInt(m[3], 10) + ' 日';
        }
        m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[1].toLowerCase()];
            if (mon) return mon + ' 月 ' + parseInt(m[2], 10) + ' 日';
        }
        m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[2].toLowerCase()];
            if (mon) return mon + ' 月 ' + parseInt(m[1], 10) + ' 日';
        }
        return s;
    }

    /** Translate model selector plan/audience phrases while preserving unknown plan names. */
    function formatPlanAudience(raw) {
        const s = String(raw || '').trim();
        const low = s.toLowerCase();
        const audienceMap = {
            'all users': '所有用户',
            'everyone': '所有用户',
            'your current plan': '您当前的方案',
            'your plan': '您的方案',
            'free tier': '免费版',
            'free users': '免费版用户',
            'paid plans': '付费方案',
            'paid users': '付费用户',
            'pro users': 'Pro 用户',
            'pro plan': 'Pro 方案',
            'ultra users': 'Ultra 用户',
            'ultra plan': 'Ultra 方案',
            'plus users': 'Plus 用户',
            'enterprise users': '企业版用户',
            'team users': '团队版用户',
            'early access': '抢先体验用户',
            'google ai pro': 'Google AI Pro',
            'google ai ultra': 'Google AI Ultra',
            'ai pro': 'AI Pro',
            'ai ultra': 'AI Ultra'
        };
        if (Object.prototype.hasOwnProperty.call(audienceMap, low)) {
            return audienceMap[low];
        }
        if (/\s+and\s+/i.test(s)) {
            return s.split(/\s+and\s+/i).map(p => formatPlanAudience(p)).join(' 和 ');
        }
        return s;
    }

    function formatModelAvailability(model, timing, aud) {
        const isNow = /^now$/i.test(timing);
        const audZh = formatPlanAudience(aud);
        return model + (isNow ? ' 现已向 ' : ' 目前已向 ') + audZh + ' 开放';
    }

    const DYNAMIC_RULES = [
        // 列表展开 / 收起明细
        // 省略号跟着原文：「Show 3 more」不补「...」
        [/^Show\s+(\d+)\s+more(\s+(results?|items?|commands?|options?))?(\.\.\.|…)?$/i, (m, num, p2, type, ell) => {
            const tail = ell || '';
            if (type) {
                if (/result/i.test(type)) return (("显示另外 " + num + " 个结果")) + tail;
                if (/command/i.test(type)) return (("显示另外 " + num + " 个命令")) + tail;
                if (/item/i.test(type)) return (("显示另外 " + num + " 个项目")) + tail;
                if (/option/i.test(type)) return (("显示另外 " + num + " 个选项")) + tail;
            }
            return (("显示另外 " + num + " 个")) + tail;
        }],
        [/^Show\s+(\d+)\s+breakdown(s)?$/i, (m, num) => ("显示 " + num + " 项细目")],
        [/^Hide\s+breakdown(s)?$/i, () => "收起细目"],
        [/^Show\s+breakdown(s)?$/i, () => "显示细目"],
        [/^(?:\+\s*)?See\s+(\d+)\s+more(?:\s+(.+))?$/i, (m, num) => {
            const hasPlus = /^\+/.test(m);
            return (hasPlus ? "+ " : "") + (("展开另外 " + num + " 项"));
        }],
        [/^See\s+more\s+in\s+(.+)$/i, (m, name) => ("在 " + name + " 中展开更多")],
        [/^See all\s*\((\d+)\)$/i, (m, num) => ("显示全部 (" + num + ")")],

        // 会话删除与统计
        [/^(?:(Permanently delete)\s+)?(.+?)\s+including\s+(\d+)\s+active conversations?([.。])?$/i, (m, del, name, count, dot) => {
            const delPrefix = del ? ("永久删除 ") : "";
            const suffix = dot ? "。" : "";
            return delPrefix + name + (("（包含 " + count + " 个活跃会话）")) + suffix;
        }],
        [/^including\s+(\d+)\s+active conversations?([.。])?$/i, (m, count, dot) => (("包含 " + count + " 个活跃会话")) + (dot ? "。" : "")],
        [/^(\d+)\s+active conversations?([.。])?$/i, (m, count, dot) => ((count + " 个活跃会话")) + (dot ? "。" : "")],
        [/^Are you sure you want to delete (the |this )?project (.+?)\??$/i, (m, article, name) => ("您确定要删除项目 " + name + " 吗？")],
        [/^Marked\s+(\d+)\s+conversations?\s+as\s+read$/i, (m, count) => ("已将 " + count + " 个会话标记为已读")],
        [/^No more older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("没有更多历史消息，当前显示 " + a + " / " + b + " 条")],

        // 问候语与语音交互
        [/^Hey\s+(.+?),\s+what should we build today\??$/i, (m, name) => name.trim().toLowerCase() === 'there' ? ("嗨，今天我们要构建什么？") : (("嗨 " + name.trim() + "，今天我们要构建什么？"))],
        [/^Welcome back,\s*(.+?)\.\s*Where should we pick up\??$/i, (m, name) => ("欢迎回来，" + name.trim() + "。我们从哪里继续？")],
        [/^Welcome back\.\s*Where should we pick up\??$/i, () => "欢迎回来。我们从哪里继续？"],
        [/^Good to see you,\s*(.+?)\.\s*What's next\??$/i, (m, name) => ("很高兴见到您，" + name.trim() + "。接下来做什么？")],
        [/^Good to see you\.\s*What's next\??$/i, () => "很高兴见到您。接下来做什么？"],
        [/^Hi\s+(.+?),\s+what can we get done today\??$/i, (m, name) => ("嗨 " + name + "，今天有什么我们可以一起完成的？")],
        [/^What can we get done today\??$/i, () => "今天有什么我们可以一起完成的？"],
        [/^Good to see you(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (("很高兴见到您，" + name.trim() + "。")) : ("很高兴见到您。")],
        [/^Welcome back(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (("欢迎回来，" + name.trim() + "。")) : ("欢迎回来。")],
        [/^Hello,\s*(.+?)[.!]*$/i, (m, name) => ("你好，" + name.trim() + "。")],
        [/^Hello[.!]$/i, () => "你好。"],
        [/^Hi there[.!]*$/i, () => "您好。"],
        [/^Hi\s+([^\s.!]+)[.!]*$/i, (m, name) => name.toLowerCase() === 'there' ? "您好。" : (("嗨，" + name.trim() + "。"))],
        [/^(.+?),\s+voice\s+(\d+)\s+of\s+(\d+)$/i, (m, name, curr, total) => (name + "，音色 " + curr + " / " + total)],
        [/^Voice\s+speed,\s+([0-9.]+x)$/i, (m, spd) => ("语速，" + spd)],

        // 按钮与快捷提示
        [/^Send message\s+(Enter|⏎|\u23ce)$/i, (m, key) => ("发送消息 ") + key],
        [/^Queue message\s+(Enter|⏎|\u23ce)$/i, (m, key) => ("排队发送消息 ") + key],
        [/^Send all\s*\((\d+)\)$/i, (m, num) => ("全部发送 (" + num + ")")],
        [/^Open (Live transcript|Voice transcript),\s*(.+?)(?:\.\s*Summarizing call)?$/i, (m, kind, dur) => {
            const kZh = /^Live/i.test(kind) ? ("实时转录") : ("语音转录");
            const suffix = /Summarizing call$/i.test(m) ? ("。正在总结通话") : "";
            return ("打开") + kZh + "，" + dur + suffix;
        }],
        [/^Select all in$/i, () => "全选 "],
        [/^Uses your local clone,$/i, () => "使用本地克隆版本，"],
        [/^to have the agent generate a plan\.?$/i, () => "让智能体生成计划。"],

        // 配额刷新与 AI 额度提示
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?, (\d+) hours?\.?$/i, (m, d, h) => (d + " 天 " + h + " 小时后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?, (\d+) minutes?\.?$/i, (m, h, min) => (h + " 小时 " + min + " 分钟后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?\.?$/i, (m, d) => (d + " 天后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?\.?$/i, (m, h) => (h + " 小时后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) minutes?\.?$/i, (m, min) => (min + " 分钟后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in less than a minute\.?$/i, () => "不到 1 分钟后刷新"],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in a few seconds\.?$/i, () => "几秒后刷新"],
        [/^Available AI Credits:\s*(.+)$/i, (m, val) => ("可用 AI 额度：") + val],
        [/^Your plan's baseline quota will refresh on (.+?)\.?\s*To continue using this model now, enable AI Credit overages\.?$/i, (m, when) => ("您方案的基础配额将于 " + when + " 刷新。如需立即继续使用此模型，请启用 AI 额度超量使用。")],
        [/^You have hit your (weekly|daily|monthly|\d+-hour) limit,\s*it (?:will refresh|refreshes) in (.+?)\.\s*If on a supported paid plan, you can use AI credits in the interim(?:\s*(or upgrade to a higher tier))?\.?$/i, (m, unit, when, upgrade) => {
            const u = unit.toLowerCase();
            const uTw = u === 'weekly' ? '每週額度' : u === 'daily' ? '每日額度' : u === 'monthly' ? '每月額度' : (' ' + u.replace(/-hour$/i, '') + ' 小時');
            const uSc = u === 'weekly' ? '每周额度' : u === 'daily' ? '每日额度' : u === 'monthly' ? '每月额度' : (' ' + u.replace(/-hour$/i, '') + ' 小时');
            const dur = formatUsageDuration(when) || when;
            const upTw = upgrade ? '，或升級至更高層級' : '';
            const upSc = upgrade ? '，或升级至更高层级' : '';
            return ("您已达到" + uSc + "限制，将于 " + dur + "刷新。若您使用受支持的付费计划，可在此期间使用 AI 额度" + upSc + "。");
        }],
        [/^You have hit your (weekly|daily|monthly|\d+-hour) limit,\s*(?:so\s+)?the (weekly|daily|monthly|\d+-hour) limit does not currently apply\.\s*Your (?:weekly|daily|monthly|\d+-hour) limit will (?:(fully)\s+)?refresh in (.+?)\.?$/i, (m, hit, other, fully, when) => {
            const label = (w, tw) => {
                const l = w.toLowerCase();
                if (l === 'weekly') return tw ? '每週額度' : '每周额度';
                if (l === 'daily') return tw ? '每日額度' : '每日额度';
                if (l === 'monthly') return tw ? '每月額度' : '每月额度';
                const h = l.replace(/-hour$/i, '');
                return tw ? (' ' + h + ' 小時') : (' ' + h + ' 小时');
            };
            const hitTw = label(hit, true), otherTw = label(other, true).trimStart();
            const hitSc = label(hit, false), otherSc = label(other, false).trimStart();
            const dur = formatUsageDuration(when) || when;
            return ("您已达到" + hitSc + "限制，" + otherSc + "限制目前不适用。您的" + hitSc + "限制将于 " + dur + (fully ? "完全刷新" : "刷新") + "。");
        }],
        [/^You have used some of your (weekly|daily|monthly|\d+-hour) limit,\s*it will (?:(fully)\s+)?refresh in (.+?)\.?$/i, (m, unit, fully, when) => {
            const l = unit.toLowerCase();
            const uTw = l === 'weekly' ? '每週額度' : l === 'daily' ? '每日額度' : l === 'monthly' ? '每月額度' : (' ' + l.replace(/-hour$/i, '') + ' 小時');
            const uSc = l === 'weekly' ? '每周额度' : l === 'daily' ? '每日额度' : l === 'monthly' ? '每月额度' : (' ' + l.replace(/-hour$/i, '') + ' 小时');
            const dur = /^less than a minute$/i.test(when.trim()) ? ('不到 1 分钟') : (formatUsageDuration(when) || when);
            return ("您已使用部分" + uSc + "限制，将于 " + dur + (fully ? "完全刷新" : "刷新") + "。");
        }],
        [/^Models within this group:\s*(.+)$/i, (m, models) => ("此分组包含的模型：" + models)],
        [/^(.+?)\s+(Weekly|Daily|Monthly|Five[- ]Hour|5[- ]Hour)\s+Limit$/i, (m, prefix, unit) => {
            const u = unit.toLowerCase();
            const uTw = u === 'weekly' ? '每週上限' : u === 'daily' ? '每日上限' : u === 'monthly' ? '每月上限' : '5 小時上限';
            const uSc = u === 'weekly' ? '每周限额' : u === 'daily' ? '每日限额' : u === 'monthly' ? '每月限额' : '5 小时限额';
            return (prefix + " " + uSc);
        }],
        [/^For paid Pro plans,\s*(.+?)\s+quota is separate\.\s*Higher\s+\1\s+quota\s*\(included as part of the larger\s+(.+?)\s+quota bucket\)\s*is available on Ultra plans\.?$/i, (m, model, bucket) => ("在 Pro 付费方案中，" + model + " 配额独立计算。Ultra 方案提供更高的 " + model + " 配额（包含在更大的 " + bucket + " 配额池中）。")],
        [/^You can upgrade to (?:a|the)\s+(higher\s+)?(.+?)\s+plan to receive (?:(the highest)|higher) rate limits\.?$/i, (m, higherAdj, plan, highest) => {
            const ratePart = highest ? '最高的速率限制。' : '更高的速率限制。';
            return higherAdj
                ? ('您可以升级到更高级别的 ' + plan + ' 计划以获得' + ratePart)
                : ('您可以升级到 ' + plan + ' 计划以获得' + ratePart);
        }],
        [/^The original\s+(.+?)\s+model for advanced workflows\.?$/i, (m, model) => ("适用于高级工作流的初代 " + model + " 模型")],
        [/^Waiting for (\d+) timers$/i, (m, n) => ("正在等待 " + n + " 个计时器")],
        [/^Waiting for timer$/i, () => "正在等待计时器"],
        [/^(\d+) (subagents\/tasks|subagents?|tasks?) running$/i, (m, n, kind) => {
            const k = kind.toLowerCase();
            const lTw = k === 'subagents/tasks' ? ' 個子代理／任務' : k.startsWith('subagent') ? ' 個子代理' : ' 個任務';
            const lSc = k === 'subagents/tasks' ? ' 个子智能体/任务' : k.startsWith('subagent') ? ' 个子智能体' : ' 个任务';
            return (n + lSc + "运行中");
        }],
        [/^(\d+) subagents? blocked$/i, (m, n) => (n + " 个子智能体受阻")],

        // 预设、权限与工具 Token 预算
        [/^Learn more about (.+)$/i, (m, p) => {
            let translatedPreset = p;
            const pLow = p.toLowerCase();
            if (pLow === 'default' || pLow.includes('默认') || pLow.includes('預設')) translatedPreset = "默认 (Default)";
            else if (pLow === 'inherit global' || pLow.includes('继承全局') || pLow.includes('繼承全域')) translatedPreset = "继承全局 (Inherit Global)";
            else if (pLow === 'full machine' || pLow.includes('全机') || pLow.includes('全機')) translatedPreset = "全机访问 (Full Machine)";
            else if (pLow === 'turbo mode' || pLow.includes('极速') || pLow.includes('極速')) translatedPreset = "极速模式 (Turbo Mode)";
            else if (pLow === 'custom' || pLow.includes('自定义') || pLow.includes('自訂')) translatedPreset = "自定义 (Custom)";
            return ("了解更多关于 " + translatedPreset + " 的信息");
        }],
        [/^Yes, allow downloads from (.+) for this run$/i, (m, site) => ("是，本次运行允许从 " + site + " 下载")],
        [/^Yes, allow downloads from (.+) in this conversation$/i, (m, site) => ("是，在此会话中允许从 " + site + " 下载")],
        [/^Yes, always allow downloads from (.+)$/i, (m, site) => ("是，始终允许从 " + site + " 下载")],
        [/^Yes, allow (.+) in this conversation$/i, (m, target) => ("是，在此会话中允许 " + target)],
        [/^Yes, always allow (.+)$/i, (m, target) => ("是，始终允许 " + target)],
        [/^(\d+) tools? enabled$/i, (m, num) => (num + " 个工具已启用")],
        [/^(\d+)\s+tools?$/i, (m, num) => num + (" 个工具")],
        [/^(\d+)\s+tools?\s+·\s+sign in for more$/i, (m, num) => num + (" 个工具 · 登录以获取更多")],
        [/^(\d+)\s+tools?\s+excluded$/i, (m, num) => num + (" 个工具已排除")],
        [/^Exceeded the rules token budget\.\s+Full rule content\s+\(([\d,]+)\s+tokens?\)\s+was replaced with a lightweight file-path pointer in context\.$/i, (m, num) => ("已超出规则 Token 预算。完整规则内容 (" + num + " 个 Token) 已在上下文中替换为轻量级文件路径指针。")],
        [/^All tools in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, num) => ("此 MCP 服务器中的所有工具 (" + num + " 个 Token) 均已超出自定义项预算，并已从上下文中排除。")],
        [/^(\d+)\s+tools?\s+in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, tCount, num) => ("此 MCP 服务器中有 " + tCount + " 个工具 (" + num + " 个 Token) 超出自定义项预算，并已从上下文中排除。")],
        [/^Exceeded the customization token budget\s+\(([\d,]+)\s+tokens?\)\s+and was excluded from context\.$/i, (m, num) => ("超出自定义项 Token 预算 (" + num + " 个 Token)，已从上下文中排除。")],
        [/^(Rules|Skills|Mcp Tools): ([\d,]+) tokens$/i, (m, kind, num) => {
            const kindMap = { "Rules": "规则", "Skills": "技能", "Mcp Tools": "MCP 工具" };
            return (kindMap[kind] || kind) + "：" + num + " Token";
        }],

        // 版本、时间戳与超时报错
        [/^Version\s+([\d.]+)$/i, (m, v) => "版本 " + v],
        [/^(\d+)(s|m|h|d|w|mo|yr)\s+ago$/i, (m, num, unit) => {
            const pair = UNIT_MAP[unit.toLowerCase()];
            return num + (pair ? pair[0] : unit) + "前";
        }],
        [/^(.+?): context deadline exceeded$/i, (m, prefix) => prefix + (": 请求超时 (context deadline exceeded)")],
        [/^(.+?): i\/o timeout$/i, (m, prefix) => prefix + (": I/O 超时 (i/o timeout)")],

        // 远程 MCP 通用描述句式
        [/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i, (m, name, tools, purpose) => name + (" 远程 MCP 服务器可让您访问并运行 ") + tools + (" 工具，用于 ") + purpose],
        [/^The (.+?) remote MCP server lets you manage (.+) resources\.?$/i, (m, name, res) => name + (" 远程 MCP 服务器可让您管理 ") + res + (" 资源。")],
        [/^The (.+?) remote MCP server (allows you to|lets you) (.+)$/i, (m, name, verb, rest) => {
            const text = rest.replace(/enroll projects/gi, "注册项目")
                             .replace(/generate audit and scope reports/gi, "生成审计与范围报告")
                             .replace(/check resource enrollment statuses/gi, "检查资源注册状态")
                             .replace(/in the (.+?) region/gi, (rm, r) => ("在 " + r + " 区域"));
            return name + (" 远程 MCP 服务器允许您 ") + text;
        }],

        // 反馈、思考状态、浏览器安全警告与步骤汇总
        [/^Send feedback as(\s+(.+))?$/i, (m, p1, email) => email ? ("以 " + email + (" 身份发送反馈")) : ("以如下身份发送反馈：")],
        [/^(Thought|Thinking|Worked) for\s+(.+)$/i, (m, verb, rest) => {
            const vZh = /^Thought/i.test(verb) ? "已思考 " : (/^Thinking/i.test(verb) ? "正在思考 " : "已工作 ");
            let durPart = rest.trim();
            let updateSuffix = "";
            const updMatch = durPart.match(/^(.*?)\s*·\s*(\d+)\s+updates?$/i);
            if (updMatch) {
                durPart = updMatch[1].trim();
                updateSuffix = " · " + updMatch[2] + (" 项更新");
            }
            const dZh = durPart.replace(/(\d+)\s*h(?:ours?|r)?(?![a-z])/gi, "$1 小时").replace(/(\d+)\s*m(?:inutes?|in)?(?![a-z])/gi, "$1 分钟").replace(/(\d+)\s*s(?:econds?|ec)?(?![a-z])/gi, "$1 秒");
            return vZh + dZh + updateSuffix;
        }],
        [/^(?:(·\s*))?(\d+)\s+updates?$/i, (m, dot, num) => (dot ? " · " : "") + num + (" 项更新")],
        [/^Low contrast ratio \(([^)]+)\)\.\s*Text may be hard to read\.?$/i, (m, ratio) => ("对比度过低 (" + ratio + ")，文字可能难以阅读。")],
        [/^Preview unavailable\s*[—–-]\s*(.+)$/i, (m, reason) => ("预览不可用 — ") + reason],
        [/^Proceed to\s+(.+?)\s+\(unsafe\)$/i, (m, host) => ("继续前往 " + host + "（不安全）")],
        [/^\(?for example, passwords, messages, or credit cards\)?\.?$/i, () => "（例如：密码、通讯内容或信用卡）。"],
        [/^may sign you out of this site\.?$/i, () => "可能会导致您退出此网站。"],
        [/^normally uses encryption to protect your information\. When the browser tried to connect to$/i, () => "通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 "],
        [/^this time, the website sent back unusual and incorrect credentials\.?$/i, () => " 时，该网站发回了异常且不正确的凭据。"],
        [/^(.+?)\s+normally uses encryption to protect your information\.\s*When the browser tried to connect to\s+(.+?)\s+this time,\s*the website sent back unusual and incorrect credentials\.?$/i, (m, h1, h2) => (h1 + " 通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 " + h2 + " 时，该网站发回了异常且不正确的凭据。")],
        [/^The certificate was rejected \((.+)\)\.\s*$/i, (m, code) => ("证书已被拒绝 (" + code + ")。")],
        [/^Nothing is running on port (\d+)$/i, (m, port) => ("端口 " + port + " 上没有正在运行的服务")],
        [/^Resume the conversation to start its workspace again, then start the server on port (\d+) and retry\.$/i, (m, port) => ("请恢复会话以重新启动其工作区，然后在端口 " + port + " 上启动服务器并重试。")],
        [/^No server is listening on port (\d+) inside the remote workspace\. Start it, or ask the agent to, then retry\.$/i, (m, port) => ("远程工作区内的端口 " + port + " 没有服务器正在监听。请启动服务器（或让智能体启动），然后重试。")],
        [/^Help us improve\s+(.+?)\.?$/i, (m, app) => ("帮助我们改进 " + app + "。")],
        [/^Get Anything Done with\s+(.+)$/i, (m, app) => ("用 " + app + " 搞定一切")],
        [/^Customize your experience from visual themes to how autonomous your agent acts and what\s+(.+?)\s+says\.?$/i, (m, app) => ("自定义您的使用体验，从视觉主题到智能体的自主程度以及 " + app + " 的提示音。")],
        [/^(.+?)'s agents are powerful\.\s*They can edit files,\s*run commands,\s*and browse the web\.?$/i, (m, app) => (app + " 的智能体功能强大，可以编辑文件、运行命令以及浏览网页。")],
        [/^Google\s+(.+?)\s+Terms of Service$/i, (m, app) => ("Google " + app + " 服务条款")],
        [/^Review permissions for\s+(.+)$/i, (m, name) => ("查看 " + name + " 的权限")],
        [/^Auth code for\s+(.+)$/i, (m, name) => (name + " 的授权码")],
        [/^(.+?),\s*(\d+)\s+grants?$/i, (m, name, count) => (name + "，" + count + " 项授权")],
        [/^Set up\s+(.+)$/i, (m, name) => ("配置 " + name)],
        [/^On top of those defaults,\s*(.+?)\s+requests the access below\.$/i, (m, name) => ("除上述默认权限外，" + name + " 还请求以下访问权限。")],
        [/^(\d+)\s+calls?\s*·\s*([0-9.]+)\s*MB$/i, (m, count, mb) => (count + " 次通话 · " + mb + " MB")],
        [/^Deleted\s+(\d+)\s+recordings?\s*\(([0-9.]+)\s*MB\)$/i, (m, count, mb) => ("已删除 " + count + " 条录音（" + mb + " MB）")],
        [/^Failed to delete recordings:\s*(.+)$/i, (m, err) => ("删除录音失败：" + err)],
        [/^This deletes\s+(\d+)\s+call recordings?\s*\(([0-9.]+)\s*MB\)\s+from your machine\.\s*You can't undo this\.$/i, (m, count, mb) => ("这将从您的计算机中删除 " + count + " 条通话录音（" + mb + " MB）。此操作无法撤销。")],
        [/^Step\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("第 " + a + " 步，共 " + b + " 步")],
        [/^\+(\d+)\s+more$/i, (m, num) => ("另外 +" + num + " 项")],
        [/^Not referenced by any feature\s*\((\d+)\)$/i, (m, num) => ("未被任何功能引用 (" + num + ")")],
        [/^Zipping\s+(.+?)(\.\.\.|…)?$/i, (m, name) => ("正在压缩 " + name + "...")],
        [/^There are currently no Build with\s+(.+?)\s+plugins available\.?$/i, (m, partner) => ("当前没有可用的 Build with " + partner + " 插件。")],
        [/^To switch accounts,\s*sign out in the\s+(.+?)\s+and sign in again\.?$/i, (m, place) => ("如需切换账户，请在" + place + "中退出登录并重新登录。")],
        [/^No MCP servers found for\s+"(.+)"$/i, (m, q) => ('未找到与“' + q + '”相关的 MCP 服务器')],
        [/^Agents created by\s+(.+?)\s+can apply across workspaces,\s*while project agents apply to\s+(.+?)\.?$/i, (m, a, b) => ("由 " + a + " 创建的智能体可跨工作区生效，而项目智能体仅作用于 " + b + "。")],
        [/^An?\s+(automation|scheduled task)\s+with this name already exists\.\s*Choose a different name\.?$/i, (m, kind) => ("已存在同名的" + (/automation/i.test(kind) ? "自动化任务" : "定时任务") + "，请选择其他名称。")],
        [/^Choose\s+(.+?)'s\s+Voice$/i, (m, app) => ("选择 " + app + " 的声音")],
        [/^Microphone blocked\.\s*Allow in\s+(.+?)\.?$/i, (m, place) => ("麦克风已被阻止。请在 " + place + " 中允许。")],
        [/^Microphone access for\s+(.+?)\s+was denied\.\s*Quit and reopen the app to be asked again\.?$/i, (m, host) => (host + " 的麦克风访问权限已被拒绝。请退出并重新打开应用以再次询问。")],
        [/^Microphone access for\s+(.+?)\s+wasn['’]t allowed\.?$/i, (m, host) => ("尚未允许 " + host + " 访问麦克风。")],
        [/^Agent needs permission to act on\s+(.+)$/i, (m, target) => ("智能体需要权限才能对 " + target + " 执行操作")],
        [/^The browser blocked the download of\s+(.+?):\s*the agent browser does not download this file type(.*)$/i, (m, file, rest) => ("浏览器已阻止下载 " + file + "：智能体浏览器不支持下载此文件类型" + rest)],
        [/^Blocked external popup navigation to\s+"(.+)"$/i, (m, url) => ("已阻止外部弹窗导航：“") + url + ("”")],
        [/^Blocked navigation to\s+"(.+)"$/i, (m, url) => ("已阻止导航至：“") + url + ("”")],
        [/^Blocked popup to\s+"(.+)"$/i, (m, url) => ("已阻止弹窗：“") + url + ("”")],
        [/^Blocked cross-origin subframe\s+"(.+)"$/i, (m, url) => ("已阻止跨源子框架：“") + url + ("”")],
        [/^Build with\s+(.+?)\s+Plugins$/i, (m, partner) => ("基于 " + partner + " 插件构建")],
        [/^Open the\s+(.+?)\s+plugin$/i, (m, name) => ("打开 " + name + " 插件")],
        [/^Managed by the\s+(.+?)\s+plugin$/i, (m, name) => ("由 " + name + " 插件管理")],
        [/^Open\s+(.+?)\s+skill$/i, (m, name) => ("打开 " + name + " 技能")],
        [/^The\s+(.+?)\s+MCP server requires configuration parameters before it can be started\.?$/i, (m, srv) => (srv + " MCP 服务器需要配置参数后才能启动。")],
        [/^Cannot add folder:\s*"(.+?)"\s+is not a valid folder location\.?$/i, (m, loc) => ("无法添加文件夹：“" + loc + "”不是有效的文件夹位置。")],
        [/^The folder\s+[“"](.+?)[”"]\s+does not exist\.\s*Would you like to create it\?$/i, (m, name) => ("文件夹“" + name + "”不存在，是否要创建？")],
        [/^[“"](.+?)[”"]\s+isn['’]t a valid folder name\.?$/i, (m, name) => ("“" + name + "”不是有效的文件夹名称。")],
        [/^A file already exists at\s+(.+?)\.?$/i, (m, p) => ("在 " + p + " 已存在同名文件。")],
        [/^(Created automation|Enabled|Deleted|Started|Restarted|Failed to delete|Failed to start)\s+"(.+?)"\.?$/i, (m, verb, name) => {
            const vMap = { 'created automation': '已创建自动化任务', 'enabled': '已启用', 'deleted': '已删除', 'started': '已启动', 'restarted': '已重启', 'failed to delete': '删除失败', 'failed to start': '启动失败' };
            return (vMap[verb.toLowerCase()] || verb) + ("“") + name + ("”。");
        }],
        [/^(Unfold|Fold)\s+lines\s+(\d+)-(\d+)$/i, (m, act, a, b) => (/^unfold$/i.test(act) ? ("展开第 ") : ("折叠第 ")) + a + "-" + b + " 行"],
        [/^Failed to save cloud permission settings:\s*(.+)$/i, (m, err) => ("保存云端权限设置失败：") + err],
        [/^System default\s*\((.+)\)$/i, (m, dev) => ("系统默认 (") + dev + ")"],
        [/^Zoom\s+(\d+)%,\s*reset to fit$/i, (m, pct) => ("缩放 ") + pct + ("%，重置为适应窗口")],
        [/^Recording shortcut for\s+(.+?)\.\s*Press keys to bind,\s*Enter to save,\s*Escape to cancel\.?$/i, (m, name) => ("正在录制 " + name + " 的快捷键。请按下按键组合绑定，按 Enter 保存，按 Escape 取消。")],
        [/^This window's agents,\s*files,\s*and terminals are on\s+(.+?)\.?$/i, (m, host) => ("此窗口的智能体、文件和终端位于 " + host + "。")],
        [/^When toggled on,\s*(.+?)\s+collects usage data to help Google enhance performance and features\.?$/i, (m, app) => ("开启后，" + app + " 会收集使用数据以帮助 Google 改进性能和功能。")],
        [/^When toggled on,\s*(.+?)\s+will use your AI credits to fulfill model requests once you're out of model quota\.\s*(.+?)\s+will always use your model quota first before using AI credits\.?$/i, (m, a1, a2) => ("开启后，当您的模型配额用尽时，" + a1 + " 将使用您的 AI 积分处理模型请求。" + a2 + " 始终会优先使用模型配额，再使用 AI 积分。")],
        [/^Receive product updates,\s*tips,\s*and promotions from Google\s+(.+?)\s+via email\.?$/i, (m, app) => ("通过电子邮件接收来自 Google " + app + " 的产品更新、技巧和促销信息。")],
        [/^Agents created by this\s+(.+?)\s+run in a dedicated\s+(.+?)\s+with its own permissions\.\s*You can change the permissions in the\s+(.+?)\s+settings page\.?$/i, (m, kind, scope, scope2) => {
            // 名词（automation、project）先查词典：译成中文时与前后中文之间不留空格，保留英文时加空格
            const term = w => {
                const t = w.toLowerCase() === 'automation' ? ('自动化') : (lookupDict(w) || w);
                return /[㐀-鿿]/.test(t) ? t : ' ' + t + ' ';
            };
            return ("此" + term(kind) + "创建的智能体会在具有独立权限的专用" + term(scope) + "中运行。您可以在" + term(scope2) + "设置页面更改权限。");
        }],
        [/^Stop\s+(\d+)\s+agents?\?$/i, (m, count) => ("要停止 " + count + " 个智能体吗？")],
        [/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)(?:,\s*(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?))*$/i, (m) => {
            const verbMap = { exploring: '正在探索', explored: '已探索', editing: '正在编辑', edited: '已编辑', running: '正在运行', ran: '已运行' };
            const nounMap = { file: '个文件', files: '个文件', folder: '个文件夹', folders: '个文件夹', search: '次搜索', searches: '次搜索', command: '个命令', commands: '个命令', task: '个任务', tasks: '个任务', page: '个网页', pages: '个网页', browser: '次浏览器操作', browsers: '次浏览器操作', image: '张图片', images: '张图片', action: '项操作', actions: '项操作', artifact: '个工件', artifacts: '个工件' };
            return m.split(/\s*,\s*/).map(part => {
                const pm = part.match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)$/i);
                if (!pm) return part;
                const v = pm[1] ? (verbMap[pm[1].toLowerCase()] || pm[1]) + ' ' : '';
                const n = nounMap[pm[3].toLowerCase()] || pm[3];
                return v + pm[2] + ' ' + n;
            }).join('，');
        }],
        [/^(?:(?:Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Using|Used|Reading|Read|Writing|Wrote|Viewing|Viewed|Checking|Checked)(?:\s+(?:(?:\d+\s+)?(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?)))?|\d+\s+(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|mcp tools?))(?:\s*,\s*(?:(?:Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Using|Used|Reading|Read|Writing|Wrote|Viewing|Viewed|Checking|Checked)(?:\s+(?:(?:\d+\s+)?(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?)))?|\d+\s+(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|mcp tools?)))*$/i, (m) => {
            if (!m.includes(',') && !/\s+(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?)$/i.test(m)) {
                return m;
            }
            const verbMap = { exploring: '正在探索', explored: '已探索', editing: '正在编辑', edited: '已编辑', running: '正在运行', ran: '已运行', searching: '正在搜索', searched: '已搜索', using: '正在使用', used: '已使用', reading: '正在读取', read: '已读取', writing: '正在写入', wrote: '已写入', viewing: '正在查看', viewed: '已查看', checking: '正在检查', checked: '已检查' };
            const nounMap = { file: '文件', files: '文件', folder: '文件夹', folders: '文件夹', search: '搜索', searches: '搜索', command: '命令', commands: '命令', task: '任务', tasks: '任务', page: '网页', pages: '网页', browser: '浏览器', browsers: '浏览器', image: '图片', images: '图片', action: '操作', actions: '操作', artifact: '工件', artifacts: '工件', tool: '工具', tools: '工具', web: '网页', 'mcp tool': 'MCP 工具', 'mcp tools': 'MCP 工具' };
            const countNounMap = { file: '个文件', files: '个文件', folder: '个文件夹', folders: '个文件夹', search: '次搜索', searches: '次搜索', command: '个命令', commands: '个命令', task: '个任务', tasks: '个任务', page: '个网页', pages: '个网页', browser: '次浏览器操作', browsers: '次浏览器操作', image: '张图片', images: '张图片', action: '项操作', actions: '项操作', artifact: '个工件', artifacts: '个工件', tool: '个工具', tools: '个工具', 'mcp tool': '个 MCP 工具', 'mcp tools': '个 MCP 工具' };
            return m.split(/\s*,\s*/).map(part => {
                const pm = part.trim().match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Using|Used|Reading|Read|Writing|Wrote|Viewing|Viewed|Checking|Checked)(?:\s+(?:(\d+)\s+)?(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?))?|(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|mcp tools?))$/i);
                if (!pm) return part;
                if (pm[4]) {
                    return pm[4] + ' ' + (countNounMap[pm[5].toLowerCase()] || pm[5]);
                }
                const v = verbMap[pm[1].toLowerCase()] || pm[1];
                if (pm[2]) {
                    return v + ' ' + pm[2] + ' ' + (countNounMap[pm[3].toLowerCase()] || pm[3]);
                }
                if (pm[3]) {
                    return v + (nounMap[pm[3].toLowerCase()] || pm[3]);
                }
                return v;
            }).join('，');
        }],
        [/^exit_plan_mode$/, () => '退出规划模式'],
        [/^enter_plan_mode$/, () => '进入规划模式'],

        // Swarm 伴生面板 (Sidecar) 动态消息、回放、关系图与概览状态
        [/^(\d+)\s+posts?$/i, (m, n) => n + (" 条消息")],
        [/^(\d+)\s+posts?\s+since the view was updated$/i, (m, n) => ("自视图上次更新以来有 " + n + " 条新消息")],
        [/^Narrator read up to #(\d+) of (\d+)$/i, (m, a, b) => ("解说员已读至 #" + a + " / " + b)],
        [/^read #(\d+)(?:\s*·\s*updated\s+(.+?)\s+ago)?$/i, (m, seq, dur) => ("已读至 #") + seq + (dur ? (" · " + formatCompactDuration(dur) + "前更新") : "")],
        [/^Posted in #([^\s;]+);\s*click to show only #([^\s;]+)$/i, (m, c1, c2) => ("发布于 #" + c1 + "；点击仅显示 #" + c2)],
        [/^#([^\s]+)\s+\(archived\)$/i, (m, ch) => "#" + ch + ("（已归档）")],
        [/^#([^\s]+)\s+is archived:\s*this addresses nobody$/i, (m, ch) => "#" + ch + (" 已归档：不会通知任何成员")],
        [/^Everyone in #([^\s]+)$/i, (m, ch) => "#" + ch + (" 中的所有成员")],
        [/^Go to #(\d+)(?:\s*\(([^)]+)\))?$/i, (m, seq, who) => ("跳转到 #") + seq + (who ? (" (" + who + ")") : "")],
        [/^The narrator's last step failed:\s*(.+)$/i, (m, detail) => ("解说员上一步执行失败：") + detail],
        [/^the narrator's view failed \((.+)\)$/i, (m, r) => ("解说员视图加载失败 (" + r + ")")],
        [/^overview\s*·\s*from the narrator's notes\s*\((.+)\)$/i, (m, r) => {
            const rNorm = norm(r);
            const rZh = map.get(rNorm) || r;
            return ("概览 · 来自解说员笔记（") + rZh + "）";
        }],
        [/^Opening (.+?)'s conversation needs the app\.$/i, (m, who) => ("需要在客户端应用中打开 " + who + " 的会话。")],
        [/^(.+?) runs on (.+?); open it there\.$/i, (m, name, host) => (name + " 运行于 " + host + "；请在该处打开。")],
        [/^Copied ["“](.+)["”]\.\s*Paste it in the chat\.$/i, (m, txt) => ("已复制“" + txt + "”。请粘贴到聊天框中。")],
        [/^Type ["“](.+)["”]\s+in the chat\.$/i, (m, txt) => ("请在聊天框中输入“" + txt + "”。")],
        [/^Copied ["“](.+)["”]\.\s*Paste it to the coordinator and say what you want changed\.$/i, (m, txt) => ("已复制“" + txt + "”。请粘贴给协调器并说明您想修改的内容。")],
        [/^Tell the coordinator:\s*["“](.+)["”]$/i, (m, txt) => ("请告诉协调器：“" + txt + "”")],
        [/^@([^\s]+)\s+ran out of quota(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + (" 配额已耗尽") + (dur ? (("（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+looks stuck(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + " 似乎卡住了" + (dur ? (("（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+hit an error(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + (" 遇到错误") + (dur ? (("（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^seen just now$/i, () => "刚刚在线"],
        [/^last seen (\d+(?:s|m|h|d)) ago$/i, (m, dur) => ("上次在线：") + formatCompactDuration(dur) + "前"],
        [/^(\d+)\s+of\s+(\d+)\s+tasks?\s+done$/i, (m, d, tot) => d + " / " + tot + (" 项任务已完成")],
        [/^([0-9]+\/[0-9]+|[0-9]+%)\s+done$/i, (m, lbl) => "已完成 " + lbl],
        [/^(\d+)\s+needs?\s+you$/i, (m, n) => n + (" 项待你处理")],
        [/^(\d+)\s+blocked$/i, (m, n) => n + (" 项受阻")],
        [/^(\d+)\s+threads?\s+open$/i, (m, n) => n + (" 条工作线进行中")],
        [/^(\d+)\s+active$/i, (m, n) => n + (" 项进行中")],
        [/^Up next\s*·\s*(\d+)$/i, (m, n) => ("接下来 · ") + n],
        [/^Last change:\s*[“"](.+)[”"]$/i, (m, txt) => ("上次变更：“") + txt + ("”")],
        [/^Remote\s*·\s*(\d+)\s+machines?$/i, (m, n) => ("远程 · ") + n + (" 台机器")],
        [/^Remote\s*·\s*(reconnecting|connecting|unavailable)$/i, (m, st) => {
            const stLow = st.toLowerCase();
            const stZh = stLow === 'reconnecting'
                ? ('正在重连')
                : (stLow === 'connecting' ? ('正在连接') : '不可用');
            return ("远程 · ") + stZh;
        }],
        [/^Message from\s+(.+)$/, (m, sender) => {
            const sNorm = norm(sender);
            const sZh = sNorm === 'Parent Agent'
                ? ('父级智能体')
                : (map.get(sNorm) || sender);
            const isCjk = /[\u4e00-\u9fff]/.test(sZh);
            return (isCjk ? ('来自') : ('来自 ')) + sZh + (isCjk ? ('的消息') : (' 的消息'));
        }],

        // v2.32.1 新增界面：草稿胶囊、SSH 远程主机、多智能体视图与插件云端凭据
        [/^(\d+)\s+Drafts?$/i, (m, n) => n + (" 条草稿")],
        [/^Resume\s+(\d+)\s+comment drafts?$/i, (m, n) => ("恢复 " + n + " 条评论草稿")],
        [/^Couldn't connect to\s+(.+)$/i, (m, rest) => ("无法连接到 ") + rest],
        [/^Connecting to\s+(.+?)(\.\.\.|…)?$/i, (m, host, ell) => ("正在连接到 ") + host + (ell || "")],
        [/^Connected to\s+(.+)$/i, (m, host) => ("已连接到 ") + host],
        [/^SSH Config\s*\((.+)\)$/i, (m, cfg) => ("SSH 配置 (") + cfg + ")"],
        [/^(\d+)\s+hidden hosts?$/i, (m, n) => n + (" 个已隐藏的主机")],
        [/^Hide\s+(.+?)\s+from this list$/i, (m, host) => ("从此列表中隐藏 " + host)],
        [/^Show\s+(.+?)\s+in the list again$/i, (m, host) => ("重新在列表中显示 " + host)],
        [/^(.+?)\s*\((Focus this tile|Back to all agents)\)$/i, (m, prefix, action) => prefix + "（" + (/^Focus/i.test(action) ? ("聚焦此视图") : ("返回全部智能体")) + "）"],
        [/^Sign-ins to (.+?) are kept in the cloud with your account\.(?:\s*(Other credentials stay on this machine\.))?(?:\s*(Credentials are only sent to the domains listed\.))?$/i, (m, providers, otherPart, domainPart) => {
            let res = (providers + " 的登录信息会随您的账户保存在云端。");
            if (otherPart) res += "其他凭据保留在本机上。";
            if (domainPart) res += "凭据仅会发送至所列出的域名。";
            return res;
        }],
        [/^(.+?)\s+needs?\s+the terminal sandbox,\s+which isn't available on this host\.$/i, (m, presets) => {
            const labels = presets.split(/\s+and\s+/i).map(p => {
                const k = norm(p);
                return map.get(k) || lowerMap.get(k.toLowerCase()) || k;
            });
            const joined = labels.join(" 和 ");
            return joined + (" 需要终端沙盒，但此主机不可用。");
        }],
        [/^(Messaging|Messaged)\s+(.+)$/, (m, verb, role) => {
            const rTrim = role.trim();
            if (rTrim.length > 60 || /[.!?。！？]$/.test(rTrim)) return m;
            const rNorm = norm(rTrim);
            const rZh = map.get(rNorm) || rTrim;
            if (verb === 'Messaging') {
                return ("正在向 ") + rZh + (" 发送消息");
            }
            return ("已向 ") + rZh + (" 发送消息");
        }],
        [/^Failed to save project settings:\s*(.+)$/i, (m, err) => ("保存项目设置失败：") + err],

        // v2.33.0 新增界面：浏览数据/Cookie、快捷键方案、远程登录、套件审查、协调器选择器、权限询问与模型下架提示
        [/^Account this MCP server uses:\s*(.+)$/i, (m, acc) => ("此 MCP 服务器使用的账户：") + acc],
        [/^Add bundle\s+(.+)$/i, (m, name) => ("添加套件 ") + name],
        [/^Add\s*\((\d+)\)$/i, (m, n) => ("添加 (") + n + ")"],
        [/^Add shortcut for\s+(.+)$/i, (m, cmd) => ("为 ") + (lookupDict(cmd) || cmd) + (" 添加快捷键")],
        [/^App view for\s+(.+)$/i, (m, name) => name + (" 的应用视图")],
        [/^Authorization code for\s+(.+)$/i, (m, name) => name + (" 的授权码")],
        [/^(Bounding box|Comment|Search match) on page\s+(\d+)$/i, (m, kind, p) => {
            const kZh = /^Bounding/i.test(kind) ? ("边界框") : (/^Comment/i.test(kind) ? ("评论") : ("搜索匹配项"));
            return ("第 " + p + " 页的" + kZh);
        }],
        [/^Cancel Questionnaire and Stop the Agent\s*\((.+)\)$/i, (m, p) => ("取消问卷并停止智能体 (") + p + ")"],
        [/^Connect GitHub:\s*(.+)$/i, (m, detail) => ("连接 GitHub：") + detail],
        [/^GitHub:\s*(.+)$/i, (m, msg) => "GitHub：" + (translateExactOrDynamic(norm(msg)) || msg)],
        [/^SSH:\s*(.+)$/i, (m, host) => "SSH：" + host],
        [/^Cost summary:\s*(.+)$/i, (m, detail) => ("费用摘要：") + detail],
        [/^(Couldn't|Failed to)\s+(archive|unarchive|pin|unpin|delete|rename|open|load|save|update|create|fork|duplicate|export|share)\s+conversation$/i, (m, lead, verb) => {
            const vMap = { archive: '归档', unarchive: '取消归档', pin: '置顶', unpin: '取消置顶', delete: '删除', rename: '重命名', open: '打开', load: '加载', save: '保存', update: '更新', create: '创建', fork: '分叉', duplicate: '复制', export: '导出', share: '分享' };
            const act = vMap[verb.toLowerCase()] || verb;
            return /^Couldn/i.test(lead)
                ? (("无法" + act + "会话"))
                : ((act + "会话失败"));
        }],
        [/^Delete cookies for\s+(.+)$/i, (m, site) => ("删除 " + site + " 的 Cookie")],
        [/^(?:Could not clear site data|Couldn't delete cookies|Clearing cookies and site data|Site data cleared) for\s+(.+?)(?:\.\s*Try again\.?)?$/i, (m, site) => {
            const retrySuffix = /\.\s*Try again\.?$/i.test(m) ? ("，请重试。") : "";
            if (/^Could not clear/i.test(m)) return ("无法清除以下网站的网站数据：") + site + retrySuffix;
            if (/^Couldn't delete/i.test(m)) return ("无法删除以下网站的 Cookie：") + site + retrySuffix;
            if (/^Clearing/i.test(m)) return ("正在清除以下网站的 Cookie 和网站数据：") + site + retrySuffix;
            return ("已清除以下网站的网站数据：") + site + retrySuffix;
        }],
        [/^No sites match\s+"(.+?)"\.?$/i, (m, q) => ("没有匹配“" + q + "”的网站。")],
        [/^(?:Delete|Edit) side question(?:\s+title)?:\s*(.+)$/i, (m, title) => (/^Delete/i.test(m) ? ("删除侧边提问：") : ("编辑侧边提问标题：")) + title],
        [/^Detached at\s+(.+)$/i, (m, ref) => ("已分离于 ") + ref],
        [/^Details for\s+(.+)$/i, (m, name) => name + (" 的详情")],
        [/^Duplicate\s+(.+?)\s+name$/i, (m, kind) => translateNoun(kind) + ("名称重复")],
        [/^Edit comment:\s*(.+)$/i, (m, txt) => ("编辑评论：") + txt],
        [/^Edit\s+(.+?)\s+name$/i, (m, target) => ("编辑 " + target + " 名称")],
        [/^Failed to archive\s+(.+)$/i, (m, target) => ("归档失败：") + target],
        [/^Failed to create project:\s*(.+)$/i, (m, err) => ("创建项目失败：") + err],
        [/^Failed to create\s+(.+?)\.?$/i, (m, target) => ("创建失败：") + target],
        [/^Failed to delete\s+([^:]+):\s*(.+)$/i, (m, target, err) => ("删除 " + target + " 失败：" + err)],
        [/^Failed to delete\s+([^:"]+?)\.?$/i, (m, target) => {
            const tZh = translateNoun(target);
            const sep = tZh === norm(target) ? " " : "";
            return ("删除" + sep + tZh + (sep ? " " : "") + "失败");
        }],
        [/^Failed to resolve folder:\s*(.+?)\s*\((.+)\)$/i, (m, dir, err) => ("解析文件夹失败：" + dir + " (" + err + ")")],
        [/^Failed to save\s+"(.+?)"$/i, (m, name) => ("保存“" + name + "”失败")],
        [/^Failed to save project Google3 configuration:\s*(.+)$/i, (m, err) => ("保存项目 Google3 配置失败：") + err],
        [/^Failed to save project permissions:\s*(.+)$/i, (m, err) => ("保存项目权限失败：") + err],
        [/^Failed to save project:\s*(.+)$/i, (m, err) => ("保存项目失败：") + err],
        [/^Failed to save settings:\s*(.+)$/i, (m, err) => ("保存设置失败：") + err],
        [/^Failed to select workspace:\s*(.+)$/i, (m, err) => ("选择工作区失败：") + err],
        [/^Failed to unarchive project:\s*(.+)$/i, (m, err) => ("取消归档项目失败：") + err],
        [/^Failed to update\s+"(.+?)"$/i, (m, name) => ("更新“" + name + "”失败")],
        [/^Filter skills and rules:\s*(.+)$/i, (m, q) => ("筛选技能和规则：") + (lookupDict(q) || q)],
        [/^Fix with Agent:\s*(.+)$/i, (m, target) => ("使用智能体修复：") + target],
        [/^Go to (page|slide)\s+(\d+)$/i, (m, kind, n) => (/^page/i.test(kind) ? ("跳转到第 " + n + " 页") : ("跳转到第 " + n + " 张幻灯片"))],
        [/^Go to turn\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("跳转到第 " + a + " / " + b + " 轮")],
        [/^Install folder\s+"(.+?)"\s+is already in use$/i, (m, dir) => ("安装文件夹“" + dir + "”已被占用")],
        [/^Keep:\s*(.+)$/i, (m, val) => "保留：" + (translateExactOrDynamic(norm(val)) || val)],
        [/^Label for\s+(.+)$/i, (m, acc) => acc + (" 的标签")],
        [/^Make\s+(.+?)\s+the default\s+(.+?)\s+account$/i, (m, acc, provider) => ("将 " + acc + " 设为默认 " + provider + " 账户")],
        [/^Manage\s+(.+?)\s+app settings\.?$/i, (m, app) => ("管理 " + app + " 应用设置。")],
        [/^More actions for\s+(.+)$/i, (m, target) => target + " 的更多操作"],
        [/^More for\s+(.+)$/i, (m, target) => target + (" 的更多操作")],
        [/^Move to Group:\s*(.+)$/i, (m, grp) => ("移动到分组：") + grp],
        [/^New secret for\s+(.+)$/i, (m, name) => ("为 " + name + " 新建密钥")],
        [/^No\s+(plugins|skills|rules|agents|bundles|sites|results|items|servers|commands|hosts|conversations|workflows|shortcuts|apps|files|folders|projects|workspaces|mcp servers|models|extensions|tools)\s+found for(?:\s+"([^"]*)"\s*\.?|\s*:?\s*)$/i, (m, kind, query) => {
            const kZh = translateNoun(kind);
            if (query !== undefined) {
                return ("未找到与“" + query + "”匹配的" + kZh);
            }
            return ("未找到匹配的") + kZh + "：";
        }],
        [/^Open Subagent:\s*(.+)$/i, (m, name) => ("打开子代理：") + name],
        [/^Open URL in system browser:\s*(.+)$/i, (m, url) => ("在系统浏览器中打开 URL：") + url],
        [/^Opens external link:\s*(.+)$/i, (m, url) => ("打开外部链接：") + url],
        [/^Page\s+(\d+)\s+failed to load$/i, (m, p) => ("第 " + p + " 页加载失败")],
        [/^Plan,\s*(\d+)\s+of\s+(\d+)\s+steps?\s+done$/i, (m, a, b) => ("计划，已完成 " + a + " / " + b + " 步")],
        [/^Playback speed\s+([0-9.]+x)$/i, (m, spd) => "播放速度 " + spd],
        [/^Plugins in\s+(.+)$/i, (m, cat) => (lookupDict(cat) || cat) + (" 中的插件")],
        [/^(\d+)\s+plugins?$/i, (m, n) => n + (" 个插件")],
        [/^(\d+)\s+plugins?,\s*all already installed\.\s+Adding the bundle installs plugins it gains later\.?$/i, (m, n) => (n + " 个插件，均已安装。添加套件后将自动安装后续新增的插件。")],
        [/^(\d+)\s+plugins?\.\s+Adding the bundle installs plugins it gains later\.?$/i, (m, n) => (n + " 个插件。添加套件后将自动安装后续新增的插件。")],
        [/^(\d+)\s+plugins?\.\s+Add bundle installs (it|all of them)\.?$/i, (m, n, target) => (n + " 个插件。添加套件将安装" + (/^it$/i.test(target) ? "该插件。" : "全部插件。"))],
        [/^(\d+)\s+plugins?\.\s+Add bundle installs\s+(\d+);\s*the ones you already have stay as they are\.?$/i, (m, n, b) => (n + " 个插件。添加套件将安装其中 " + b + " 个；您已安装的插件将保持不变。")],
        [/^(?:This plugin|These plugins) in\s+(.+?)\s+may have looser code review\.\s+Review (?:its|their) contents before adding the bundle\.?$/i, (m, src) => {
            const isPlural = /^These/i.test(m);
            return (src + (isPlural ? " 中的这些插件代码审查可能较宽松，添加套件前请先查看其内容。" : " 中的此插件代码审查可能较宽松，添加套件前请先查看其内容。"));
        }],
        [/^(.+?)\.\s+Disabling or removing the bundle applies only to the ones it installed\.?$/i, (m, prefix) => {
            const normPref = norm(prefix);
            let prefZh = translateExactOrDynamic(normPref);
            if (!prefZh) {
                const withDot = translateExactOrDynamic(normPref + '.');
                if (withDot) prefZh = withDot.replace(/[。.]$/, '');
            }
            return (prefZh || prefix) + ("。停用或移除此套件仅会影响由它安装的项目。");
        }],
        [/^(Question|Turn)\s+(\d+)\s+of\s+(\d+)$/i, (m, kind, a, b) => (/^Question/i.test(kind) ? ("第 " + a + " / " + b + " 个问题") : ("第 " + a + " / " + b + " 轮"))],
        [/^Remove context from\s+(.+)$/i, (m, target) => ("移除来自 " + target + " 的上下文")],
        [/^Remove shortcut\s+(.+?)\s+for\s+(.+)$/i, (m, key, cmd) => "移除 " + (lookupDict(cmd) || cmd) + (" 的快捷键 ") + key],
        [/^Remove\s+(.+?)\s+from (Recent|list)$/i, (m, item, where) => (/^Recent/i.test(where) ? ("从最近列表中移除 ") : ("从列表中移除 ")) + item],
        [/^Reset\s+(.+?)\s+to default$/i, (m, cmd) => ("将 ") + (lookupDict(cmd) || cmd) + (" 重置为默认值")],
        [/^Review\s+(.+?)\s+before installing$/i, (m, item) => ("安装前审查 " + item)],
        [/^Run\s+(.+?)\s+now$/i, (m, item) => ("立即运行 ") + item],
        [/^Scroll to:\s*(.+?)\s+on page\s+(\d+)$/i, (m, target, p) => ("滚动到第 " + p + " 页的：" + target)],
        [/^Search Google for\s+"(.+)"$/i, (m, q) => ("在 Google 中搜索“" + q + "”")],
        [/^Secret for a new\s+(.+?)\s+account$/i, (m, provider) => ("新 " + provider + " 账户的密钥")],
        [/^Secret for\s+(.+)$/i, (m, name) => name + (" 的密钥")],
        [/^See\s+([^:]+):\s*(.+)$/i, (m, label, target) => ("查看 ") + (translateExactOrDynamic(norm(label)) || label) + "：" + target],
        [/^Shortcut\s+(.+?)\s+for\s+(.+)$/i, (m, key, cmd) => (lookupDict(cmd) || cmd) + (" 的快捷键 ") + key],
        [/^Show\s+(.+?)\s+in folder$/i, (m, item) => ("在文件夹中显示 " + item)],
        [/^Sign in to\s+(.+?)\s+remotely$/i, (m, target) => ("远程登录 ") + target],
        [/^Sign in to\s+(.+)$/i, (m, target) => ("登录 ") + target],
        [/^Stop\s+(\d+)\s+selected$/i, (m, n) => ("停止所选的 " + n + " 项")],
        [/^Switch environment\s*\((.+)\)$/i, (m, env) => ("切换环境 (") + env + ")"],
        [/^The browser blocked the download of\s+(.+)$/i, (m, file) => ("浏览器已阻止下载 ") + file],
        [/^(Enable|Toggle) Word Wrap(.*)$/i, (m, act, suffix) => (/^Enable/i.test(act) ? ("启用自动换行") : ("切换自动换行")) + (suffix || "")],
        [/^Using default\s+(.+?)\s+name$/i, (m, kind) => ("使用默认") + translateNoun(kind) + ("名称")],
        [/^View Diff for\s+(.+)$/i, (m, target) => ("查看 " + target + " 的差异")],
        [/^View\s+(\d+)\s+help(?:\s+items?)?$/i, (m, n) => ("查看 " + n + " 条帮助")],
        [/^View\s+(\d+)\s+side questions?$/i, (m, n) => ("查看 " + n + " 个侧边提问")],
        [/^You're signing in on\s+(.+?)\.\s*Your sign-in stays on that machine\.?$/i, (m, host) => ("您正在 " + host + " 上登录。登录状态仅保留在该机器上。")],
        [/^Where the agent runs,\s*current:\s*(.+)$/i, (m, rest) => {
            const rNorm = norm(rest);
            const r = lookupDict(rNorm) || rNorm.replace(/^Remote$/i, '远程').replace(/^This computer$/i, '此电脑');
            return ("智能体运行位置，当前：") + r;
        }],
        [/^Agent permissions preset selector,\s*current:\s*(.+)$/i, (m, p) => ("智能体权限预设选择器，当前：") + (lookupDict(p) || p)],
        [/^Agent permissions preset:\s*(.+?),\s*(.+)$/i, (m, p, s) => ("智能体权限预设：") + (lookupDict(p) || p) + "，" + (lookupDict(s) || s)],
        [/^(Save rule to always allow|Allow)\s+(.+?)\?$/i, (m, verb, act) => {
            const isSave = /^Save/i.test(verb);
            const actTrim = act.trim();
            const actLow = actTrim.toLowerCase();
            const actMap = {
                'read access to this path': '读取此路径',
                'write access to this path': '写入此路径',
                'read/write access to this path': '读写此路径',
                'reading this url': '读取此网址',
                'executing actions on this url': '在此网址上执行操作',
                'browser downloads from this site': '从此网站进行浏览器下载',
                'running this command': '运行此命令',
                'running this command outside the sandbox': '在沙箱外运行此命令',
                'using this mcp tool': '使用此 MCP 工具',
                'a one-time administrator (uac) elevation': '一次性管理员 (UAC) 提权',
                'access to this resource': '访问此资源',
                'the browser agent to download a file': '浏览器智能体下载文件'
            };
            const target = actMap[actLow] || actTrim;
            const sep = actMap[actLow] ? '' : ' ';
            return isSave
                ? (("是否保存规则以始终允许" + sep + target + "？"))
                : (("是否允许" + sep + target + "？"));
        }],
        [/^Conflicts with your configured Ask permission:\s*(.+)$/i, (m, d) => ("与您配置的“询问”权限冲突：") + d],
        [/^Requires manual confirmation:\s*(.+)$/i, (m, d) => ("需要手动确认：") + d],
        [/^Show\s+(\d+)\s+more\s+subagents?$/i, (m, n) => ("显示另外 " + n + " 个子智能体")],
        [/^Showing latest\s+(\d+)\s+browser steps?$/i, (m, n) => ("当前显示最近 " + n + " 个浏览器步骤")],
        [/^Showing first\s+(\d+)\s+references?$/i, (m, n) => ("当前显示前 " + n + " 个引用")],
        [/^(\d+)\s+references?$/i, (m, n) => n + (" 个引用")],
        [/^Load older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("加载更早的消息，当前显示 " + a + " / " + b + " 条")],
        [/^Sort and filter conversations\s*\((\d+)\s+active\)$/i, (m, n) => ("排序和筛选会话（" + n + " 个生效中）")],
        [/^Proceed with implementation plan and\s+(\d+)\s+comments?$/i, (m, n) => ("按实施计划并附带 " + n + " 条评论继续执行")],
        [/^Compare responses from\s+(\d+)\s+models side-by-side to find the best result\.?$/i, (m, n) => ("并排对比 " + n + " 个模型的回复，找出最佳结果。")],
        [/^You have\s+(\d+)\s+conversations? in progress\.\s+Updating will interrupt them,\s+and they will automatically resume once the update completes\.?$/i, (m, n) => ("您有 " + n + " 个正在进行的会话。更新将暂时中断它们，更新完成后会自动恢复。")],
        [/^You have\s+(\d+)\s+conversations? in progress\.\s+Updating will cancel them and you'll need to manually restart them\.?$/i, (m, n) => ("您有 " + n + " 个正在进行的会话。更新将取消它们，之后您需要手动重新启动。")],
        [/^(.+?)\s+is no longer available\.\s+Runs use\s+(.+?)\s+instead\.?$/i, (m, oldM, newM) => oldM + (" 已不再可用，运行时将改用 ") + newM + "。"],
        [/^(.+?)\s+is no longer available\.\s+Runs will fail until you pick another model\.?$/i, (m, oldM) => oldM + (" 已不再可用，在您选择其他模型之前运行将会失败。")],

        // 模型选择器方案可用性与下架日期动态提示
        [/^(.+?)\s+is\s+(currently|now)\s+available\s+(to|on)\s+(.+?)\.\s+(.+?)\s+will no longer be available on your current plan starting on\s+(.+?)(\.)?$/i, (m, model, timing, prep, aud, model2, dateStr, dot) => {
            const avail = formatModelAvailability(model, timing, aud);
            const subj = /^it$/i.test(model2.trim()) ? '它' : model2.trim();
            const dep = (subj + ' 将自 ' + formatEnglishDate(dateStr) + ' 起不再在您当前的方案中提供');
            return avail + '。' + dep + (dot ? '。' : '');
        }],
        [/^(.+?)\s+is\s+(currently|now)\s+available\s+(to|on)\s+(.+?)\.\s+Third-party model access will no longer be available(?:\s+on your current plan)?\s+starting on\s+(.+?)(\.)?$/i, (m, model, timing, prep, aud, dateStr, dot) => {
            const avail = formatModelAvailability(model, timing, aud);
            const hasPlan = /on your current plan/i.test(m);
            const dep = ('第三方模型访问权限将自 ' + formatEnglishDate(dateStr) + (hasPlan ? ' 起不再在您当前的方案中提供' : ' 起不再提供'));
            return avail + '。' + dep + (dot ? '。' : '');
        }],
        [/^(.+?)\s+is\s+(currently|now)\s+available\s+(to|on)\s+(.+?)(\.)?$/i, (m, model, timing, prep, aud, dot) => {
            return formatModelAvailability(model, timing, aud) + (dot ? '。' : '');
        }],
        [/^Third-party model access will no longer be available(?:\s+on your current plan)?\s+starting on\s+(.+?)(\.)?$/i, (m, dateStr, dot) => {
            const hasPlan = /on your current plan/i.test(m);
            return (('第三方模型访问权限将自 ' + formatEnglishDate(dateStr) + (hasPlan ? ' 起不再在您当前的方案中提供' : ' 起不再提供'))) + (dot ? '。' : '');
        }],
        [/^(.+?)\s+will no longer be available on your current plan starting on\s+(.+?)(\.)?$/i, (m, model, dateStr, dot) => {
            return ((model + ' 将自 ' + formatEnglishDate(dateStr) + ' 起不再在您当前的方案中提供')) + (dot ? '。' : '');
        }],

        // v2.35.1 模型悬浮说明、下架日期预告与选择器状态属性
        [/^Use\s+(.+?)\s+for better quality with lower quota usage\.(?:\s*Leaving on\s+(.+?)(\.)?)?$/i, (m, model, dateStr, dot) => {
            const base = ('建议使用 ' + model.trim() + '，以更低的配额消耗获得更佳质量。');
            if (!dateStr) return base;
            const dFmt = formatEnglishDate(dateStr.replace(/\.$/, ''));
            const sep = /[\u4e00-\u9fff]$/.test(dFmt) ? '' : ' ';
            return base + (('将于 ' + dFmt + sep + '下线')) + (dot || /\.$/.test(m.trim()) ? '。' : '');
        }],
        [/^Use\s+(.+?)\s+for better quality(?:\s+and faster responses)?\.(?:\s*Leaving on\s+(.+?)(\.)?)?$/i, (m, model, dateStr, dot) => {
            const hasFast = /and faster responses/i.test(m);
            const base = ('建议使用 ' + model.trim() + (hasFast ? '，兼顾更佳质量与更快响应。' : ' 以获得更佳质量。'));
            if (!dateStr) return base;
            const dFmt = formatEnglishDate(dateStr.replace(/\.$/, ''));
            const sep = /[\u4e00-\u9fff]$/.test(dFmt) ? '' : ' ';
            return base + (('将于 ' + dFmt + sep + '下线')) + (dot || /\.$/.test(m.trim()) ? '。' : '');
        }],
        [/^Use\s+(.+?)\s+instead\.(?:\s*Leaving on\s+(.+?)(\.)?)?$/i, (m, model, dateStr, dot) => {
            const base = ('建议改用 ' + model.trim() + '。');
            if (!dateStr) return base;
            const dFmt = formatEnglishDate(dateStr.replace(/\.$/, ''));
            const sep = /[\u4e00-\u9fff]$/.test(dFmt) ? '' : ' ';
            return base + (('将于 ' + dFmt + sep + '下线')) + (dot || /\.$/.test(m.trim()) ? '。' : '');
        }],
        [/^Leaving on\s+([A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})(\.)?$/i, (m, dateStr, dot) => {
            const dFmt = formatEnglishDate(dateStr);
            const sep = /[\u4e00-\u9fff]$/.test(dFmt) ? '' : ' ';
            return (('将于 ' + dFmt + sep + '下线')) + (dot ? '。' : '');
        }],
        [/^(.+?)\.\s+Leaving on\s+([A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})(\.)?$/i, (m, firstSent, dateStr, dot) => {
            const fNorm = norm(firstSent);
            const fZh = translateExactOrDynamic(fNorm + '.') || translateExactOrDynamic(fNorm);
            if (!fZh) return m;
            const dFmt = formatEnglishDate(dateStr);
            const sep = /[\u4e00-\u9fff]$/.test(dFmt) ? '' : ' ';
            return fZh.replace(/[。.]+$/, '') + '。' + (('将于 ' + dFmt + sep + '下线')) + (dot ? '。' : '');
        }],
        [/^Select model,\s*current:[ \t]*(.+)$/i, (m, cur) => ('选择模型，当前：') + cur],
        [/^Select model with\s+(.+)$/i, (m, key) => (('使用 ' + key + ' 选择模型'))],
        [/^Model:[ \t]*(.+?),\s*(.+)$/i, (m, cur, reason) => {
            const rZh = translateExactOrDynamic(norm(reason));
            if (!rZh) return m;
            return '模型：' + cur + '，' + rZh;
        }],

        // v2.34.0 动态模板规则
        [/^Couldn't disconnect (.+?): (.+)$/, (m, target, reason) => ('无法断开 ' + target + ' 的连接：') + reason],
        [/^Failed to load page (.+?): (.+)$/, (m, page, reason) => ('加载页面 ' + page + ' 失败：') + reason],
        [/^More options for (.+)$/, (m, target) => target + (' 的更多选项')],
        [/^Opens the New Conversation screen for this (.+)$/, (m, target) => ('打开此 ' + translateNoun(target) + ' 的新会话界面')],

        // 账号资格、地区不支持与 v2.33/v2.34 补充模板
        [/^Your current account is not eligible for\s+(.+?),\s*because it is not currently available in your\s+(?:location|region|country|area)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `您当前的账户无权使用 ${app.trim()}，因为您所在的地区目前暂不支持此服务${period}`;
        }],
        [/^(?:Your current|This)\s+account is not eligible (?:for|to use)\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `当前账户无权使用 ${app.trim()}${period}`;
        }],
        [/^Sorry,\s*this account is ineligible to use\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `抱歉，当前账户无权使用 ${app.trim()}${period}`;
        }],
        [/^Further action is required to use\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `需要采取进一步操作才能使用 ${app.trim()}${period}`;
        }],
        [/^(?:This service|The service|Antigravity|Jetski)\s+is not (?:currently\s+)?available in your\s+(?:location|region|country|area)\.?$/i, (m) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `您所在的地区目前暂不支持此服务${period}`;
        }],
        [/^Your (?:current\s+)?(?:location|region|country|area) is not supported\.?$/i, (m) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `当前不支持您所在的地区${period}`;
        }],
        [/^(.+?)\s+is not (?:currently\s+)?available in your\s+(?:location|region|country|area)\.?$/i, (m, target) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `您所在的地区目前暂不支持 ${target.trim()}${period}`;
        }],
        [/^You['’]re signing in on\s+(.+?)\.\s*Your sign-in stays on that machine\.?$/i, (m, host) => {
            const period = /\.$/.test(m.trim()) ? '。' : '';
            return `您正在 ${host.trim()} 上登录。您的登录状态将保留在该设备上${period}`;
        }],
        [/^Turn\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => ('第 ' + c + ' 轮（共 ' + tot + ' 轮）')],
        [/^Go to turn\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => ('跳至第 ' + c + ' / ' + tot + ' 轮')],
        [/^Recording shortcut for\s+(.+?)\.\s*Press keys to bind,\s*Enter to save,\s*Escape to cancel\.?$/i, (m, cmd) => ('正在录制“' + cmd + '”的快捷键。按下按键以绑定，按 Enter 保存，按 Escape 取消。')],
        [/^Low contrast ratio\s*\((.+?):1\)\.\s*Text may be hard to read\.?$/i, (m, r) => ('对比度过低（' + r + ':1），文字可能难以阅读。')],
        [/^(?:Auth|Authorization) code for\s+(.+)$/i, (m, app) => app + (' 的授权码')],
        [/^Failed to save project Google3 configuration:\s*(.+)$/i, (m, err) => ('保存项目 Google3 配置失败：') + err],
        [/^Failed to save project:\s*(.+)$/i, (m, err) => ('保存项目失败：') + err],
        [/^Available for\s+(.+?)\s+project$/i, (m, proj) => ('适用于 ') + proj.trim() + (' 项目')],

        // v2.35.0 动态模板规则
        [/^All (.+?) will be revoked\. The plugin will ask before doing this again\.$/, (m, target) => ('将撤销全部 ' + target + '。插件在再次执行此操作前会先征求您的同意。')],
        [/^Dismiss:\s*(.+)$/, (m, target) => ('忽略：') + target],
        [/^Move to\s+(.+)$/, (m, dest) => { const d = lookupDict(dest); return ('移动到') + (d && /^[\u3400-\u9fff]/.test(d) ? '' : ' ') + (d || dest); }],
        [/^New\s+(.+?)\.\.\.$/, (m, kind) => ('新建') + translateNoun(kind) + '...'],
        [/^No matching languages for "(.+)"$/, (m, q) => ('未找到与“' + q + '”匹配的语言')],
        [/^Remove from\s+(.+)$/, (m, target) => ('从 ') + (lookupDict(target) || target) + ' 移除'],
        [/^Revoke all:\s*(.+)$/, (m, target) => ('全部撤销：') + target],
        [/^Revoke:\s*(.+)$/, (m, target) => ('撤销：') + target],

        // v2.35.1 全面审计补充动态模板规则（配额、排程、时间、计数、Git/MCP/浏览器提示）
        [/^You need (at least \d+|more) AI Credits to send messages\.\s*To continue using (.+?) now,\s*purchase more AI Credits\.(?:\s*Your plan's baseline quota will refresh on (.+?)\.?)?$/i, (m, amt, target, when) => {
            const amtZh = /^more$/i.test(amt) ? '更多' : amt.replace(/^at least\s+/i, '至少 ');
            const tTrim = target.trim();
            const tPart = /^this model$/i.test(tTrim) ? '此模型' : (' ' + tTrim);
            let res = ('您需要' + amtZh + ' AI 额度才能发送消息。要立即继续使用' + tPart + '，请购买更多 AI 额度。');
            if (when) {
                const cleanWhen = when.replace(/\.$/, '');
                res += ('您方案的基础配额将于 ' + cleanWhen + ' 刷新。');
            }
            return res;
        }],
        [/^Your quota for (.+?) will reset on (.+?)\. Switch to another available model to continue\.$/i, (m, model, when) => {
            const mZh = /^this model$/i.test(model.trim()) ? '此模型' : model.trim();
            return ('您的 ' + mZh + ' 配额将于 ' + when + ' 重置。请切换至其他可用模型以继续。');
        }],
        [/^Your quota for (.+?) has been reached\. Switch to another available model to continue\.$/i, (m, model) => {
            const mZh = /^this model$/i.test(model.trim()) ? '此模型' : model.trim();
            return ('您的 ' + mZh + ' 配额已用完。请切换至其他可用模型以继续。');
        }],
        [/^Your plan's baseline quota will refresh on (.+?)\.?$/i, (m, when) => ('您方案的基础配额将于 ' + when + ' 刷新。')],
        [/^Your plan:\s*(.+)$/i, (m, plan) => ('您的方案：') + plan],
        [/^Telemetry is turned off for your account\. This means (.+?) does not collect any of your prompts, content, or model responses, but will still collect general usage patterns \(e\.g\., feature adoption, active user counts\)\.?$/i, (m, app) => ('您的账户已关闭遥测数据收集。这意味着 ' + app + ' 不会收集您的任何提示词、内容或模型回复，但仍会收集一般使用模式（例如功能采用率、活跃用户数）。')],
        [/^Model unavailable,\s*retrying(?:\s+in\s+(\d+)s)?(?:\s*\(attempt\s+(\d+)\/(\d+)\))?$/i, (m, sec, att, max) => {
            const attZh = att ? (('（第 ' + att + '/' + max + ' 次尝试）')) : '';
            if (sec) return ('模型暂不可用，' + sec + ' 秒后重试' + attZh);
            return ('模型暂不可用，正在重试' + attZh);
        }],
        [/^Waiting for command completion\s*\(up to (\d+) seconds\)$/i, (m, s) => ('正在等待命令完成（最多 ' + s + ' 秒）')],
        [/^Thinking \((\d+)s\)\.\.\.$/i, (m, s) => '正在思考 (' + s + ' 秒)...'],
        [/^Still thinking,\s*(\d+) seconds$/i, (m, s) => '仍在思考，' + s + ' 秒'],
        [/^Working\s*·\s*(\d+)s$/i, (m, s) => '工作中 · ' + s + ' 秒'],
        [/^Using browser(?:\s*·\s*(.+?))?(?:\s*\((\d+)s\))?$/i, (m, action, s) => {
            const act = action ? (' · ' + (lookupDict(action) || action)) : '';
            const dur = s ? (' (' + s + ' 秒)') : '';
            return ('正在使用浏览器') + act + dur;
        }],
        [/^(Started|Stopped) voice chat\s*·\s*(.+)$/i, (m, act, rest) => {
            const verb = /^Started/i.test(act) ? ('已开始语音对话 · ') : ('已结束语音对话 · ');
            return verb + rest;
        }],
        [/^Turns?\s+(\d+)(?:[–-](\d+))?$/i, (m, a, b) => b ? ('第 ' + a + '–' + b + (' 轮')) : ('第 ' + a + (' 轮'))],
        [/^(Turn|Tot):\s*(\d+)\/(\d+)$/i, (m, kind, a, b) => (/^Turn/i.test(kind) ? ('轮次：') : ('总计：')) + a + '/' + b],
        [/^(Today|Tomorrow|Yesterday)\s+(.+)$/i, (m, day, time) => {
            const dLow = day.toLowerCase();
            const dZh = dLow === 'today' ? '今天' : (dLow === 'tomorrow' ? '明天' : '昨天');
            return dZh + ' ' + time;
        }],
        [/^Daily at\s+(.+)$/i, (m, t) => '每天 ' + t],
        [/^Monthly on the\s+(.+?)\s+at\s+(.+)$/i, (m, d, t) => ('每月 ') + d + ' ' + t],
        [/^Every\s+(\d+)\s+(hours?|minutes?)(.*)$/i, (m, n, unit, rest) => {
            const uZh = /^hour/i.test(unit) ? (' 小时') : (' 分钟');
            return '每 ' + n + uZh + (rest || '');
        }],
        [/^(?:(\d+)d\s+)?(?:(\d+)h\s+)?(?:(\d+)m|(\d+)s)\s+left$/i, (m, d, h, min, sec) => {
            const parts = [];
            if (d) parts.push(d + ' 天');
            if (h) parts.push(h + (' 小时'));
            if (min) parts.push(min + (' 分钟'));
            if (sec) parts.push(sec + ' 秒');
            return ('剩余 ') + parts.join(' ');
        }],
        [/^(\d+)\s+(image|video|audio|file)\s+attachments?$/i, (m, n, kind) => {
            const kLow = kind.toLowerCase();
            const kZh = kLow === 'image' ? ('张图片附件')
                : kLow === 'video' ? ('个视频附件')
                : kLow === 'audio' ? ('个音频附件')
                : ('个文件附件');
            return n + ' ' + kZh;
        }],
        [/^(\d+)\s+attachments?$/i, (m, n) => n + (' 个附件')],
        [/^(?:(.+?)\s+)?\((\d+)\s+(?:(image|video|audio|file)\s+)?attachments?\)$/i, (m, prefix, n, kind) => {
            const kLow = kind ? kind.toLowerCase() : '';
            const kZh = kLow === 'image' ? ('张图片附件')
                : kLow === 'video' ? ('个视频附件')
                : kLow === 'audio' ? ('个音频附件')
                : kLow === 'file' ? ('个文件附件')
                : ('个附件');
            return (prefix ? prefix + ' ' : '') + '(' + n + ' ' + kZh + ')';
        }],
        [/^(\d+)\s+attachment\(s\)$/i, (m, n) => n + (' 个附件')],
        [/^(\d+)\s+of\s+(\d+)$/i, (m, a, b) => a + ' / ' + b],
        [/^(\d+)\s+archived conversations?$/i, (m, n) => n + (' 个已归档会话')],
        [/^(\d+)\s+background tasks?$/i, (m, n) => n + (' 个后台任务')],
        [/^(\d+)\s+browser steps?$/i, (m, n) => n + (' 个浏览器步骤')],
        [/^(\d+)\s+models?\s+selected$/i, (m, n) => ('已选择 ' + n + ' 个模型')],
        [/^(\d+)\s+waiting on you$/i, (m, n) => n + (' 项待您处理')],
        [/^(\d+)\s+Files?\s+With Changes$/i, (m, n) => n + (' 个文件有更改')],
        [/^(\d+)\s+files?\s+changed(?:\s+([+-]\d+(?:\s*[+-]\d+)?))?$/i, (m, n, diff) => n + (' 个文件已更改') + (diff ? (' ' + diff) : '')],
        [/^(\d+)\s*\/\s*(\d+)\s+steps?$/i, (m, done, total) => done + '/' + total + (' 步骤')],
        [/^(\d+)\s+lines?\s+added,\s*(\d+)\s+lines?\s+removed$/i, (m, a, b) => ('新增 ' + a + ' 行，删除 ' + b + ' 行')],
        [/^(\d+)\s+(questions?|turns?|comments?|subagents?|chunks?|accounts?|rows?)$/i, (m, n, kind) => {
            const k = kind.toLowerCase();
            const mapZh = { question: '个问题', questions: '个问题', turn: '轮', turns: '轮', comment: '条评论', comments: '条评论', subagent: '个子智能体', subagents: '个子智能体', chunk: '个区块', chunks: '个区块', account: '个账户', accounts: '个账户', row: '行', rows: '行' };
            return n + ' ' + (mapZh[k] || kind);
        }],
        [/^(\d+)\s+tasks?\s+running$/i, (m, n) => n + (' 个任务运行中')],
        [/^(\d+)\s+MCP servers? failed to start$/i, (m, n) => n + (' 个 MCP 服务器启动失败')],
        [/^Added MCP server "(.+?)",\s*but it failed to start:\s*(.+)$/i, (m, name, err) => ('已添加 MCP 服务器“' + name + '”，但启动失败：' + err)],
        [/^MCP server (.+?) requires authentication:\s*sign in to "(.+?)" in the Accounts section of plugin "(.+?)"$/i, (m, srv, acc, plug) => ('MCP 服务器 ' + srv + ' 需要身份验证：请在“' + plug + '”插件的“账户”部分登录“' + acc + '”')],
        [/^MCP server (.+?) requires authentication$/i, (m, srv) => ('MCP 服务器 ' + srv + ' 需要身份验证')],
        [/^(\d+)\s+customizations? failed to load$/i, (m, n) => n + (' 项自定义项加载失败')],
        [/^(\d+)\s+folders? in this project could not be loaded because their locations are invalid\.$/i, (m, n) => ('此项目中有 ' + n + ' 个文件夹因位置无效而无法加载。')],
        [/^(.+?) file uploads are not currently supported in remote mode$/i, (m, ext) => ('远程模式暂不支持上传 ' + ext + ' 文件')],
        [/^Pushed (\d+) commits? to (.+?)\.?$/i, (m, n, br) => ('已推送 ' + n + ' 个提交到 ' + br + '。')],
        [/^Pushed to (.+?)\.?$/i, (m, br) => ('已推送到 ') + br + '。'],
        [/^Published (.+?) to origin\.?$/i, (m, ref) => ('已发布 ') + ref + ' 至 origin。'],
        [/^Committed to (.+?)\.?$/i, (m, ref) => ('已提交到 ') + ref + '。'],
        [/^Amended commit on (.+?)\.?$/i, (m, ref) => ('已修订 ') + ref + (' 上的提交。')],
        [/^Checked out in (.+)$/i, (m, loc) => ('已在 ') + loc + (' 检出')],
        [/^(Generating|Generated|Generate) with (.+?) 🍌$/i, (m, verb, model) => {
            const vZh = /^Generating/i.test(verb) ? ('正在使用 ') : (/^Generated/i.test(verb) ? '已使用 ' : '使用 ');
            return vZh + model + (' 生成 🍌');
        }],
        [/^Ran command:\s*(.+)$/i, (m, cmd) => ('已运行命令：') + cmd],
        [/^Used MCP tool:\s*(.+)$/i, (m, tool) => ('已使用 MCP 工具：') + tool],
        [/^Used tool:\s*(.+)$/i, (m, tool) => ('已使用工具：') + tool],
        [/^(?:Searched web|Searched for|Internal search|Code search|Browser task):\s*"(.+)"$/i, (m, q) => {
            const prefix = /^Searched web/i.test(m) ? ('已搜索网页：')
                : /^Searched for/i.test(m) ? ('已搜索：')
                : /^Internal search/i.test(m) ? ('内部搜索：')
                : /^Code search/i.test(m) ? ('代码搜索：')
                : ('浏览器任务：');
            return prefix + (('“' + q + '”'));
        }],
        [/^Searched for files:\s*(.+)$/i, (m, q) => ('已搜索文件：') + q],
        [/^Opened browser:\s*(.+)$/i, (m, u) => ('已打开浏览器：') + u],
        [/^Viewed (.+)$/i, (m, target) => ('已查看 ') + target],
        [/^Listed directory (.+)$/i, (m, dir) => ('已列出目录 ') + dir],
        [/^Read URL:\s*(.+)$/i, (m, u) => ('已读取 URL：') + u],
        [/^Invoked subagent:\s*(.+)$/i, (m, name) => ('已调用子代理：') + name],
        [/^Generated image:\s*"(.+)"$/i, (m, p) => ('已生成图片：“') + p + ('”')],
        [/^Agent finished:\s*(.+)$/i, (m, summary) => ('智能体已完成：') + summary],
        [/^Side question failed:\s*(.+)$/i, (m, err) => ('侧边提问失败：') + err],
        [/^Side question \(conversation (.+?)\):\s*(.+)$/i, (m, cid, title) => ('侧边提问（会话 ') + cid + '）：' + title],
        [/^Credentials expire in (.+?)\. Refresh credentials to keep this automation running$/i, (m, dur) => ('凭据将在 ' + (formatUsageDuration(dur) || dur) + ' 后过期。请刷新凭据以保持此自动化任务运行')],
        [/^Connect an account for (.+?) so the agent can run automations\.$/i, (m, prov) => ('请为 ' + prov + ' 连接账户，以便智能体运行自动化任务。')],
        [/^Runs even when your computer is off\.\s*(Schedules and events\.|Schedules only\.)$/i, (m, kind) => ('即使计算机关闭也会运行。') + (/events/i.test(kind) ? ('定时与事件。') : ('仅定时。'))],
        [/^The selected (.+?) can't be found\. Pick another (.+?) from the (.+?) selector to send\.$/i, (m, n1, n2, n3) => ('找不到所选的' + translateNoun(n1) + '。请从' + translateNoun(n3) + '选择器中选择其他' + translateNoun(n2) + '以发送。')],
        [/^This (.+?) overrides your global permission settings\.$/i, (m, kind) => ('此' + translateNoun(kind) + '会覆盖您的全局权限设置。')],
        [/^(.+?) needs (.+?) to use your computer\.$/i, (m, app, perms) => {
            // 「needs both」原本会译成「需要 这两项权限 权限」
            if (/^both$/i.test(perms.trim())) return app + (' 需要这两项权限才能控制您的电脑。');
            const pZh = perms.replace(/Accessibility/gi, '“辅助功能”').replace(/Screen Recording/gi, '“屏幕录制”');
            return app + ' 需要' + pZh + ('权限才能控制您的电脑。');
        }],
        [/^Relaunch (.+?) to finish Screen Recording\.$/i, (m, app) => ('请重新启动 ' + app + ' 以完成“屏幕录制”设置。')],
        [/^Stop (\d+) items?\?$/i, (m, n) => ('确定要停止 ' + n + ' 个项目吗？')],
        [/^Show (\d+) more subagents?$/i, (m, n) => ('显示另外 ' + n + ' 个子代理')],
        [/^\+(\d+) more \(Show all\)$/i, (m, n) => ('另外 +' + n + ' 项（显示全部）')],
        [/^(.+?) needs you to sign in before it can be used\.$/i, (m, name) => name + (' 需要您先登录后才能使用。')],
        [/^No messages in last (\d+) steps\s*(?:·|—|,)\s*load (?:more|older)$/i, (m, n) => ('最近 ' + n + ' 步无消息 · 加载更早消息')],
        [/^No visible messages in last (\d+) steps\. Activate Load older messages to continue\.$/i, (m, n) => ('最近 ' + n + ' 步没有可见消息。请激活“加载更早的消息”以继续。')],
        [/^File exceeds the (\d+)MB display limit \((\d+)MB\), so it can't be opened or downloaded here\.$/i, (m, lim, sz) => ('文件超过 ' + lim + 'MB 显示上限（' + sz + 'MB），因此无法在此打开或下载。')],
        [/^File exceeds (\d+) bytes \((\d+) bytes\)$/i, (m, lim, sz) => ('文件超过 ' + lim + ' 字节（' + sz + ' 字节）')],
        [/^Recording exceeds 15MB limit \((\d+)MB\)$/i, (m, sz) => ('录音超过 15MB 上限（' + sz + 'MB）')],
        [/^Total media size exceeds (\d+)MB limit$/i, (m, lim) => ('媒体总大小超过 ' + lim + 'MB 上限')],
        [/^(.+?)'s server IP address could not be found\.$/i, (m, h) => ('找不到 ' + h + ' 的服务器 IP 地址。')],
        [/^(.+?) refused to connect\.$/i, (m, h) => h + (' 拒绝连接。')],
        [/^(.+?) took too long to respond\.$/i, (m, h) => h + (' 响应时间过长。')],
        [/^(.+?) could not find the requested page\.$/i, (m, h) => h + (' 找不到请求的页面。')],
        [/^(.+?) is currently unable to handle this request\.$/i, (m, h) => h + (' 当前无法处理此请求。')],
        [/^Check if there is a typo in (.+?), or open the page in your external browser\.$/i, (m, h) => {
            const hZh = /^the address$/i.test(h.trim()) ? ('地址') : h.trim();
            return ('请检查 ' + hZh + ' 是否有拼写错误，或在外部浏览器中打开该页面。');
        }],
        [/^(?:(Open|Reopen)\s+)?(Accessibility|Screen Recording) settings$/i, (m, act, pane) => {
            const pZh = /^Accessibility/i.test(pane) ? ('辅助功能') : ('屏幕录制');
            if (!act) return pZh + ('设置');
            return (/^Reopen/i.test(act) ? ('重新打开') : ('打开')) + pZh + ('设置');
        }],
        [/^Deleted cookies for (.+)$/i, (m, site) => ('已删除 ' + site + ' 的 Cookie')],
        [/^Moved conversation (.+)$/i, (m, target) => ('已移动会话 ') + target],
        [/^Adding plugins from (.+)$/i, (m, src) => ('正在从 ') + src + (' 添加插件')],
        [/^No connectors match "(.+)"$/i, (m, q) => ('没有匹配“' + q + '”的连接器')],
        [/^View (\d+) help(?: items?)? and (\d+) side questions?$/i, (m, h, s) => ('查看 ' + h + ' 条帮助和 ' + s + ' 个侧边提问')],
        [/^Work in (.+)$/i, (m, wt) => /^progress$/i.test(wt.trim()) ? m : (('在 ') + wt + ' 中工作')],
        [/^Work locally on (.+)$/i, (m, repos) => ('在本地处理 ') + repos],
        [/^Worktree from (.+)$/i, (m, repos) => ('创建工作树：') + repos],
        [/^Automatically create a new (.+?) workspace when the conversation starts$/i, (m, vcs) => ('会话开始时自动创建新的 ' + vcs + ' 工作区')],
        [/^(.+?)\.\s+(Show|Hide)\s+plan$/i, (m, title, verb) => title + '。' + (/^Hide/i.test(verb) ? ('隐藏计划') : ('显示计划'))],
        [/^Triggered (.+)$/, (m, name) => ('已触发 ') + name],
        [/^(.+?) download progress$/i, (m, name) => name + (' 下载进度')],
        [/^(.+?) color picker$/i, (m, name) => name + (' 颜色选择器')],
        [/^Error:\s*(.+)$/, (m, msg) => ('错误：') + msg],
        [/^(.+?),\s*showing (\d+) of (\d+)$/i, (m, title, b, c) => title + (('，正在显示第 ' + b + ' / ' + c + ' 项'))],
        [/^(.+?):\s*([\d,]+)\s+tokens$/i, (m, label, num) => (lookupDict(label) || label) + '：' + num + ' Token'],
        [/^(.+?)\.\s*View site information$/i, (m, summary) => summary + ('。查看站点信息')],
        [/^(\d+)\s+days$/i, (m, d) => d + ' 天'],
        [/^(.+?) annotation on page (\d+)$/i, (m, kind, p) => ('第 ' + p + ' 页的 ' + kind + ' 批注')],
        [/^Applied\s+(.+)$/i, (m, target) => ('已应用 ') + target],
        [/^Show\s+(.+?)\s+in the list again$/i, (m, host) => ('重新在列表中显示 ') + host],
        [/^Hook\s+((?:Json|Command|Prompt|Shell|Script)\s+[A-Za-z0-9_.:-]+|[A-Z][A-Za-z0-9_.:-]*(?:\s+[A-Za-z0-9_.:-]+){0,2})$/, (m, rest) => {
            if (/^(?:will|with|is|was|has|are|to|for|that|can|may|from|when|if)\b/i.test(rest.trim())) return m;
            return ('钩子 ') + rest;
        }],
        [/^(?:(·\s*))?Exited with code\s+(-?\d+)$/i, (m, dot, code) => (dot ? '· ' : '') + (('已退出，退出码 ' + code))],
        [/^(?:(·\s*))?Exit code\s+(-?\d+)$/i, (m, dot, code) => (dot ? '· ' : '') + (('退出码 ' + code))],
        [/^(?:(·\s*))?Exited with signal\s+([A-Za-z0-9_+-]+)$/i, (m, dot, sig) => (dot ? '· ' : '') + (('已因信号 ' + sig + ' 退出'))],
        [/^(.+?)\s*·\s*Exited with code\s+(-?\d+)$/i, (m, prefix, code) => {
            const pNorm = norm(prefix);
            const pZh = translateExactOrDynamic(pNorm) || prefix;
            return pZh + ((' · 已退出，退出码 ' + code));
        }],
        [/^(Running|Ran|Searching|Searched|Analyzing|Analyzed|Reading|Editing|Edited|Writing|Wrote|Creating|Created|Deleting|Deleted|Viewing|Listing|Listed|Checking|Checked|Calling|Called|Invoking|Invoked|Executing|Executed|Fetching|Fetched|Updating|Updated|Waiting for)\s+(.+)$/, (m, verb, rest) => {
            const restTrim = rest.trim();
            if (!restTrim || restTrim.length > 100 || /[.!?。！？]$/.test(restTrim)) return m;
            if (verb === 'Waiting for' && /^you\b/i.test(restTrim)) return m;
            const verbMap = {
                Running: ['正在运行', '正在執行'],
                Ran: ['已运行', '已執行'],
                Searching: ['正在搜索', '正在搜尋'],
                Searched: ['已搜索', '已搜尋'],
                Analyzing: ['正在分析', '正在分析'],
                Analyzed: ['已分析', '已分析'],
                Reading: ['正在读取', '正在讀取'],
                Editing: ['正在编辑', '正在編輯'],
                Edited: ['已编辑', '已編輯'],
                Writing: ['正在写入', '正在寫入'],
                Wrote: ['已写入', '已寫入'],
                Creating: ['正在创建', '正在建立'],
                Created: ['已创建', '已建立'],
                Deleting: ['正在删除', '正在刪除'],
                Deleted: ['已删除', '已刪除'],
                Viewing: ['正在查看', '正在檢視'],
                Listing: ['正在列出', '正在列出'],
                Listed: ['已列出', '已列出'],
                Checking: ['正在检查', '正在檢查'],
                Checked: ['已检查', '已檢查'],
                Calling: ['正在调用', '正在呼叫'],
                Called: ['已调用', '已呼叫'],
                Invoking: ['正在调用', '正在呼叫'],
                Invoked: ['已调用', '已呼叫'],
                Executing: ['正在执行', '正在執行'],
                Executed: ['已执行', '已執行'],
                Fetching: ['正在获取', '正在擷取'],
                Fetched: ['已获取', '已擷取'],
                Updating: ['正在更新', '正在更新'],
                Updated: ['已更新', '已更新'],
                'Waiting for': ['正在等待', '正在等待']
            };
            const vPair = verbMap[verb];
            if (!vPair) return m;
            const formattedRest = restTrim.replace(/(\s+)((?:\d+(?:d|h|m|s)\s*)+)$/i, (_, sp, dur) => {
                return sp + formatCompactDuration(dur);
            });
            return vPair[0] + ' ' + formattedRest;
        }],
        [/^Stream and control\s+(.+?)\s+directly in the side pane\.?$/i, (m, name) => ('直接在侧边面板中流式传输与控制 ' + name + '。')],
        [/^Applies to \/btw and messages sent after this turn\.?$/i, () => '适用于 /btw 及本轮之后发送的消息'],
        [/^Applies to messages sent after this turn\.?$/i, () => '适用于本轮之后发送的消息'],
        [/^(\.\.\.\s*)?([\d,]+)\s+more\s+(lines?|characters?|chars?|bytes?|items?),\s*truncated for display\.?$/i, (m, ellipsis, num, unit) => {
            const uLow = unit.toLowerCase();
            const uZh = uLow.startsWith('line') ? '行'
                : (uLow.startsWith('char') ? ('个字符')
                : (uLow.startsWith('byte') ? ('个字节')
                : ('项')));
            return (ellipsis ? '... ' : '') + (('还有 ' + num + ' ' + uZh + '，已截断显示。'));
        }],
        [/^(\.\.\.\s*)?truncated for display\.?$/i, (m, ellipsis) => (ellipsis ? '... ' : '') + ('已截断显示。')],

        // 安全白名单通用动作按钮模板（仅匹配受控 UI 实体名词，防止单字或代码标识符误翻）
        [/^(Add|Cancel|Close|Configure|Connect|Delete|Disconnect|Enable|Install|New|Open|Reconnect|Remove|Restart|Stop|Toggle|View)\s+(?:the\s+)?([a-zA-Z][a-zA-Z ]{1,30})(\??)$/i, (m, verb, noun, qMark) => {
            const nLow = norm(noun).toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(ENTITY_NOUN_MAP, nLow)) return m;
            const vPair = ACTION_VERB_MAP[verb.toLowerCase()];
            if (!vPair) return m;
            const vZh = vPair[0];
            const nZh = ENTITY_NOUN_MAP[nLow][0];
            const qSuffix = qMark ? ('吗？') : '';
            return vZh + nZh + qSuffix;
        }],
    ];

    function translateExactOrDynamic(t) {
        const usageTrans = translateUsageText(t);
        if (usageTrans) return usageTrans;
        const shortcutTrans = translateWithShortcut(t);
        if (shortcutTrans) return shortcutTrans;
        if (map.has(t)) return map.get(t);
        const lower = t.toLowerCase();
        if (lowerMap.has(lower)) return lowerMap.get(lower);
        for (const [regex, replacer] of DYNAMIC_RULES) {
            if (regex.test(t)) return t.replace(regex, replacer);
        }
        return null;
    }

    // 处理受父节点上下文约束的碎片化 DOM 文本
    function translateContextualText(node, originalVal, valNorm) {
        const p = node.parentElement;
        if (!p) return null;
        const pText = dfsParentTexts.get(p) || originalParentTexts.get(p) || p.textContent || '';

        if (/^(\d+)(s|m|h|d|w|mo|yr)$/i.test(valNorm)) {
            return valNorm.replace(/^(\d+)(s|m|h|d|w|mo|yr)$/i, (match, num, unit) => {
                const pair = UNIT_MAP[unit.toLowerCase()];
                let unitStr = pair ? pair[0] : unit;
                if (typeof p.closest === 'function' && p.closest('[data-testid="conversation-row-sidebar"]')) {
                    unitStr += "前";
                }
                return num + unitStr;
            });
        }
        if (valNorm === 'now' && typeof p.closest === 'function' && p.closest('[data-testid="conversation-row-sidebar"], [data-testid="conversation-row-history"]')) {
            return '刚刚';
        }
        if (/^(?:\d+(?:d|h|m|s)\s+)+\d+(?:d|h|m|s)$/i.test(valNorm)) {
            return formatCompactDuration(valNorm);
        }
        if (valNorm === 'Hook' && /^Hook\s+(?:Json|Command|Prompt|Shell|Script|SessionStart|SessionEnd|PreToolUse|PostToolUse|PreInvocation|PostInvocation|UserPromptSubmit|SubagentStop|PreCompact)\b/i.test(pText.trim())) {
            return '钩子';
        }
        if ((valNorm === 'directly in the side pane.' || valNorm === 'directly in the side pane') && /Stream and control|流式传输与控制|串流傳輸與控制/i.test(pText)) {
            return '。';
        }
        if ((valNorm === 'Type' || valNorm === 'Command') && findSidecarDetailsModal(p)) {
            return valNorm === 'Type' ? ('类型') : ('命令');
        }
        if (/messages sent after this turn|本轮之后发送的消息|本輪之後傳送的訊息/i.test(pText)) {
            if (valNorm === 'Applies to') return '适用于 ';
            if (/^and messages sent after this turn\.?$/i.test(valNorm)) {
                const dot = valNorm.endsWith('.') ? '。' : '';
                return (' 及本轮之后发送的消息') + dot;
            }
        }
        if (/^steps?$/i.test(valNorm)) {
            const gp = p.parentElement && typeof document !== 'undefined' && p.parentElement !== document.body && p.parentElement !== document.documentElement ? p.parentElement : null;
            const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
            if (/^\d+\s*\/\s*\d+\s*steps?$/i.test(pText.trim()) || (gpText.length < 80 && /^\d+\s*\/\s*\d+\s*steps?$/i.test(gpText.trim()))) {
                return (originalVal.startsWith(' ') ? ' ' : '') + ('步骤');
            }
        }
        if (/^more\s+(lines?|characters?|chars?|bytes?|items?),\s*truncated for display\.?$/i.test(valNorm)) {
            const gp = p.parentElement && typeof document !== 'undefined' && p.parentElement !== document.body && p.parentElement !== document.documentElement ? p.parentElement : null;
            const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
            const ctxText = /\d/.test(pText) ? pText : (gpText.length < 200 ? gpText : '');
            if (/\d[\d,]*\s+more\s+(?:lines?|characters?|chars?|bytes?|items?),\s*truncated for display/i.test(ctxText)) {
                const uLow = valNorm.match(/^more\s+(\w+)/i)[1].toLowerCase();
                const uZh = uLow.startsWith('line') ? '行'
                    : (uLow.startsWith('char') ? ('个字符')
                    : (uLow.startsWith('byte') ? ('个字节')
                    : ('项')));
                return (originalVal.startsWith(' ') ? ' ' : '') + uZh + ('，已截断显示。');
            }
        }
        const toolLabelZh = lookupToolCallSectionLabel(valNorm);
        if (toolLabelZh && norm(pText) === valNorm && hasAdjacentCodeBlock(p)) {
            return toolLabelZh;
        }
        if (/^(?:·\s*)?Exited with code$/i.test(valNorm)) {
            const gp = p.parentElement && typeof document !== 'undefined' && p.parentElement !== document.body && p.parentElement !== document.documentElement ? p.parentElement : null;
            const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
            if (/Exited with code\s+-?\d+/i.test(pText) || (gpText.length < 120 && /Exited with code\s+-?\d+/i.test(gpText))) {
                const leadDot = valNorm.startsWith('·') ? '· ' : '';
                const trail = originalVal.endsWith(' ') ? ' ' : '';
                return leadDot + ('已退出，退出码') + trail;
            }
        }
        if ((valNorm === 'Card' || valNorm === 'of') && ((typeof p.closest === 'function' && p.closest('[data-testid="card-deck-counter"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'card-deck-counter'))) {
            return valNorm === 'Card' ? "卡片 " : " / ";
        }
        if (pText.includes('For corp passwords (such as') || pText.includes('如需使用公司密码（例如') || pText.includes('如需使用公司密碼（例如')) {
            if (valNorm === 'For corp passwords (such as') return "如需使用公司密码（例如 ";
            if (valNorm === 'or') return " 或 ";
            if (valNorm.startsWith('), use an external SSH session')) return valNorm.replace(/^\), use an external SSH session/i, "），请使用外部 SSH 会话");
            if (valNorm.startsWith('. For non-corp passwords')) return "。对于非公司密码或 SSH 密码短语，请允许下一次提示并重新运行命令。";
        }
        if ((valNorm === 'Type' || valNorm === 'and select') && ((typeof p.closest === 'function' && p.closest('[data-testid="plan-command-fyi-alert"]')) || pText.includes('generate a plan'))) {
            return valNorm === 'Type' ? ("输入") : ("并选择");
        }
        if (valNorm === 'and' && (pText.includes('Privacy Policy') || pText.includes('Terms of Service') || pText.includes('隐私政策') || pText.includes('隱私權政策'))) {
            return "以及";
        }
        if (valNorm === 'Variables' && ((typeof p.closest === 'function' && (p.closest('[data-testid="trigger-cel-tokens"]') || p.closest('[data-testid="trigger-cel-optional-section"]'))) || /Target|Fields|Helpers|目标|目標|字段|欄位/.test(pText))) {
            return "变量";
        }
        if ((valNorm === 'Search conversations with' || valNorm === 'in the top left.') && (pText.includes('in the top left') || pText.includes('可通过左上角的') || pText.includes('使用左上角的'))) {
            return valNorm === 'Search conversations with' ? ("可通过左上角的") : ("搜索对话。");
        }
        if ((valNorm === 'View archived in the sidebar' || valNorm === 'menu)') && (pText.includes('View archived in the sidebar') || pText.includes('已归档对话可在侧边栏') || pText.includes('已封存對話可在側邊欄') || pText.includes('已歸檔對話可在側邊欄'))) {
            return valNorm === 'View archived in the sidebar' ? ("已归档对话可在侧边栏") : ("菜单中查看。");
        }
        if ((valNorm === 'For help, visit' || valNorm === 'or join the' || valNorm === 'chat space') && (pText.includes('chat space') || pText.includes('聊天空间') || pText.includes('聊天空間'))) {
            if (valNorm === 'For help, visit') return "如需帮助，请访问";
            if (valNorm === 'or join the') return "或加入";
            if (valNorm === 'chat space') return "聊天空间";
        }
        if ((valNorm === 'when working' || valNorm === 'in this project' || valNorm === 'in these conversations') && /when working|Global Permissions|全局权限|全域權限|Global Settings|全局设置|全域設定|在此项目中工作时|在此專案中工作時|在这些会话中工作时|在這些對話中工作時/.test(pText)) {
            if (valNorm === 'when working') {
                return pText.includes('in this project')
                    ? ("（在此项目中工作时）")
                    : ("（在这些会话中工作时）");
            }
            return "";
        }
        if ((valNorm === 'Use' || originalVal === 'Use ') && ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker-use"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'voice-picker-use'))) {
            return "使用 ";
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker"]')) || (p.querySelector && p.querySelector('[data-testid="voice-picker-settings-link"]'))) {
            if (valNorm.startsWith('Powered by Gemini Live')) return "由 Gemini Live 提供技术支持 · ";
            if (valNorm === 'You can change this in') return "您稍后可在 ";
            if (valNorm === 'later.') return " 中更改。";
        }
        if (valNorm === 'No' && p.tagName === 'SPAN') {
            const writeIn = p.nextElementSibling;
            const hint = '(tell the agent what to do instead)';
            const placeholder = writeIn && typeof writeIn.getAttribute === 'function' ? writeIn.getAttribute('placeholder') : null;
            if (writeIn && typeof writeIn.matches === 'function' && writeIn.matches('textarea[data-testid="ask-question-writein"]') &&
                (placeholder === hint || placeholder === map.get(hint))) {
                return '否';
            }
        }
        if ((valNorm === 'Proceed to' || valNorm === '(unsafe)') && (pText.includes('Proceed to') || pText.includes('继续前往') || pText.includes('繼續前往')) && (pText.includes('(unsafe)') || pText.includes('（不安全）'))) {
            return valNorm === 'Proceed to' ? ("继续前往 ") : ("（不安全）");
        }
        if (valNorm === 'Customize your experience from visual themes to how autonomous your agent acts and what') {
            return "自定义您的使用体验，从视觉主题到智能体的自主程度以及 ";
        }
        if (valNorm === "Customize your experience across the agent, plugins, and product from the settings and marketplace. We won't show you ads or let advertisers influence what") {
            return "从设置与市场中自定义您在智能体、插件及产品上的各项体验。我们不会向您展示广告，也不会让广告主影响 ";
        }
        if (valNorm === 'says.' && (pText.includes('autonomous') || pText.includes('自主程度') || pText.includes('influence what') || pText.includes('广告主影响') || pText.includes('廣告客戶影響'))) {
            return (pText.includes('influence what') || pText.includes('广告主影响') || pText.includes('廣告客戶影響'))
                ? (" 所说的内容。")
                : " 的提示音。";
        }
        if (valNorm === "'s agents are powerful. They can edit files, run commands, and browse the web.") {
            return " 的智能体功能强大，可以编辑文件、运行命令以及浏览网页。";
        }
        if (valNorm === "'s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.") {
            return " 的智能体功能强大，可帮助您比以往更好、更快地完成更多工作，但仍请务必核验智能体执行的操作。";
        }
        if (valNorm === '(excluding product analytics data)' && (pText.includes('Privacy Notice') || pText.includes('隐私声明') || pText.includes('隱私聲明') || pText.includes('隱私權聲明'))) {
            return "（不含产品分析数据）";
        }
        if (valNorm === 'Sign up for newsletters, informational emails, and special offers about') {
            return "订阅有关 ";
        }
        if (valNorm === '.' && (pText.includes('Sign up for newsletters') || pText.includes('订阅有关') || pText.includes('訂閱有關') || pText.includes('订阅关于') || pText.includes('訂閱關於'))) {
            const curText = p.textContent || '';
            return (pText.includes('tips and tricks') || pText.includes('以下内容') || pText.includes('以下內容') || curText.includes('以下内容') || curText.includes('以下內容'))
                ? "。"
                : (" 的新闻通讯、资讯邮件和特别优惠。");
        }
        if ((valNorm === 'For' || valNorm === ',') && (pText.includes('does not collect and use your Interactions data') || pText.includes('does not collect any of your prompts') || pText.includes('不会收集您的任何提示') || pText.includes('不會收集您的任何提示'))) {
            if (valNorm === 'For') return "对于 ";
            if (valNorm === ',') return "，";
        }
        if (valNorm === 'does not collect and use your Interactions data for model training, and retains it only to provide the service.') {
            return " 不会收集或使用您的交互数据进行模型训练，仅为提供服务而保留该数据。";
        }
        if (valNorm.startsWith('does not collect any of your prompts, content, or model responses') && valNorm.includes('general usage patterns such as feature adoption')) {
            return " 不会收集您的任何提示词、内容或模型回复，但会收集功能采用率与活跃用户数等常规使用模式（“产品分析”）。遥测数据将按照 Google 隐私政策处理。";
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="post-onboarding-welcome-tip"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'post-onboarding-welcome-tip') || pText.includes('to switch to the Gemini app')) {
            if (valNorm === 'Press') return " 按 ";
            if (valNorm === 'to switch to the Gemini app. Your agents keep working in the background.') {
                return " 即可切换至 Gemini 应用。您的智能体会在后台继续运行。";
            }
        }
        if (valNorm === 'To switch accounts, sign out in the') {
            return "如需切换账户，请在";
        }
        if ((valNorm === 'settings page' || valNorm === 'settings page.') && (pText.includes('switch accounts') || pText.includes('切换账户') || pText.includes('切換帳戶'))) {
            return (valNorm.endsWith('.') ? "设置页面。" : "设置页面");
        }
        if (valNorm === 'and sign in again.' && (pText.includes('switch accounts') || pText.includes('切换账户') || pText.includes('切換帳戶'))) {
            return "中退出登录并重新登录。";
        }
        if (valNorm === 'There are currently no Build with') {
            return "当前没有可用的 Build with ";
        }
        if (valNorm === 'plugins available.' && (pText.includes('Build with') || pText.includes('目前沒有可用的') || pText.includes('当前没有可用的'))) {
            return " 插件。";
        }
        if (valNorm === 'Not referenced by any feature (' && pText.includes('Not referenced by any feature')) {
            return "未被任何功能引用 (";
        }
        if (valNorm === 'Only for' && (pText.includes('overrides Global') || pText.includes('覆盖全局') || pText.includes('覆寫全域'))) {
            return "仅针对 ";
        }
        if ((valNorm === 'Allow' || valNorm === 'to access your microphone in' || valNorm === 'to use Voice.') && (pText.includes('to use Voice') || pText.includes('访问您的麦克风') || pText.includes('存取您的麥克風'))) {
            if (valNorm === 'Allow') return "请允许 ";
            if (valNorm === 'to access your microphone in') return " 在 ";
            if (valNorm === 'to use Voice.') return " 中访问您的麦克风以使用语音功能。";
        }
        if (p.id === 'replay-label' || (typeof p.closest === 'function' && p.closest('#replay-label'))) {
            const ofMatch = valNorm.match(/^of\s+(\d+)(?:\s*·\s*#(\d+)\s+at\s+(.+?)\s*\(\+([^)]+)\))?$/i);
            if (ofMatch) {
                return " / " + ofMatch[1] + (ofMatch[2]
                    ? (" · #" + ofMatch[2] + (" 于 ") + ofMatch[3] + " (+" + formatCompactDuration(ofMatch[4]) + ")")
                    : "");
            }
            const overMatch = valNorm.match(/^over\s+(.+)$/i);
            if (overMatch) {
                return (" · 历时 ") + formatCompactDuration(overMatch[1]);
            }
        }
        if (p.tagName === 'OPTION' && p.parentElement) {
            if (p.parentElement.id === 'f-agent' && /^From\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^From\s+(.+)$/i, (_, who) => ("来自 ") + who);
            }
            if (p.parentElement.id === 'f-mention' && /^To\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^To\s+(.+)$/i, (_, who) => ("发给 ") + who);
            }
        }
        if (p.classList && p.classList.contains('chip-name') && /\s+\(you\)$/i.test(valNorm)) {
            return valNorm.replace(/\s+\(you\)$/i, "（你）");
        }
        if (p.classList && p.classList.contains('size') && /\d+\s+lines?$/i.test(valNorm)) {
            return valNorm.replace(/(\d+)\s+lines?$/i, "$1 行");
        }
        if (p.id === 'empty-body') {
            if (valNorm === 'Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with') {
                return "在此会话中启动的 Swarm 会自动显示在这里，包含看板、成员列表和 @提及关系图。输入 ";
            }
            if (valNorm === 'Open this pane from a conversation to see its swarm. Swarms started there appear here automatically; start one with') {
                return "请从会话中打开此面板以查看其 Swarm。在会话中启动的 Swarm 会自动显示在这里；输入 ";
            }
            if (valNorm === '.') {
                return " 即可启动。";
            }
        }
        if (p.id === 'ov-notice' || (typeof p.closest === 'function' && p.closest('#ov-notice'))) {
            if (valNorm === 'The narrator (') return "解说员 (";
            if (valNorm === ') was stopped. Ask the coordinator to add a new one (') {
                return ") 已停止。可让协调器新增一个 (";
            }
            if (valNorm === ').') return ")。";
        }
        if (p.id === 'ov-ack' || (typeof p.closest === 'function' && p.closest('#ov-ack'))) {
            if (/^Last change:\s*[“"]$/i.test(valNorm)) return "上次变更：“";
            if (/^[”"]$/.test(valNorm)) return "”";
        }
        if ((p.classList && p.classList.contains('o2-progt')) || (typeof p.closest === 'function' && p.closest('.o2-progt'))) {
            const progMatch = valNorm.match(/^(\d+)\s+of\s+(\d+)$/i);
            if (progMatch) return progMatch[1] + " / " + progMatch[2];
            if (/^tasks?\s+done$/i.test(valNorm)) {
                return (originalVal.startsWith(' ') ? ' ' : '') + ("项任务已完成");
            }
        }
        if (valNorm === 'Missing' && p.getAttribute && /^computer-permissions-badge-/.test(p.getAttribute('data-testid') || '')) {
            return '未授权';
        }
        if (pText.includes('macOS Privacy & Security') || pText.includes('隐私与安全性') || pText.includes('隱私權與安全性')) {
            if (valNorm === 'Click') return '点击 ';
            if (valNorm === 'to open macOS Privacy & Security.') return ' 以打开 macOS“隐私与安全性”。';
        }
        if (pText.includes('Type one above') || pText.includes('请在上方直接输入') || pText.includes('請在上方直接輸入')) {
            if (valNorm === 'No hosts in') return '在 ';
            if (valNorm === 'yet. Type one above.') return ' 中暂未配置主机，请在上方直接输入。';
        }
        if (pText.includes('Microphone blocked. Allow in') || pText.includes('麦克风已被阻止。请在') || pText.includes('麥克風已被封鎖。請在')) {
            if (valNorm === '.') return '。';
        }
        if (valNorm === "Couldn't connect to" && typeof p.closest === 'function' && p.closest('[data-testid="ssh-connect-error"]')) {
            return '无法连接到 ';
        }
        if (valNorm === 'Layout' && p.parentElement && p.parentElement.hasAttribute && p.parentElement.hasAttribute('data-agy-layout-bar')) {
            return '布局';
        }
        if ((p.hasAttribute && p.hasAttribute('data-agy-layout-option')) || (typeof p.closest === 'function' && p.closest('[data-agy-layout]'))) {
            if (valNorm === 'Stage') return '舞台';
            if (valNorm === 'Desktop') return '桌面';
            if (valNorm === 'Grid') return '网格';
        }
        if ((valNorm === 'thread' || valNorm === 'threads') && typeof p.closest === 'function' && p.closest('.hv-sum')) {
            return ' 条工作线';
        }
        if (valNorm === "Couldn't delete cookies for" && (pText.includes('cookies') || pText.includes('Cookie'))) {
            return '无法删除以下网站的 Cookie：';
        }
        if (valNorm === '. Try again.' && (
            (typeof p.closest === 'function' && p.closest('[data-testid="browser-site-data-delete-error"]')) ||
            (p.getAttribute && p.getAttribute('data-testid') === 'browser-site-data-delete-error')
        )) {
            return '，请重试。';
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="browser-site-data-no-match"]')) ||
            (p.getAttribute && p.getAttribute('data-testid') === 'browser-site-data-no-match')) {
            if (valNorm === 'No sites match "') {
                return '没有匹配“';
            }
            if (valNorm === '".') {
                return '”的网站。';
            }
        }
        // v2.35.1 用独立的 " " 文字节点夹着 <code>antigravity.</code>，译文不再自带空格（否则出现双空格）；
        // 空格写在同一个文字节点里的旧结构则照原文保留
        if (valNorm === 'Inspect live bindings or record custom key chords filtered to') {
            return ('查看实时按键绑定或录制自定义组合键，当前筛选范围为') + (/\s$/.test(originalVal) ? ' ' : '');
        }
        if (valNorm === 'commands.' && (pText.includes('Inspect live bindings') || pText.includes('实时按键绑定') || pText.includes('即時按鍵繫結') || pText.includes('实时绑定') || pText.includes('即時綁定'))) {
            return (/^\s/.test(originalVal) ? ' ' : '') + ('命令。');
        }
        if ((valNorm === 'Initialized with' || valNorm === 'Declared by') && p.tagName === 'SPAN' && p.nextElementSibling && p.nextElementSibling.tagName === 'CODE') {
            return valNorm === 'Initialized with'
                ? ('初始化来源')
                : ('声明来源');
        }
        if (valNorm === 'Messages now send immediately. Configure in') {
            return '消息现已改为立即发送。可在';
        }
        // 「Configure in <settings>.」的句点与链接同在 whitespace-nowrap 的 span 内
        const msgHead = p.parentElement && p.parentElement.firstChild;
        if (valNorm === '.' && msgHead && msgHead.nodeType === Node.TEXT_NODE && /^(?:Messages now send immediately|訊息現已改為立即傳送|消息现已改为立即发送)/.test((msgHead.nodeValue || '').trim())) {
            return '中调整。';
        }
        if (valNorm === 'In System Settings, click') {
            return '在“系统设置”中，点击 ';
        }
        if (valNorm === 'In System Settings, turn on') {
            return '在“系统设置”中，开启 ';
        }
        if (valNorm === 'Already on? Select') {
            return '已经开启？请选择 ';
        }
        // macOS 权限引导句（电脑操作权限状态栏）：React Fragment 把句子拆成文字节点与 <strong>App</strong>／<strong>+</strong>
        if (typeof p.getAttribute === 'function' && p.getAttribute('role') === 'status' && /System Settings|系統設定|系统设置/.test(pText)) {
            const guide = {
                ". If it isn't in the list, drag it in from the small window next to System Settings.": ['。如果列表中没有，请从“系统设置”旁的小窗口将它拖入。', '。如果清單中沒有，請從「系統設定」旁的小視窗將它拖曳進來。'],
                ', choose': ['，选择', '，選取'],
                ', then turn it on.': ['，然后将其开启。', '，然後將它開啟。'],
                ', click': ['，点击 ', '，按一下 '],
                ', then': ['，然后', '，然後'],
                'drag it back in from the small window.': ['从小窗口将它重新拖入。', '從小視窗將它重新拖曳進來。'],
                'click': ['点击 ', '按一下 '],
                'and add it again.': [' 重新添加。', ' 重新加入。']
            };
            if (Object.prototype.hasOwnProperty.call(guide, valNorm)) return guide[valNorm][0];
        }
        // 自动化排程摘要：<b>Weekly</b> on <b>Monday</b> around <b>9:00 AM</b>
        if ((valNorm === 'around' || valNorm === 'on') && typeof p.querySelector === 'function' && p.querySelector('.font-semibold') &&
            /^(?:Daily|Weekdays|Weekly|每天|平日|工作日|每週|每周)/.test(pText.trim())) {
            return valNorm === 'around' ? ('约') : '';
        }
        // 声明权限说明句结尾：「…which you can change anytime in the <project> settings page.」
        if (valNorm === 'settings page.' && /its own permissions|獨立權限|独立权限/.test(pText)) {
            return '设置页面中更改。';
        }
        // 插件详情页找不到项目：「No plugin found for <code>id</code>.」（前半句由词典翻译）
        if (valNorm === '.' && typeof p.querySelector === 'function' && p.querySelector('.font-mono') &&
            /^(?:No (?:app|plugin|bundle) found for|找不到(?:應用程式|外掛程式)|未找到(?:应用|插件))/.test(pText.trim())) {
            return '。';
        }
        // 运行中项目批量选择栏：「3 selected」
        if (valNorm === 'selected' && typeof p.closest === 'function' && p.closest('[data-testid="running-selection-bar"]')) {
            return ' 项已选中';
        }
        if (valNorm === 'FAQ' && p.tagName === 'A' && p.parentElement && (dfsParentTexts.get(p.parentElement) || originalParentTexts.get(p.parentElement) || p.parentElement.textContent || '').match(/visiting our|造訪我們的|访问我们的|了解更多请访问|請造訪/)) {
            return '常见问题';
        }
        if ((valNorm === 'In this case,' || valNorm === 'chunks were collapsed into one. Chunks included in this read:') && pText.includes('chunks were collapsed into one')) {
            return valNorm === 'In this case,'
                ? ('在此情况下，已将 ')
                : (' 个区块合并为单个区块。此次读取包含的区块：');
        }
        if (valNorm === 'Start Best-of-' && /^Start Best-of-\d+$/i.test(pText.trim())) {
            return '启动 Best-of-';
        }
        if (valNorm === 'Generation Steps (' && /^Generation Steps \(\d+\)$/.test(pText.trim())) {
            return '生成步骤 (';
        }
        if ((valNorm === 'Show more (' && /^Show more \(\d+\)$/.test(pText.trim())) || (valNorm === 'Show submitted (' && /^Show submitted \(\d+\)$/.test(pText.trim()))) {
            return valNorm === 'Show more ('
                ? ('显示更多 (')
                : ('显示已提交 (');
        }
        if (pText.includes('No MCP servers found for "') || pText.includes('未找到与“') || pText.includes('找不到與「')) {
            if (valNorm === 'No MCP servers found for "') return '未找到与“';
            if (valNorm === '"') return '”匹配的 MCP 服务器';
        }
        if (valNorm === 'If that machine is a cloudtop, reach it via') {
            return '如果该机器是 Cloudtop，请通过以下方式访问：';
        }
        return null;
    }

    const COORDINATOR_ICON_LABELS = {
        'Robot': ['机器人', '機器人'],
        'Tree': ['树状图', '樹狀圖'],
        'Hub': ['枢纽', '樞紐'],
        'Sliders': ['滑块', '滑桿'],
        'Terminal window': ['终端窗口', '終端機視窗'],
        'Command prompt': ['命令提示符', '命令提示字元'],
        'Code': ['代码', '程式碼'],
        'Sparkles': ['闪光', '閃光'],
        'Wrench': ['扳手', '扳手'],
        'Shield': ['盾牌', '盾牌'],
        'Speedometer': ['速度表', '速度表'],
        'Gauge': ['仪表', '儀表'],
        'Eye': ['眼睛', '眼睛'],
        'Flask': ['烧瓶', '燒瓶'],
        'Radar': ['雷达', '雷達'],
        'Bot': ['机器人', '機器人']
    };
    const COORDINATOR_COLOR_LABELS = {
        'Blue': ['蓝色', '藍色'],
        'Purple': ['紫色', '紫色'],
        'Teal': ['青色', '青色'],
        'Green': ['绿色', '綠色'],
        'Amber': ['琥珀色', '琥珀色'],
        'Orange': ['橙色', '橙色'],
        'Red': ['红色', '紅色'],
        'Indigo': ['靛蓝色', '靛藍色']
    };

    const protectedPluginNames = new WeakMap();
    const PLUGIN_UI_CHROME_SET = new Set([
        'install', 'uninstall', 'enable', 'disable', 'configure', 'settings', 'remove', 'update',
        'details', 'more', 'open marketplace', 'marketplace', 'plugins', 'plugin', 'see more',
        'see less', 'show more', 'show less', 'active', 'disabled', 'installed', 'running',
        'stopped', 'connected', 'not connected', 'sign in', 'sign out', 'authentication required',
        'plugin permissions', 'plugins options', 'no plugins available', 'no plugins installed',
        'add', 'cancel', 'close', 'open', 'refresh', 'retry', 'try again', 'manage', 'back',
        'delete', 'edit', 'search', 'filter', 'loading...', 'show all', 'see all',
        'side pane ui available', 'recent events', 'full logs', 'host endpoint', 'uptime',
        'status', 'type', 'command', 'restart', 'open in side pane', 'managed by plugin'
    ]);
    const BUILTIN_AUX_TABS = new Set([
        'review', 'files', 'terminal', 'browser', 'changes', 'diff', 'preview', 'editor',
        'artifacts', 'problems', 'output', 'console', 'logs', 'timeline', 'inspector',
        'search', 'plan', 'swarm', 'overview', 'board', 'members', 'graph', 'raw', 'hive',
        'open file', 'side question', 'side questions', 'skills used'
    ]);

    function findSidecarDetailsModal(el) {
        const startEl = el && el.nodeType === Node.ELEMENT_NODE ? el : (el && el.parentElement) || null;
        if (!startEl) return null;
        const hasSidecarMarkers = (node) => {
            const txt = node.textContent || '';
            return txt.length > 0 && txt.length < 4000 && (
                txt.includes('Side Pane UI Available') ||
                txt.includes('侧边面板界面可用') ||
                txt.includes('側邊面板介面可用') ||
                txt.includes('Host Endpoint') ||
                txt.includes('主机端点') ||
                txt.includes('主機端點') ||
                txt.includes('Managed by plugin') ||
                txt.includes('由插件管理') ||
                txt.includes('由外掛程式管理')
            );
        };
        const dialog = typeof startEl.closest === 'function' ? startEl.closest('[role="dialog"], [aria-modal="true"]') : null;
        if (dialog) {
            return hasSidecarMarkers(dialog) ? dialog : null;
        }
        let cur = startEl;
        for (let depth = 0; cur && depth < 10 && typeof document !== 'undefined' && cur !== document.body && cur !== document.documentElement; depth++, cur = cur.parentElement) {
            if (typeof cur.querySelector === 'function' && cur.querySelector('[role="dialog"], [aria-modal="true"]')) {
                return null;
            }
            if (hasSidecarMarkers(cur)) {
                return cur;
            }
        }
        return null;
    }

    function recordProtectedPluginName(el, name) {
        if (!el || !name) return;
        const clean = norm(name);
        if (!clean) return;
        let set = protectedPluginNames.get(el);
        if (!set) {
            set = new Set();
            protectedPluginNames.set(el, set);
        }
        set.add(clean.toLowerCase());
    }

    function isSlashCommandNameNode(node, valNorm) {
        if (!valNorm || valNorm.includes(' ')) return false;
        if (/^\/[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(valNorm)) return true;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(valNorm)) return false;
        const prevText = node && node.previousSibling ? norm(node.previousSibling.textContent || '') : '';
        if (prevText === '/' || prevText.endsWith('/')) return true;
        const el = node && node.parentElement ? node.parentElement : null;
        if (!el) return false;
        if (el.previousElementSibling && norm(el.previousElementSibling.textContent || '').endsWith('/')) {
            return true;
        }
        const item = typeof el.closest === 'function'
            ? el.closest('[role="option"], [role="menuitem"], [cmdk-item], [data-testid*="slash"], [data-testid*="command-menu"], [data-testid*="action-menu"]')
            : null;
        if (item && valNorm === valNorm.toLowerCase()) {
            const hasSiblingDesc = Boolean(
                (el.nextElementSibling && norm(el.nextElementSibling.textContent || '')) ||
                (el.parentElement && el.parentElement !== item && el.parentElement.nextElementSibling && norm(el.parentElement.nextElementSibling.textContent || ''))
            );
            const itemText = norm(item.textContent || '');
            if (hasSiblingDesc || itemText.startsWith('/' + valNorm)) {
                return true;
            }
        }
        return false;
    }

    function isSidebarPluginNameNode(node, valNorm) {
        if (!valNorm || valNorm.length > 48 || /[.!?。！？]$/.test(valNorm)) return false;
        const low = valNorm.toLowerCase();
        if (PLUGIN_UI_CHROME_SET.has(low)) return false;
        const el = node && node.parentElement ? node.parentElement : null;
        if (el && typeof document !== 'undefined' && el !== document.body && el !== document.documentElement) {
            const tabEl = typeof el.closest === 'function'
                ? el.closest('[role="tab"], [data-testid*="plugin-tab"], [data-testid*="sidecar-tab"]')
                : null;
            if (tabEl) {
                const tabBar = typeof tabEl.closest === 'function' ? (tabEl.closest('[role="tablist"]') || tabEl.parentElement) : tabEl.parentElement;
                let hasSidecarSibling = typeof tabEl.matches === 'function' && tabEl.matches('[data-testid*="plugin"], [data-testid*="sidecar"], [data-plugin-id]');
                if (!hasSidecarSibling && tabBar) {
                    const barText = norm(tabBar.textContent || '');
                    const hasMultipleTabs = (tabBar.children && tabBar.children.length > 1) || (tabBar.childNodes && tabBar.childNodes.length > 1);
                    if (hasMultipleTabs && /(?:Review|评审|評審|審查)/.test(barText)) {
                        hasSidecarSibling = true;
                    } else {
                        let anc = tabBar.parentElement;
                        for (let d = 0; anc && d < 4 && anc !== document.body && anc !== document.documentElement; d++, anc = anc.parentElement) {
                            if (typeof anc.querySelector === 'function' && anc.querySelector('iframe[data-testid="sidecar-iframe"]')) {
                                hasSidecarSibling = true;
                                break;
                            }
                        }
                    }
                }
                if (hasSidecarSibling && !BUILTIN_AUX_TABS.has(low)) {
                    return true;
                }
            }
            const pText = dfsParentTexts.get(el) || originalParentTexts.get(el) || el.textContent || '';
            const gp = el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement ? el.parentElement : null;
            const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
            const sentText = (pText.length < 300 ? pText : '') + '\n' + (gpText.length < 300 ? gpText : '');
            if (/Stream and control|流式传输与控制|串流傳輸與控制/i.test(sentText) && /directly in the side pane|直接在侧边面板中|直接在側邊面板中/i.test(sentText)) {
                if (low !== 'stream and control' && !low.startsWith('directly in the side pane') && !valNorm.includes('流式传输与控制') && !valNorm.includes('串流傳輸與控制')) {
                    return true;
                }
            }
            const modal = findSidecarDetailsModal(el);
            if (modal) {
                const mSet = protectedPluginNames.get(modal);
                if (mSet && mSet.has(low)) return true;
                if (!el.closest || !el.closest('button')) {
                    const isHeading = typeof el.matches === 'function' && el.matches('h1, h2, h3, h4, [role="heading"]');
                    let hasHeaderContext = isHeading;
                    if (!hasHeaderContext) {
                        let blk = el.parentElement;
                        for (let d = 0; blk && blk !== modal && d < 3; d++, blk = blk.parentElement) {
                            const bTxt = blk.textContent || '';
                            if (bTxt.length < 180 && (/(?:Running|Stopped)(?=\s|$)|运行中|已停止|執行中/.test(bTxt) || /[a-z0-9._-]+\/[a-z0-9._-]+/i.test(bTxt))) {
                                if (!/[a-z0-9._-]+\/[a-z0-9._-]+/i.test(valNorm)) {
                                    hasHeaderContext = true;
                                }
                                break;
                            }
                        }
                    }
                    if (hasHeaderContext) {
                        recordProtectedPluginName(modal, valNorm);
                        return true;
                    }
                }
            }
        }
        let cur = el;
        for (let depth = 0; cur && depth < 6; depth++, cur = cur.parentElement) {
            const pSet = protectedPluginNames.get(cur);
            if (pSet && pSet.has(low)) return true;
            if (typeof cur.matches === 'function' && cur.matches('[data-plugin-id], [data-plugin-name], [data-testid*="sidebar-plugin"], [data-testid*="plugin-sidebar"], [data-testid*="plugin-nav"], [data-testid*="plugin-tab"], [data-testid*="plugin-name"], [data-testid*="plugin-title"]')) {
                return true;
            }
            if (typeof cur.matches === 'function' && cur.matches('section, div, ul') && typeof cur.closest === 'function' && cur.closest('nav, aside, [role="navigation"], [data-testid*="sidebar"]')) {
                const headings = cur.querySelectorAll ? cur.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [role="heading"]') : [];
                if (headings.length === 1) {
                    const hdr = headings[0];
                    if (hdr !== el && !hdr.contains(node)) {
                        const hdrText = norm(hdr.textContent || '');
                        if (hdrText === 'Plugins' || hdrText === '插件' || hdrText === '外掛程式') {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function translateElementAttributes(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toUpperCase();
        if (SKIP_TAGS.includes(tag)) return;
        if (isCodeOrEditor(node, true)) return;
        const inSwarmEl = isSwarmUiContext(node);
        for (const attr of ['placeholder', 'title', 'aria-label']) {
            const v = node.getAttribute(attr);
            if (v) {
                const t = norm(v);
                if (attr === 'aria-label' || attr === 'title') {
                    const plugMatch = t.match(/^(?:Open the\s+(.+?)\s+plugin|App view for\s+(.+)|Managed by the\s+(.+?)\s+plugin)$/i);
                    if (plugMatch) {
                        recordProtectedPluginName(node, plugMatch[1] || plugMatch[2] || plugMatch[3]);
                    }
                }
                let newAttr = translatePermissionChoice(v);
                if (!newAttr && inSwarmEl && Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, t)) {
                    newAttr = SCOPED_SWARM_MAP[t][0];
                }
                if (!newAttr && attr === 'aria-label') {
                    const testId = node.getAttribute('data-testid') || '';
                    if (node.getAttribute('role') === 'radiogroup') {
                        if (t === 'Icon') newAttr = '图标';
                        else if (t === 'Color') newAttr = '颜色';
                    } else if (node.hasAttribute('data-agy-layout') && t === 'Layout') {
                        newAttr = '布局';
                    } else if (testId.startsWith('coordinator-icon-option-') && Object.prototype.hasOwnProperty.call(COORDINATOR_ICON_LABELS, t)) {
                        newAttr = COORDINATOR_ICON_LABELS[t][0];
                    } else if (testId.startsWith('coordinator-color-option-') && Object.prototype.hasOwnProperty.call(COORDINATOR_COLOR_LABELS, t)) {
                        newAttr = COORDINATOR_COLOR_LABELS[t][0];
                    }
                }
                if (!newAttr) {
                    if (isFilePathOrUri(t)) continue;
                    newAttr = translateExactOrDynamic(t);
                    if (!newAttr) {
                        const showMatch = t.match(/^Show\s+(.+)$/i);
                        if (showMatch) {
                            const target = showMatch[1].trim();
                            const inSidebarOrPlugin = Boolean(typeof node.closest === 'function' && node.closest('[data-plugin-id], [data-plugin-name], [data-testid*="plugin"], nav, aside, [role="navigation"], [data-testid*="sidebar"]'));
                            if (inSidebarOrPlugin && !PLUGIN_UI_CHROME_SET.has(target.toLowerCase())) {
                                recordProtectedPluginName(node, target);
                                newAttr = ('显示 ') + target;
                            } else {
                                newAttr = ('显示 ') + (lookupDict(target) || target);
                            }
                        }
                    }
                }
                if (!newAttr && inSwarmEl) {
                    newAttr = translateSwarmComposite(v);
                }
                newAttr = keepSourceEllipsis(v, newAttr);
                if (newAttr && newAttr !== v) {
                    node.setAttribute(attr, newAttr);
                    if (attr === 'placeholder' && 'placeholder' in node && node.placeholder !== newAttr) {
                        node.placeholder = newAttr;
                    }
                }
            }
        }
    }

    function replaceWithBoundary(text, key, replacement) {
        const needStartBoundary = /[A-Za-z0-9_]/.test(key[0]);
        const needEndBoundary = /[A-Za-z0-9_]/.test(key[key.length - 1]);
        let pos = 0;
        let out = '';
        let replaced = false;
        while (pos <= text.length - key.length) {
            const idx = text.indexOf(key, pos);
            if (idx === -1) break;
            const prevCh = idx > 0 ? text[idx - 1] : '';
            const nextCh = idx + key.length < text.length ? text[idx + key.length] : '';
            const startOk = !needStartBoundary || !/[A-Za-z0-9_]/.test(prevCh);
            const endOk = !needEndBoundary || !/[A-Za-z0-9_]/.test(nextCh);
            if (startOk && endOk) {
                out += text.slice(pos, idx) + replacement;
                pos = idx + key.length;
                replaced = true;
            } else {
                out += text.slice(pos, idx + 1);
                pos = idx + 1;
            }
        }
        return replaced ? out + text.slice(pos) : null;
    }

    // React 会把相邻字符串之间的 " " 拆成独立文字节点；两侧都是中文、且至少一侧是这里翻译出来的中文时，
    // 收掉这个空白（中文字之间不留空格）；两侧原本就是中文（例如用户内容）时不动。收合可逆：React 之后
    // 重用两侧节点换成英文时还原空白。判断只读目前的 DOM、不在判断时翻译邻近节点；邻近节点翻完后，
    // 由父元素走访结束、节点添加或删除、文字变动时重新判断。
    const CJK_TAIL = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]$/;
    const CJK_HEAD = /^[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
    const collapsedGaps = new WeakMap();
    // 邻近节点靠空白那一侧的文字节点：元素只往下找行内小元素（每层至多两个子元素、最多 GAP_EDGE_DEPTH 层），
    // 不读大型容器的 textContent；超出范围时回传 GAP_UNKNOWN（不收合）。refreshGapsAround 往上找同样的层数，范围一致
    const GAP_EDGE_DEPTH = 4;
    // 跳过占位节点（注解、空文字）的上限：超过时视为无法判断，不收合，避免大量空节点让每次变动都扫一长串
    const GAP_FILLER_MAX = 4;
    const GAP_UNKNOWN = {};
    function gapEdgeTextNode(n, fromEnd, depth = 0) {
        if (!n || n.nodeType === Node.COMMENT_NODE) return null;
        if (n.nodeType === Node.TEXT_NODE) return n.nodeValue ? n : null;
        if (n.nodeType !== Node.ELEMENT_NODE || depth >= GAP_EDGE_DEPTH || n.childElementCount > 2) return GAP_UNKNOWN;
        const kids = n.childNodes;
        const limit = Math.min(kids.length, GAP_FILLER_MAX + 1);
        for (let k = 0; k < limit; k++) {
            const found = gapEdgeTextNode(kids[fromEnd ? kids.length - 1 - k : k], fromEnd, depth + 1);
            if (found) return found;
        }
        return kids.length > limit ? GAP_UNKNOWN : null;
    }
    // 注解与空文字节点是 React 的占位，不算邻居；收合过的空白不算占位，它本身要重新判断
    function isGapFiller(n) {
        return !!n && (n.nodeType === Node.COMMENT_NODE || (n.nodeType === Node.TEXT_NODE && !n.nodeValue && !collapsedGaps.has(n)));
    }
    // 往 dir 方向跳过占位节点，回传第一个实际邻居（超过 GAP_FILLER_MAX 个占位时为 GAP_UNKNOWN），
    // 以及是否跳过了空文字节点。收合判断、前后空白与变动后的重新判断都用这一个，两个方向的规则一致
    function gapNeighbor(n, dir) {
        let s = n[dir];
        let skippedText = false;
        for (let i = 0; isGapFiller(s); i++) {
            if (i >= GAP_FILLER_MAX) return { node: GAP_UNKNOWN, skippedText };
            if (s.nodeType === Node.TEXT_NODE) skippedText = true;
            s = s[dir];
        }
        return { node: s, skippedText };
    }
    function isCjkGap(n) {
        return !!n && n.nodeType === Node.TEXT_NODE && (n.nodeValue === ' ' || (n.nodeValue === '' && collapsedGaps.has(n)));
    }
    // 这段文字是本套件写进去的译文，而且之后没被 React 改过（React 改写时，文字节点分支会先清掉旧纪录）
    function isOwnTranslation(n) {
        return translatedValues.has(n) && translatedValues.get(n) === n.nodeValue;
    }
    function cjkGapShouldCollapse(gap) {
        const p = gapNeighbor(gap, 'previousSibling');
        const q = gapNeighbor(gap, 'nextSibling');
        const prev = p.node;
        const next = q.node;
        if (!prev || !next || prev === GAP_UNKNOWN || next === GAP_UNKNOWN) return false;
        // 两侧都是元素（例如并排的两个链接或按钮）时，这个空白是分隔用的，保留
        if (!p.skippedText && !q.skippedText && prev.nodeType !== Node.TEXT_NODE && next.nodeType !== Node.TEXT_NODE) return false;
        const before = gapEdgeTextNode(prev, true);
        const after = gapEdgeTextNode(next, false);
        if (!before || !after || before === GAP_UNKNOWN || after === GAP_UNKNOWN) return false;
        if (!CJK_TAIL.test(before.nodeValue) || !CJK_HEAD.test(after.nodeValue)) return false;
        return isOwnTranslation(before) || isOwnTranslation(after);
    }
    function refreshCjkGap(gap) {
        // 编辑区与代码区的内容属于用户：事后才变成可编辑的段落也不再改动
        if (isCodeOrEditor(gap)) return;
        if (cjkGapShouldCollapse(gap)) {
            if (gap.nodeValue) {
                collapsedGaps.set(gap, gap.nodeValue);
                translatedValues.set(gap, '');
                gap.nodeValue = '';
            }
        } else if (!gap.nodeValue && collapsedGaps.has(gap)) {
            const original = collapsedGaps.get(gap);
            collapsedGaps.delete(gap);
            translatedValues.delete(gap);
            gap.nodeValue = original;
        }
    }
    function refreshNeighborSpacing(n, dir) {
        const s = gapNeighbor(n, dir).node;
        if (!s || s === GAP_UNKNOWN) return;
        if (isCjkGap(s)) refreshCjkGap(s);
        else if (edgeSpacedBase.has(s)) refreshEdgeSpaces(s);
    }
    // 节点添加或文字变动后，重新判断它两侧的空白，再往上 GAP_EDGE_DEPTH 层判断各层祖先两侧的空白。
    // 不因祖先的子元素变多就提早停下：祖先刚多了子元素时，原本依它收合的空白要还原
    function refreshGapsAround(node) {
        let n = node;
        for (let depth = 0; n && depth <= GAP_EDGE_DEPTH; depth++) {
            refreshNeighborSpacing(n, 'previousSibling');
            refreshNeighborSpacing(n, 'nextSibling');
            n = n.parentElement;
        }
    }
    // 只删除节点时 addedNodes 是空的：重新判断删除位置两侧的空白
    function refreshGapsAtRemoval(m) {
        for (const s of [m.previousSibling, m.nextSibling]) {
            if (!s) continue;
            if (isCjkGap(s)) {
                refreshCjkGap(s);
            } else {
                if (edgeSpacedBase.has(s)) refreshEdgeSpaces(s);
                refreshGapsAround(s);
            }
        }
        refreshGapsAround(m.target);
    }
    // norm() 会先把「…」换成「...」再查词典与规则；原文只用「…」时，译文里的「...」都换回「…」
    // （规则调整语序后，原文结尾的「…」可能落在译文中间，例如「{1} 的标签」）
    function keepSourceEllipsis(source, out) {
        if (typeof out !== 'string' || typeof source !== 'string' || !source.includes('…')) return out;
        if (!source.includes('...')) return out.replace(/\.\.\./g, '…');
        return /…\s*$/.test(source) ? out.replace(/\.\.\.(\s*)$/, '…$1') : out;
    }
    // 译文片段自带的前后半角空白是替英文名称与数字留的（「由 Foo 创建」）；紧邻的文字是中文时拿掉
    // （「由我的插件创建」，中文字之间不留空格）。原始译文记在 edgeSpacedBase，邻近内容改变时依目前的 DOM 重新判断，
    // 找邻近文字的范围与空白收合相同（gapEdgeTextNode）
    const edgeSpacedBase = new WeakMap();
    function adjacentEdgeText(node, dir) {
        const s = gapNeighbor(node, dir).node;
        if (!s || s === GAP_UNKNOWN) return null;
        const edge = gapEdgeTextNode(s, dir === 'previousSibling');
        return edge && edge !== GAP_UNKNOWN ? edge.nodeValue : null;
    }
    // 只拿掉两侧都是中文的空白：译文靠空白那一侧是英文、数字或符号时保留（「遵守 Google 隐私权政策」「设置 - 一般」）
    function adaptEdgeSpaces(node, base) {
        let out = base;
        if (out.length > 1 && out.charAt(0) === ' ' && CJK_HEAD.test(out.slice(1))) {
            const before = adjacentEdgeText(node, 'previousSibling');
            if (before && CJK_TAIL.test(before)) out = out.slice(1);
        }
        if (out.length > 1 && out.charAt(out.length - 1) === ' ' && CJK_TAIL.test(out.slice(0, -1))) {
            const after = adjacentEdgeText(node, 'nextSibling');
            if (after && CJK_HEAD.test(after)) out = out.slice(0, -1);
        }
        return out;
    }
    function refreshEdgeSpaces(node) {
        const base = edgeSpacedBase.get(node);
        if (!base || translatedValues.get(node) !== node.nodeValue || isCodeOrEditor(node)) return;
        const out = adaptEdgeSpaces(node, base);
        if (out !== node.nodeValue) {
            translatedValues.set(node, out);
            node.nodeValue = out;
        }
    }

    function isIconFallbackSvg(n) {
        return !!n && n.nodeType === Node.ELEMENT_NODE && typeof n.hasAttribute === 'function' && n.hasAttribute('data-ag-icon-fallback');
    }
    // 补画的 SVG 跟着宿主的无障碍设置：宿主已隐藏或另有名称时隐藏 SVG；否则由 SVG 带着图标名称
    // （字体图标的名称文字原本就是无障碍名称的一部分，文字清空后改由 SVG 提供）
    function syncIconFallbackA11y(host, svg) {
        if (host.getAttribute('aria-hidden') === 'true' || host.hasAttribute('aria-label') || host.hasAttribute('aria-labelledby')) {
            if (svg.getAttribute('aria-hidden') !== 'true') svg.setAttribute('aria-hidden', 'true');
            svg.removeAttribute('role');
            svg.removeAttribute('aria-label');
        } else {
            svg.removeAttribute('aria-hidden');
            if (svg.getAttribute('role') !== 'img') svg.setAttribute('role', 'img');
            if (!svg.hasAttribute('aria-label')) svg.setAttribute('aria-label', svg.getAttribute('data-ag-icon-fallback'));
        }
    }
    // 字体图标（ligature）文字：Antigravity 2.35.1 未加载 Google Symbols 字体，内置 SVG 表缺少的图标会以图标名称纯文字显示。
    // 已知缺口改画 SVG 并清空文字，其余图标名称一律不翻译，避免 "comment" 之类被字典译成中文（保留 React 的文字节点，避免遍历失同步）。
    // 文字清空或改成空白时也在这里处理，才不会被后面的空白与缓存判断提早挡下而留着旧 SVG。回传 true 表示已处理完
    function handleIconFontText(node, originalVal) {
        const parent = node.parentElement;
        const iconHost = parent && typeof parent.matches === 'function' && parent.matches(ICON_FONT_SELECTOR) ? parent : null;
        if (!iconHost) {
            // React 重用图标的文字节点并拿掉图标 class 后改了文字：移除先前补画在它前面的 SVG
            if (isIconFallbackSvg(node.previousSibling)) node.previousSibling.remove();
            return false;
        }
        const oldSvg = Array.from(iconHost.children).find(isIconFallbackSvg) || null;
        // 本套件清空的文字（SVG 还在）：维持现状
        if (originalVal === '' && oldSvg && translatedValues.get(node) === '') return true;
        const valNorm = norm(originalVal || '');
        if (oldSvg && oldSvg.getAttribute('data-ag-icon-fallback') !== valNorm) oldSvg.remove();
        const paths = valNorm && Object.prototype.hasOwnProperty.call(ICON_FONT_FALLBACK_PATHS, valNorm) ? ICON_FONT_FALLBACK_PATHS[valNorm] : null;
        if (!paths || typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
            if (originalVal) unchangedTextValues.set(node, originalVal);
            return true;
        }
        if (!oldSvg || oldSvg.getAttribute('data-ag-icon-fallback') !== valNorm) {
            const svgNs = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNs, 'svg');
            svg.setAttribute('data-ag-icon-fallback', valNorm);
            // 1em 跟随图标宿主的字级（px、rem 或继承值都适用），与字体图标原本的大小一致
            svg.setAttribute('width', '1em');
            svg.setAttribute('height', '1em');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.setAttribute('class', 'shrink-0');
            svg.setAttribute('style', 'display:inline-block;vertical-align:middle');
            syncIconFallbackA11y(iconHost, svg);
            for (const d of paths) {
                const pSvg = document.createElementNS(svgNs, 'path');
                pSvg.setAttribute('d', d);
                svg.appendChild(pSvg);
            }
            iconHost.insertBefore(svg, node);
        }
        // 同一文字节点之后换回不需 SVG 的图标名称时，不能被「未翻译」缓存提早挡下而留着旧 SVG
        unchangedTextValues.delete(node);
        translatedValues.set(node, '');
        node.nodeValue = '';
        return true;
    }

    // 拆段句子里由用户命名的字段（自动化、插件名称）：依前后片段辨认，片段可能已翻译，也可能还是原文
    const USER_NAME_SLOTS = [['Agents created by', 'run in a dedicated']];
    function isFragmentNode(n, source) {
        if (!n || n === GAP_UNKNOWN || n.nodeType !== Node.TEXT_NODE || !n.nodeValue) return false;
        // 片段原文与译文都很短：邻居是一长段文字时不必范式比对
        if (n.nodeValue.length > 64) return false;
        const v = norm(n.nodeValue);
        if (v === source) return true;
        const tr = map.get(source);
        return typeof tr === 'string' && v === norm(tr);
    }
    function isUserNameSlot(node) {
        const prev = gapNeighbor(node, 'previousSibling').node;
        if (!prev || prev === GAP_UNKNOWN || prev.nodeType !== Node.TEXT_NODE) return false;
        const next = gapNeighbor(node, 'nextSibling').node;
        return USER_NAME_SLOTS.some(([before, after]) => isFragmentNode(prev, before) && isFragmentNode(next, after));
    }

    function translateNode(node) {
        try {
            if (!node) return;
            if (isSubframeWindow() && !isBuiltInSidecarDocument()) return;

            if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                if (node.host && isCodeOrEditor(node.host)) return;
                for (const child of node.childNodes) translateNode(child);
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (SKIP_TAGS.includes(tag)) return;
                // 翻译属性：placeholder, title, aria-label（隔离区元素及内部控件已在 translateElementAttributes 前置拦截）
                translateElementAttributes(node);

                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                if (tag === 'OPTION' && !node.hasAttribute('value')) return;
                if (isCodeOrEditor(node) || node.isContentEditable) {
                    if (!node.isContentEditable) translateIsolatedToolCallChrome(node);
                    return;
                }
                if (node.classList && (node.classList.contains('monaco-editor') || node.classList.contains('terminal') || node.classList.contains('xterm'))) return;

                // 处理 FastPick / 列表底部的 "Show <N> more..." 复合节点
                const elText = node.textContent ? node.textContent.trim() : '';
                if (/^Show\s+\d+\s+more(?:\.\.\.|…)?$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2) {
                        for (const tc of textChildren) {
                            const v = tc.nodeValue;
                            if (v === 'Show ' || norm(v) === 'Show') {
                                tc.nodeValue = '显示另外 ';
                                translatedValues.set(tc, tc.nodeValue);
                            } else if (/^more(\.\.\.|…)?$/i.test(v.trim())) {
                                tc.nodeValue = (' 个') + (v.trim().match(/^more(\.\.\.|…)?$/i)[1] || '');
                                translatedValues.set(tc, tc.nodeValue);
                            }
                        }
                    } else if (textChildren.length === 1 && node.childNodes.length === 1) {
                        const m = elText.match(/^Show\s+(\d+)\s+more(\.\.\.|…)?$/i);
                        if (m) {
                            textChildren[0].nodeValue = (('显示另外 ' + m[1] + ' 个')) + (m[2] || '');
                            translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        }
                    }
                }

                // 处理语音助手选择器底部 "Use <VoiceName>" 复合按钮
                if (node.getAttribute && node.getAttribute('data-testid') === 'voice-picker-use') {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const v = tc.nodeValue;
                        if (v === 'Use ' || norm(v) === 'Use') {
                            tc.nodeValue = '使用 ';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                // 处理 v2.31.0 Coordinator 逐词流式欢迎语段落
                if (node.getAttribute && node.getAttribute('data-testid') === 'coordinator-welcome') {
                    const paragraphs = node.querySelectorAll ? node.querySelectorAll('p') : [];
                    for (const p of paragraphs) {
                        const pNorm = norm(p.textContent || '');
                        if (/^Welcome to\s+(.+?)\.\s*I coordinate the work for this project\./i.test(pNorm)) {
                            const strongEl = p.querySelector && p.querySelector('strong');
                            const nameClone = strongEl ? strongEl.cloneNode(true) : null;
                            p.textContent = '';
                            p.appendChild(document.createTextNode('欢迎使用 '));
                            if (nameClone) p.appendChild(nameClone);
                            p.appendChild(document.createTextNode('。我负责协调此项目的工作。您可以向我提问或交办任务，我会直接回答或启动并行工作代理。'));
                            p.setAttribute('translate', 'no');
                        } else if (/^(?:You|您)\s+can follow the workers in the Dashboard/i.test(pNorm)) {
                            p.textContent = '您可以在仪表盘中跟进工作代理的进度，当任务完成或需要您处理时，我会发布更新。';
                            p.setAttribute('translate', 'no');
                        }
                    }
                    return;
                }

                // 处理新手引导 "Get Anything Done with <AppName>" 拆分文本节点
                if (/^Get Anything Done with\s+(.+)$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2 && norm(textChildren[0].nodeValue) === 'Get Anything Done with') {
                        textChildren[0].nodeValue = '用 ';
                        translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        const suffixNode = document.createTextNode(' 搞定一切');
                        translatedValues.set(suffixNode, suffixNode.nodeValue);
                        node.appendChild(suffixNode);
                    }
                }

                // 處理 "Available for <projectId> project" 拆分文本節點
                if (/^Available for\s+.+?\s+project$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const n = norm(tc.nodeValue);
                        if (n === 'Available for') {
                            tc.nodeValue = '适用于 ';
                            translatedValues.set(tc, tc.nodeValue);
                        } else if (n === 'project') {
                            tc.nodeValue = ' 项目';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                // 处理插件侧边面板介绍 "Stream and control <pluginName> directly in the side pane."
                if (/^(?:Stream and control|流式传输与控制|串流傳輸與控制)\s+.+?\s+directly in the side pane\.?$/i.test(elText)) {
                    const modal = findSidecarDetailsModal(node);
                    for (const c of Array.from(node.childNodes)) {
                        if (c.nodeType === Node.TEXT_NODE) {
                            const n = norm(c.nodeValue);
                            if (/^(?:Stream and control|流式传输与控制|串流傳輸與控制)$/i.test(n)) {
                                c.nodeValue = '直接在侧边面板中流式传输与控制 ';
                                translatedValues.set(c, c.nodeValue);
                            } else if (/^directly in the side pane\.?$/i.test(n)) {
                                c.nodeValue = '。';
                                translatedValues.set(c, c.nodeValue);
                            } else if (n) {
                                recordProtectedPluginName(node, n);
                                if (modal) recordProtectedPluginName(modal, n);
                            }
                        } else if (c.nodeType === Node.ELEMENT_NODE) {
                            const cname = norm(c.textContent || '');
                            if (cname) {
                                recordProtectedPluginName(node, cname);
                                if (modal) recordProtectedPluginName(modal, cname);
                            }
                        }
                    }
                }

                const elChildrenCount = node.children ? node.children.length : Array.from(node.childNodes || []).filter(c => c.nodeType === Node.ELEMENT_NODE).length;
                if (elChildrenCount === 0 && node.childNodes.length > 1) {
                    const truncZh = translateTruncatedNotice(norm(elText));
                    if (truncZh && replaceElementTextNodes(node, truncZh)) {
                        return;
                    }
                }

                if (node.shadowRoot) {
                    observeRoot(node.shadowRoot);
                    translateNode(node.shadowRoot);
                }
                const useParentSnapshot = node.childNodes.length > 1;
                if (useParentSnapshot) {
                    const rawPText = node.textContent || '';
                    dfsParentTexts.set(node, rawPText);
                    if (!originalParentTexts.has(node)) {
                        originalParentTexts.set(node, rawPText);
                    }
                }
                try {
                    for (const child of node.childNodes) translateNode(child);
                    // 子节点都翻完后再判断其间的空白：遍历到空白时，它后面的节点还没翻译
                    for (const child of node.childNodes) {
                        if (isCjkGap(child)) refreshCjkGap(child);
                        else if (edgeSpacedBase.has(child)) refreshEdgeSpaces(child);
                    }
                } finally {
                    if (useParentSnapshot) dfsParentTexts.delete(node);
                }

            } else if (node.nodeType === Node.TEXT_NODE) {
                if (isCodeOrEditor(node)) {
                    if (node.parentElement && !node.parentElement.isContentEditable) {
                        translateIsolatedToolCallChrome(node.parentElement);
                    }
                    return;
                }

                let originalVal = node.nodeValue;
                // React 改写了这个节点（内容和本套件上次写入的不同）：先前的翻译与前后空白纪录都不再适用，
                // 之后判断「是不是本套件的译文」才不会误用旧纪录（例如节点被重用为用户内容，或改成图标名称）
                if (translatedValues.has(node) && translatedValues.get(node) !== originalVal) {
                    translatedValues.delete(node);
                    edgeSpacedBase.delete(node);
                }
                // 收合过的空白被 React 改成别的内容（换了分隔字或清空后再写入），不再当作可还原的空白
                if (originalVal && collapsedGaps.has(node)) collapsedGaps.delete(node);
                if (handleIconFontText(node, originalVal)) return;
                if (originalVal === ' ') {
                    refreshCjkGap(node);
                    return;
                }
                if (!originalVal || originalVal.trim().length < 1) return;

                if (translatedValues.get(node) !== originalVal) {
                    const permChoiceTrans = translatePermissionChoice(originalVal);
                    if (permChoiceTrans && permChoiceTrans !== originalVal) {
                        translatedValues.set(node, permChoiceTrans);
                        node.nodeValue = permChoiceTrans;
                        return;
                    }
                }

                // 处理 FastPick / 列表底部由于 React 节点拆分导致的 "Show ", num, " more..." 分段文本
                const parentText = node.parentElement && node.parentElement.textContent ? node.parentElement.textContent.trim() : '';
                if (isFilePathOrUri(originalVal.trim()) || isFilePathOrUri(parentText)) return;
                if (parentText && (
                    /^(?:Show|显示另外|顯示另外)\s+\d+\s+(?:more|个|個)(?:\.\.\.|…)?$/i.test(parentText) ||
                    (node.parentElement.getAttribute && node.parentElement.getAttribute('value')?.startsWith('fastpick-show-more:'))
                )) {
                    if (originalVal === 'Show ' || norm(originalVal) === 'Show') {
                        node.nodeValue = '显示另外 ';
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                    const moreTail = originalVal.trim().match(/^more(\.\.\.|…)?$/i);
                    if (moreTail) {
                        node.nodeValue = (' 个') + (moreTail[1] || '');
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                }

                // 核心：如果是 skeleton 骨架占位文本，强制打上不翻译标记
                if (originalVal.toLowerCase().includes('pack.info')) {
                    const parent = node.parentElement;
                    if (parent) {
                        if (parent.getAttribute('translate') !== 'no') parent.setAttribute('translate', 'no');
                        try { if (!parent.classList.contains('notranslate')) parent.classList.add('notranslate'); } catch (e) {}
                    }
                    return;
                }

                const valNorm = norm(originalVal);
                if (isSlashCommandNameNode(node, valNorm) || isSidebarPluginNameNode(node, valNorm)) return;
                const cachedValue = translatedValues.get(node);
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && isModelMenuText(node)) {
                    if (originalVal !== '新') {
                        translatedValues.set(node, '新');
                        node.nodeValue = '新';
                    }
                    return;
                }
                if (valNorm === 'Unavailable' && isModelMenuText(node)) {
                    const unavailLabel = '不可用';
                    if (originalVal !== unavailLabel) {
                        translatedValues.set(node, unavailLabel);
                        node.nodeValue = unavailLabel;
                    }
                    return;
                }
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && node.parentElement?.getAttribute?.('data-testid') === 'swarm-unread-divider') {
                    const unreadLabel = '新消息';
                    if (originalVal !== unreadLabel) {
                        translatedValues.set(node, unreadLabel);
                        node.nodeValue = unreadLabel;
                    }
                    return;
                }
                if (cachedValue === originalVal || unchangedTextValues.get(node) === originalVal) return;

                // 拆段句子里由用户命名的字段不翻译，即使名称刚好和字典词条相同（例如名为 Settings 的插件）
                if (isUserNameSlot(node)) {
                    unchangedTextValues.set(node, originalVal);
                    return;
                }

                // 输入框底部权限预设胶囊按钮为 shrink-0 + whitespace-nowrap，双语括号译名会挤压同行的模型选择按钮，改用短标签
                if (Object.prototype.hasOwnProperty.call(PERMISSION_PILL_LABELS, valNorm) && node.parentElement?.closest?.('[data-testid="permissions-selector-trigger"]')) {
                    const pillLabel = PERMISSION_PILL_LABELS[valNorm][0];
                    translatedValues.set(node, pillLabel);
                    node.nodeValue = pillLabel;
                    return;
                }

                let newVal = originalVal;
                const inSwarmText = isSwarmUiContext(node.parentElement);
                const scopedSwarmHit = (inSwarmText && Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, valNorm))
                    ? SCOPED_SWARM_MAP[valNorm][0]
                    : null;
                let scopedFilesChangedHit = null;
                if (scopedSwarmHit === null && /^files?\s+changed$/i.test(valNorm) && node.parentElement) {
                    const p = node.parentElement;
                    const pText = dfsParentTexts.get(p) || originalParentTexts.get(p) || p.textContent || '';
                    const gp = p.parentElement && typeof document !== 'undefined' && p.parentElement !== document.body && p.parentElement !== document.documentElement ? p.parentElement : null;
                    const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
                    if (/^\d+\s*files?\s+changed\b/i.test(pText.trim()) || (gpText.length < 120 && /^\d+\s*files?\s+changed\b/i.test(gpText.trim()))) {
                        scopedFilesChangedHit = (originalVal.startsWith(' ') ? ' ' : '') + ('个文件已更改');
                    }
                }
                const commonTrans = scopedSwarmHit !== null
                    ? scopedSwarmHit
                    : (scopedFilesChangedHit !== null ? scopedFilesChangedHit : translateExactOrDynamic(valNorm));
                if (commonTrans !== null) {
                    newVal = commonTrans;
                } else {
                    const ctxTrans = translateContextualText(node, originalVal, valNorm);
                    if (ctxTrans !== null) {
                        newVal = ctxTrans;
                    } else {
                        const swarmComp = inSwarmText ? translateSwarmComposite(originalVal) : null;
                        if (swarmComp !== null) {
                            newVal = swarmComp;
                        } else if (valNorm.length > 15 && valNorm.includes(' ') && longMissCache.get(node) !== valNorm) {
                            // 长句子串滑动替换与末尾截断智能匹配
                            const isTruncated = valNorm.endsWith('...') && valNorm.length >= 35;
                            const cleanVal = isTruncated ? valNorm.slice(0, -3).trim().toLowerCase() : '';
                            let matchedLong = false;
                            for (const [key, translated, keyLower] of longEntries) {
                                if (key.length <= valNorm.length) {
                                    const replaced = replaceWithBoundary(newVal.includes(key) ? newVal : valNorm, key, translated);
                                    if (replaced !== null) {
                                        if (newVal.includes(key)) {
                                            newVal = replaced;
                                        } else {
                                            const lead = originalVal.match(/^\s*/)[0];
                                            const trail = originalVal.match(/\s*$/)[0];
                                            newVal = lead + replaced + trail;
                                        }
                                        matchedLong = true;
                                        break;
                                    }
                                }
                                if (isTruncated && cleanVal.length >= 30 && keyLower.startsWith(cleanVal)) {
                                    newVal = translated;
                                    matchedLong = true;
                                    break;
                                }
                            }
                            if (!matchedLong) {
                                longMissCache.set(node, valNorm);
                            }
                        }
                    }
                }

                newVal = keepSourceEllipsis(originalVal, newVal);
                if (newVal !== originalVal && newVal.length > 1 && (newVal.charAt(0) === ' ' || newVal.charAt(newVal.length - 1) === ' ')) {
                    edgeSpacedBase.set(node, newVal);
                    newVal = adaptEdgeSpaces(node, newVal);
                } else {
                    edgeSpacedBase.delete(node);
                }
                if (newVal !== originalVal) {
                    const p = node.parentElement;
                    if (p && !originalParentTexts.has(p)) {
                        originalParentTexts.set(p, p.textContent || '');
                    }
                    unchangedTextValues.delete(node);
                    translatedValues.set(node, newVal);
                    node.nodeValue = newVal;
                } else {
                    unchangedTextValues.set(node, originalVal);
                }
            }
        } catch (e) {}
    }

    const pendingNodes = new Set();
    const pendingAttrNodes = new Set();
    const pendingMenuRefreshTargets = new Set();
    let flushScheduled = false;

    function invalidateChildTextCaches(target) {
        if (!target || !target.childNodes) return;
        for (const c of target.childNodes) {
            if (c.nodeType === Node.TEXT_NODE) {
                unchangedTextValues.delete(c);
            }
        }
    }

    function flushPendingTranslations() {
        flushScheduled = false;
        const attrNodes = Array.from(pendingAttrNodes);
        const nodes = Array.from(pendingNodes);
        const menuTargets = Array.from(pendingMenuRefreshTargets);
        pendingAttrNodes.clear();
        pendingNodes.clear();
        pendingMenuRefreshTargets.clear();

        if (isSubframeWindow()) {
            if (!isBuiltInSidecarDocument()) return;
            if (!subframeActivated) {
                subframeActivated = true;
                const rootTarget = typeof document !== 'undefined' ? (document.body || document.documentElement) : null;
                if (rootTarget) translateNode(rootTarget);
                return;
            }
        }

        const queuedSet = new Set(nodes);
        for (const n of attrNodes) {
            if (!queuedSet.has(n)) {
                try { translateElementAttributes(n); } catch (e) {}
            }
        }
        for (const n of nodes) {
            translateNode(n);
            refreshGapsAround(n);
        }
        for (const target of menuTargets) {
            try { refreshMenusLabelledBy(target); } catch (e) {}
        }
    }

    function scheduleMutationFlush() {
        if (flushScheduled) return;
        flushScheduled = true;
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(flushPendingTranslations);
        } else {
            Promise.resolve().then(flushPendingTranslations);
        }
    }

    const observer = typeof MutationObserver === 'function' ? new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                if (m.removedNodes && m.removedNodes.length > 0) {
                    originalParentTexts.delete(m.target);
                    refreshGapsAtRemoval(m);
                }
                invalidateChildTextCaches(m.target);
                for (const n of m.addedNodes) pendingNodes.add(n);
            } else if (m.type === 'characterData') {
                if (m.target.nodeValue !== translatedValues.get(m.target)) {
                    unchangedTextValues.delete(m.target);
                    if (m.target.parentElement) {
                        originalParentTexts.delete(m.target.parentElement);
                    }
                    pendingNodes.add(m.target);
                }
            } else if (m.type === 'attributes') {
                if (m.attributeName === 'role' || m.attributeName === 'aria-labelledby') {
                    invalidateChildTextCaches(m.target);
                    pendingNodes.add(m.target);
                } else {
                    pendingAttrNodes.add(m.target);
                }
                if (m.attributeName === 'aria-label' || m.attributeName === 'aria-labelledby') {
                    pendingMenuRefreshTargets.add(m.target);
                    // 字体图标宿主的无障碍名称改了：补画的 SVG 跟着调整（宿主拿掉名称后改由 SVG 带图标名称）
                    const fallbackSvg = Array.from(m.target.children || []).find(isIconFallbackSvg);
                    if (fallbackSvg) syncIconFallbackA11y(m.target, fallbackSvg);
                }
            }
        }
        if (pendingNodes.size > 0 || pendingAttrNodes.size > 0 || pendingMenuRefreshTargets.size > 0) {
            scheduleMutationFlush();
        }
    }) : null;

    const obsOpts = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'aria-labelledby', 'role'] };
    const observedRoots = new WeakSet();

    function observeRoot(root) {
        if (!observer || !root || observedRoots.has(root)) return;
        observer.observe(root, obsOpts);
        observedRoots.add(root);
    }

    const startEngine = () => {
        if (typeof document === 'undefined') return;
        const target = document.body || document.documentElement;
        if (target) {
            try {
                observeRoot(target);
                if (!isSubframeWindow() || isBuiltInSidecarDocument()) {
                    if (isSubframeWindow()) subframeActivated = true;
                    translateNode(target);
                }
            } catch (e) {}
        }
    };
    if (typeof window !== 'undefined') {
        window.__agCnRuntimeStart = startEngine;
    }

    if (typeof Element !== 'undefined' && Element.prototype && typeof Element.prototype.attachShadow === 'function' && !Element.prototype.attachShadow._agCnHooked) {
        const origAttachShadow = Element.prototype.attachShadow;
        const hookedAttachShadow = function() {
            const sr = origAttachShadow.apply(this, arguments);
            try { observeRoot(sr); } catch (e) {}
            return sr;
        };
        hookedAttachShadow._agCnHooked = true;
        Element.prototype.attachShadow = hookedAttachShadow;
    }

    // 强力多阶段触发绑定
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
            document.addEventListener('DOMContentLoaded', startEngine);
        } else {
            startEngine();
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('load', startEngine);
        }
        for (const delay of [100, 300, 1000, 3000, 6000]) {
            setTimeout(startEngine, delay);
        }
    }
})();
