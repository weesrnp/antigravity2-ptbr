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

    // Isolamento de segurança leve: ignora scripts, estilos e blocos de código (pre/code)
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'PRE', 'CODE'];

    // Seletores de isolamento de código, campos de texto rico e conteúdo de conversa: exclui editores Lexical, mensagens do usuário, respostas da IA, raciocínio, blocos de código, terminal e caminhos de arquivo
    const CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .code-block, .line-content, [aria-label="File Viewer"], [aria-label="Visualizador de arquivos"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], .font-mono, [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-row-history"] span.truncate, [translate="no"], .notranslate, .md-divider-spacing, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], [data-testid="thinking-collapsible-trigger"] + div, [data-testid="thinking-collapsible-trigger"] ~ div, .msg-body, .sys-text, .node-label, .raw-meta .path, .o2-mauth, .hv-nm, .o2-wchip.bee > span:last-child, .o2-m[data-o2who]:not(.all) > span:last-child';
    const HARD_CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .line-content, [aria-label="File Viewer"], [aria-label="Visualizador de arquivos"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-row-history"] span.truncate, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], .msg-body, .sys-text, .node-label, .raw-meta .path, .o2-mauth, .hv-nm, .o2-wchip.bee > span:last-child, .o2-m[data-o2who]:not(.all) > span:last-child';
    const RAW_CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .line-content, [aria-label="File Viewer"], [aria-label="Visualizador de arquivos"], [class*="diffEditor"], .token, .hljs, [class*="mtk"], [data-testid="planner-response-text"], [data-testid="user-input-step"], [data-testid="conversation-row-sidebar"], [data-testid="conversation-row-history"], .msg-body, .sys-text, .node-label';
    const TOOL_CODE_BOX_SELECTOR = 'pre, code, .code-block, .hljs, .code-line, .line-content, .cm-editor, .monaco-editor, .font-mono, .terminal, .xterm, [class*="language-"], [class*="mtk"]';

    // Contêineres de ícones em fonte: o texto é o nome do ícone, não texto da interface
    const ICON_FONT_SELECTOR = '.google-symbols, .material-symbols-outlined, .material-symbols-rounded, .material-symbols-sharp, .material-icons';
    // Ícones ausentes na tabela SVG embutida do Antigravity 2.35.1 que recorrem à renderização por fonte (obtidos comparando os componentes de ícone e a propriedade icon em main.js)
    const ICON_FONT_FALLBACK_PATHS = {
        restore_page: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
        comment: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
        format_quote: ['M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z', 'M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z'],
        laptop_shield: ['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16', 'M12 8l3 1.2v1.8c0 1.6-1.3 2.7-3 3.2-1.7-.5-3-1.6-3-3.2V9.2z']
    };
    // Rótulos curtos dos botões de predefinição de permissões
    const PERMISSION_PILL_LABELS = {
        'Request Review': ['Solicitar revisão'],
        'Default': ['Padrão'],
        'Auto': ['Automático'],
        'Turbo': ['Turbo'],
        // Rótulo curto de "Full machine"; "Machine" no dicionário refere-se a ambiente em nuvem e não se aplica aqui
        'Machine': ['Máquina inteira']
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
    // Interceptação de tradução do menu de contexto nativo do sistema (Native Context Menu)
    // ==========================================
    const CONTEXT_MENU_EXTRA_MAP = {
        remove: ['Remover'],
        replace: ['Substituir'],
        hide: ['Ocultar'],
        show: ['Mostrar'],
        create: ['Criar'],
        apply: ['Aplicar'],
        reply: ['Responder'],
        duplicate: ['Duplicar'],
        inspect: ['Inspecionar'],
        'inspect element': ['Inspecionar elemento'],
        find: ['Localizar'],
        cut: ['Recortar'],
        paste: ['Colar'],
        'paste and match style': ['Colar com o mesmo estilo'],
        'select all': ['Selecionar tudo'],
        open: ['Abrir'],
        'open in terminal': ['Abrir no terminal'],
        'copy relative path': ['Copiar caminho relativo'],
        'move to trash': ['Mover para a Lixeira'],
        'close others': ['Fechar outras abas'],
        'close all': ['Fechar tudo'],
        'close to the right': ['Fechar abas à direita']
    };

    function translateContextMenuLabel(label) {
        if (!label || typeof label !== 'string') return label;
        let trimmed = norm(label);
        if (!trimmed) return label;

        let isDefault = false;
        if (/\s*\((?:Default|Padrão)\)$/i.test(trimmed)) {
            trimmed = trimmed.replace(/\s*\((?:Default|Padrão)\)$/i, '').trim();
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
            return isDefault ? (translated + (" (Padrão)")) : translated;
        } else if (isDefault) {
            return trimmed + (" (Padrão)");
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
        s: ['s'],
        m: ['min'],
        h: ['h'],
        d: ['d'],
        w: ['sem'],
        mo: ['mês'],
        yr: ['ano']
    };

    const USAGE_UNIT_WORDS = {
        d: ['dia', 'dias'],
        w: ['semana', 'semanas'],
        mo: ['mês', 'meses'],
        yr: ['ano', 'anos']
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
            const pair = USAGE_UNIT_WORDS[unitKey];
            const name = pair ? pair[Number(match[1]) === 1 ? 0 : 1] : UNIT_MAP[unitKey][langIdx];
            parts.push((end === 0 && gap.trim() === '<' ? '<' : '') + match[1] + ' ' + name);
            end = match.index + match[0].length;
        }
        return parts.length && !text.slice(end).trim() ? parts.join(' ') : null;
    }

    function translateLimitLabel(raw) {
        const s = raw.trim();
        if (/^daily\s+limit$/i.test(s)) return 'Limite diário';
        if (/^weekly\s+limit$/i.test(s)) return 'Limite semanal';
        if (/^monthly\s+limit$/i.test(s)) return 'Limite mensal';
        const m = s.match(/^([0-9]+)(?:[- ]*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|wk|weeks?))\s+limit$/i);
        if (m) {
            const unit = m[2].toLowerCase();
            const isSingular = Number(m[1]) === 1;
            const unitName = /^(?:w|wk|weeks?)$/.test(unit) ? (isSingular ? 'semana' : 'semanas')
                : /^(?:d|days?)$/.test(unit) ? (isSingular ? 'dia' : 'dias')
                : /^(?:h|hr|hours?)$/.test(unit) ? (isSingular ? 'hora' : 'horas')
                : /^(?:m|min|minutes?)$/.test(unit) ? (isSingular ? 'minuto' : 'minutos')
                : (isSingular ? 'segundo' : 'segundos');
            return 'Limite de ' + m[1] + ' ' + unitName;
        }
        return null;
    }

    function translateResetPart(raw) {
        const reset = raw.trim().match(/^(Resets|Refreshes)\s+in\s+(.+)$/i);
        if (!reset) return null;
        const duration = formatUsageDuration(reset[2]);
        if (!duration) return null;
        const verb = /^refreshes/i.test(reset[1]) ? 'Renova em ' : 'Redefine em ';
        return verb + duration;
    }

    function translateUsageText(value) {
        const combo = value.match(/^(.+?),\s*((?:resets|refreshes)\s+in\s+.+)$/i);
        if (combo) {
            const limitPart = translateLimitLabel(combo[1]) || map.get(combo[1].trim()) || lowerMap.get(combo[1].trim().toLowerCase());
            const resetPart = translateResetPart(combo[2]);
            if (limitPart && resetPart) return limitPart + ', ' + resetPart.charAt(0).toLowerCase() + resetPart.slice(1);
        }
        const limitLabel = translateLimitLabel(value);
        if (limitLabel) return limitLabel;
        const remaining = value.match(/^([0-9]+(?:\.[0-9]+)?\s*%|%)\s+left$/i);
        if (remaining) return remaining[1] + ' restante';
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
        return /^(Select model|Selecionar modelo)/i.test(norm(label || ''));
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
    // Tabela declarativa de regras dinâmicas com regex (Table-Driven Dynamic Rules)
    // ==========================================
    function formatCompactDuration(str) {
        const langIdx = 0;
        return String(str || '').trim().replace(/(\d+)\s*(d|h|m|s)\b/gi, (_, num, u) => {
            const pair = UNIT_MAP[u.toLowerCase()];
            return num + ' ' + (pair ? pair[langIdx] : u);
        });
    }

    const SCOPED_SWARM_MAP = {
        'Board': ['Quadro'],
        'Graph': ['Grafo'],
        'Raw': ['Bruto'],
        'Reconnecting': ['Reconectando'],
        'Replay': ['Reprodução'],
        'Follow': ['Seguir'],
        'Latest': ['Mais recente'],
        'Channels': ['Canais'],
        'Filters': ['Filtros'],
        'Coordinator': ['Coordenador'],
        'Waiting': ['Aguardando'],
        'Retired': ['Desativado'],
        'Paused': ['Pausado'],
        'Working...': ['Trabalhando...'],
        'Working': ['Trabalhando'],
        'Empty.': ['Vazio.'],
        '(empty)': ['(vazio)'],
        'stale': ['desatualizado'],
        'system:': ['sistema:'],
        'Goal': ['Objetivo'],
        'Team': ['Equipe'],
        'Threads': ['Tópicos'],
        'Now': ['Agora'],
        'Progress': ['Progresso'],
        'Tasks': ['Tarefas'],
        'Other': ['Outros'],
        'Moving': ['Em andamento'],
        'Reply': ['Responder'],
        'Frames': ['Quadros'],
        'All': ['Todos'],
        'all channels': ['todos os canais'],
        'Remote': ['Remoto'],
        'updating': ['atualizando'],
        'watching': ['observando'],
        'stopped': ['parado'],
        'Needs you': ['Precisa de você'],
        'Not started': ['Não iniciado'],
        'Blocked': ['Bloqueado'],
        'Running': ['Em execução'],
        'Done': ['Concluído'],
        'Open': ['Aberto'],
        'Active': ['Ativo'],
        'Killed': ['Encerrado'],
        'queued': ['na fila'],
        'running': ['em execução'],
        'blocked': ['bloqueado'],
        'done': ['concluído'],
        'active': ['ativo'],
        'paused': ['pausado'],
        'Hive': ['Hive'],
        'Tasks done': ['Tarefas concluídas'],
        'Message just sent': ['Mensagem recém-enviada'],
        'Waiting on': ['Aguardando'],
        'Stuck': ['Travado'],
        'Resting': ['Em repouso'],
        'Latest action': ['Ação mais recente'],
        'Zoom': ['Zoom']
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
        'arguments': ['Argumentos'],
        'output': ['Saída'],
        'result': ['Resultado'],
        'response': ['Resposta'],
        'input': ['Entrada'],
        'parameters': ['Parâmetros'],
        'tool arguments': ['Argumentos da ferramenta'],
        'tool output': ['Saída da ferramenta'],
        'tool result': ['Resultado da ferramenta'],
        'return value': ['Valor de retorno'],
        'tool response': ['Resposta da ferramenta'],
        'command output': ['Saída do comando']
    };

    function lookupToolCallSectionLabel(valNorm) {
        if (!valNorm) return null;
        const hasColon = valNorm.endsWith(':');
        const base = (hasColon ? valNorm.slice(0, -1) : valNorm).trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(TOOL_CALL_SECTION_LABELS, base)) return null;
        const pair = TOOL_CALL_SECTION_LABELS[base];
        return pair[0] + (hasColon ? ':' : '');
    }

    function translateTruncatedNotice(valNorm) {
        if (!valNorm) return null;
        const dot = valNorm.endsWith('.') ? '.' : '';
        const mMore = valNorm.match(/^(\.\.\.\s*)?([\d,]+)\s+more\s+(lines?|characters?|chars?|bytes?|items?),\s*truncated for display\.?$/i);
        if (mMore) {
            const isOne = mMore[2].replace(/,/g, '') === '1';
            const uLow = mMore[3].toLowerCase();
            const isLine = uLow.startsWith('line');
            const uPt = isLine ? (isOne ? 'linha' : 'linhas')
                : (uLow.startsWith('char') ? (isOne ? 'caractere' : 'caracteres')
                : (uLow.startsWith('byte') ? (isOne ? 'byte' : 'bytes')
                : (isOne ? 'item' : 'itens')));
            const trunc = isLine
                ? (isOne ? 'truncada para exibição' : 'truncadas para exibição')
                : (isOne ? 'truncado para exibição' : 'truncados para exibição');
            return (mMore[1] ? '... ' : '') + 'mais ' + mMore[2] + ' ' + uPt + ', ' + trunc + dot;
        }
        const mBare = valNorm.match(/^(\.\.\.\s*)?truncated for display\.?$/i);
        if (mBare) {
            const cap = !mBare[1] && /^[A-Z]/.test(valNorm) ? 'T' : 't';
            return (mBare[1] ? '... ' : '') + cap + 'runcado para exibição' + dot;
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
                if (/^(?:Thought|Thinking|Raciocinou|Raciocinando|Raciocínio)\b/i.test(trigText)) {
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
            const dirLbl = Number(edgeMatch[3]) === 1 ? ' direta' : ' diretas';
            return edgeMatch[1] + ' → ' + edgeMatch[2] + ': ' + edgeMatch[3] + dirLbl +
                (edgeMatch[4] ? (', ' + edgeMatch[4] + ' via @all') : '');
        }
        const outsiderMatch = trimmed.match(/^(\S+)\s+\(not on the roster\)$/i);
        if (outsiderMatch) {
            return outsiderMatch[1] + ' (fora da lista de membros)';
        }
        const sharedBoardMatch = trimmed.match(/^Shared\s+(.+?)\s+board(?:\s+(.*))?$/i);
        if (sharedBoardMatch) {
            return 'Quadro compartilhado ' + sharedBoardMatch[1] + (sharedBoardMatch[2] ? ' ' + sharedBoardMatch[2] : '');
        }
        const runsOnMatch = trimmed.match(/^Runs on\s+(.+)$/);
        if (runsOnMatch) {
            return 'Executa em ' + runsOnMatch[1];
        }
        const errMatch = trimmed.match(/^Error:\s*(.+)$/i);
        if (errMatch) {
            return 'Erro: ' + errMatch[1];
        }
        const openMemberMatch = trimmed.match(/^Open\s+(@?[a-z0-9][a-z0-9._-]*)$/);
        if (openMemberMatch) {
            return 'Abrir ' + openMemberMatch[1];
        }
        const workingForMatch = trimmed.match(/^Working for\s+(@\S+)$/i);
        if (workingForMatch) {
            return 'Trabalhando para ' + workingForMatch[1];
        }
        const waitingOnMemberMatch = trimmed.match(/^Waiting on\s+(@\S+)$/i);
        if (waitingOnMemberMatch) {
            return 'Aguardando ' + waitingOnMemberMatch[1];
        }
        const waitingOnCountMatch = trimmed.match(/^Waiting on\s+(\d+)$/i);
        if (waitingOnCountMatch) {
            const cnt = waitingOnCountMatch[1];
            return 'Aguardando ' + cnt + (Number(cnt) === 1 ? ' membro' : ' membros');
        }
        const waitersChipMatch = trimmed.match(/^(\d+)\s+waiting on\s+(@\S+)$/i);
        if (waitersChipMatch) {
            return waitersChipMatch[1] + ' aguardando ' + waitersChipMatch[2];
        }
        const ofDoneMatch = trimmed.match(/^(\d+)\s+of\s+(\d+)\s+(?:tasks\s+)?done$/i);
        if (ofDoneMatch) {
            const hasTasks = /\btasks\b/i.test(trimmed);
            const doneLbl = hasTasks
                ? (Number(ofDoneMatch[2]) === 1 ? ' tarefa concluída' : ' tarefas concluídas')
                : (Number(ofDoneMatch[1]) === 1 ? ' concluído' : ' concluídos');
            return ofDoneMatch[1] + ' de ' + ofDoneMatch[2] + doneLbl;
        }
        const beeCountMatch = trimmed.match(/^(\d+)\s+bees?$/i);
        if (beeCountMatch) {
            return beeCountMatch[1] + (Number(beeCountMatch[1]) === 1 ? ' membro' : ' membros');
        }
        const chipSummaryMatch = trimmed.match(/^(\d+)\s+(stuck|needs?\s+you|in\s+review|active|working|waiting|done|threads?\s+open)$/i);
        if (chipSummaryMatch) {
            const cnt = chipSummaryMatch[1];
            const one = Number(cnt) === 1;
            const k = chipSummaryMatch[2].toLowerCase().replace(/\s+/g, ' ');
            if (k === 'stuck') return cnt + (one ? ' travado' : ' travados');
            if (k === 'needs you' || k === 'need you') return cnt + (one ? ' precisa de você' : ' precisam de você');
            if (k === 'in review') return cnt + ' em revisão';
            if (k === 'active') return cnt + (one ? ' ativo' : ' ativos');
            if (k === 'working') return cnt + ' trabalhando';
            if (k === 'waiting') return cnt + ' aguardando';
            if (k === 'done') return cnt + (one ? ' concluído' : ' concluídos');
            return cnt + (one ? ' tópico aberto' : ' tópicos abertos');
        }
        const liveTipMatch = trimmed.match(/^(Thinking|Latest action):\s*(.+)$/s);
        if (liveTipMatch) {
            const lbl = liveTipMatch[1] === 'Thinking'
                ? 'Raciocínio: '
                : 'Ação mais recente: ';
            return lbl + liveTipMatch[2];
        }
        const lastSeenMatch = trimmed.match(/^last seen\s+(.+)\s+ago$/i);
        if (lastSeenMatch) {
            const dur = formatCompactDuration(lastSeenMatch[1]);
            return 'visto há ' + dur;
        }
        const sysAlertMatch = trimmed.match(/^@(\S+)\s+(ran out of quota|looks stuck|hit an error)$/i);
        if (sysAlertMatch) {
            const k = sysAlertMatch[2].toLowerCase();
            const msg = k === 'ran out of quota'
                ? ' ficou sem cota'
                : k === 'looks stuck' ? ' parece travado' : ' encontrou um erro';
            return '@' + sysAlertMatch[1] + msg;
        }
        const exportPctMatch = trimmed.match(/^Exporting\s+(\d+%)$/i);
        if (exportPctMatch) {
            return 'Exportando ' + exportPctMatch[1];
        }
        const exportFileMatch = trimmed.match(/^(Exporting|Rendering)\s+(.+?)(?:\.\.\.|…)$/i);
        if (exportFileMatch) {
            const verb = exportFileMatch[1].toLowerCase() === 'exporting'
                ? 'Exportando '
                : 'Renderizando ';
            return verb + exportFileMatch[2] + '...';
        }
        const exportedMatch = trimmed.match(/^Exported\s+(.+?)\s+\((.+)\)$/i);
        if (exportedMatch) {
            const meta = translateSwarmComposite(exportedMatch[2]) || exportedMatch[2];
            return 'Exportado ' + exportedMatch[1] + ' (' + meta + ')';
        }
        const downloadMatch = trimmed.match(/^Download\s+(.+)$/i);
        if (downloadMatch) {
            return 'Baixar ' + downloadMatch[1];
        }
        const replayTitleMatch = trimmed.match(/^(.+?)\s+graph replay$/i);
        if (replayTitleMatch) {
            return 'Reprodução do grafo de ' + replayTitleMatch[1];
        }
        const narratorFailMatch = trimmed.match(/^The narrator's last step failed:\s*(.+)$/i);
        if (narratorFailMatch) {
            return 'A última etapa do narrador falhou: ' + narratorFailMatch[1];
        }
        const noPostsTipMatch = trimmed.match(/^([^:]+):\s*No posts yet$/i);
        if (noPostsTipMatch) {
            return noPostsTipMatch[1] + ': Nenhuma publicação ainda';
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
                if (s === 'Coordinator') { changed = true; return 'Coordenador'; }
                if (s === 'Working') { changed = true; return 'Trabalhando'; }
                if (s === 'Active') { changed = true; return 'Ativo'; }
                if (s === 'Waiting') { changed = true; return 'Aguardando'; }
                if (s === 'Killed') { changed = true; return 'Encerrado'; }
                if (s === 'Swarm start') { changed = true; return 'Início do Swarm'; }
                if (/^\d+\s+posts?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+posts?$/i, (_, n) => n + (Number(n) === 1 ? ' publicação' : ' publicações')); }
                if (/^\d+\s+members?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+members?$/i, (_, n) => n + (Number(n) === 1 ? ' membro' : ' membros')); }
                if (/^\d+\s+frames?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+frames?$/i, (_, n) => n + (Number(n) === 1 ? ' quadro' : ' quadros')); }
                if (/^\d+\s+steps?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+steps?$/i, (_, n) => n + (Number(n) === 1 ? ' etapa' : ' etapas')); }
                if (/^\d+\s+unaddressed$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unaddressed$/i, (_, n) => n + ' sem destinatário'); }
                if (/^\d+\s+unread$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unread$/i, (_, n) => n + (Number(n) === 1 ? ' não lida' : ' não lidas')); }
                if (/^runs on\s+(.+)$/i.test(s)) { changed = true; return s.replace(/^runs on\s+(.+)$/i, (_, h) => 'executa em ' + h); }
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
            return isConv ? ('Sim, salvar regra para ' + pattern + ' nesta conversa') : ('Sim, salvar regra para ' + pattern + ' globalmente');
        }

        const match = value.match(/^\s*Yes,\s+and always allow\s+([\s\S]+)$/i);
        if (!match || /^in this (?:project|conversation)$/i.test(norm(match[1]))) return null;

        // O cliente acrescenta o escopo depois das aspas externas do comando; preserve o texto original do comando e só depois monte o sufixo de escopo
        const scoped = match[1].match(/^('[\s\S]*'|"[\s\S]*")\s+in this (project|conversation)\s*$/i);
        const command = scoped ? scoped[1] : match[1].trimEnd();
        const scope = scoped && scoped[2] ? scoped[2].toLowerCase() : '';
        if (scope === 'conversation') return 'Sim, e sempre permitir executar ' + command + ' nesta conversa';
        if (scope === 'project') return 'Sim, e sempre permitir executar ' + command + ' neste projeto';
        return 'Sim, e sempre permitir executar ' + command;
    }

    function lookupDict(s) {
        const k = norm(s);
        return map.get(k) || lowerMap.get(k.toLowerCase()) || null;
    }

    const ENTITY_NOUN_MAP = {
        project: ['projeto'],
        projects: ['projetos'],
        workspace: ['espaço de trabalho'],
        workspaces: ['espaços de trabalho'],
        folder: ['pasta'],
        folders: ['pastas'],
        rule: ['regra'],
        rules: ['regras'],
        workflow: ['fluxo de trabalho'],
        workflows: ['fluxos de trabalho'],
        agent: ['agente'],
        agents: ['agentes'],
        subagent: ['subagente'],
        subagents: ['subagentes'],
        group: ['grupo'],
        bundle: ['pacote'],
        bundles: ['pacotes'],
        plugin: ['plugin'],
        plugins: ['plugins'],
        skill: ['habilidade'],
        skills: ['habilidades'],
        server: ['servidor'],
        servers: ['servidores'],
        'mcp server': ['servidor MCP'],
        'mcp servers': ['servidores MCP'],
        site: ['site'],
        sites: ['sites'],
        host: ['host'],
        hosts: ['hosts'],
        account: ['conta'],
        secret: ['segredo'],
        shortcut: ['atalho'],
        shortcuts: ['atalhos'],
        conversation: ['conversa'],
        conversations: ['conversas'],
        'side question': ['pergunta paralela'],
        automation: ['automação'],
        'scheduled task': ['tarefa agendada'],
        file: ['arquivo'],
        files: ['arquivos'],
        tab: ['aba'],
        window: ['janela'],
        panel: ['painel'],
        terminal: ['terminal'],
        recording: ['gravação'],
        recordings: ['gravações'],
        voice: ['voz'],
        model: ['modelo'],
        models: ['modelos'],
        environment: ['ambiente'],
        artifact: ['artefato'],
        plan: ['plano'],
        comment: ['comentário'],
        preview: ['prévia'],
        browser: ['navegador'],
        'virtual machine': ['máquina virtual'],
        cookies: ['cookies'],
        app: ['app'],
        apps: ['apps'],
        command: ['comando'],
        commands: ['comandos'],
        result: ['resultado'],
        results: ['resultados'],
        item: ['item'],
        items: ['itens'],
        extension: ['extensão'],
        extensions: ['extensões'],
        tool: ['ferramenta'],
        tools: ['ferramentas']
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
        add: ['Adicionar '],
        cancel: ['Cancelar '],
        close: ['Fechar '],
        configure: ['Configurar '],
        connect: ['Conectar '],
        delete: ['Excluir '],
        disconnect: ['Desconectar '],
        enable: ['Ativar '],
        install: ['Instalar '],
        new: ['Novo '],
        open: ['Abrir '],
        reconnect: ['Reconectar '],
        remove: ['Remover '],
        restart: ['Reiniciar '],
        stop: ['Parar '],
        toggle: ['Alternar '],
        view: ['Ver ']
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

    const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    /** Format English calendar dates into Brazilian Portuguese "D de mês de YYYY" (or "D de mês") form. */
    function formatEnglishDate(raw) {
        const s = String(raw || '').trim();
        let m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[1].toLowerCase()];
            if (mon) return parseInt(m[2], 10) + ' de ' + MESES_PT[mon - 1] + ' de ' + m[3];
        }
        m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{4})$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[2].toLowerCase()];
            if (mon) return parseInt(m[1], 10) + ' de ' + MESES_PT[mon - 1] + ' de ' + m[3];
        }
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
            return parseInt(m[3], 10) + ' de ' + MESES_PT[parseInt(m[2], 10) - 1] + ' de ' + m[1];
        }
        m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[1].toLowerCase()];
            if (mon) return parseInt(m[2], 10) + ' de ' + MESES_PT[mon - 1];
        }
        m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?$/i);
        if (m) {
            const mon = MONTH_NAME_TO_NUM[m[2].toLowerCase()];
            if (mon) return parseInt(m[1], 10) + ' de ' + MESES_PT[mon - 1];
        }
        return s;
    }

    /** Translate model selector plan/audience phrases while preserving unknown plan names. */
    function formatPlanAudience(raw) {
        const s = String(raw || '').trim();
        const low = s.toLowerCase();
        const audienceMap = {
            'all users': 'todos os usuários',
            'everyone': 'todos os usuários',
            'your current plan': 'seu plano atual',
            'your plan': 'seu plano',
            'free tier': 'plano gratuito',
            'free users': 'usuários do plano gratuito',
            'paid plans': 'planos pagos',
            'paid users': 'usuários pagantes',
            'pro users': 'usuários Pro',
            'pro plan': 'plano Pro',
            'ultra users': 'usuários Ultra',
            'ultra plan': 'plano Ultra',
            'plus users': 'usuários Plus',
            'enterprise users': 'usuários Enterprise',
            'team users': 'usuários de equipe',
            'early access': 'usuários de acesso antecipado',
            'google ai pro': 'Google AI Pro',
            'google ai ultra': 'Google AI Ultra',
            'ai pro': 'AI Pro',
            'ai ultra': 'AI Ultra'
        };
        if (Object.prototype.hasOwnProperty.call(audienceMap, low)) {
            return audienceMap[low];
        }
        if (/\s+and\s+/i.test(s)) {
            return s.split(/\s+and\s+/i).map(p => formatPlanAudience(p)).join(' e ');
        }
        return s;
    }

    function formatModelAvailability(model, timing, aud) {
        const isNow = /^now$/i.test(timing);
        const audPt = formatPlanAudience(aud);
        return model + (isNow ? ' agora está disponível para ' : ' está disponível atualmente para ') + audPt;
    }

    const DYNAMIC_RULES = [
        // Expandir / recolher detalhes da lista
        // As reticências seguem o texto original: "Show 3 more" não ganha "..."
        [/^Show\s+(\d+)\s+more(\s+(results?|items?|commands?|options?))?(\.\.\.|…)?$/i, (m, num, p2, type, ell) => {
            const tail = ell || '';
            if (type) {
                const one = Number(num) === 1;
                if (/result/i.test(type)) return ('Mostrar mais ' + num + (one ? ' resultado' : ' resultados')) + tail;
                if (/command/i.test(type)) return ('Mostrar mais ' + num + (one ? ' comando' : ' comandos')) + tail;
                if (/item/i.test(type)) return ('Mostrar mais ' + num + (one ? ' item' : ' itens')) + tail;
                if (/option/i.test(type)) return ('Mostrar mais ' + num + (one ? ' opção' : ' opções')) + tail;
            }
            return ('Mostrar mais ' + num) + tail;
        }],
        [/^Show\s+(\d+)\s+breakdown(s)?$/i, (m, num) => ("Mostrar " + num + (Number(num) === 1 ? " detalhamento" : " detalhamentos"))],
        [/^Hide\s+breakdown(s)?$/i, () => "Ocultar detalhamento"],
        [/^Show\s+breakdown(s)?$/i, () => "Mostrar detalhamento"],
        [/^(?:\+\s*)?See\s+(\d+)\s+more(?:\s+(.+))?$/i, (m, num) => {
            const hasPlus = /^\+/.test(m);
            return (hasPlus ? "+ " : "") + ("Ver mais " + num);
        }],
        [/^See\s+more\s+in\s+(.+)$/i, (m, name) => ("Ver mais em " + name)],
        [/^See all\s*\((\d+)\)$/i, (m, num) => ("Ver tudo (" + num + ")")],

        // Exclusão de conversas e contagens
        [/^(?:(Permanently delete)\s+)?(.+?)\s+including\s+(\d+)\s+active conversations?(\.)?$/i, (m, del, name, count, dot) => {
            const delPrefix = del ? "Excluir permanentemente " : "";
            const suffix = dot ? "." : "";
            return delPrefix + name + (" (incluindo " + count + (Number(count) === 1 ? " conversa ativa)" : " conversas ativas)")) + suffix;
        }],
        [/^including\s+(\d+)\s+active conversations?(\.)?$/i, (m, count, dot) => ("incluindo " + count + (Number(count) === 1 ? " conversa ativa" : " conversas ativas")) + (dot ? "." : "")],
        [/^(\d+)\s+active conversations?(\.)?$/i, (m, count, dot) => (count + (Number(count) === 1 ? " conversa ativa" : " conversas ativas")) + (dot ? "." : "")],
        [/^Are you sure you want to delete (the |this )?project (.+?)\??$/i, (m, article, name) => ("Tem certeza de que deseja excluir o projeto " + name + "?")],
        [/^Marked\s+(\d+)\s+conversations?\s+as\s+read$/i, (m, count) => (Number(count) === 1 ? "1 conversa marcada como lida" : count + " conversas marcadas como lidas")],
        [/^No more older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("Não há mais mensagens antigas. Mostrando " + a + " de " + b)],

        // Saudações e interação por voz
        [/^Hey\s+(.+?),\s+what should we build today\??$/i, (m, name) => name.trim().toLowerCase() === 'there' ? ("Olá, o que vamos construir hoje?") : (("Olá, " + name.trim() + ", o que vamos construir hoje?"))],
        [/^Welcome back,\s*(.+?)\.\s*Where should we pick up\??$/i, (m, name) => ("Que bom ver você de novo, " + name.trim() + ". Por onde vamos continuar?")],
        [/^Welcome back\.\s*Where should we pick up\??$/i, () => "Que bom ver você de novo. Por onde vamos continuar?"],
        [/^Good to see you,\s*(.+?)\.\s*What's next\??$/i, (m, name) => ("Que bom ver você, " + name.trim() + ". O que vem agora?")],
        [/^Good to see you\.\s*What's next\??$/i, () => "Que bom ver você. O que vem agora?"],
        [/^Hi\s+(.+?),\s+what can we get done today\??$/i, (m, name) => ("Olá, " + name.trim() + ", o que vamos realizar hoje?")],
        [/^What can we get done today\??$/i, () => "O que vamos realizar hoje?"],
        [/^Good to see you(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (("Que bom ver você, " + name.trim() + ".")) : ("Que bom ver você.")],
        [/^Welcome back(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (("Que bom ver você de novo, " + name.trim() + ".")) : ("Que bom ver você de novo.")],
        [/^Hello,\s*(.+?)[.!]*$/i, (m, name) => ("Olá, " + name.trim() + ".")],
        [/^Hello[.!]$/i, () => "Olá."],
        [/^Hi there[.!]*$/i, () => "Olá."],
        [/^Hi\s+([^\s.!]+)[.!]*$/i, (m, name) => name.toLowerCase() === 'there' ? "Olá." : (("Olá, " + name.trim() + "."))],
        [/^(.+?),\s+voice\s+(\d+)\s+of\s+(\d+)$/i, (m, name, curr, total) => (name + ", voz " + curr + " de " + total)],
        [/^Voice\s+speed,\s+([0-9.]+x)$/i, (m, spd) => ("Velocidade da voz, " + spd)],

        // Botões e dicas rápidas
        [/^Send message\s+(Enter|⏎|\u23ce)$/i, (m, key) => ("Enviar mensagem ") + key],
        [/^Queue message\s+(Enter|⏎|\u23ce)$/i, (m, key) => ("Enfileirar mensagem ") + key],
        [/^Send all\s*\((\d+)\)$/i, (m, num) => ("Enviar tudo (" + num + ")")],
        [/^Open (Live transcript|Voice transcript),\s*(.+?)(?:\.\s*Summarizing call)?$/i, (m, kind, dur) => {
            const kZh = /^Live/i.test(kind) ? ("transcrição ao vivo") : ("transcrição de voz");
            const suffix = /Summarizing call$/i.test(m) ? (". Resumindo a chamada") : "";
            return ("Abrir ") + kZh + ", " + dur + suffix;
        }],
        [/^Select all in$/i, () => "Selecionar tudo em "],
        [/^Uses your local clone,$/i, () => "Usa o seu clone local,"],
        [/^to have the agent generate a plan\.?$/i, () => "para que o agente gere um plano."],

        // Renovação de cota e avisos de créditos de IA
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?, (\d+) hours?\.?$/i, (m, d, h) => ("Renova em " + d + (Number(d) === 1 ? " dia" : " dias") + " e " + h + (Number(h) === 1 ? " hora" : " horas"))],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?, (\d+) minutes?\.?$/i, (m, h, min) => ("Renova em " + h + (Number(h) === 1 ? " hora" : " horas") + " e " + min + (Number(min) === 1 ? " minuto" : " minutos"))],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?\.?$/i, (m, d) => ("Renova em " + d + (Number(d) === 1 ? " dia" : " dias"))],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?\.?$/i, (m, h) => ("Renova em " + h + (Number(h) === 1 ? " hora" : " horas"))],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) minutes?\.?$/i, (m, min) => ("Renova em " + min + (Number(min) === 1 ? " minuto" : " minutos"))],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in less than a minute\.?$/i, () => "Renova em menos de 1 minuto"],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in a few seconds\.?$/i, () => "Renova em alguns segundos"],
        [/^Available AI Credits:\s*(.+)$/i, (m, val) => ("Créditos de IA disponíveis: ") + val],
        [/^Your plan's baseline quota will refresh on (.+?)\.?\s*To continue using this model now, enable AI Credit overages\.?$/i, (m, when) => ("A cota básica do seu plano será renovada em " + when + ". Para continuar usando este modelo agora, ative o uso excedente de créditos de IA.")],
        [/^You have hit your (weekly|daily|monthly|\d+-hour) limit,\s*it (?:will refresh|refreshes) in (.+?)\.\s*If on a supported paid plan, you can use AI credits in the interim(?:\s*(or upgrade to a higher tier))?\.?$/i, (m, unit, when, upgrade) => {
            const u = unit.toLowerCase();
            const h = u.replace(/-hour$/i, '');
            const uSc = u === 'weekly' ? 'semanal' : u === 'daily' ? 'diário' : u === 'monthly' ? 'mensal' : ('de ' + h + (Number(h) === 1 ? ' hora' : ' horas'));
            const dur = formatUsageDuration(when) || when;
            const upSc = upgrade ? ' ou fazer upgrade para um nível superior' : '';
            return ("Você atingiu seu limite " + uSc + ", que será renovado em " + dur + ". Se estiver em um plano pago compatível, você pode usar créditos de IA enquanto isso" + upSc + ".");
        }],
        [/^You have hit your (weekly|daily|monthly|\d+-hour) limit,\s*(?:so\s+)?the (weekly|daily|monthly|\d+-hour) limit does not currently apply\.\s*Your (?:weekly|daily|monthly|\d+-hour) limit will (?:(fully)\s+)?refresh in (.+?)\.?$/i, (m, hit, other, fully, when) => {
            const label = (w) => {
                const l = w.toLowerCase();
                if (l === 'weekly') return 'semanal';
                if (l === 'daily') return 'diário';
                if (l === 'monthly') return 'mensal';
                const h = l.replace(/-hour$/i, '');
                return 'de ' + h + (Number(h) === 1 ? ' hora' : ' horas');
            };
            const hitSc = label(hit);
            const otherSc = label(other);
            const dur = formatUsageDuration(when) || when;
            return ("Você atingiu seu limite " + hitSc + ", e o limite " + otherSc + " não se aplica no momento. Seu limite " + hitSc + " será " + (fully ? "totalmente renovado" : "renovado") + " em " + dur + ".");
        }],
        [/^You have used some of your (weekly|daily|monthly|\d+-hour) limit,\s*it will (?:(fully)\s+)?refresh in (.+?)\.?$/i, (m, unit, fully, when) => {
            const l = unit.toLowerCase();
            const h = l.replace(/-hour$/i, '');
            const uSc = l === 'weekly' ? 'semanal' : l === 'daily' ? 'diário' : l === 'monthly' ? 'mensal' : ('de ' + h + (Number(h) === 1 ? ' hora' : ' horas'));
            const dur = /^less than a minute$/i.test(when.trim()) ? ('menos de 1 minuto') : (formatUsageDuration(when) || when);
            return ("Você usou parte do seu limite " + uSc + ", que será " + (fully ? "totalmente renovado" : "renovado") + " em " + dur + ".");
        }],
        [/^Models within this group:\s*(.+)$/i, (m, models) => ("Modelos deste grupo: " + models)],
        [/^(.+?)\s+(Weekly|Daily|Monthly|Five[- ]Hour|5[- ]Hour)\s+Limit$/i, (m, prefix, unit) => {
            const u = unit.toLowerCase();
            const uSc = u === 'weekly' ? 'Limite semanal' : u === 'daily' ? 'Limite diário' : u === 'monthly' ? 'Limite mensal' : 'Limite de 5 horas';
            return (uSc + " de " + prefix);
        }],
        [/^For paid Pro plans,\s*(.+?)\s+quota is separate\.\s*Higher\s+\1\s+quota\s*\(included as part of the larger\s+(.+?)\s+quota bucket\)\s*is available on Ultra plans\.?$/i, (m, model, bucket) => ("Nos planos Pro pagos, a cota de " + model + " é separada. Uma cota maior de " + model + " (incluída no grupo de cota maior de " + bucket + ") está disponível nos planos Ultra.")],
        [/^You can upgrade to (?:a|the)\s+(higher\s+)?(.+?)\s+plan to receive (?:(the highest)|higher) rate limits\.?$/i, (m, higherAdj, plan, highest) => {
            const ratePart = highest ? 'os maiores limites de uso.' : 'limites de uso mais altos.';
            return higherAdj
                ? ('Você pode fazer upgrade para um plano ' + plan + ' de nível superior para receber ' + ratePart)
                : ('Você pode fazer upgrade para o plano ' + plan + ' para receber ' + ratePart);
        }],
        [/^The original\s+(.+?)\s+model for advanced workflows\.?$/i, (m, model) => ("O modelo " + model + " original para fluxos de trabalho avançados")],
        [/^Waiting for (\d+) timers$/i, (m, n) => ("Aguardando " + n + " temporizadores")],
        [/^Waiting for timer$/i, () => "Aguardando temporizador"],
        [/^(\d+) (subagents\/tasks|subagents?|tasks?) running$/i, (m, n, kind) => {
            const k = kind.toLowerCase();
            const one = Number(n) === 1;
            const lSc = k === 'subagents/tasks' ? (one ? ' subagente/tarefa' : ' subagentes/tarefas') : k.startsWith('subagent') ? (one ? ' subagente' : ' subagentes') : (one ? ' tarefa' : ' tarefas');
            return (n + lSc + " em execução");
        }],
        [/^(\d+) subagents? blocked$/i, (m, n) => (n + (Number(n) === 1 ? " subagente bloqueado" : " subagentes bloqueados"))],

        // Predefinições, permissões e orçamento de tokens das ferramentas
        [/^Learn more about (.+)$/i, (m, p) => {
            let translatedPreset = p;
            const pLow = p.toLowerCase();
            if (pLow === 'default' || pLow.includes('padrão')) translatedPreset = "Padrão";
            else if (pLow === 'inherit global' || pLow.includes('herdar global')) translatedPreset = "Herdar global";
            else if (pLow === 'full machine' || pLow.includes('máquina inteira') || pLow.includes('máquina completa')) translatedPreset = "Máquina inteira";
            else if (pLow === 'turbo mode' || pLow.includes('modo turbo')) translatedPreset = "Modo Turbo";
            else if (pLow === 'custom' || pLow.includes('personalizado')) translatedPreset = "Personalizado";
            return ("Saiba mais sobre " + translatedPreset);
        }],
        [/^Yes, allow downloads from (.+) for this run$/i, (m, site) => ("Sim, permitir downloads de " + site + " nesta execução")],
        [/^Yes, allow downloads from (.+) in this conversation$/i, (m, site) => ("Sim, permitir downloads de " + site + " nesta conversa")],
        [/^Yes, always allow downloads from (.+)$/i, (m, site) => ("Sim, sempre permitir downloads de " + site)],
        [/^Yes, allow (.+) in this conversation$/i, (m, target) => ("Sim, permitir " + target + " nesta conversa")],
        [/^Yes, always allow (.+)$/i, (m, target) => ("Sim, sempre permitir " + target)],
        [/^(\d+) tools? enabled$/i, (m, num) => (num + (Number(num) === 1 ? " ferramenta ativada" : " ferramentas ativadas"))],
        [/^(\d+)\s+tools?$/i, (m, num) => num + (Number(num) === 1 ? " ferramenta" : " ferramentas")],
        [/^(\d+)\s+tools?\s+·\s+sign in for more$/i, (m, num) => num + (Number(num) === 1 ? " ferramenta" : " ferramentas") + " · entre para ver mais"],
        [/^(\d+)\s+tools?\s+excluded$/i, (m, num) => num + (Number(num) === 1 ? " ferramenta excluída" : " ferramentas excluídas")],
        [/^Exceeded the rules token budget\.\s+Full rule content\s+\(([\d,]+)\s+tokens?\)\s+was replaced with a lightweight file-path pointer in context\.$/i, (m, num) => ("O orçamento de tokens das regras foi excedido. O conteúdo completo da regra (" + num + (num === "1" ? " token" : " tokens") + ") foi substituído no contexto por um ponteiro leve de caminho de arquivo.")],
        [/^All tools in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, num) => ("Todas as ferramentas deste servidor MCP (" + num + (num === "1" ? " token" : " tokens") + ") excederam o orçamento de personalização e foram excluídas do contexto.")],
        [/^(\d+)\s+tools?\s+in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, tCount, num) => (Number(tCount) === 1 ? ("1 ferramenta deste servidor MCP (" + num + (num === "1" ? " token" : " tokens") + ") excedeu o orçamento de personalização e foi excluída do contexto.") : (tCount + " ferramentas deste servidor MCP (" + num + (num === "1" ? " token" : " tokens") + ") excederam o orçamento de personalização e foram excluídas do contexto."))],
        [/^Exceeded the customization token budget\s+\(([\d,]+)\s+tokens?\)\s+and was excluded from context\.$/i, (m, num) => ("O orçamento de tokens de personalização foi excedido (" + num + (num === "1" ? " token" : " tokens") + ") e o item foi excluído do contexto.")],
        [/^(Rules|Skills|Mcp Tools): ([\d,]+) tokens$/i, (m, kind, num) => {
            const kindMap = { "rules": "Regras", "skills": "Habilidades", "mcp tools": "Ferramentas MCP" };
            return (kindMap[kind.toLowerCase()] || kind) + ": " + num + " tokens";
        }],

        // Versão, carimbos de tempo e erros de tempo limite
        [/^Version\s+([\d.]+)$/i, (m, v) => "Versão " + v],
        [/^(\d+)(s|m|h|d|w|mo|yr)\s+ago$/i, (m, num, unit) => {
            const u = unit.toLowerCase();
            if (u === 'mo') return "há " + num + (Number(num) === 1 ? " mês" : " meses");
            if (u === 'yr') return "há " + num + (Number(num) === 1 ? " ano" : " anos");
            const pair = UNIT_MAP[u];
            return "há " + num + " " + (pair ? pair[0] : unit);
        }],
        [/^(.+?): context deadline exceeded$/i, (m, prefix) => prefix + (": tempo limite da requisição excedido (context deadline exceeded)")],
        [/^(.+?): i\/o timeout$/i, (m, prefix) => prefix + (": tempo limite de E/S esgotado (i/o timeout)")],

        // Frases genéricas de descrição de servidores MCP remotos
        [/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i, (m, name, tools, purpose) => ("O servidor MCP remoto de " + name + " permite que você acesse e execute ferramentas de ") + tools + (" para ") + purpose],
        [/^The (.+?) remote MCP server lets you manage (.+) resources\.?$/i, (m, name, res) => ("O servidor MCP remoto de " + name + " permite que você gerencie recursos de ") + res + (".")],
        [/^The (.+?) remote MCP server (allows you to|lets you) (.+)$/i, (m, name, verb, rest) => {
            const text = rest.replace(/enroll projects/gi, "registrar projetos")
                             .replace(/generate audit and scope reports/gi, "gerar relatórios de auditoria e de escopo")
                             .replace(/check resource enrollment statuses/gi, "verificar o status de registro de recursos")
                             .replace(/in the (.+?) region/gi, (rm, r) => ("na região " + r));
            return ("O servidor MCP remoto de " + name + " permite que você ") + text;
        }],

        // Feedback, estado de raciocínio, alertas de segurança do navegador e resumos de etapas
        [/^Send feedback as(\s+(.+))?$/i, (m, p1, email) => email ? ("Enviar feedback como " + email) : ("Enviar feedback como:")],
        [/^(Thought|Thinking|Worked) for\s+(.+)$/i, (m, verb, rest) => {
            const vZh = /^Thought/i.test(verb) ? "Raciocinou por " : (/^Thinking/i.test(verb) ? "Raciocinando por " : "Trabalhou por ");
            let durPart = rest.trim();
            let updateSuffix = "";
            const updMatch = durPart.match(/^(.*?)\s*·\s*(\d+)\s+updates?$/i);
            if (updMatch) {
                durPart = updMatch[1].trim();
                updateSuffix = " · " + updMatch[2] + (Number(updMatch[2]) === 1 ? " atualização" : " atualizações");
            }
            const dZh = durPart.replace(/(\d+)\s*h(?:ours?|r)?(?![a-z])/gi, "$1 h").replace(/(\d+)\s*m(?:inutes?|in)?(?![a-z])/gi, "$1 min").replace(/(\d+)\s*s(?:econds?|ec)?(?![a-z])/gi, "$1 s");
            return vZh + dZh + updateSuffix;
        }],
        [/^(?:(·\s*))?(\d+)\s+updates?$/i, (m, dot, num) => (dot ? " · " : "") + num + (Number(num) === 1 ? " atualização" : " atualizações")],
        [/^Low contrast ratio \(([^)]+)\)\.\s*Text may be hard to read\.?$/i, (m, ratio) => ("Taxa de contraste baixa (" + ratio + "). O texto pode ser difícil de ler.")],
        [/^Preview unavailable\s*[—–-]\s*(.+)$/i, (m, reason) => ("Prévia indisponível — ") + reason],
        [/^Proceed to\s+(.+?)\s+\(unsafe\)$/i, (m, host) => ("Continuar para " + host + " (não seguro)")],
        [/^\(?for example, passwords, messages, or credit cards\)?\.?$/i, () => "(por exemplo, senhas, mensagens ou cartões de crédito)."],
        [/^may sign you out of this site\.?$/i, () => "pode desconectar você deste site."],
        [/^normally uses encryption to protect your information\. When the browser tried to connect to$/i, () => "normalmente usa criptografia para proteger suas informações. Quando o navegador tentou se conectar a "],
        [/^this time, the website sent back unusual and incorrect credentials\.?$/i, () => " desta vez, o site enviou credenciais incomuns e incorretas."],
        [/^(.+?)\s+normally uses encryption to protect your information\.\s*When the browser tried to connect to\s+(.+?)\s+this time,\s*the website sent back unusual and incorrect credentials\.?$/i, (m, h1, h2) => (h1 + " normalmente usa criptografia para proteger suas informações. Quando o navegador tentou se conectar a " + h2 + " desta vez, o site enviou credenciais incomuns e incorretas.")],
        [/^The certificate was rejected \((.+)\)\.\s*$/i, (m, code) => ("O certificado foi rejeitado (" + code + ").")],
        [/^Nothing is running on port (\d+)$/i, (m, port) => ("Nada está em execução na porta " + port)],
        [/^Resume the conversation to start its workspace again, then start the server on port (\d+) and retry\.$/i, (m, port) => ("Retome a conversa para iniciar o espaço de trabalho novamente, depois inicie o servidor na porta " + port + " e tente novamente.")],
        [/^No server is listening on port (\d+) inside the remote workspace\. Start it, or ask the agent to, then retry\.$/i, (m, port) => ("Nenhum servidor está escutando na porta " + port + " dentro do espaço de trabalho remoto. Inicie-o, ou peça ao agente para iniciá-lo, e tente novamente.")],
        [/^Help us improve\s+(.+?)\.?$/i, (m, app) => ("Ajude-nos a melhorar " + app + ".")],
        [/^Get Anything Done with\s+(.+)$/i, (m, app) => ("Faça tudo com " + app)],
        [/^Customize your experience from visual themes to how autonomous your agent acts and what\s+(.+?)\s+says\.?$/i, (m, app) => ("Personalize sua experiência, dos temas visuais ao nível de autonomia do seu agente e ao que " + app + " diz.")],
        [/^(.+?)'s agents are powerful\.\s*They can edit files,\s*run commands,\s*and browse the web\.?$/i, (m, app) => ("Os agentes de " + app + " são poderosos. Eles podem editar arquivos, executar comandos e navegar na web.")],
        [/^Google\s+(.+?)\s+Terms of Service$/i, (m, app) => ("Termos de Serviço do Google " + app)],
        [/^Review permissions for\s+(.+)$/i, (m, name) => ("Revisar permissões de " + name)],
        [/^Auth code for\s+(.+)$/i, (m, name) => ("Código de autorização de " + name)],
        [/^(.+?),\s*(\d+)\s+grants?$/i, (m, name, count) => (name + ", " + count + (Number(count) === 1 ? " concessão" : " concessões"))],
        [/^Set up\s+(.+)$/i, (m, name) => ("Configurar " + name)],
        [/^On top of those defaults,\s*(.+?)\s+requests the access below\.$/i, (m, name) => ("Além desses padrões, " + name + " solicita o acesso abaixo.")],
        [/^(\d+)\s+calls?\s*·\s*([0-9.]+)\s*MB$/i, (m, count, mb) => (count + (Number(count) === 1 ? " chamada" : " chamadas") + " · " + mb + " MB")],
        [/^Deleted\s+(\d+)\s+recordings?\s*\(([0-9.]+)\s*MB\)$/i, (m, count, mb) => (Number(count) === 1 ? ("1 gravação excluída (" + mb + " MB)") : (count + " gravações excluídas (" + mb + " MB)"))],
        [/^Failed to delete recordings:\s*(.+)$/i, (m, err) => ("Falha ao excluir gravações: " + err)],
        [/^This deletes\s+(\d+)\s+call recordings?\s*\(([0-9.]+)\s*MB\)\s+from your machine\.\s*You can't undo this\.$/i, (m, count, mb) => ("Isso exclui " + count + (Number(count) === 1 ? " gravação de chamada" : " gravações de chamadas") + " (" + mb + " MB) do seu computador. Esta ação não pode ser desfeita.")],
        [/^Step\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("Etapa " + a + " de " + b)],
        [/^\+(\d+)\s+more$/i, (m, num) => ("+" + num + " mais")],
        [/^Not referenced by any feature\s*\((\d+)\)$/i, (m, num) => ("Não referenciado por nenhum recurso (" + num + ")")],
        [/^Zipping\s+(.+?)(\.\.\.|…)?$/i, (m, name) => ("Compactando " + name + "...")],
        [/^There are currently no Build with\s+(.+?)\s+plugins available\.?$/i, (m, partner) => ("No momento, não há plugins Build with " + partner + " disponíveis.")],
        [/^To switch accounts,\s*sign out in the\s+(.+?)\s+and sign in again\.?$/i, (m, place) => ("Para trocar de conta, saia em " + place + " e entre novamente.")],
        [/^No MCP servers found for\s+"(.+)"$/i, (m, q) => ('Nenhum servidor MCP encontrado para "' + q + '"')],
        [/^Agents created by\s+(.+?)\s+can apply across workspaces,\s*while project agents apply to\s+(.+?)\.?$/i, (m, a, b) => ("Os agentes criados por " + a + " valem em todos os espaços de trabalho, enquanto os agentes de projeto valem apenas em " + b + ".")],
        [/^An?\s+(automation|scheduled task)\s+with this name already exists\.\s*Choose a different name\.?$/i, (m, kind) => ("Já existe " + (/automation/i.test(kind) ? "uma automação" : "uma tarefa agendada") + " com este nome. Escolha outro nome.")],
        [/^Choose\s+(.+?)'s\s+Voice$/i, (m, app) => ("Escolha a voz de " + app)],
        [/^Microphone blocked\.\s*Allow in\s+(.+?)\.?$/i, (m, place) => {
            const raw = place.trim();
            const knownPlaces = {
                'system settings': 'Configurações do sistema',
                'system preferences': 'Preferências do sistema',
                'windows settings': 'Configurações do Windows',
                'privacy & security': 'Privacidade e Segurança',
                'browser settings': 'Configurações do navegador',
                'site settings': 'Configurações do site'
            };
            const translatedPlace = lookupDict(raw) || knownPlaces[raw.toLowerCase()] || raw;
            return "Microfone bloqueado. Permita em " + translatedPlace + ".";
        }],
        [/^Microphone access for\s+(.+?)\s+was denied\.\s*Quit and reopen the app to be asked again\.?$/i, (m, host) => ("O acesso ao microfone para " + host + " foi negado. Saia e abra o app novamente para que a permissão seja solicitada outra vez.")],
        [/^Microphone access for\s+(.+?)\s+wasn['’]t allowed\.?$/i, (m, host) => ("O acesso ao microfone para " + host + " não foi permitido.")],
        [/^Agent needs permission to act on\s+(.+)$/i, (m, target) => ("O agente precisa de permissão para agir em " + target)],
        [/^The browser blocked the download of\s+(.+?):\s*the agent browser does not download this file type(.*)$/i, (m, file, rest) => ("O navegador bloqueou o download de " + file + ": o navegador do agente não baixa este tipo de arquivo" + rest)],
        [/^Blocked external popup navigation to\s+"(.+)"$/i, (m, url) => ('Navegação bloqueada para pop-up externo: "') + url + ('"')],
        [/^Blocked navigation to\s+"(.+)"$/i, (m, url) => ('Navegação bloqueada para: "') + url + ('"')],
        [/^Blocked popup to\s+"(.+)"$/i, (m, url) => ('Pop-up bloqueado para: "') + url + ('"')],
        [/^Blocked cross-origin subframe\s+"(.+)"$/i, (m, url) => ('Subframe de origem cruzada bloqueado: "') + url + ('"')],
        [/^Build with\s+(.+?)\s+Plugins$/i, (m, partner) => ("Criar com plugins de " + partner)],
        [/^Open the\s+(.+?)\s+plugin$/i, (m, name) => ("Abrir o plugin " + name)],
        [/^Managed by the\s+(.+?)\s+plugin$/i, (m, name) => ("Gerenciado pelo plugin " + name)],
        [/^Open\s+(.+?)\s+skill$/i, (m, name) => ("Abrir habilidade " + name)],
        [/^The\s+(.+?)\s+MCP server requires configuration parameters before it can be started\.?$/i, (m, srv) => ("O servidor MCP " + srv + " precisa de parâmetros de configuração antes de poder ser iniciado.")],
        [/^Cannot add folder:\s*"(.+?)"\s+is not a valid folder location\.?$/i, (m, loc) => ('Não foi possível adicionar a pasta: "' + loc + '" não é um local de pasta válido.')],
        [/^The folder\s+[“"](.+?)[”"]\s+does not exist\.\s*Would you like to create it\?$/i, (m, name) => ('A pasta "' + name + '" não existe. Deseja criá-la?')],
        [/^[“"](.+?)[”"]\s+isn['’]t a valid folder name\.?$/i, (m, name) => ('"' + name + '" não é um nome de pasta válido.')],
        [/^A file already exists at\s+(.+?)\.?$/i, (m, p) => ("Já existe um arquivo em " + p + ".")],
        [/^(Created automation|Enabled|Deleted|Started|Restarted|Failed to delete|Failed to start)\s+"(.+?)"\.?$/i, (m, verb, name) => {
            const vMap = { 'created automation': 'Automação criada', 'enabled': 'Ativado', 'deleted': 'Excluído', 'started': 'Iniciado', 'restarted': 'Reiniciado', 'failed to delete': 'Falha ao excluir', 'failed to start': 'Falha ao iniciar' };
            return (vMap[verb.toLowerCase()] || verb) + (': "') + name + ('".');
        }],
        [/^(Unfold|Fold)\s+lines\s+(\d+)-(\d+)$/i, (m, act, a, b) => (/^unfold$/i.test(act) ? ("Expandir linhas ") : ("Recolher linhas ")) + a + "-" + b],
        [/^Failed to save cloud permission settings:\s*(.+)$/i, (m, err) => ("Falha ao salvar as configurações de permissão da nuvem: ") + err],
        [/^System default\s*\((.+)\)$/i, (m, dev) => ("Padrão do sistema (") + dev + ")"],
        [/^Zoom\s+(\d+)%,\s*reset to fit$/i, (m, pct) => ("Zoom ") + pct + ("%, redefinir para ajustar")],
        [/^Recording shortcut for\s+(.+?)\.\s*Press keys to bind,\s*Enter to save,\s*Escape to cancel\.?$/i, (m, name) => ("Gravando atalho para " + name + ". Pressione as teclas para vincular, Enter para salvar, Escape para cancelar.")],
        [/^This window's agents,\s*files,\s*and terminals are on\s+(.+?)\.?$/i, (m, host) => ("Os agentes, arquivos e terminais desta janela estão em " + host + ".")],
        [/^When toggled on,\s*(.+?)\s+collects usage data to help Google enhance performance and features\.?$/i, (m, app) => ("Quando ativado, " + app + " coleta dados de uso para ajudar o Google a melhorar o desempenho e os recursos.")],
        [/^When toggled on,\s*(.+?)\s+will use your AI credits to fulfill model requests once you're out of model quota\.\s*(.+?)\s+will always use your model quota first before using AI credits\.?$/i, (m, a1, a2) => ("Quando ativado, " + a1 + " usará seus créditos de IA para atender às solicitações de modelo quando a sua cota de modelo acabar. " + a2 + " sempre usará primeiro a cota de modelo antes de usar créditos de IA.")],
        [/^Receive product updates,\s*tips,\s*and promotions from Google\s+(.+?)\s+via email\.?$/i, (m, app) => ("Receba por e-mail novidades do produto, dicas e promoções do Google " + app + ".")],
        [/^Agents created by this\s+(.+?)\s+run in a dedicated\s+(.+?)\s+with its own permissions\.\s*You can change the permissions in the\s+(.+?)\s+settings page\.?$/i, (m, kind, scope, scope2) => {
            // Os substantivos (automation, project) passam primeiro pelo dicionário; em português ficam em minúsculas, entre espaços normais
            const term = w => {
                const t = w.toLowerCase() === 'automation' ? ('automação') : (lookupDict(w) || w);
                return t.toLowerCase();
            };
            const termWithThis = w => {
                const t = term(w);
                if (t === 'automação') return 'esta automação';
                if (t === 'projeto') return 'este projeto';
                return t;
            };
            return ("Os agentes criados por " + termWithThis(kind) + " são executados em um ambiente dedicado (" + term(scope) + ") com permissões próprias. Você pode alterar as permissões na página de configurações de " + term(scope2) + ".");
        }],
        [/^Stop\s+(\d+)\s+agents?\?$/i, (m, count) => ("Parar " + count + (Number(count) === 1 ? " agente?" : " agentes?"))],
        [/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)(?:,\s*(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?))*$/i, (m) => {
            const verbMap = { exploring: 'Explorando', explored: 'Explorou', editing: 'Editando', edited: 'Editou', running: 'Executando', ran: 'Executou' };
            const nounMap = { file: 'arquivo', files: 'arquivos', folder: 'pasta', folders: 'pastas', search: 'pesquisa', searches: 'pesquisas', command: 'comando', commands: 'comandos', task: 'tarefa', tasks: 'tarefas', page: 'página', pages: 'páginas', browser: 'ação do navegador', browsers: 'ações do navegador', image: 'imagem', images: 'imagens', action: 'ação', actions: 'ações', artifact: 'artefato', artifacts: 'artefatos' };
            return m.split(/\s*,\s*/).map(part => {
                const pm = part.match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)$/i);
                if (!pm) return part;
                const v = pm[1] ? (verbMap[pm[1].toLowerCase()] || pm[1]) + ' ' : '';
                const n = nounMap[pm[3].toLowerCase()] || pm[3];
                return v + pm[2] + ' ' + n;
            }).join(', ');
        }],

        [/^(?:(?:Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Using|Used|Reading|Read|Writing|Wrote|Viewing|Viewed|Checking|Checked)(?:\s+(?:(?:\d+\s+)?(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?)))?|\d+\s+(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|mcp tools?))(?:\s*,\s*(?:(?:Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Using|Used|Reading|Read|Writing|Wrote|Viewing|Viewed|Checking|Checked)(?:\s+(?:(?:\d+\s+)?(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?)))?|\d+\s+(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|mcp tools?)))*$/i, (m) => {
            if (!m.includes(',') && !/\s+(?:files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?)$/i.test(m)) {
                return m;
            }
            const verbMap = { exploring: 'Explorando', explored: 'Explorou', editing: 'Editando', edited: 'Editou', running: 'Executando', ran: 'Executou', searching: 'Pesquisando', searched: 'Pesquisou', using: 'Usando', used: 'Usou', reading: 'Lendo', read: 'Leu', writing: 'Escrevendo', wrote: 'Escreveu', viewing: 'Visualizando', viewed: 'Visualizou', checking: 'Verificando', checked: 'Verificou' };
            const nounMap = { file: 'arquivo', files: 'arquivos', folder: 'pasta', folders: 'pastas', search: 'pesquisa', searches: 'pesquisas', command: 'comando', commands: 'comandos', task: 'tarefa', tasks: 'tarefas', page: 'página', pages: 'páginas', browser: 'navegador', browsers: 'navegadores', image: 'imagem', images: 'imagens', action: 'ação', actions: 'ações', artifact: 'artefato', artifacts: 'artefatos', tool: 'ferramenta', tools: 'ferramentas', web: 'web', 'mcp tool': 'ferramenta MCP', 'mcp tools': 'ferramentas MCP' };
            // [singular, plural] para uso com número
            const countNounMap = { file: ['arquivo', 'arquivos'], files: ['arquivo', 'arquivos'], folder: ['pasta', 'pastas'], folders: ['pasta', 'pastas'], search: ['pesquisa', 'pesquisas'], searches: ['pesquisa', 'pesquisas'], command: ['comando', 'comandos'], commands: ['comando', 'comandos'], task: ['tarefa', 'tarefas'], tasks: ['tarefa', 'tarefas'], page: ['página', 'páginas'], pages: ['página', 'páginas'], browser: ['ação do navegador', 'ações do navegador'], browsers: ['ação do navegador', 'ações do navegador'], image: ['imagem', 'imagens'], images: ['imagem', 'imagens'], action: ['ação', 'ações'], actions: ['ação', 'ações'], artifact: ['artefato', 'artefatos'], artifacts: ['artefato', 'artefatos'], tool: ['ferramenta', 'ferramentas'], tools: ['ferramenta', 'ferramentas'], 'mcp tool': ['ferramenta MCP', 'ferramentas MCP'], 'mcp tools': ['ferramenta MCP', 'ferramentas MCP'] };
            const countNoun = (word, n) => {
                const pair = countNounMap[word.toLowerCase()];
                return pair ? pair[Number(n) === 1 ? 0 : 1] : word;
            };
            return m.split(/\s*,\s*/).map(part => {
                const pm = part.trim().match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Using|Used|Reading|Read|Writing|Wrote|Viewing|Viewed|Checking|Checked)(?:\s+(?:(\d+)\s+)?(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|web|mcp tools?))?|(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?|tools?|mcp tools?))$/i);
                if (!pm) return part;
                if (pm[4]) {
                    return pm[4] + ' ' + countNoun(pm[5], pm[4]);
                }
                const v = verbMap[pm[1].toLowerCase()] || pm[1];
                if (pm[2]) {
                    return v + ' ' + pm[2] + ' ' + countNoun(pm[3], pm[2]);
                }
                if (pm[3]) {
                    return v + ' ' + (nounMap[pm[3].toLowerCase()] || pm[3]);
                }
                return v;
            }).join(', ');
        }],
        [/^exit_plan_mode$/, () => 'Sair do modo de planejamento'],
        [/^enter_plan_mode$/, () => 'Entrar no modo de planejamento'],

        // Mensagens dinâmicas, reprodução, grafo de relações e status da visão geral do painel complementar (Sidecar) do Swarm
        [/^(\d+)\s+posts?$/i, (m, n) => n + (Number(n) === 1 ? " publicação" : " publicações")],
        [/^(\d+)\s+posts?\s+since the view was updated$/i, (m, n) => n + (Number(n) === 1 ? " publicação" : " publicações") + " desde que a visualização foi atualizada"],
        [/^Narrator read up to #(\d+) of (\d+)$/i, (m, a, b) => "O narrador leu até #" + a + " de " + b],
        [/^read #(\d+)(?:\s*·\s*updated\s+(.+?)\s+ago)?$/i, (m, seq, dur) => "lido até #" + seq + (dur ? (" · atualizado há " + formatCompactDuration(dur)) : "")],
        [/^Posted in #([^\s;]+);\s*click to show only #([^\s;]+)$/i, (m, c1, c2) => "Publicado em #" + c1 + "; clique para mostrar apenas #" + c2],
        [/^#([^\s]+)\s+\(archived\)$/i, (m, ch) => "#" + ch + " (arquivado)"],
        [/^#([^\s]+)\s+is archived:\s*this addresses nobody$/i, (m, ch) => "#" + ch + " está arquivado: isso não notifica ninguém"],
        [/^Everyone in #([^\s]+)$/i, (m, ch) => "Todos em #" + ch],
        [/^Go to #(\d+)(?:\s*\(([^)]+)\))?$/i, (m, seq, who) => "Ir para #" + seq + (who ? (" (" + who + ")") : "")],
        [/^The narrator's last step failed:\s*(.+)$/i, (m, detail) => "A última etapa do narrador falhou: " + detail],
        [/^the narrator's view failed \((.+)\)$/i, (m, r) => "a visão do narrador falhou (" + r + ")"],
        [/^overview\s*·\s*from the narrator's notes\s*\((.+)\)$/i, (m, r) => {
            const rNorm = norm(r);
            const rZh = map.get(rNorm) || r;
            return "visão geral · das anotações do narrador (" + rZh + ")";
        }],
        [/^Opening (.+?)'s conversation needs the app\.$/i, (m, who) => "Abrir a conversa de " + who + " requer o aplicativo."],
        [/^(.+?) runs on (.+?); open it there\.$/i, (m, name, host) => name + " executa em " + host + "; abra lá."],
        [/^Copied ["“](.+)["”]\.\s*Paste it in the chat\.$/i, (m, txt) => 'Copiado "' + txt + '". Cole no chat.'],
        [/^Type ["“](.+)["”]\s+in the chat\.$/i, (m, txt) => 'Digite "' + txt + '" no chat.'],
        [/^Copied ["“](.+)["”]\.\s*Paste it to the coordinator and say what you want changed\.$/i, (m, txt) => 'Copiado "' + txt + '". Cole para o coordenador e diga o que você quer alterar.'],
        [/^Tell the coordinator:\s*["“](.+)["”]$/i, (m, txt) => 'Diga ao coordenador: "' + txt + '"'],
        [/^@([^\s]+)\s+ran out of quota(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + " ficou sem cota" + (dur ? (" (há " + formatCompactDuration(dur) + ")") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+looks stuck(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + " parece travado" + (dur ? (" (há " + formatCompactDuration(dur) + ")") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+hit an error(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + " encontrou um erro" + (dur ? (" (há " + formatCompactDuration(dur) + ")") : "") + (detail ? (" — " + detail) : "")],
        [/^seen just now$/i, () => "visto agora mesmo"],
        [/^last seen (\d+(?:s|m|h|d)) ago$/i, (m, dur) => "visto pela última vez há " + formatCompactDuration(dur)],
        [/^(\d+)\s+of\s+(\d+)\s+tasks?\s+done$/i, (m, d, tot) => d + " de " + tot + (Number(tot) === 1 ? " tarefa concluída" : " tarefas concluídas")],
        [/^([0-9]+\/[0-9]+|[0-9]+%)\s+done$/i, (m, lbl) => lbl + " concluído"],
        [/^(\d+)\s+needs?\s+you$/i, (m, n) => n + (Number(n) === 1 ? " precisa de você" : " precisam de você")],
        [/^(\d+)\s+blocked$/i, (m, n) => n + (Number(n) === 1 ? " bloqueado" : " bloqueados")],
        [/^(\d+)\s+threads?\s+open$/i, (m, n) => n + (Number(n) === 1 ? " tópico aberto" : " tópicos abertos")],
        [/^(\d+)\s+active$/i, (m, n) => n + (Number(n) === 1 ? " ativo" : " ativos")],
        [/^Up next\s*·\s*(\d+)$/i, (m, n) => "A seguir · " + n],
        [/^Last change:\s*[“"](.+)[”"]$/i, (m, txt) => 'Última alteração: "' + txt + '"'],
        [/^Remote\s*·\s*(\d+)\s+machines?$/i, (m, n) => "Remoto · " + n + (Number(n) === 1 ? " máquina" : " máquinas")],
        [/^Remote\s*·\s*(reconnecting|connecting|unavailable)$/i, (m, st) => {
            const stLow = st.toLowerCase();
            const stZh = stLow === 'reconnecting'
                ? 'reconectando'
                : (stLow === 'connecting' ? 'conectando' : 'indisponível');
            return "Remoto · " + stZh;
        }],
        [/^Message from\s+(.+)$/, (m, sender) => {
            const sNorm = norm(sender);
            const sZh = sNorm === 'Parent Agent'
                ? 'Agente pai'
                : (map.get(sNorm) || sender);
            return 'Mensagem de ' + sZh;
        }],

        // v2.32.1 Nova interface: pílulas de rascunho, hosts remotos SSH, visualização multiagente e credenciais de plugins na nuvem
        [/^(\d+)\s+Drafts?$/i, (m, n) => n + (Number(n) === 1 ? " rascunho" : " rascunhos")],
        [/^Resume\s+(\d+)\s+comment drafts?$/i, (m, n) => "Retomar " + n + (Number(n) === 1 ? " rascunho de comentário" : " rascunhos de comentário")],
        [/^Couldn't connect to\s+(.+)$/i, (m, rest) => "Não foi possível conectar a " + rest],
        [/^Connecting to\s+(.+?)(\.\.\.|…)?$/i, (m, host, ell) => "Conectando a " + host + (ell || "")],
        [/^Connected to\s+(.+)$/i, (m, host) => "Conectado a " + host],
        [/^SSH Config\s*\((.+)\)$/i, (m, cfg) => "Configuração SSH (" + cfg + ")"],
        [/^(\d+)\s+hidden hosts?$/i, (m, n) => n + (Number(n) === 1 ? " host oculto" : " hosts ocultos")],
        [/^Hide\s+(.+?)\s+from this list$/i, (m, host) => "Ocultar " + host + " desta lista"],
        [/^Show\s+(.+?)\s+in the list again$/i, (m, host) => "Mostrar " + host + " na lista novamente"],
        [/^(.+?)\s*\((Focus this tile|Back to all agents)\)$/i, (m, prefix, action) => prefix + " (" + (/^Focus/i.test(action) ? "Focar este bloco" : "Voltar para todos os agentes") + ")"],
        [/^Sign-ins to (.+?) are kept in the cloud with your account\.(?:\s*(Other credentials stay on this machine\.))?(?:\s*(Credentials are only sent to the domains listed\.))?$/i, (m, providers, otherPart, domainPart) => {
            let res = "Os logins em " + providers + " ficam salvos na nuvem com a sua conta.";
            if (otherPart) res += " As outras credenciais ficam nesta máquina.";
            if (domainPart) res += " As credenciais são enviadas somente aos domínios listados.";
            return res;
        }],
        [/^(.+?)\s+needs?\s+the terminal sandbox,\s+which isn't available on this host\.$/i, (m, presets) => {
            const labels = presets.split(/\s+and\s+/i).map(p => {
                const k = norm(p);
                return map.get(k) || lowerMap.get(k.toLowerCase()) || k;
            });
            const joined = labels.join(" e ");
            return joined + (labels.length > 1 ? " precisam do sandbox de terminal, que não está disponível neste host." : " precisa do sandbox de terminal, que não está disponível neste host.");
        }],
        [/^(Messaging|Messaged)\s+(.+)$/, (m, verb, role) => {
            const rTrim = role.trim();
            if (rTrim.length > 60 || /[.!?。！？]$/.test(rTrim)) return m;
            const rNorm = norm(rTrim);
            const rZh = map.get(rNorm) || rTrim;
            if (verb === 'Messaging') {
                return "Enviando mensagem para " + rZh;
            }
            return "Mensagem enviada para " + rZh;
        }],
        [/^Failed to save project settings:\s*(.+)$/i, (m, err) => "Falha ao salvar as configurações do projeto: " + err],

        // v2.33.0 Nova interface: dados de navegação/cookies, esquemas de atalhos, login remoto, revisão de pacotes, seletor de coordenador, solicitações de permissão e avisos de descontinuação de modelos
        [/^Account this MCP server uses:\s*(.+)$/i, (m, acc) => "Conta usada por este servidor MCP: " + acc],
        [/^Add bundle\s+(.+)$/i, (m, name) => "Adicionar pacote " + name],
        [/^Add\s*\((\d+)\)$/i, (m, n) => "Adicionar (" + n + ")"],
        [/^Add shortcut for\s+(.+)$/i, (m, cmd) => "Adicionar atalho para " + (lookupDict(cmd) || cmd)],
        [/^App view for\s+(.+)$/i, (m, name) => "Visualização do app para " + name],
        [/^Authorization code for\s+(.+)$/i, (m, name) => "Código de autorização para " + name],
        [/^(Bounding box|Comment|Search match) on page\s+(\d+)$/i, (m, kind, p) => {
            const kZh = /^Bounding/i.test(kind) ? "Caixa delimitadora" : (/^Comment/i.test(kind) ? "Comentário" : "Correspondência de pesquisa");
            return kZh + " na página " + p;
        }],
        [/^Cancel Questionnaire and Stop the Agent\s*\((.+)\)$/i, (m, p) => "Cancelar questionário e parar o agente (" + p + ")"],
        [/^Connect GitHub:\s*(.+)$/i, (m, detail) => "Conectar GitHub: " + detail],
        [/^GitHub:\s*(.+)$/i, (m, msg) => "GitHub: " + (translateExactOrDynamic(norm(msg)) || msg)],
        [/^SSH:\s*(.+)$/i, (m, host) => "SSH: " + host],
        [/^Cost summary:\s*(.+)$/i, (m, detail) => "Resumo de custos: " + detail],
        [/^(Couldn't|Failed to)\s+(archive|unarchive|pin|unpin|delete|rename|open|load|save|update|create|fork|duplicate|export|share)\s+conversation$/i, (m, lead, verb) => {
            const vMap = { archive: 'arquivar', unarchive: 'desarquivar', pin: 'fixar', unpin: 'desafixar', delete: 'excluir', rename: 'renomear', open: 'abrir', load: 'carregar', save: 'salvar', update: 'atualizar', create: 'criar', fork: 'ramificar', duplicate: 'duplicar', export: 'exportar', share: 'compartilhar' };
            const act = vMap[verb.toLowerCase()] || verb;
            return /^Couldn/i.test(lead)
                ? ("Não foi possível " + act + " a conversa")
                : ("Falha ao " + act + " a conversa");
        }],
        [/^Delete cookies for\s+(.+)$/i, (m, site) => "Excluir cookies de " + site],
        [/^(?:Could not clear site data|Couldn't delete cookies|Clearing cookies and site data|Site data cleared) for\s+(.+?)(?:\.\s*Try again\.?)?$/i, (m, site) => {
            const retrySuffix = /\.\s*Try again\.?$/i.test(m) ? ". Tente novamente." : "";
            if (/^Could not clear/i.test(m)) return "Não foi possível limpar os dados do site de " + site + retrySuffix;
            if (/^Couldn't delete/i.test(m)) return "Não foi possível excluir os cookies de " + site + retrySuffix;
            if (/^Clearing/i.test(m)) return "Limpando cookies e dados do site de " + site + retrySuffix;
            return "Dados do site limpos para " + site + retrySuffix;
        }],
        [/^No sites match\s+"(.+?)"\.?$/i, (m, q) => 'Nenhum site corresponde a "' + q + '".'],
        [/^(?:Delete|Edit) side question(?:\s+title)?:\s*(.+)$/i, (m, title) => (/^Delete/i.test(m) ? "Excluir pergunta paralela: " : "Editar título da pergunta paralela: ") + title],
        [/^Detached at\s+(.+)$/i, (m, ref) => "Desanexado em " + ref],
        [/^Details for\s+(.+)$/i, (m, name) => "Detalhes de " + name],
        [/^Duplicate\s+(.+?)\s+name$/i, (m, kind) => "Nome de " + translateNoun(kind) + " duplicado"],
        [/^Edit comment:\s*(.+)$/i, (m, txt) => "Editar comentário: " + txt],
        [/^Edit\s+(.+?)\s+name$/i, (m, target) => "Editar nome de " + target],
        [/^Failed to archive\s+(.+)$/i, (m, target) => "Falha ao arquivar " + target],
        [/^Failed to create project:\s*(.+)$/i, (m, err) => "Falha ao criar o projeto: " + err],
        [/^Failed to create\s+(.+?)\.?$/i, (m, target) => "Falha ao criar " + target],
        [/^Failed to delete\s+([^:]+):\s*(.+)$/i, (m, target, err) => "Falha ao excluir " + target + ": " + err],
        [/^Failed to delete\s+([^:"]+?)\.?$/i, (m, target) => {
            const tZh = translateNoun(target);
            return "Falha ao excluir " + tZh;
        }],
        [/^Failed to resolve folder:\s*(.+?)\s*\((.+)\)$/i, (m, dir, err) => "Falha ao resolver a pasta: " + dir + " (" + err + ")"],
        [/^Failed to save\s+"(.+?)"$/i, (m, name) => 'Falha ao salvar "' + name + '"'],
        [/^Failed to save project Google3 configuration:\s*(.+)$/i, (m, err) => "Falha ao salvar a configuração do Google3 do projeto: " + err],
        [/^Failed to save project permissions:\s*(.+)$/i, (m, err) => "Falha ao salvar as permissões do projeto: " + err],
        [/^Failed to save project:\s*(.+)$/i, (m, err) => "Falha ao salvar o projeto: " + err],
        [/^Failed to save settings:\s*(.+)$/i, (m, err) => "Falha ao salvar as configurações: " + err],
        [/^Failed to select workspace:\s*(.+)$/i, (m, err) => "Falha ao selecionar o espaço de trabalho: " + err],
        [/^Failed to unarchive project:\s*(.+)$/i, (m, err) => "Falha ao desarquivar o projeto: " + err],
        [/^Failed to update\s+"(.+?)"$/i, (m, name) => 'Falha ao atualizar "' + name + '"'],
        [/^Filter skills and rules:\s*(.+)$/i, (m, q) => "Filtrar habilidades e regras: " + (lookupDict(q) || q)],
        [/^Fix with Agent:\s*(.+)$/i, (m, target) => "Corrigir com o agente: " + target],
        [/^Go to (page|slide)\s+(\d+)$/i, (m, kind, n) => (/^page/i.test(kind) ? ("Ir para a página " + n) : ("Ir para o slide " + n))],
        [/^Go to turn\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => "Ir para o turno " + a + " de " + b],
        [/^Install folder\s+"(.+?)"\s+is already in use$/i, (m, dir) => 'A pasta de instalação "' + dir + '" já está em uso'],
        [/^Keep:\s*(.+)$/i, (m, val) => "Manter: " + (translateExactOrDynamic(norm(val)) || val)],
        [/^Label for\s+(.+)$/i, (m, acc) => "Rótulo para " + acc],
        [/^Make\s+(.+?)\s+the default\s+(.+?)\s+account$/i, (m, acc, provider) => "Tornar " + acc + " a conta padrão de " + provider],
        [/^Manage\s+(.+?)\s+app settings\.?$/i, (m, app) => "Gerenciar configurações do app " + app + "."],
        [/^More actions for\s+(.+)$/i, (m, target) => "Mais ações para " + target],
        [/^More for\s+(.+)$/i, (m, target) => "Mais para " + target],
        [/^Move to Group:\s*(.+)$/i, (m, grp) => "Mover para o grupo: " + grp],
        [/^New secret for\s+(.+)$/i, (m, name) => "Novo segredo para " + name],
        [/^No\s+(plugins|skills|rules|agents|bundles|sites|results|items|servers|commands|hosts|conversations|workflows|shortcuts|apps|files|folders|projects|workspaces|mcp servers|models|extensions|tools)\s+found for(?:\s+"([^"]*)"\s*\.?|\s*:?\s*)$/i, (m, kind, query) => {
            const singularMap = {
                plugins: 'plugin',
                skills: 'habilidade',
                rules: 'regra',
                agents: 'agente',
                bundles: 'pacote',
                sites: 'site',
                results: 'resultado',
                items: 'item',
                servers: 'servidor',
                commands: 'comando',
                hosts: 'host',
                conversations: 'conversa',
                workflows: 'fluxo de trabalho',
                shortcuts: 'atalho',
                apps: 'app',
                files: 'arquivo',
                folders: 'pasta',
                projects: 'projeto',
                workspaces: 'espaço de trabalho',
                'mcp servers': 'servidor MCP',
                models: 'modelo',
                extensions: 'extensão',
                tools: 'ferramenta'
            };
            const kLow = kind.toLowerCase();
            const isFem = /^(skills|rules|conversations|folders|extensions|tools)$/.test(kLow);
            const kPt = singularMap[kLow] || translateNoun(kind);
            const lead = isFem ? ("Nenhuma " + kPt + " encontrada") : ("Nenhum " + kPt + " encontrado");
            if (query !== undefined) {
                return lead + ' para "' + query + '"';
            }
            return lead + " para:";
        }],
        [/^Open Subagent:\s*(.+)$/i, (m, name) => "Abrir subagente: " + name],
        [/^Open URL in system browser:\s*(.+)$/i, (m, url) => "Abrir URL no navegador do sistema: " + url],
        [/^Opens external link:\s*(.+)$/i, (m, url) => "Abre link externo: " + url],
        [/^Page\s+(\d+)\s+failed to load$/i, (m, p) => "Falha ao carregar a página " + p],
        [/^Plan,\s*(\d+)\s+of\s+(\d+)\s+steps?\s+done$/i, (m, a, b) => "Plano, " + a + " de " + b + (Number(b) === 1 ? " etapa concluída" : " etapas concluídas")],
        [/^Playback speed\s+([0-9.]+x)$/i, (m, spd) => "Velocidade de reprodução " + spd],
        [/^Plugins in\s+(.+)$/i, (m, cat) => "Plugins em " + (lookupDict(cat) || cat)],
        [/^(\d+)\s+plugins?$/i, (m, n) => n + (Number(n) === 1 ? " plugin" : " plugins")],
        [/^(\d+)\s+plugins?,\s*all already installed\.\s+Adding the bundle installs plugins it gains later\.?$/i, (m, n) => n + (Number(n) === 1 ? " plugin, já instalado. " : " plugins, todos já instalados. ") + "Adicionar o pacote instala os plugins que ele receber depois."],
        [/^(\d+)\s+plugins?\.\s+Adding the bundle installs plugins it gains later\.?$/i, (m, n) => n + (Number(n) === 1 ? " plugin. " : " plugins. ") + "Adicionar o pacote instala os plugins que ele receber depois."],
        [/^(\d+)\s+plugins?\.\s+Add bundle installs (it|all of them)\.?$/i, (m, n, target) => n + (Number(n) === 1 ? " plugin. " : " plugins. ") + "Adicionar o pacote instala " + (/^it$/i.test(target) ? "este plugin." : "todos eles.")],
        [/^(\d+)\s+plugins?\.\s+Add bundle installs\s+(\d+);\s*the ones you already have stay as they are\.?$/i, (m, n, b) => n + (Number(n) === 1 ? " plugin. " : " plugins. ") + "Adicionar o pacote instala " + b + "; os que você já tem permanecem como estão."],
        [/^(?:This plugin|These plugins) in\s+(.+?)\s+may have looser code review\.\s+Review (?:its|their) contents before adding the bundle\.?$/i, (m, src) => {
            const isPlural = /^These/i.test(m);
            return isPlural
                ? ("Estes plugins em " + src + " podem ter revisão de código menos rigorosa. Revise o conteúdo deles antes de adicionar o pacote.")
                : ("Este plugin em " + src + " pode ter revisão de código menos rigorosa. Revise o conteúdo dele antes de adicionar o pacote.");
        }],
        [/^(.+?)\.\s+Disabling or removing the bundle applies only to the ones it installed\.?$/i, (m, prefix) => {
            const normPref = norm(prefix);
            let prefZh = translateExactOrDynamic(normPref);
            if (!prefZh) {
                const withDot = translateExactOrDynamic(normPref + '.');
                if (withDot) prefZh = withDot.replace(/[。.]$/, '');
            }
            return (prefZh || prefix) + ". Desativar ou remover o pacote se aplica apenas aos que ele instalou.";
        }],
        [/^(Question|Turn)\s+(\d+)\s+of\s+(\d+)$/i, (m, kind, a, b) => (/^Question/i.test(kind) ? ("Pergunta " + a + " de " + b) : ("Turno " + a + " de " + b))],
        [/^Remove context from\s+(.+)$/i, (m, target) => "Remover contexto de " + target],
        [/^Remove shortcut\s+(.+?)\s+for\s+(.+)$/i, (m, key, cmd) => "Remover atalho " + key + " para " + (lookupDict(cmd) || cmd)],
        [/^Remove\s+(.+?)\s+from (Recent|list)$/i, (m, item, where) => "Remover " + item + (/^Recent/i.test(where) ? " de Recentes" : " da lista")],
        [/^Reset\s+(.+?)\s+to default$/i, (m, cmd) => "Redefinir " + (lookupDict(cmd) || cmd) + " para o padrão"],
        [/^Review\s+(.+?)\s+before installing$/i, (m, item) => "Revisar " + item + " antes de instalar"],
        [/^Run\s+(.+?)\s+now$/i, (m, item) => "Executar " + item + " agora"],
        [/^Scroll to:\s*(.+?)\s+on page\s+(\d+)$/i, (m, target, p) => "Rolar até: " + target + " na página " + p],
        [/^Search Google for\s+"(.+)"$/i, (m, q) => 'Pesquisar "' + q + '" no Google'],
        [/^Secret for a new\s+(.+?)\s+account$/i, (m, provider) => "Segredo para uma nova conta de " + provider],
        [/^Secret for\s+(.+)$/i, (m, name) => "Segredo para " + name],
        [/^See\s+([^:]+):\s*(.+)$/i, (m, label, target) => "Ver " + (translateExactOrDynamic(norm(label)) || label) + ": " + target],
        [/^Shortcut\s+(.+?)\s+for\s+(.+)$/i, (m, key, cmd) => "Atalho " + key + " para " + (lookupDict(cmd) || cmd)],
        [/^Show\s+(.+?)\s+in folder$/i, (m, item) => "Mostrar " + item + " na pasta"],
        [/^Sign in to\s+(.+?)\s+remotely$/i, (m, target) => "Entrar em " + target + " remotamente"],
        [/^Sign in to\s+(.+)$/i, (m, target) => "Entrar em " + target],
        [/^Stop\s+(\d+)\s+selected$/i, (m, n) => "Parar " + n + (Number(n) === 1 ? " selecionado" : " selecionados")],
        [/^Switch environment\s*\((.+)\)$/i, (m, env) => "Alternar ambiente (" + env + ")"],
        [/^The browser blocked the download of\s+(.+)$/i, (m, file) => "O navegador bloqueou o download de " + file],
        [/^(Enable|Toggle) Word Wrap(.*)$/i, (m, act, suffix) => (/^Enable/i.test(act) ? "Ativar quebra de linha" : "Alternar quebra de linha") + (suffix || "")],
        [/^Using default\s+(.+?)\s+name$/i, (m, kind) => "Usando nome padrão de " + translateNoun(kind)],
        [/^View Diff for\s+(.+)$/i, (m, target) => "Ver diff de " + target],
        [/^View\s+(\d+)\s+help(?:\s+items?)?$/i, (m, n) => "Ver " + n + (Number(n) === 1 ? " item de ajuda" : " itens de ajuda")],
        [/^View\s+(\d+)\s+side questions?$/i, (m, n) => "Ver " + n + (Number(n) === 1 ? " pergunta paralela" : " perguntas paralelas")],
        [/^You're signing in on\s+(.+?)\.\s*Your sign-in stays on that machine\.?$/i, (m, host) => "Você está entrando em " + host + ". Seu login permanece nessa máquina."],
        [/^Where the agent runs,\s*current:\s*(.+)$/i, (m, rest) => {
            const rNorm = norm(rest);
            const r = lookupDict(rNorm) || rNorm.replace(/^Remote$/i, 'Remoto').replace(/^This computer$/i, 'Este computador');
            return "Onde o agente executa, atual: " + r;
        }],
        [/^Agent permissions preset selector,\s*current:\s*(.+)$/i, (m, p) => "Seletor de predefinição de permissões do agente, atual: " + (lookupDict(p) || p)],
        [/^Agent permissions preset:\s*(.+?),\s*(.+)$/i, (m, p, s) => "Predefinição de permissões do agente: " + (lookupDict(p) || p) + ", " + (lookupDict(s) || s)],
        [/^(Save rule to always allow|Allow)\s+(.+?)\?$/i, (m, verb, act) => {
            const isSave = /^Save/i.test(verb);
            const actTrim = act.trim();
            const actLow = actTrim.toLowerCase();
            const actMap = {
                'read access to this path': 'acesso de leitura a este caminho',
                'write access to this path': 'acesso de gravação a este caminho',
                'read/write access to this path': 'acesso de leitura e gravação a este caminho',
                'reading this url': 'a leitura desta URL',
                'executing actions on this url': 'executar ações nesta URL',
                'browser downloads from this site': 'downloads do navegador deste site',
                'running this command': 'executar este comando',
                'running this command outside the sandbox': 'executar este comando fora do sandbox',
                'using this mcp tool': 'usar esta ferramenta MCP',
                'a one-time administrator (uac) elevation': 'uma elevação de administrador (UAC) única',
                'access to this resource': 'acesso a este recurso',
                'the browser agent to download a file': 'que o agente de navegador baixe um arquivo'
            };
            const target = actMap[actLow] || actTrim;
            return isSave
                ? ("Salvar regra para sempre permitir " + target + "?")
                : ("Permitir " + target + "?");
        }],
        [/^Conflicts with your configured Ask permission:\s*(.+)$/i, (m, d) => ("Conflita com a permissão \"Perguntar\" que você configurou: ") + d],
        [/^Requires manual confirmation:\s*(.+)$/i, (m, d) => ("Requer confirmação manual: ") + d],
        [/^Show\s+(\d+)\s+more\s+subagents?$/i, (m, n) => ("Mostrar mais " + n + (Number(n) === 1 ? " subagente" : " subagentes"))],
        [/^Showing latest\s+(\d+)\s+browser steps?$/i, (m, n) => ("Mostrando " + (Number(n) === 1 ? "a última etapa" : "as últimas " + n + " etapas") + " do navegador")],
        [/^Showing first\s+(\d+)\s+references?$/i, (m, n) => ("Mostrando " + (Number(n) === 1 ? "a primeira referência" : "as primeiras " + n + " referências"))],
        [/^(\d+)\s+references?$/i, (m, n) => n + (Number(n) === 1 ? " referência" : " referências")],
        [/^Load older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => ("Carregar mensagens mais antigas, mostrando " + a + " de " + b)],
        [/^Sort and filter conversations\s*\((\d+)\s+active\)$/i, (m, n) => ("Ordenar e filtrar conversas (" + n + (Number(n) === 1 ? " ativo" : " ativos") + ")")],
        [/^Proceed with implementation plan and\s+(\d+)\s+comments?$/i, (m, n) => ("Prosseguir com o plano de implementação e " + n + (Number(n) === 1 ? " comentário" : " comentários"))],
        [/^Compare responses from\s+(\d+)\s+models side-by-side to find the best result\.?$/i, (m, n) => ("Compare lado a lado as respostas de " + n + " modelos para encontrar o melhor resultado.")],
        [/^You have\s+(\d+)\s+conversations? in progress\.\s+Updating will interrupt them,\s+and they will automatically resume once the update completes\.?$/i, (m, n) => ("Você tem " + n + (Number(n) === 1 ? " conversa em andamento. A atualização vai interrompê-la e ela será retomada automaticamente quando a atualização terminar." : " conversas em andamento. A atualização vai interrompê-las e elas serão retomadas automaticamente quando a atualização terminar."))],
        [/^You have\s+(\d+)\s+conversations? in progress\.\s+Updating will cancel them and you'll need to manually restart them\.?$/i, (m, n) => ("Você tem " + n + (Number(n) === 1 ? " conversa em andamento. A atualização vai cancelá-la e você precisará reiniciá-la manualmente." : " conversas em andamento. A atualização vai cancelá-las e você precisará reiniciá-las manualmente."))],
        [/^(.+?)\s+is no longer available\.\s+Runs use\s+(.+?)\s+instead\.?$/i, (m, oldM, newM) => oldM + (" não está mais disponível. As execuções usam ") + newM + " no lugar."],
        [/^(.+?)\s+is no longer available\.\s+Runs will fail until you pick another model\.?$/i, (m, oldM) => oldM + (" não está mais disponível. As execuções vão falhar até você escolher outro modelo.")],

        // Disponibilidade do modelo por plano e avisos dinâmicos de data de desativação no seletor de modelos
        [/^(.+?)\s+is\s+(currently|now)\s+available\s+(to|on)\s+(.+?)\.\s+(.+?)\s+will no longer be available on your current plan starting on\s+(.+?)(\.)?$/i, (m, model, timing, prep, aud, model2, dateStr, dot) => {
            const avail = formatModelAvailability(model, timing, aud);
            const subj = /^it$/i.test(model2.trim()) ? 'Ele' : model2.trim();
            const dep = (subj + ' deixará de estar disponível no seu plano atual a partir de ' + formatEnglishDate(dateStr));
            return avail + '. ' + dep + (dot ? '.' : '');
        }],
        [/^(.+?)\s+is\s+(currently|now)\s+available\s+(to|on)\s+(.+?)\.\s+Third-party model access will no longer be available(?:\s+on your current plan)?\s+starting on\s+(.+?)(\.)?$/i, (m, model, timing, prep, aud, dateStr, dot) => {
            const avail = formatModelAvailability(model, timing, aud);
            const hasPlan = /on your current plan/i.test(m);
            const dep = ('O acesso a modelos de terceiros deixará de estar disponível' + (hasPlan ? ' no seu plano atual' : '') + ' a partir de ' + formatEnglishDate(dateStr));
            return avail + '. ' + dep + (dot ? '.' : '');
        }],
        [/^(.+?)\s+is\s+(currently|now)\s+available\s+(to|on)\s+(.+?)(\.)?$/i, (m, model, timing, prep, aud, dot) => {
            return formatModelAvailability(model, timing, aud) + (dot ? '.' : '');
        }],
        [/^Third-party model access will no longer be available(?:\s+on your current plan)?\s+starting on\s+(.+?)(\.)?$/i, (m, dateStr, dot) => {
            const hasPlan = /on your current plan/i.test(m);
            return (('O acesso a modelos de terceiros deixará de estar disponível' + (hasPlan ? ' no seu plano atual' : '') + ' a partir de ' + formatEnglishDate(dateStr))) + (dot ? '.' : '');
        }],
        [/^(.+?)\s+will no longer be available on your current plan starting on\s+(.+?)(\.)?$/i, (m, model, dateStr, dot) => {
            return ((model + ' deixará de estar disponível no seu plano atual a partir de ' + formatEnglishDate(dateStr))) + (dot ? '.' : '');
        }],

        // v2.35.1 dicas do modelo, aviso de data de desativação e atributos de estado do seletor
        [/^Use\s+(.+?)\s+for better quality with lower quota usage\.(?:\s*Leaving on\s+(.+?)(\.)?)?$/i, (m, model, dateStr, dot) => {
            const base = ('Use ' + model.trim() + ' para obter mais qualidade com menor consumo de cota.');
            if (!dateStr) return base;
            const dFmt = formatEnglishDate(dateStr.replace(/\.$/, ''));
            return base + ((' Será desativado em ' + dFmt)) + (dot || /\.$/.test(m.trim()) ? '.' : '');
        }],
        [/^Use\s+(.+?)\s+for better quality(?:\s+and faster responses)?\.(?:\s*Leaving on\s+(.+?)(\.)?)?$/i, (m, model, dateStr, dot) => {
            const hasFast = /and faster responses/i.test(m);
            const base = ('Use ' + model.trim() + (hasFast ? ' para obter mais qualidade e respostas mais rápidas.' : ' para obter mais qualidade.'));
            if (!dateStr) return base;
            const dFmt = formatEnglishDate(dateStr.replace(/\.$/, ''));
            return base + ((' Será desativado em ' + dFmt)) + (dot || /\.$/.test(m.trim()) ? '.' : '');
        }],
        [/^Use\s+(.+?)\s+instead\.(?:\s*Leaving on\s+(.+?)(\.)?)?$/i, (m, model, dateStr, dot) => {
            const base = ('Use ' + model.trim() + ' no lugar.');
            if (!dateStr) return base;
            const dFmt = formatEnglishDate(dateStr.replace(/\.$/, ''));
            return base + ((' Será desativado em ' + dFmt)) + (dot || /\.$/.test(m.trim()) ? '.' : '');
        }],
        [/^Leaving on\s+([A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})(\.)?$/i, (m, dateStr, dot) => {
            const dFmt = formatEnglishDate(dateStr);
            return (('Será desativado em ' + dFmt)) + (dot ? '.' : '');
        }],
        [/^(.+?)\.\s+Leaving on\s+([A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})(\.)?$/i, (m, firstSent, dateStr, dot) => {
            const fNorm = norm(firstSent);
            const fZh = translateExactOrDynamic(fNorm + '.') || translateExactOrDynamic(fNorm);
            if (!fZh) return m;
            const dFmt = formatEnglishDate(dateStr);
            return fZh.replace(/\.+$/, '') + '. ' + (('Será desativado em ' + dFmt)) + (dot ? '.' : '');
        }],
        [/^Select model,\s*current:[ \t]*(.+)$/i, (m, cur) => ('Selecionar modelo, atual: ') + cur],
        [/^Select model with\s+(.+)$/i, (m, key) => (('Selecionar modelo com ' + key))],
        [/^Model:[ \t]*(.+?),\s*(.+)$/i, (m, cur, reason) => {
            const rZh = translateExactOrDynamic(norm(reason));
            if (!rZh) return m;
            return 'Modelo: ' + cur + ', ' + rZh;
        }],

        // Regras de modelos dinâmicos da v2.34.0
        [/^Couldn't disconnect (.+?): (.+)$/, (m, target, reason) => ('Não foi possível desconectar ' + target + ': ') + reason],
        [/^Failed to load page (.+?): (.+)$/, (m, page, reason) => ('Falha ao carregar a página ' + page + ': ') + reason],
        [/^More options for (.+)$/, (m, target) => ('Mais opções para ' + target)],
        [/^Opens the New Conversation screen for this (.+)$/, (m, target) => {
            const nounPt = translateNoun(target);
            const dem = /^(pasta|regra|habilidade|conta|conversa|pergunta\s+(?:lateral|paralela)|automação|tarefa\s+agendada|aba|janela|gravação|voz|prévia|máquina\s+virtual|extensão|ferramenta|página|seção|lista|coleção|equipe|organização)$/i.test(nounPt) ? 'esta ' : 'este ';
            return 'Abre a tela de nova conversa para ' + dem + nounPt;
        }],

        // Elegibilidade da conta, região sem suporte e modelos complementares das v2.33/v2.34
        [/^Your current account is not eligible for\s+(.+?),\s*because it is not currently available in your\s+(?:location|region|country|area)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `Sua conta atual não pode usar ${app.trim()}, porque o serviço ainda não está disponível na sua região${period}`;
        }],
        [/^(?:Your current|This)\s+account is not eligible (?:for|to use)\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `Esta conta não pode usar ${app.trim()}${period}`;
        }],
        [/^Sorry,\s*this account is ineligible to use\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `Desculpe, esta conta não pode usar ${app.trim()}${period}`;
        }],
        [/^Further action is required to use\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `É necessária uma ação adicional para usar ${app.trim()}${period}`;
        }],
        [/^(?:This service|The service|Antigravity|Jetski)\s+is not (?:currently\s+)?available in your\s+(?:location|region|country|area)\.?$/i, (m) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `Este serviço ainda não está disponível na sua região${period}`;
        }],
        [/^Your (?:current\s+)?(?:location|region|country|area) is not supported\.?$/i, (m) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `Sua região não é compatível${period}`;
        }],
        [/^(.+?)\s+is not (?:currently\s+)?available in your\s+(?:location|region|country|area)\.?$/i, (m, target) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `${target.trim()} ainda não está disponível na sua região${period}`;
        }],
        [/^You['’]re signing in on\s+(.+?)\.\s*Your sign-in stays on that machine\.?$/i, (m, host) => {
            const period = /\.$/.test(m.trim()) ? '.' : '';
            return `Você está entrando em ${host.trim()}. Seu login permanece nesse computador${period}`;
        }],
        [/^Turn\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => ('Turno ' + c + ' de ' + tot)],
        [/^Go to turn\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => ('Ir para o turno ' + c + ' de ' + tot)],
        [/^Recording shortcut for\s+(.+?)\.\s*Press keys to bind,\s*Enter to save,\s*Escape to cancel\.?$/i, (m, cmd) => ('Gravando atalho para "' + cmd + '". Pressione as teclas para vincular, Enter para salvar, Escape para cancelar.')],
        [/^Low contrast ratio\s*\((.+?):1\)\.\s*Text may be hard to read\.?$/i, (m, r) => ('Taxa de contraste baixa (' + r + ':1). O texto pode ser difícil de ler.')],
        [/^(?:Auth|Authorization) code for\s+(.+)$/i, (m, app) => ('Código de autorização para ' + app)],
        [/^Failed to save project Google3 configuration:\s*(.+)$/i, (m, err) => ('Falha ao salvar a configuração Google3 do projeto: ') + err],
        [/^Failed to save project:\s*(.+)$/i, (m, err) => ('Falha ao salvar o projeto: ') + err],
        [/^Available for\s+(.+?)\s+project$/i, (m, proj) => ('Disponível para o projeto ') + proj.trim()],

        // Regras de modelos dinâmicos da v2.35.0
        [/^All (.+?) will be revoked\. The plugin will ask before doing this again\.$/, (m, target) => {
            const tTrim = target.trim();
            const translated = translateNoun(tTrim);
            let tPt = translated;
            if (translated === tTrim) {
                const permMatch = tTrim.match(/^(.+?)\s+permissions$/i);
                const toolMatch = tTrim.match(/^(.+?)\s+tools$/i);
                if (permMatch) tPt = 'permissões de ' + (lookupDict(permMatch[1]) || permMatch[1]);
                else if (toolMatch) tPt = 'ferramentas de ' + (lookupDict(toolMatch[1]) || toolMatch[1]);
            }
            const lowFirst = tPt.charAt(0).toLowerCase() + tPt.slice(1);
            if (/^(permissões|ferramentas|ações|regras|credenciais|chaves|extensões|habilidades|conversas|pastas|configurações|conexões|sessões|notificações|solicitações|integrações|autorizações)\b/i.test(tPt)) {
                return 'Todas as ' + lowFirst + ' serão revogadas. O plugin vai pedir permissão antes de fazer isso novamente.';
            }
            if (/^(arquivos|comandos|plugins|servidores|atalhos|projetos|agentes|subagentes|modelos|resultados|itens|tokens|cookies|dados|acessos)\b/i.test(tPt)) {
                return 'Todos os ' + lowFirst + ' serão revogados. O plugin vai pedir permissão antes de fazer isso novamente.';
            }
            return 'Todos os itens de ' + tTrim + ' serão revogados. O plugin vai pedir permissão antes de fazer isso novamente.';
        }],
        [/^Dismiss:\s*(.+)$/, (m, target) => ('Dispensar: ') + target],
        [/^Move to\s+(.+)$/, (m, dest) => {
            const fixedDest = { archive: 'Arquivo', trash: 'Lixeira', favorites: 'Favoritos', pinned: 'Fixados', recents: 'Recentes', bookmarks: 'Favoritos', queue: 'a fila' };
            const k = dest.trim().toLowerCase();
            const d = Object.prototype.hasOwnProperty.call(fixedDest, k) ? fixedDest[k] : lookupDict(dest);
            return 'Mover para ' + (d || dest);
        }],
        [/^New\s+(.+?)\.\.\.$/, (m, kind) => {
            const nounPt = translateNoun(kind);
            const adj = /^(pasta|regra|habilidade|conta|conversa|pergunta\s+(?:lateral|paralela)|automação|tarefa\s+agendada|aba|janela|gravação|voz|prévia|máquina\s+virtual|extensão|ferramenta|página|seção|lista|coleção|equipe|organização)$/i.test(nounPt) ? 'Nova ' : 'Novo ';
            return adj + nounPt + '...';
        }],
        [/^No matching languages for "(.+)"$/, (m, q) => ('Nenhum idioma correspondente a "' + q + '"')],
        [/^Remove from\s+(.+)$/, (m, target) => {
            const fixedTargets = { favorites: 'Favoritos', pinned: 'Fixados', recents: 'Recentes', bookmarks: 'Favoritos', archive: 'Arquivo', trash: 'da Lixeira', queue: 'da fila', allowlist: 'da lista de permissões', 'allow list': 'da lista de permissões', blocklist: 'da lista de bloqueio', denylist: 'da lista de bloqueio', 'deny list': 'da lista de bloqueio' };
            const k = target.trim().toLowerCase();
            if (Object.prototype.hasOwnProperty.call(fixedTargets, k)) {
                const val = fixedTargets[k];
                return val.startsWith('da ') ? 'Remover ' + val : 'Remover de ' + val;
            }
            return 'Remover de ' + (lookupDict(target) || target);
        }],
        [/^Revoke all:\s*(.+)$/, (m, target) => ('Revogar tudo: ') + target],
        [/^Revoke:\s*(.+)$/, (m, target) => ('Revogar: ') + target],

        // v2.35.1 regras dinâmicas adicionais da auditoria completa (cota, agendamento, tempo, contagem, dicas de Git/MCP/navegador)
        [/^You need (at least \d+|more) AI Credits to send messages\.\s*To continue using (.+?) now,\s*purchase more AI Credits\.(?:\s*Your plan's baseline quota will refresh on (.+?)\.?)?$/i, (m, amt, target, when) => {
            const amtZh = /^more$/i.test(amt) ? 'mais' : amt.replace(/^at least\s+/i, 'pelo menos ');
            const tTrim = target.trim();
            const tPart = /^this model$/i.test(tTrim) ? 'este modelo' : tTrim;
            let res = ('Você precisa de ' + amtZh + ' créditos de IA para enviar mensagens. Para continuar usando ' + tPart + ' agora, compre mais créditos de IA.');
            if (when) {
                const cleanWhen = formatEnglishDate(when.replace(/\.$/, ''));
                res += (' A cota básica do seu plano será renovada em ' + cleanWhen + '.');
            }
            return res;
        }],
        [/^Your quota for (.+?) will reset on (.+?)\. Switch to another available model to continue\.$/i, (m, model, when) => {
            const mZh = /^this model$/i.test(model.trim()) ? 'este modelo' : model.trim();
            return ('Sua cota para ' + mZh + ' será redefinida em ' + formatEnglishDate(when.replace(/\.$/, '')) + '. Mude para outro modelo disponível para continuar.');
        }],
        [/^Your quota for (.+?) has been reached\. Switch to another available model to continue\.$/i, (m, model) => {
            const mZh = /^this model$/i.test(model.trim()) ? 'este modelo' : model.trim();
            return ('Sua cota para ' + mZh + ' foi atingida. Mude para outro modelo disponível para continuar.');
        }],
        [/^Your plan's baseline quota will refresh on (.+?)\.?$/i, (m, when) => ('A cota básica do seu plano será renovada em ' + formatEnglishDate(when.replace(/\.$/, '')) + '.')],
        [/^Your plan:\s*(.+)$/i, (m, plan) => ('Seu plano: ') + plan],
        [/^Telemetry is turned off for your account\. This means (.+?) does not collect any of your prompts, content, or model responses, but will still collect general usage patterns \(e\.g\., feature adoption, active user counts\)\.?$/i, (m, app) => ('A telemetria está desativada na sua conta. Isso significa que ' + app + ' não coleta nenhum dos seus prompts, conteúdo ou respostas do modelo, mas ainda coleta padrões gerais de uso (por exemplo, adoção de recursos e número de usuários ativos).')],
        [/^Model unavailable,\s*retrying(?:\s+in\s+(\d+)s)?(?:\s*\(attempt\s+(\d+)\/(\d+)\))?$/i, (m, sec, att, max) => {
            const attZh = att ? (' (tentativa ' + att + '/' + max + ')') : '';
            if (sec) return ('Modelo indisponível, tentando novamente em ' + sec + ' s' + attZh);
            return ('Modelo indisponível, tentando novamente' + attZh);
        }],
        [/^Waiting for command completion\s*\(up to (\d+) seconds\)$/i, (m, s) => ('Aguardando a conclusão do comando (até ' + s + (Number(s) === 1 ? ' segundo' : ' segundos') + ')')],
        [/^Thinking \((\d+)s\)\.\.\.$/i, (m, s) => 'Raciocinando (' + s + ' s)...'],
        [/^Still thinking,\s*(\d+) seconds$/i, (m, s) => 'Ainda raciocinando, ' + s + (Number(s) === 1 ? ' segundo' : ' segundos')],
        [/^Working\s*·\s*(\d+)s$/i, (m, s) => 'Trabalhando · ' + s + ' s'],
        [/^Using browser(?:\s*·\s*(.+?))?(?:\s*\((\d+)s\))?$/i, (m, action, s) => {
            const act = action ? (' · ' + (lookupDict(action) || action)) : '';
            const dur = s ? (' (' + s + ' s)') : '';
            return ('Usando o navegador') + act + dur;
        }],
        [/^(Started|Stopped) voice chat\s*·\s*(.+)$/i, (m, act, rest) => {
            const verb = /^Started/i.test(act) ? ('Conversa por voz iniciada · ') : ('Conversa por voz encerrada · ');
            return verb + rest;
        }],
        [/^Turns?\s+(\d+)(?:[–-](\d+))?$/i, (m, a, b) => b ? ('Turnos ' + a + '–' + b) : ('Turno ' + a)],
        [/^(Turn|Tot):\s*(\d+)\/(\d+)$/i, (m, kind, a, b) => (/^Turn/i.test(kind) ? ('Turno: ') : ('Total: ')) + a + '/' + b],
        [/^(Today|Tomorrow|Yesterday)\s+(.+)$/i, (m, day, time) => {
            const dLow = day.toLowerCase();
            const dZh = dLow === 'today' ? 'Hoje' : (dLow === 'tomorrow' ? 'Amanhã' : 'Ontem');
            return dZh + ' ' + time;
        }],
        [/^Daily at\s+(.+)$/i, (m, t) => 'Diariamente às ' + t],
        [/^Monthly on the\s+(.+?)\s+at\s+(.+)$/i, (m, d, t) => {
            const dPt = d.trim().replace(/^(\d+)(?:st|nd|rd|th)$/i, (_, n) => n === '1' ? '1º' : n);
            return 'Mensalmente no dia ' + dPt + ' às ' + t;
        }],
        [/^Every\s+(\d+)\s+(hours?|minutes?)(.*)$/i, (m, n, unit, rest) => {
            const uZh = /^hour/i.test(unit) ? (Number(n) === 1 ? 'hora' : 'horas') : (Number(n) === 1 ? 'minuto' : 'minutos');
            return 'A cada ' + (Number(n) === 1 ? '' : n + ' ') + uZh + (rest || '');
        }],
        [/^(?:(\d+)d\s+)?(?:(\d+)h\s+)?(?:(\d+)m|(\d+)s)\s+left$/i, (m, d, h, min, sec) => {
            const parts = [];
            if (d) parts.push(d + (Number(d) === 1 ? ' dia' : ' dias'));
            if (h) parts.push(h + ' h');
            if (min) parts.push(min + ' min');
            if (sec) parts.push(sec + ' s');
            const singular = parts.length === 1 && Number(d || h || min || sec) === 1;
            return parts.join(' ') + (singular ? ' restante' : ' restantes');
        }],
        [/^(\d+)\s+(image|video|audio|file)\s+attachments?$/i, (m, n, kind) => {
            const kLow = kind.toLowerCase();
            const kZh = kLow === 'image' ? (Number(n) === 1 ? 'anexo de imagem' : 'anexos de imagem')
                : kLow === 'video' ? (Number(n) === 1 ? 'anexo de vídeo' : 'anexos de vídeo')
                : kLow === 'audio' ? (Number(n) === 1 ? 'anexo de áudio' : 'anexos de áudio')
                : (Number(n) === 1 ? 'anexo de arquivo' : 'anexos de arquivo');
            return n + ' ' + kZh;
        }],
        [/^(\d+)\s+attachments?$/i, (m, n) => n + (Number(n) === 1 ? ' anexo' : ' anexos')],
        [/^(?:(.+?)\s+)?\((\d+)\s+(?:(image|video|audio|file)\s+)?attachments?\)$/i, (m, prefix, n, kind) => {
            const kLow = kind ? kind.toLowerCase() : '';
            const kZh = kLow === 'image' ? (Number(n) === 1 ? 'anexo de imagem' : 'anexos de imagem')
                : kLow === 'video' ? (Number(n) === 1 ? 'anexo de vídeo' : 'anexos de vídeo')
                : kLow === 'audio' ? (Number(n) === 1 ? 'anexo de áudio' : 'anexos de áudio')
                : kLow === 'file' ? (Number(n) === 1 ? 'anexo de arquivo' : 'anexos de arquivo')
                : (Number(n) === 1 ? 'anexo' : 'anexos');
            return (prefix ? prefix + ' ' : '') + '(' + n + ' ' + kZh + ')';
        }],
        [/^(\d+)\s+attachment\(s\)$/i, (m, n) => n + (Number(n) === 1 ? ' anexo' : ' anexos')],
        [/^(\d+)\s+of\s+(\d+)$/i, (m, a, b) => a + ' / ' + b],
        [/^(\d+)\s+archived conversations?$/i, (m, n) => n + (Number(n) === 1 ? ' conversa arquivada' : ' conversas arquivadas')],
        [/^(\d+)\s+background tasks?$/i, (m, n) => n + (Number(n) === 1 ? ' tarefa em segundo plano' : ' tarefas em segundo plano')],
        [/^(\d+)\s+browser steps?$/i, (m, n) => n + (Number(n) === 1 ? ' etapa do navegador' : ' etapas do navegador')],
        [/^(\d+)\s+models?\s+selected$/i, (m, n) => (n + (Number(n) === 1 ? ' modelo selecionado' : ' modelos selecionados'))],
        [/^(\d+)\s+waiting on you$/i, (m, n) => n + ' aguardando você'],
        [/^(\d+)\s+Files?\s+With Changes$/i, (m, n) => n + (Number(n) === 1 ? ' arquivo com alterações' : ' arquivos com alterações')],
        [/^(\d+)\s+files?\s+changed(?:\s+([+-]\d+(?:\s*[+-]\d+)?))?$/i, (m, n, diff) => n + (Number(n) === 1 ? ' arquivo alterado' : ' arquivos alterados') + (diff ? (' ' + diff) : '')],
        [/^(\d+)\s*\/\s*(\d+)\s+steps?$/i, (m, done, total) => done + '/' + total + (Number(total) === 1 ? ' etapa' : ' etapas')],
        [/^(\d+)\s+lines?\s+added,\s*(\d+)\s+lines?\s+removed$/i, (m, a, b) => a + (Number(a) === 1 ? ' linha adicionada, ' : ' linhas adicionadas, ') + b + (Number(b) === 1 ? ' linha removida' : ' linhas removidas')],
        [/^(\d+)\s+(questions?|turns?|comments?|subagents?|chunks?|accounts?|rows?)$/i, (m, n, kind) => {
            const k = kind.toLowerCase();
            const isOne = Number(n) === 1;
            const mapZh = {
                question: 'pergunta', questions: isOne ? 'pergunta' : 'perguntas',
                turn: 'turno', turns: isOne ? 'turno' : 'turnos',
                comment: 'comentário', comments: isOne ? 'comentário' : 'comentários',
                subagent: 'subagente', subagents: isOne ? 'subagente' : 'subagentes',
                chunk: 'chunk', chunks: isOne ? 'chunk' : 'chunks',
                account: 'conta', accounts: isOne ? 'conta' : 'contas',
                row: 'linha', rows: isOne ? 'linha' : 'linhas'
            };
            return n + ' ' + (mapZh[k] || kind);
        }],
        [/^(\d+)\s+tasks?\s+running$/i, (m, n) => n + (Number(n) === 1 ? ' tarefa em execução' : ' tarefas em execução')],
        [/^(\d+)\s+MCP servers? failed to start$/i, (m, n) => n + (Number(n) === 1 ? ' servidor MCP falhou ao iniciar' : ' servidores MCP falharam ao iniciar')],
        [/^Added MCP server "(.+?)",\s*but it failed to start:\s*(.+)$/i, (m, name, err) => 'Servidor MCP "' + name + '" adicionado, mas falhou ao iniciar: ' + err],
        [/^MCP server (.+?) requires authentication:\s*sign in to "(.+?)" in the Accounts section of plugin "(.+?)"$/i, (m, srv, acc, plug) => 'O servidor MCP ' + srv + ' requer autenticação: entre em "' + acc + '" na seção Contas do plugin "' + plug + '"'],
        [/^MCP server (.+?) requires authentication$/i, (m, srv) => 'O servidor MCP ' + srv + ' requer autenticação'],
        [/^(\d+)\s+customizations? failed to load$/i, (m, n) => n + (Number(n) === 1 ? ' personalização falhou ao carregar' : ' personalizações falharam ao carregar')],
        [/^(\d+)\s+folders? in this project could not be loaded because their locations are invalid\.$/i, (m, n) => Number(n) === 1 ? '1 pasta neste projeto não pôde ser carregada porque o local é inválido.' : (n + ' pastas neste projeto não puderam ser carregadas porque os locais são inválidos.')],
        [/^(.+?) file uploads are not currently supported in remote mode$/i, (m, ext) => 'No momento, o envio de arquivos ' + ext + ' não é compatível com o modo remoto'],
        [/^Pushed (\d+) commits? to (.+?)\.?$/i, (m, n, br) => 'Push de ' + n + (Number(n) === 1 ? ' commit' : ' commits') + ' para ' + br + '.'],
        [/^Pushed to (.+?)\.?$/i, (m, br) => 'Enviado por push para ' + br + '.'],
        [/^Published (.+?) to origin\.?$/i, (m, ref) => 'Publicado ' + ref + ' em origin.'],
        [/^Committed to (.+?)\.?$/i, (m, ref) => 'Commit em ' + ref + '.'],
        [/^Amended commit on (.+?)\.?$/i, (m, ref) => 'Commit corrigido (amend) em ' + ref + '.'],
        [/^Checked out in (.+)$/i, (m, loc) => 'Checkout feito em ' + loc],
        [/^(Generating|Generated|Generate) with (.+?) 🍌$/i, (m, verb, model) => {
            const vZh = /^Generating/i.test(verb) ? 'Gerando com ' : (/^Generated/i.test(verb) ? 'Gerado com ' : 'Gerar com ');
            return vZh + model + ' 🍌';
        }],
        [/^Ran command:\s*(.+)$/i, (m, cmd) => 'Executou comando: ' + cmd],
        [/^Used MCP tool:\s*(.+)$/i, (m, tool) => 'Usou ferramenta MCP: ' + tool],
        [/^Used tool:\s*(.+)$/i, (m, tool) => 'Usou ferramenta: ' + tool],
        [/^(?:Searched web|Searched for|Internal search|Code search|Browser task):\s*"(.+)"$/i, (m, q) => {
            const prefix = /^Searched web/i.test(m) ? 'Pesquisou na web: '
                : /^Searched for/i.test(m) ? 'Pesquisou por: '
                : /^Internal search/i.test(m) ? 'Pesquisa interna: '
                : /^Code search/i.test(m) ? 'Pesquisa de código: '
                : 'Tarefa do navegador: ';
            return prefix + '"' + q + '"';
        }],
        [/^Searched for files:\s*(.+)$/i, (m, q) => 'Pesquisou arquivos: ' + q],
        [/^Opened browser:\s*(.+)$/i, (m, u) => 'Abriu o navegador: ' + u],
        [/^Viewed (.+)$/i, (m, target) => 'Visualizou ' + target],
        [/^Listed directory (.+)$/i, (m, dir) => 'Listou o diretório ' + dir],
        [/^Read URL:\s*(.+)$/i, (m, u) => 'Leu URL: ' + u],
        [/^Invoked subagent:\s*(.+)$/i, (m, name) => 'Invocou subagente: ' + name],
        [/^Generated image:\s*"(.+)"$/i, (m, p) => 'Gerou imagem: "' + p + '"'],
        [/^Agent finished:\s*(.+)$/i, (m, summary) => 'Agente concluiu: ' + summary],
        [/^Side question failed:\s*(.+)$/i, (m, err) => 'Falha na pergunta paralela: ' + err],
        [/^Side question \(conversation (.+?)\):\s*(.+)$/i, (m, cid, title) => 'Pergunta paralela (conversa ' + cid + '): ' + title],
        [/^Credentials expire in (.+?)\. Refresh credentials to keep this automation running$/i, (m, dur) => 'As credenciais expiram em ' + (formatUsageDuration(dur) || dur) + '. Atualize as credenciais para manter esta automação em execução'],
        [/^Connect an account for (.+?) so the agent can run automations\.$/i, (m, prov) => 'Conecte uma conta de ' + prov + ' para que o agente possa executar automações.'],
        [/^Runs even when your computer is off\.\s*(Schedules and events\.|Schedules only\.)$/i, (m, kind) => 'Executa mesmo quando o computador está desligado. ' + (/events/i.test(kind) ? 'Agendamentos e eventos.' : 'Somente agendamentos.')],
        [/^The selected (.+?) can't be found\. Pick another (.+?) from the (.+?) selector to send\.$/i, (m, n1, n2, n3) => {
            const t1 = translateNoun(n1);
            const t2 = translateNoun(n2);
            const t3 = translateNoun(n3);
            const fem1 = /^(pasta|regra|conta|conversa|pergunta|automação|tarefa|aba|janela|gravação|voz|prévia|máquina|extensão|ferramenta|habilidade)\b/i.test(t1);
            const fem2 = /^(pasta|regra|conta|conversa|pergunta|automação|tarefa|aba|janela|gravação|voz|prévia|máquina|extensão|ferramenta|habilidade)\b/i.test(t2);
            return 'Não foi possível encontrar ' + (fem1 ? 'a ' : 'o ') + t1 + (fem1 ? ' selecionada' : ' selecionado') + '. Escolha ' + (fem2 ? 'outra ' : 'outro ') + t2 + ' no seletor de ' + t3 + ' para enviar.';
        }],
        [/^This (.+?) overrides your global permission settings\.$/i, (m, kind) => {
            const t = translateNoun(kind);
            const fem = /^(pasta|regra|conta|conversa|pergunta|automação|tarefa|aba|janela|gravação|voz|prévia|máquina|extensão|ferramenta|habilidade)\b/i.test(t);
            return (fem ? 'Esta ' : 'Este ') + t + ' substitui suas configurações globais de permissão.';
        }],
        [/^(.+?) needs (.+?) to use your computer\.$/i, (m, app, perms) => {
            // "needs both" originalmente viraria "precisa de ambas as permissões permissões"
            if (/^both$/i.test(perms.trim())) return app + ' precisa de ambas as permissões para controlar seu computador.';
            const hasAnd = /\s+and\s+/i.test(perms);
            const pZh = perms.replace(/Accessibility/gi, '"Acessibilidade"').replace(/Screen Recording/gi, '"Gravação de tela"').replace(/\s+and\s+/gi, ' e ');
            return app + (hasAnd ? ' precisa das permissões de ' : ' precisa da permissão de ') + pZh + ' para controlar seu computador.';
        }],
        [/^Relaunch (.+?) to finish Screen Recording\.$/i, (m, app) => 'Reinicie ' + app + ' para concluir a configuração de "Gravação de tela".'],
        [/^Stop (\d+) items?\?$/i, (m, n) => 'Parar ' + n + (Number(n) === 1 ? ' item?' : ' itens?')],
        [/^Show (\d+) more subagents?$/i, (m, n) => 'Mostrar mais ' + n + (Number(n) === 1 ? ' subagente' : ' subagentes')],
        [/^\+(\d+) more \(Show all\)$/i, (m, n) => 'Mais +' + n + ' (Mostrar tudo)'],
        [/^(.+?) needs you to sign in before it can be used\.$/i, (m, name) => name + ' precisa que você entre antes de poder ser usado.'],
        [/^No messages in last (\d+) steps\s*(?:·|—|,)\s*load (?:more|older)$/i, (m, n) => 'Nenhuma mensagem ' + (Number(n) === 1 ? 'na última etapa' : 'nas últimas ' + n + ' etapas') + ' · carregar mais antigas'],
        [/^No visible messages in last (\d+) steps\. Activate Load older messages to continue\.$/i, (m, n) => 'Nenhuma mensagem visível ' + (Number(n) === 1 ? 'na última etapa' : 'nas últimas ' + n + ' etapas') + '. Ative "Carregar mensagens mais antigas" para continuar.'],
        [/^File exceeds the (\d+)MB display limit \((\d+)MB\), so it can't be opened or downloaded here\.$/i, (m, lim, sz) => 'O arquivo excede o limite de exibição de ' + lim + ' MB (' + sz + ' MB), portanto não pode ser aberto nem baixado aqui.'],
        [/^File exceeds (\d+) bytes \((\d+) bytes\)$/i, (m, lim, sz) => 'O arquivo excede ' + lim + (Number(lim) === 1 ? ' byte' : ' bytes') + ' (' + sz + (Number(sz) === 1 ? ' byte' : ' bytes') + ')'],
        [/^Recording exceeds 15MB limit \((\d+)MB\)$/i, (m, sz) => 'A gravação excede o limite de 15 MB (' + sz + ' MB)'],
        [/^Total media size exceeds (\d+)MB limit$/i, (m, lim) => 'O tamanho total da mídia excede o limite de ' + lim + ' MB'],
        [/^(.+?)'s server IP address could not be found\.$/i, (m, h) => 'Não foi possível encontrar o endereço IP do servidor de ' + h + '.'],
        [/^(.+?) refused to connect\.$/i, (m, h) => h + ' recusou a conexão.'],
        [/^(.+?) took too long to respond\.$/i, (m, h) => h + ' demorou muito para responder.'],
        [/^(.+?) could not find the requested page\.$/i, (m, h) => h + ' não encontrou a página solicitada.'],
        [/^(.+?) is currently unable to handle this request\.$/i, (m, h) => h + ' não consegue atender a esta solicitação no momento.'],
        [/^Check if there is a typo in (.+?), or open the page in your external browser\.$/i, (m, h) => {
            const hZh = /^the address$/i.test(h.trim()) ? 'o endereço' : h.trim();
            return 'Verifique se há um erro de digitação em ' + hZh + ' ou abra a página no seu navegador externo.';
        }],
        [/^(?:(Open|Reopen)\s+)?(Accessibility|Screen Recording) settings$/i, (m, act, pane) => {
            const isAcc = /^Accessibility/i.test(pane);
            const pZh = isAcc ? 'acessibilidade' : 'gravação de tela';
            if (!act) return isAcc ? 'Configurações de acessibilidade' : 'Configurações de gravação de tela';
            return (/^Reopen/i.test(act) ? 'Reabrir configurações de ' : 'Abrir configurações de ') + pZh;
        }],
        [/^Deleted cookies for (.+)$/i, (m, site) => 'Cookies de ' + site + ' excluídos'],
        [/^Moved conversation (.+)$/i, (m, target) => {
            const t = target.trim();
            return /^to\s+/i.test(t) ? 'Conversa movida para ' + t.replace(/^to\s+/i, '') : 'Conversa movida: ' + t;
        }],
        [/^Adding plugins from (.+)$/i, (m, src) => 'Adicionando plugins de ' + src],
        [/^No connectors match "(.+)"$/i, (m, q) => 'Nenhum conector corresponde a "' + q + '"'],
        [/^View (\d+) help(?: items?)? and (\d+) side questions?$/i, (m, h, s) => 'Ver ' + h + (Number(h) === 1 ? ' item de ajuda' : ' itens de ajuda') + ' e ' + s + (Number(s) === 1 ? ' pergunta paralela' : ' perguntas paralelas')],
        [/^Work in (.+)$/i, (m, wt) => /^progress$/i.test(wt.trim()) ? m : ('Trabalhar em ' + wt)],
        [/^Work locally on (.+)$/i, (m, repos) => 'Trabalhar localmente em ' + repos],
        [/^Worktree from (.+)$/i, (m, repos) => 'Worktree de ' + repos],
        [/^Automatically create a new (.+?) workspace when the conversation starts$/i, (m, vcs) => 'Criar automaticamente um novo espaço de trabalho ' + vcs + ' quando a conversa começar'],
        [/^(.+?)\.\s+(Show|Hide)\s+plan$/i, (m, title, verb) => title + '. ' + (/^Hide/i.test(verb) ? 'Ocultar plano' : 'Mostrar plano')],
        [/^Triggered (.+)$/, (m, name) => 'Acionou ' + name],
        [/^(.+?) download progress$/i, (m, name) => 'Progresso do download de ' + name],
        [/^(.+?) color picker$/i, (m, name) => 'Seletor de cores de ' + name],
        [/^Error:\s*(.+)$/, (m, msg) => 'Erro: ' + msg],
        [/^(.+?),\s*showing (\d+) of (\d+)$/i, (m, title, b, c) => title + ', mostrando ' + b + ' de ' + c],
        [/^(.+?):\s*([\d,]+)\s+tokens$/i, (m, label, num) => (lookupDict(label) || label) + ': ' + num + ' tokens'],
        [/^(.+?)\.\s*View site information$/i, (m, summary) => summary + '. Ver informações do site'],
        [/^(\d+)\s+days$/i, (m, d) => d + (Number(d) === 1 ? ' dia' : ' dias')],
        [/^(.+?) annotation on page (\d+)$/i, (m, kind, p) => 'Anotação de ' + kind + ' na página ' + p],
        [/^Applied\s+(.+)$/i, (m, target) => 'Aplicou ' + target],
        [/^Show\s+(.+?)\s+in the list again$/i, (m, host) => 'Mostrar ' + host + ' na lista novamente'],
        [/^Hook\s+((?:Json|Command|Prompt|Shell|Script)\s+[A-Za-z0-9_.:-]+|[A-Z][A-Za-z0-9_.:-]*(?:\s+[A-Za-z0-9_.:-]+){0,2})$/, (m, rest) => {
            if (/^(?:will|with|is|was|has|are|to|for|that|can|may|from|when|if)\b/i.test(rest.trim())) return m;
            return 'Hook ' + rest;
        }],
        [/^(?:(·\s*))?Exited with code\s+(-?\d+)$/i, (m, dot, code) => (dot ? '· ' : '') + 'Encerrado com código ' + code],
        [/^(?:(·\s*))?Exit code\s+(-?\d+)$/i, (m, dot, code) => (dot ? '· ' : '') + 'Código de saída ' + code],
        [/^(?:(·\s*))?Exited with signal\s+([A-Za-z0-9_+-]+)$/i, (m, dot, sig) => (dot ? '· ' : '') + 'Encerrado com sinal ' + sig],
        [/^(.+?)\s*·\s*Exited with code\s+(-?\d+)$/i, (m, prefix, code) => {
            const pNorm = norm(prefix);
            const pZh = translateExactOrDynamic(pNorm) || prefix;
            return pZh + ' · Encerrado com código ' + code;
        }],
        [/^(Running|Ran|Searching|Searched|Analyzing|Analyzed|Reading|Editing|Edited|Writing|Wrote|Creating|Created|Deleting|Deleted|Viewing|Listing|Listed|Checking|Checked|Calling|Called|Invoking|Invoked|Executing|Executed|Fetching|Fetched|Updating|Updated|Waiting for)\s+(.+)$/, (m, verb, rest) => {
            const restTrim = rest.trim();
            if (!restTrim || restTrim.length > 100 || /[.!?。！？]$/.test(restTrim)) return m;
            if (verb === 'Waiting for' && /^you\b/i.test(restTrim)) return m;
            const verbMap = {
                Running: ['Executando'],
                Ran: ['Executou'],
                Searching: ['Pesquisando'],
                Searched: ['Pesquisou'],
                Analyzing: ['Analisando'],
                Analyzed: ['Analisou'],
                Reading: ['Lendo'],
                Editing: ['Editando'],
                Edited: ['Editou'],
                Writing: ['Escrevendo'],
                Wrote: ['Escreveu'],
                Creating: ['Criando'],
                Created: ['Criou'],
                Deleting: ['Excluindo'],
                Deleted: ['Excluiu'],
                Viewing: ['Visualizando'],
                Listing: ['Listando'],
                Listed: ['Listou'],
                Checking: ['Verificando'],
                Checked: ['Verificou'],
                Calling: ['Chamando'],
                Called: ['Chamou'],
                Invoking: ['Invocando'],
                Invoked: ['Invocou'],
                Executing: ['Executando'],
                Executed: ['Executou'],
                Fetching: ['Buscando'],
                Fetched: ['Buscou'],
                Updating: ['Atualizando'],
                Updated: ['Atualizou'],
                'Waiting for': ['Aguardando']
            };
            const vPair = verbMap[verb];
            if (!vPair) return m;
            const formattedRest = restTrim.replace(/(\s+)((?:\d+(?:d|h|m|s)\s*)+)$/i, (_, sp, dur) => {
                return sp + formatCompactDuration(dur);
            });
            return vPair[0] + ' ' + formattedRest;
        }],
        [/^Stream and control\s+(.+?)\s+directly in the side pane\.?$/i, (m, name) => 'Transmitir e controlar ' + name + ' diretamente no painel lateral.'],
        [/^Applies to \/btw and messages sent after this turn\.?$/i, (m) => 'Vale para /btw e para as mensagens enviadas depois deste turno' + (/\.$/.test(m.trim()) ? '.' : '')],
        [/^Applies to messages sent after this turn\.?$/i, (m) => 'Vale para as mensagens enviadas depois deste turno' + (/\.$/.test(m.trim()) ? '.' : '')],
        [/^(\.\.\.\s*)?([\d,]+)\s+more\s+(lines?|characters?|chars?|bytes?|items?),\s*truncated for display\.?$/i, (m, ellipsis, num, unit) => {
            const uLow = unit.toLowerCase();
            const isOne = num.replace(/,/g, '') === '1';
            const isLine = uLow.startsWith('line');
            const uZh = isLine ? (isOne ? 'linha' : 'linhas')
                : (uLow.startsWith('char') ? (isOne ? 'caractere' : 'caracteres')
                : (uLow.startsWith('byte') ? (isOne ? 'byte' : 'bytes')
                : (isOne ? 'item' : 'itens')));
            const trunc = isLine
                ? (isOne ? 'truncada para exibição' : 'truncadas para exibição')
                : (isOne ? 'truncado para exibição' : 'truncados para exibição');
            const dot = /\.$/.test(m.trim()) ? '.' : '';
            return (ellipsis ? '... ' : '') + 'mais ' + num + ' ' + uZh + ', ' + trunc + dot;
        }],
        [/^(\.\.\.\s*)?truncated for display\.?$/i, (m, ellipsis) => {
            const dot = /\.$/.test(m.trim()) ? '.' : '';
            const cap = !ellipsis && /^[A-Z]/.test(m.trim()) ? 'T' : 't';
            return (ellipsis ? '... ' : '') + cap + 'runcado para exibição' + dot;
        }],

        // Lista de permissões segura para modelos genéricos de botões de ação (corresponde apenas a substantivos controlados da UI para evitar tradução incorreta de palavras isoladas ou identificadores)
        [/^(Add|Cancel|Close|Configure|Connect|Delete|Disconnect|Enable|Install|New|Open|Reconnect|Remove|Restart|Stop|Toggle|View)\s+(?:the\s+)?([a-zA-Z][a-zA-Z ]{1,30})(\??)$/i, (m, verb, noun, qMark) => {
            const nLow = norm(noun).toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(ENTITY_NOUN_MAP, nLow)) return m;
            const vPair = ACTION_VERB_MAP[verb.toLowerCase()];
            if (!vPair) return m;
            const vZh = vPair[0];
            const nZh = ENTITY_NOUN_MAP[nLow][0];
            const qSuffix = qMark ? '?' : '';
            if (verb.toLowerCase() === 'new') {
                const firstWord = nZh.split(' ')[0];
                const fem = /^(pasta|pastas|regra|regras|conta|contas|conversa|conversas|pergunta|perguntas|automação|tarefa|aba|janela|gravação|gravações|voz|prévia|máquina|extensão|extensões|ferramenta|ferramentas|habilidade|habilidades)\b/i.test(firstWord);
                const pl = /(s|es|ões)$/i.test(firstWord) && !/^cookies$/i.test(firstWord);
                return (fem ? (pl ? 'Novas ' : 'Nova ') : (pl ? 'Novos ' : 'Novo ')) + nZh + qSuffix;
            }
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

    // Trata texto fragmentado do DOM restrito pelo contexto do nó pai
    function translateContextualText(node, originalVal, valNorm) {
        const p = node.parentElement;
        if (!p) return null;
        const pText = dfsParentTexts.get(p) || originalParentTexts.get(p) || p.textContent || '';

        if (/^(\d+)(s|m|h|d|w|mo|yr)$/i.test(valNorm)) {
            return valNorm.replace(/^(\d+)(s|m|h|d|w|mo|yr)$/i, (match, num, unit) => {
                const uLow = unit.toLowerCase();
                const pair = UNIT_MAP[uLow];
                let unitStr = pair ? pair[0] : unit;
                if (Number(num) !== 1) {
                    if (uLow === 'mo') unitStr = 'meses';
                    else if (uLow === 'yr') unitStr = 'anos';
                }
                if (typeof p.closest === 'function' && p.closest('[data-testid="conversation-row-sidebar"]')) {
                    return "há " + num + " " + unitStr;
                }
                return num + " " + unitStr;
            });
        }
        if (valNorm === 'now' && typeof p.closest === 'function' && p.closest('[data-testid="conversation-row-sidebar"], [data-testid="conversation-row-history"]')) {
            return 'agora';
        }
        if (/^(?:\d+(?:d|h|m|s)\s+)+\d+(?:d|h|m|s)$/i.test(valNorm)) {
            return formatCompactDuration(valNorm);
        }
        if (valNorm === 'Hook' && /^Hook\s+(?:Json|Command|Prompt|Shell|Script|SessionStart|SessionEnd|PreToolUse|PostToolUse|PreInvocation|PostInvocation|UserPromptSubmit|SubagentStop|PreCompact)\b/i.test(pText.trim())) {
            return 'Hook';
        }
        if ((valNorm === 'directly in the side pane.' || valNorm === 'directly in the side pane') && /Stream and control|Transmitir e controlar|Transmita e controle/i.test(pText)) {
            return (originalVal.startsWith(' ') ? ' ' : '') + 'diretamente no painel lateral' + (valNorm.endsWith('.') ? '.' : '');
        }
        if ((valNorm === 'Type' || valNorm === 'Command') && findSidecarDetailsModal(p)) {
            return valNorm === 'Type' ? 'Tipo' : 'Comando';
        }
        if (/messages sent after this turn|mensagens enviadas (?:depois|após) este turno/i.test(pText)) {
            if (valNorm === 'Applies to') return 'Vale para' + (originalVal.endsWith(' ') ? ' ' : '');
            if (/^and messages sent after this turn\.?$/i.test(valNorm)) {
                const dot = valNorm.endsWith('.') ? '.' : '';
                return (originalVal.startsWith(' ') ? ' ' : '') + 'e para as mensagens enviadas depois deste turno' + dot;
            }
        }
        if (/^steps?$/i.test(valNorm)) {
            const gp = p.parentElement && typeof document !== 'undefined' && p.parentElement !== document.body && p.parentElement !== document.documentElement ? p.parentElement : null;
            const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
            if (/^\d+\s*\/\s*\d+\s*steps?$/i.test(pText.trim()) || (gpText.length < 80 && /^\d+\s*\/\s*\d+\s*steps?$/i.test(gpText.trim()))) {
                const isPlural = /^steps$/i.test(valNorm);
                return (originalVal.startsWith(' ') ? ' ' : '') + (isPlural ? 'etapas' : 'etapa');
            }
        }
        if (/^more\s+(lines?|characters?|chars?|bytes?|items?),\s*truncated for display\.?$/i.test(valNorm)) {
            const gp = p.parentElement && typeof document !== 'undefined' && p.parentElement !== document.body && p.parentElement !== document.documentElement ? p.parentElement : null;
            const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || gp.textContent || '') : '';
            const ctxText = /\d/.test(pText) ? pText : (gpText.length < 200 ? gpText : '');
            if (/\d[\d,]*\s+more\s+(?:lines?|characters?|chars?|bytes?|items?),\s*truncated for display/i.test(ctxText)) {
                const uLow = valNorm.match(/^more\s+(\w+)/i)[1].toLowerCase();
                const isPlural = /s$/i.test(uLow);
                const isFem = uLow.startsWith('line');
                const uPt = isFem ? (isPlural ? 'linhas' : 'linha')
                    : (uLow.startsWith('char') ? (isPlural ? 'caracteres' : 'caractere')
                    : (uLow.startsWith('byte') ? (isPlural ? 'bytes' : 'byte')
                    : (isPlural ? 'itens' : 'item')));
                const trunc = isFem ? (isPlural ? 'truncadas' : 'truncada') : (isPlural ? 'truncados' : 'truncado');
                const dot = valNorm.endsWith('.') ? '.' : '';
                return (originalVal.startsWith(' ') ? ' ' : '') + uPt + ' a mais, ' + trunc + ' para exibição' + dot;
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
                return leadDot + 'Encerrado com código' + trail;
            }
        }
        if ((valNorm === 'Card' || valNorm === 'of') && ((typeof p.closest === 'function' && p.closest('[data-testid="card-deck-counter"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'card-deck-counter'))) {
            return valNorm === 'Card' ? "Cartão " : " / ";
        }
        if (pText.includes('For corp passwords (such as') || pText.includes('Para senhas corporativas (como')) {
            if (valNorm === 'For corp passwords (such as') return "Para senhas corporativas (como ";
            if (valNorm === 'or') return " ou ";
            if (valNorm.startsWith('), use an external SSH session')) return valNorm.replace(/^\), use an external SSH session/i, "), use uma sessão SSH externa");
            if (valNorm.startsWith('. For non-corp passwords')) return ". Para senhas não corporativas ou frases secretas SSH, permita o próximo prompt e execute o comando novamente.";
        }
        if ((valNorm === 'Type' || valNorm === 'and select') && ((typeof p.closest === 'function' && p.closest('[data-testid="plan-command-fyi-alert"]')) || pText.includes('generate a plan'))) {
            return valNorm === 'Type'
                ? ("Digite" + (originalVal.endsWith(' ') ? ' ' : ''))
                : ((originalVal.startsWith(' ') ? ' ' : '') + "e selecione" + (originalVal.endsWith(' ') ? ' ' : ''));
        }
        if (valNorm === 'and' && /Privacy Policy|Terms of Service|Política de privacidade|Termos de serviço/i.test(pText)) {
            const conjunction = /subject to the|sujeit[oa] aos/i.test(pText) ? 'e à' : 'e';
            return (originalVal.startsWith(' ') ? ' ' : '') + conjunction + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'Variables' && ((typeof p.closest === 'function' && (p.closest('[data-testid="trigger-cel-tokens"]') || p.closest('[data-testid="trigger-cel-optional-section"]'))) || /Target|Fields|Helpers|Destino|Campos|Funções auxiliares/i.test(pText))) {
            return "Variáveis";
        }
        if ((valNorm === 'Search conversations with' || valNorm === 'in the top left.') && (pText.includes('in the top left') || pText.includes('no canto superior esquerdo'))) {
            return valNorm === 'Search conversations with'
                ? ("Pesquise conversas com" + (originalVal.endsWith(' ') ? ' ' : ''))
                : ((originalVal.startsWith(' ') ? ' ' : '') + "no canto superior esquerdo.");
        }
        if (valNorm === 'View archived in the sidebar (' && (pText.includes('View archived in the sidebar') || pText.includes('Ver arquivados'))) {
            return 'Ver arquivados na barra lateral (' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((valNorm === 'View archived in the sidebar' || valNorm === 'menu)' || /^More\s+menu\)$/i.test(valNorm)) &&
            (pText.includes('View archived in the sidebar') || pText.includes('Ver arquivados') || (p.parentElement && /View archived in the sidebar|Ver arquivados/.test(p.parentElement.textContent || '')))) {
            if (valNorm === 'View archived in the sidebar') {
                return 'Ver arquivados na barra lateral' + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (/^More\s+menu\)$/i.test(valNorm)) {
                const host = p.parentElement;
                const first = host && host.firstChild;
                if (first && first.nodeType === Node.TEXT_NODE && (first.nodeValue || '').trim() === 'Ver arquivados na barra lateral') {
                    first.nodeValue = 'Ver arquivados na barra lateral (';
                    translatedValues.set(first, 'Ver arquivados na barra lateral (');
                    edgeSpacedBase.set(first, 'Ver arquivados na barra lateral (');
                }
                return 'menu Mais)';
            }
            const first = p.firstChild;
            if (first && first.nodeType === Node.TEXT_NODE && (first.nodeValue || '').trim() === 'Ver arquivados na barra lateral') {
                const prevEl = node.previousSibling;
                if (prevEl && prevEl.nodeType === Node.ELEMENT_NODE && (prevEl.textContent || '').trim()) {
                    first.nodeValue = 'Ver arquivados no menu ';
                    translatedValues.set(first, 'Ver arquivados no menu ');
                    edgeSpacedBase.set(first, 'Ver arquivados no menu ');
                    return ' da barra lateral';
                }
                if (!(first.nextSibling && first.nextSibling.nodeType === Node.TEXT_NODE && /^\s/.test(first.nextSibling.nodeValue || '')) && !/\s$/.test(first.nodeValue || '')) {
                    first.nodeValue = 'Ver arquivados na barra lateral ';
                    translatedValues.set(first, 'Ver arquivados na barra lateral ');
                    edgeSpacedBase.set(first, 'Ver arquivados na barra lateral ');
                }
            }
            return (originalVal.startsWith(' ') ? ' ' : '') + 'menu)';
        }
        if ((valNorm === 'For help, visit' || valNorm === 'or join the' || valNorm === 'chat space') && (pText.includes('chat space') || pText.includes('espaço de chat'))) {
            if (valNorm === 'For help, visit') return "Para obter ajuda, acesse" + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'or join the') return (originalVal.startsWith(' ') ? ' ' : '') + "ou entre no" + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'chat space') return (originalVal.startsWith(' ') ? ' ' : '') + "espaço de chat" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((valNorm === 'when working' || valNorm === 'in this project' || valNorm === 'in these conversations') && /when working|Global Permissions|Permissões globais|Global Settings|Configurações globais|ao trabalhar neste projeto|ao trabalhar nessas conversas/i.test(pText)) {
            if (valNorm === 'when working') {
                return (originalVal.startsWith(' ') ? ' ' : '') + "ao trabalhar" + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === 'in this project') {
                return (originalVal.startsWith(' ') ? ' ' : '') + "neste projeto" + (originalVal.endsWith(' ') ? ' ' : '');
            }
            return (originalVal.startsWith(' ') ? ' ' : '') + "nessas conversas" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((valNorm === 'Use' || originalVal === 'Use ') && ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker-use"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'voice-picker-use'))) {
            return "Usar" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker"]')) || (p.querySelector && p.querySelector('[data-testid="voice-picker-settings-link"]'))) {
            if (valNorm.startsWith('Powered by Gemini Live')) return "Com tecnologia do Gemini Live · ";
            if (valNorm === 'You can change this in') return "Você pode alterar isso em" + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'later.') return (originalVal.startsWith(' ') ? ' ' : '') + "mais tarde.";
        }
        if (valNorm === 'No' && p.tagName === 'SPAN') {
            const writeIn = p.nextElementSibling;
            const hint = '(tell the agent what to do instead)';
            const placeholder = writeIn && typeof writeIn.getAttribute === 'function' ? writeIn.getAttribute('placeholder') : null;
            if (writeIn && typeof writeIn.matches === 'function' && writeIn.matches('textarea[data-testid="ask-question-writein"]') &&
                (placeholder === hint || placeholder === map.get(hint))) {
                return 'Não';
            }
        }
        if (valNorm === 'Google' && p.tagName === 'A' && pText.includes('Google') && (pText.includes('Terms of Service') || pText.includes('Termos de Serviço'))) {
            for (const ch of Array.from(p.childNodes)) {
                if (ch.nodeType === Node.TEXT_NODE && ch !== node && /^\s*(?:Terms of Service|Termos de Serviço)\s*$/i.test(ch.nodeValue || '')) {
                    ch.nodeValue = '';
                    translatedValues.set(ch, '');
                }
            }
            return 'Termos de Serviço do Google' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'Allow Google to collect and use your Interactions data, subject to the') {
            return 'Permitir que o Google colete e use os dados das suas interações, sujeito aos' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'by allowing Google to collect and use my Interactions data, subject to the Google') {
            return 'permitindo que o Google colete e use meus dados de interações, conforme a' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'Settings -') {
            return 'Configurações -' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((valNorm === 'Proceed to' || valNorm === '(unsafe)') && (pText.includes('Proceed to') || pText.includes('Continuar para')) && (pText.includes('(unsafe)') || pText.includes('(não seguro)'))) {
            return valNorm === 'Proceed to'
                ? ('Continuar para' + (originalVal.endsWith(' ') ? ' ' : ''))
                : ((originalVal.startsWith(' ') ? ' ' : '') + '(não seguro)');
        }
        if (valNorm === 'Customize your experience from visual themes to how autonomous your agent acts and what') {
            return "Personalize sua experiência, desde temas visuais até o nível de autonomia do agente e o que" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === "Customize your experience across the agent, plugins, and product from the settings and marketplace. We won't show you ads or let advertisers influence what") {
            return "Personalize sua experiência no agente, nos plugins e no produto pelas configurações e pelo marketplace. Não exibiremos anúncios nem permitiremos que anunciantes influenciem o que" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'says.' && (pText.includes('autonomous') || pText.includes('autonomia') || pText.includes('influence what') || pText.includes('influenciem'))) {
            return (originalVal.startsWith(' ') ? ' ' : '') + "diz.";
        }
        if (valNorm === "'s agents are powerful. They can edit files, run commands, and browse the web.") {
            return " conta com agentes poderosos. Eles podem editar arquivos, executar comandos e navegar na web.";
        }
        if (valNorm === "'s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.") {
            return " conta com agentes poderosos que ajudarão você a realizar muito mais, melhor e mais rápido do que antes, mas lembre-se sempre de verificar as ações realizadas pelo agente.";
        }
        if (valNorm === '(excluding product analytics data)' && (pText.includes('Privacy Notice') || pText.includes('Aviso de privacidade'))) {
            return (originalVal.startsWith(' ') ? ' ' : '') + "(exceto dados de análise do produto)";
        }
        if (valNorm === 'Sign up for newsletters, tips and tricks, and other notifications about') {
            return "Receba newsletters, dicas e outras notificações sobre" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'Sign up for newsletters, informational emails, and special offers about') {
            return "Receba newsletters, e-mails informativos e ofertas especiais sobre" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === '.' && (pText.includes('Sign up for newsletters') || pText.includes('Receba newsletters'))) {
            return ".";
        }
        if (valNorm === 'your plan' && p.parentElement && /For\s+your\s+plan|does not collect/i.test(p.parentElement.textContent || '')) {
            return 'seu plano';
        }
        if ((valNorm === 'For' || valNorm === ',') && (pText.includes('does not collect and use your Interactions data') || pText.includes('does not collect any of your prompts') || pText.includes('não coleta nem usa seus dados de interações') || pText.includes('não coleta nenhum dos seus prompts'))) {
            if (valNorm === 'For') {
                for (const el of (p.querySelectorAll ? p.querySelectorAll('b, strong, span') : [])) {
                    const t = el.firstChild;
                    if (t && t.nodeType === Node.TEXT_NODE && (t.nodeValue || '').trim() === 'Seu plano') {
                        t.nodeValue = 'seu plano';
                        translatedValues.set(t, 'seu plano');
                        edgeSpacedBase.delete(t);
                    }
                }
                return "Para" + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === ',') {
                for (const el of (p.querySelectorAll ? p.querySelectorAll('b, strong, span') : [])) {
                    const t = el.firstChild;
                    if (t && t.nodeType === Node.TEXT_NODE && (t.nodeValue || '').trim() === 'Seu plano') {
                        t.nodeValue = 'seu plano';
                        translatedValues.set(t, 'seu plano');
                        edgeSpacedBase.delete(t);
                    }
                }
                return "," + (originalVal.endsWith(' ') ? ' ' : '');
            }
        }
        if (valNorm === 'does not collect and use your Interactions data for model training, and retains it only to provide the service.') {
            return (originalVal.startsWith(' ') ? ' ' : '') + "não coleta nem usa seus dados de interações para treinamento de modelos e os retém apenas para prestar o serviço.";
        }
        if (valNorm === 'does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts).') {
            return (originalVal.startsWith(' ') ? ' ' : '') + "não coleta nenhum dos seus prompts, conteúdos ou respostas do modelo, mas ainda coleta padrões gerais de uso (por exemplo, adoção de recursos e contagem de usuários ativos).";
        }
        if (valNorm.startsWith('does not collect any of your prompts, content, or model responses') && valNorm.includes('general usage patterns such as feature adoption')) {
            return (originalVal.startsWith(' ') ? ' ' : '') + 'não coleta nenhum dos seus prompts, conteúdos ou respostas do modelo, mas coleta padrões gerais de uso, como adoção de recursos e número de usuários ativos ("Análise de produto"). Os dados de telemetria são tratados conforme a Política de Privacidade do Google.';
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="post-onboarding-welcome-tip"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'post-onboarding-welcome-tip') || pText.includes('to switch to the Gemini app')) {
            if (valNorm === 'Press') return (originalVal.startsWith(' ') ? ' ' : '') + "Pressione" + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'to switch to the Gemini app. Your agents keep working in the background.') {
                return (originalVal.startsWith(' ') ? ' ' : '') + "para alternar para o app Gemini. Seus agentes continuam trabalhando em segundo plano.";
            }
        }
        if (valNorm === 'To switch accounts, sign out in the') {
            return "Para trocar de conta, saia na" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((valNorm === 'settings page' || valNorm === 'settings page.') && (pText.includes('switch accounts') || pText.includes('trocar de conta'))) {
            return valNorm.endsWith('.') ? "página de configurações." : "página de configurações";
        }
        if (valNorm === 'and sign in again.' && (pText.includes('switch accounts') || pText.includes('trocar de conta'))) {
            return (originalVal.startsWith(' ') ? ' ' : '') + "e entre novamente.";
        }
        if (valNorm === 'There are currently no Build with') {
            return "No momento, não há plugins de Crie com o" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'plugins available.' && (pText.includes('Build with') || pText.includes('Crie com o'))) {
            return (originalVal.startsWith(' ') ? ' ' : '') + "disponíveis.";
        }
        if (valNorm === 'Not referenced by any feature (' && pText.includes('Not referenced by any feature')) {
            return "Não referenciado por nenhum recurso (";
        }
        if (valNorm === 'Only for' && (pText.includes('overrides Global') || pText.includes('substitui as configurações globais') || pText.includes('substitui as permissões globais'))) {
            return "Somente para" + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if ((valNorm === 'Allow' || valNorm === 'to access your microphone in' || valNorm === 'to use Voice.') && (pText.includes('to use Voice') || pText.includes('acesse seu microfone'))) {
            if (valNorm === 'Allow') return "Permita que" + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'to access your microphone in') return (originalVal.startsWith(' ') ? ' ' : '') + "acesse seu microfone em" + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'to use Voice.') return (originalVal.startsWith(' ') ? ' ' : '') + "para usar o modo de voz.";
        }
        if (p.id === 'replay-label' || (typeof p.closest === 'function' && p.closest('#replay-label'))) {
            const ofMatch = valNorm.match(/^of\s+(\d+)(?:\s*·\s*#(\d+)\s+at\s+(.+?)\s*\(\+([^)]+)\))?$/i);
            if (ofMatch) {
                return " / " + ofMatch[1] + (ofMatch[2]
                    ? (" · #" + ofMatch[2] + " às " + ofMatch[3] + " (+" + formatCompactDuration(ofMatch[4]) + ")")
                    : "");
            }
            const overMatch = valNorm.match(/^over\s+(.+)$/i);
            if (overMatch) {
                return (originalVal.startsWith(' ') ? ' ' : '') + "ao longo de " + formatCompactDuration(overMatch[1]);
            }
        }
        if (p.tagName === 'OPTION' && p.parentElement) {
            if (p.parentElement.id === 'f-agent' && /^From\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^From\s+(.+)$/i, (_, who) => "De " + who);
            }
            if (p.parentElement.id === 'f-mention' && /^To\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^To\s+(.+)$/i, (_, who) => "Para " + who);
            }
        }
        if (p.classList && p.classList.contains('chip-name') && /\s+\(you\)$/i.test(valNorm)) {
            return valNorm.replace(/\s+\(you\)$/i, " (você)");
        }
        if (p.classList && p.classList.contains('size') && /\d+\s+lines?$/i.test(valNorm)) {
            return valNorm.replace(/(\d+)\s+lines?$/i, (_, n) => n + (Number(n) === 1 ? " linha" : " linhas"));
        }
        if (p.id === 'empty-body') {
            if (valNorm === 'Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with') {
                return "Os Swarms iniciados nesta conversa aparecem aqui automaticamente, com seu quadro, membros e grafo de @menções. Inicie um com" + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === 'Open this pane from a conversation to see its swarm. Swarms started there appear here automatically; start one with') {
                return "Abra este painel a partir de uma conversa para ver o Swarm dela. Os Swarms iniciados lá aparecem aqui automaticamente; inicie um com" + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === '.') {
                return ".";
            }
        }
        if (p.id === 'ov-notice' || (typeof p.closest === 'function' && p.closest('#ov-notice'))) {
            if (valNorm === 'The narrator (') return "O narrador (";
            if (valNorm === ') was stopped. Ask the coordinator to add a new one (') {
                return ") foi encerrado. Peça ao coordenador para adicionar um novo (";
            }
            if (valNorm === ').') return ").";
        }
        if (p.id === 'ov-ack' || (typeof p.closest === 'function' && p.closest('#ov-ack'))) {
            if (/^Last change:\s*[“"]$/i.test(valNorm)) return 'Última alteração: "';
            if (/^[”"]$/.test(valNorm)) {
                if (originalVal !== '"') {
                    node.nodeValue = '"';
                    translatedValues.set(node, '"');
                    edgeSpacedBase.delete(node);
                }
                return null;
            }
        }
        if ((p.classList && p.classList.contains('o2-progt')) || (typeof p.closest === 'function' && p.closest('.o2-progt'))) {
            const progMatch = valNorm.match(/^(\d+)\s+of\s+(\d+)$/i);
            if (progMatch) return progMatch[1] + " / " + progMatch[2];
            if (/^tasks?\s+done$/i.test(valNorm)) {
                const isPlural = /^tasks\b/i.test(valNorm);
                return (originalVal.startsWith(' ') ? ' ' : '') + (isPlural ? "tarefas concluídas" : "tarefa concluída");
            }
        }
        if (valNorm === 'Missing' && p.getAttribute && /^computer-permissions-badge-/.test(p.getAttribute('data-testid') || '')) {
            return 'Ausente';
        }
        if (pText.includes('macOS Privacy & Security') || pText.includes('Privacidade e Segurança do macOS')) {
            if (valNorm === 'Click') return 'Clique em' + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'to open macOS Privacy & Security.') return (originalVal.startsWith(' ') ? ' ' : '') + 'para abrir Privacidade e Segurança do macOS.';
        }
        if (pText.includes('Type one above') || pText.includes('Digite um acima')) {
            if (valNorm === 'No hosts in') return 'Ainda não há hosts em' + (originalVal.endsWith(' ') ? ' ' : '');
            if (valNorm === 'yet. Type one above.') return '. Digite um acima.';
        }
        if (valNorm === 'Microphone blocked. Allow in') {
            return 'Microfone bloqueado. Permita em' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (pText.includes('Microphone blocked. Allow in') || pText.includes('Microfone bloqueado. Permita em')) {
            if (valNorm === '.') {
                const first = p.firstChild;
                if (first && first.nodeType === Node.TEXT_NODE && first.nodeValue === 'Microfone bloqueado. Permita em' &&
                    !(first.nextSibling && first.nextSibling.nodeType === Node.TEXT_NODE && /^\s/.test(first.nextSibling.nodeValue || ''))) {
                    first.nodeValue = 'Microfone bloqueado. Permita em ';
                    translatedValues.set(first, 'Microfone bloqueado. Permita em ');
                }
                return '.';
            }
        }
        if (valNorm === "Couldn't connect to" && typeof p.closest === 'function' && p.closest('[data-testid="ssh-connect-error"]')) {
            return 'Não foi possível conectar a' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === 'Layout' && p.parentElement && p.parentElement.hasAttribute && p.parentElement.hasAttribute('data-agy-layout-bar')) {
            return 'Layout';
        }
        if ((p.hasAttribute && p.hasAttribute('data-agy-layout-option')) || (typeof p.closest === 'function' && p.closest('[data-agy-layout]'))) {
            if (valNorm === 'Stage') return 'Palco';
            if (valNorm === 'Desktop') return 'Desktop';
            if (valNorm === 'Grid') return 'Grade';
        }
        if ((valNorm === 'thread' || valNorm === 'threads') && typeof p.closest === 'function' && p.closest('.hv-sum')) {
            return (originalVal.startsWith(' ') ? ' ' : '') + (valNorm === 'threads' ? 'tópicos' : 'tópico');
        }
        if (valNorm === "Couldn't delete cookies for" && (pText.includes('cookies') || pText.includes('Cookie'))) {
            return 'Não foi possível excluir os cookies de' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        if (valNorm === '. Try again.' && (
            (typeof p.closest === 'function' && p.closest('[data-testid="browser-site-data-delete-error"]')) ||
            (p.getAttribute && p.getAttribute('data-testid') === 'browser-site-data-delete-error')
        )) {
            return '. Tente novamente.';
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="browser-site-data-no-match"]')) ||
            (p.getAttribute && p.getAttribute('data-testid') === 'browser-site-data-no-match')) {
            if (valNorm === 'No sites match "') {
                return 'Nenhum site corresponde a "';
            }
            if (valNorm === '".') {
                if (originalVal !== '".') {
                    node.nodeValue = '".';
                    translatedValues.set(node, '".');
                    edgeSpacedBase.delete(node);
                }
                return null;
            }
        }
        // A v2.35.1 usa nós de texto " " separados em volta de <code>antigravity.</code>; mantenha o espaço só quando o original já o tiver
        if (valNorm === 'Inspect live bindings or record custom key chords filtered to') {
            return 'Inspecione os atalhos ativos ou grave combinações personalizadas filtradas pelo prefixo' + (/\s$/.test(originalVal) ? ' ' : '');
        }
        if (valNorm === 'commands.' && (pText.includes('Inspect live bindings') || pText.includes('Inspecione os atalhos ativos'))) {
            return (/^\s/.test(originalVal) ? ' ' : '') + 'nos comandos.';
        }
        if ((valNorm === 'Initialized with' || valNorm === 'Declared by') && p.tagName === 'SPAN' && p.nextElementSibling && p.nextElementSibling.tagName === 'CODE') {
            return valNorm === 'Initialized with'
                ? 'Inicializado com'
                : 'Declarado por';
        }
        if (valNorm === 'Messages now send immediately. Configure in') {
            return 'As mensagens agora são enviadas imediatamente. Configure em' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        // O ponto final de "Configure in <settings>." fica junto do link dentro do span com whitespace-nowrap
        const msgHead = p.parentElement && p.parentElement.firstChild;
        if (valNorm === '.' && msgHead && msgHead.nodeType === Node.TEXT_NODE && /^(?:Messages now send immediately|As mensagens agora são enviadas imediatamente)/.test((msgHead.nodeValue || '').trim())) {
            return '.';
        }
        if (valNorm === 'In System Settings, click') {
            return 'Em Configurações do Sistema, clique em' + ((originalVal.endsWith(' ') || (p.tagName === 'SPAN' && p.nextElementSibling)) ? ' ' : '');
        }
        if (valNorm === 'In System Settings, turn on') {
            return 'Em Configurações do Sistema, ative' + ((originalVal.endsWith(' ') || (p.tagName === 'SPAN' && p.nextElementSibling)) ? ' ' : '');
        }
        if (valNorm === 'Already on? Select') {
            return 'Já está ativado? Selecione' + ((originalVal.endsWith(' ') || (p.tagName === 'SPAN' && p.nextElementSibling)) ? ' ' : '');
        }
        // Mensagem de orientação de permissão do macOS (barra de status): React Fragment divide a frase entre nós de texto e <strong>App</strong> / <strong>+</strong>
        if (typeof p.getAttribute === 'function' && p.getAttribute('role') === 'status' && /System Settings|Configurações do Sistema/i.test(pText)) {
            const guide = {
                ". If it isn't in the list, drag it in from the small window next to System Settings.": ['. Se não estiver na lista, arraste-o da janela pequena ao lado de Configurações do Sistema.'],
                ', choose': [', escolha'],
                ', then turn it on.': [', depois ative-o.'],
                ', click': [', clique em' + (originalVal.endsWith(' ') ? ' ' : '')],
                ', then': [', depois'],
                'drag it back in from the small window.': ['arraste-o de volta da janela pequena.'],
                'click': ['clique em' + (originalVal.endsWith(' ') ? ' ' : '')],
                'and add it again.': [(originalVal.startsWith(' ') ? ' ' : '') + 'e adicione-o novamente.']
            };
            if (Object.prototype.hasOwnProperty.call(guide, valNorm)) return guide[valNorm][0];
        }
        // Resumo de agendamento de automação: <b>Weekly</b> on <b>Monday</b> around <b>9:00 AM</b>
        if ((valNorm === 'around' || valNorm === 'on') && typeof p.querySelector === 'function' && p.querySelector('.font-semibold') &&
            /^(?:Daily|Weekdays|Weekly|Diariamente|Dias úteis|Semanalmente)/i.test(pText.trim())) {
            const weekDays = {
                monday: 'segunda-feira', tuesday: 'terça-feira', wednesday: 'quarta-feira',
                thursday: 'quinta-feira', friday: 'sexta-feira', saturday: 'sábado', sunday: 'domingo',
                'segunda-feira': 'segunda-feira', 'terça-feira': 'terça-feira', 'quarta-feira': 'quarta-feira',
                'quinta-feira': 'quinta-feira', 'sexta-feira': 'sexta-feira', 'sábado': 'sábado', domingo: 'domingo'
            };
            for (const el of p.querySelectorAll('.font-semibold')) {
                const t = el.firstChild;
                if (t && t.nodeType === Node.TEXT_NODE) {
                    const low = (t.nodeValue || '').trim().toLowerCase();
                    if (Object.prototype.hasOwnProperty.call(weekDays, low)) {
                        const lowerDay = weekDays[low];
                        if (t.nodeValue !== lowerDay) {
                            t.nodeValue = lowerDay;
                            translatedValues.set(t, lowerDay);
                        }
                    }
                }
            }
            return valNorm === 'around'
                ? ((originalVal.startsWith(' ') ? ' ' : '') + 'por volta de')
                : ((originalVal.startsWith(' ') ? ' ' : '') + 'na');
        }
        // Frase dividida de permissões declaradas (dp): "Agents created by <plugin> run in a dedicated <project> with its own permissions, which you can change anytime in the <project> settings page."
        if (/Agents created by|Os agentes criados por/i.test(pText) && /run in a dedicated|são executados em um/i.test(pText)) {
            if (valNorm === 'project') return 'projeto';
            if (valNorm === 'workspace') return 'espaço de trabalho';
        }
        if (/with its own permissions,\s*which you can change anytime in the|com permissões próprias,\s*que você pode alterar a qualquer momento/i.test(pText)) {
            if (valNorm === 'Agents created by') {
                return 'Os agentes criados por' + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === 'run in a dedicated') {
                return (originalVal.startsWith(' ') ? ' ' : '') + 'são executados em um' + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === 'with its own permissions, which you can change anytime in the') {
                return (originalVal.startsWith(' ') ? ' ' : '') + 'dedicado com permissões próprias, que você pode alterar a qualquer momento nas configurações do' + (originalVal.endsWith(' ') ? ' ' : '');
            }
            if (valNorm === 'settings page.') {
                for (const ch of Array.from(p.childNodes)) {
                    if (ch.nodeType !== Node.TEXT_NODE || ch === node) continue;
                    const v = ch.nodeValue || '';
                    const vt = v.trim();
                    if (vt === 'Agentes criados por') {
                        const nv = 'Os agentes criados por ';
                        ch.nodeValue = nv;
                        translatedValues.set(ch, nv);
                        edgeSpacedBase.set(ch, nv);
                    } else if (vt === 'são executados em um(a) dedicado(a)') {
                        let nx = ch.nextSibling;
                        while (nx && nx.nodeType === Node.COMMENT_NODE) nx = nx.nextSibling;
                        const nextIsSpace = nx && nx.nodeType === Node.TEXT_NODE && /^\s/.test(nx.nodeValue || '');
                        const nv = ' são executados em um' + (nextIsSpace ? '' : ' ');
                        ch.nodeValue = nv;
                        translatedValues.set(ch, nv);
                        edgeSpacedBase.set(ch, nv);
                    } else if (vt === 'Projeto' || vt === 'Espaço de trabalho') {
                        const nv = v.replace('Projeto', 'projeto').replace('Espaço de trabalho', 'espaço de trabalho').replace(/\s+$/, '');
                        ch.nodeValue = nv;
                        translatedValues.set(ch, nv);
                        edgeSpacedBase.delete(ch);
                    } else if (vt === 'com permissões próprias, que você pode alterar a qualquer momento em') {
                        let pv = ch.previousSibling;
                        while (pv && pv.nodeType === Node.COMMENT_NODE) pv = pv.previousSibling;
                        let nx = ch.nextSibling;
                        while (nx && nx.nodeType === Node.COMMENT_NODE) nx = nx.nextSibling;
                        const prevIsSpace = pv && pv.nodeType === Node.TEXT_NODE && /\s$/.test(pv.nodeValue || '');
                        const nextIsSpace = nx && nx.nodeType === Node.TEXT_NODE && /^\s/.test(nx.nodeValue || '');
                        const nv = (prevIsSpace ? '' : ' ') + 'dedicado com permissões próprias, que você pode alterar a qualquer momento nas configurações do' + (nextIsSpace ? '' : ' ');
                        ch.nodeValue = nv;
                        translatedValues.set(ch, nv);
                        edgeSpacedBase.set(ch, nv);
                    }
                }
                return '.';
            }
        }
        // Fim da frase de permissões declaradas (fallback geral)
        if (valNorm === 'settings page.' && /its own permissions|com permissões próprias/i.test(pText)) {
            return '.';
        }
        // Página de detalhes de plugin quando item não é encontrado: "No plugin found for <code>id</code>." (início traduzido pelo dicionário)
        if (valNorm === '.' && typeof p.querySelector === 'function' && p.querySelector('.font-mono') &&
            /^(?:No (?:app|plugin|bundle) found for|Nenhum (?:app|plugin|pacote) encontrado para)/i.test(pText.trim())) {
            return '.';
        }
        // Barra de seleção em lote de itens em execução: "3 selected"
        if (valNorm === 'selected' && typeof p.closest === 'function' && p.closest('[data-testid="running-selection-bar"]')) {
            const numMatch = pText.trim().match(/^(\d+)\s+selected$/i);
            const isOne = numMatch && Number(numMatch[1]) === 1;
            return (originalVal.startsWith(' ') ? ' ' : '') + (isOne ? 'selecionado' : 'selecionados');
        }
        if (valNorm === 'FAQ' && p.tagName === 'A' && p.parentElement && (dfsParentTexts.get(p.parentElement) || originalParentTexts.get(p.parentElement) || p.parentElement.textContent || '').match(/visiting our|em nossa|visitando nosso/i)) {
            return 'Perguntas frequentes';
        }
        if ((valNorm === 'In this case,' || valNorm === 'chunks were collapsed into one. Chunks included in this read:') && (pText.includes('chunks were collapsed into one') || pText.includes('blocos foram agrupados em um só'))) {
            return valNorm === 'In this case,'
                ? ('Neste caso,' + (originalVal.endsWith(' ') ? ' ' : ''))
                : ((originalVal.startsWith(' ') ? ' ' : '') + 'blocos foram agrupados em um só. Blocos incluídos nesta leitura:');
        }
        if (valNorm === 'Start Best-of-' && /^Start Best-of-\d+$/i.test(pText.trim())) {
            return 'Iniciar Best-of-';
        }
        if (valNorm === 'Generation Steps (' && /^Generation Steps \(\d+\)$/.test(pText.trim())) {
            return 'Etapas de geração (';
        }
        if ((valNorm === 'Show more (' && /^Show more \(\d+\)$/.test(pText.trim())) || (valNorm === 'Show submitted (' && /^Show submitted \(\d+\)$/.test(pText.trim()))) {
            return valNorm === 'Show more ('
                ? 'Mostrar mais ('
                : 'Mostrar enviados (';
        }
        if (pText.includes('No MCP servers found for "') || pText.includes('Nenhum servidor MCP encontrado para "')) {
            if (valNorm === 'No MCP servers found for "') return 'Nenhum servidor MCP encontrado para "';
            if (valNorm === '"') return '"';
        }
        if (valNorm === 'If that machine is a cloudtop, reach it via') {
            return 'Se essa máquina for um Cloudtop, acesse-a via' + (originalVal.endsWith(' ') ? ' ' : '');
        }
        return null;
    }

    const COORDINATOR_ICON_LABELS = {
        'Robot': ['Robô'],
        'Tree': ['Árvore'],
        'Hub': ['Hub'],
        'Sliders': ['Controles deslizantes'],
        'Terminal window': ['Janela do terminal'],
        'Command prompt': ['Prompt de comando'],
        'Code': ['Código'],
        'Sparkles': ['Brilhos'],
        'Wrench': ['Chave inglesa'],
        'Shield': ['Escudo'],
        'Speedometer': ['Velocímetro'],
        'Gauge': ['Medidor'],
        'Eye': ['Olho'],
        'Flask': ['Frasco'],
        'Radar': ['Radar'],
        'Bot': ['Bot']
    };
    const COORDINATOR_COLOR_LABELS = {
        'Blue': ['Azul'],
        'Purple': ['Roxo'],
        'Teal': ['Azul-petróleo'],
        'Green': ['Verde'],
        'Amber': ['Âmbar'],
        'Orange': ['Laranja'],
        'Red': ['Vermelho'],
        'Indigo': ['Índigo']
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
                txt.includes('Interface do painel lateral disponível') ||
                txt.includes('Host Endpoint') ||
                txt.includes('Endpoint do host') ||
                txt.includes('Managed by plugin') ||
                txt.includes('Gerenciado por plugin')
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
        if (!valNorm || valNorm.length > 48 || /[.!?]$/.test(valNorm)) return false;
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
                    if (hasMultipleTabs && /(?:Review|Revisão)/.test(barText)) {
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
            if (/Stream and control|Transmitir e controlar/i.test(sentText) && /directly in the side pane|diretamente no painel lateral/i.test(sentText)) {
                if (low !== 'stream and control' && low !== 'transmitir e controlar' && !low.startsWith('directly in the side pane') && !low.startsWith('diretamente no painel lateral')) {
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
                            if (bTxt.length < 180 && (/(?:Running|Stopped|Em execução|Parado)(?=\s|$)/.test(bTxt) || /[a-z0-9._-]+\/[a-z0-9._-]+/i.test(bTxt))) {
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
                        if (hdrText === 'Plugins') {
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
                        if (t === 'Icon') newAttr = 'Ícone';
                        else if (t === 'Color') newAttr = 'Cor';
                    } else if (node.hasAttribute('data-agy-layout') && t === 'Layout') {
                        newAttr = 'Layout';
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
                                newAttr = ('Mostrar ') + target;
                            } else {
                                newAttr = ('Mostrar ') + (lookupDict(target) || target);
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

    // O React divide " " entre strings adjacentes em nós de texto separados; quando ambos os lados são CJK
    // e pelo menos um lado foi traduzido aqui, remove esse espaço (sem espaço entre caracteres CJK); quando ambos
    // já eram CJK (ex.: conteúdo do usuário), não mexe. O colapso é reversível: se o React reutilizar os nós
    // com texto em inglês, o espaço é restaurado. Só lê o DOM atual, sem traduzir vizinhos durante a checagem;
    // os vizinhos são reavaliados ao fim da travessia do pai, na adição/remoção de nós ou na alteração de texto.
    const CJK_TAIL = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]$/;
    const CJK_HEAD = /^[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
    const collapsedGaps = new WeakMap();
    // Nó de texto adjacente na borda próxima ao espaço: desce apenas em elementos inline pequenos (no máximo 2 filhos
    // por nível, até GAP_EDGE_DEPTH níveis), sem ler textContent de contêineres grandes; fora do limite retorna GAP_UNKNOWN
    // (sem colapsar). refreshGapsAround sobe o mesmo número de níveis para manter o escopo simétrico.
    const GAP_EDGE_DEPTH = 4;
    // Limite de nós de preenchimento (comentários, texto vazio) ignorados: acima disso considera indeterminado e não colapsa,
    // evitando varrer longas sequências de nós vazios a cada mutação.
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
    // Comentários e nós de texto vazios são preenchimento do React e não contam como vizinhos; espaços já colapsados precisam ser reavaliados.
    function isGapFiller(n) {
        return !!n && (n.nodeType === Node.COMMENT_NODE || (n.nodeType === Node.TEXT_NODE && !n.nodeValue && !collapsedGaps.has(n)));
    }
    // Pula nós de preenchimento na direção dir e retorna o primeiro vizinho real (GAP_UNKNOWN se exceder GAP_FILLER_MAX),
    // indicando se pulou nó de texto vazio. Mesma regra nas duas direções para colapso, espaços de borda e reavaliação.
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
    // Indica que este texto foi escrito por este motor e não foi alterado pelo React depois (o ramo de texto limpa o registro antes).
    function isOwnTranslation(n) {
        return translatedValues.has(n) && translatedValues.get(n) === n.nodeValue;
    }
    function cjkGapShouldCollapse(gap) {
        const p = gapNeighbor(gap, 'previousSibling');
        const q = gapNeighbor(gap, 'nextSibling');
        const prev = p.node;
        const next = q.node;
        if (!prev || !next || prev === GAP_UNKNOWN || next === GAP_UNKNOWN) return false;
        // Quando ambos os lados são elementos (ex.: dois links ou botões lado a lado), o espaço serve como separador e deve ser mantido.
        if (!p.skippedText && !q.skippedText && prev.nodeType !== Node.TEXT_NODE && next.nodeType !== Node.TEXT_NODE) return false;
        const before = gapEdgeTextNode(prev, true);
        const after = gapEdgeTextNode(next, false);
        if (!before || !after || before === GAP_UNKNOWN || after === GAP_UNKNOWN) return false;
        if (!CJK_TAIL.test(before.nodeValue) || !CJK_HEAD.test(after.nodeValue)) return false;
        return isOwnTranslation(before) || isOwnTranslation(after);
    }
    function refreshCjkGap(gap) {
        // O conteúdo do editor e de áreas de código pertence ao usuário: trechos que se tornam editáveis depois também não são alterados.
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
    // Após adicionar um nó ou alterar texto, reavalia os espaços ao redor dele e sobe até GAP_EDGE_DEPTH ancestrais.
    // Não interrompe se o ancestral ganhar mais filhos, pois um espaço colapsado antes com base nele pode precisar ser restaurado.
    function refreshGapsAround(node) {
        let n = node;
        for (let depth = 0; n && depth <= GAP_EDGE_DEPTH; depth++) {
            refreshNeighborSpacing(n, 'previousSibling');
            refreshNeighborSpacing(n, 'nextSibling');
            n = n.parentElement;
        }
    }
    // Quando há apenas remoção de nós, addedNodes fica vazio: reavalia os espaços nos dois lados do ponto removido.
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
    // norm() converte primeiro "…" em "..." antes de consultar dicionários e regras; se o original usar apenas "…",
    // troca "..." de volta para "…" (após reordenação de palavras por regras, o "…" final do original pode cair no meio da tradução).
    function keepSourceEllipsis(source, out) {
        if (typeof out !== 'string' || typeof source !== 'string' || !source.includes('…')) return out;
        if (!source.includes('...')) return out.replace(/\.\.\./g, '…');
        return /…\s*$/.test(source) ? out.replace(/\.\.\.(\s*)$/, '…$1') : out;
    }
    // Os espaços nas extremidades do trecho traduzido servem para nomes em inglês e números ("Criado por Foo");
    // quando o texto adjacente é CJK, o espaço é removido. O texto base fica em edgeSpacedBase e é reavaliado quando o vizinho muda,
    // usando a mesma busca de borda (gapEdgeTextNode).
    const edgeSpacedBase = new WeakMap();
    function adjacentEdgeText(node, dir) {
        const s = gapNeighbor(node, dir).node;
        if (!s || s === GAP_UNKNOWN) return null;
        const edge = gapEdgeTextNode(s, dir === 'previousSibling');
        return edge && edge !== GAP_UNKNOWN ? edge.nodeValue : null;
    }
    // Remove apenas espaços entre dois trechos CJK; mantém o espaço quando o lado adjacente tem texto latino, número ou símbolo ("Configurações - Geral").
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
    // O SVG substituto acompanha a acessibilidade do host: oculta se o host já estiver oculto ou tiver nome próprio;
    // caso contrário o SVG carrega o nome do ícone (o texto da ligadura fazia parte do nome acessível antes de ser limpo).
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
    // Texto de fonte de ícone (ligadura): quando o Google Symbols não carrega ou falta na tabela SVG interna, o ícone aparece como texto.
    // Desenha SVG para lacunas conhecidas e limpa o texto; os demais nomes de ícone não são traduzidos (mantendo o nó de texto do React).
    // Também trata texto vazio ou espaços aqui para não deixar um SVG antigo retido pelos retornos antecipados abaixo. Retorna true se já tratou.
    function handleIconFontText(node, originalVal) {
        const parent = node.parentElement;
        const iconHost = parent && typeof parent.matches === 'function' && parent.matches(ICON_FONT_SELECTOR) ? parent : null;
        if (!iconHost) {
            // O React reutilizou o nó de texto do ícone removendo a classe de ícone e mudando o texto: remove o SVG desenhado antes.
            if (isIconFallbackSvg(node.previousSibling)) node.previousSibling.remove();
            return false;
        }
        const oldSvg = Array.from(iconHost.children).find(isIconFallbackSvg) || null;
        // Texto limpo por este motor (com o SVG ainda presente): mantém como está.
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
            // 1em acompanha o tamanho de fonte do host (px, rem ou herdado), mantendo o tamanho original do ícone de fonte.
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
        // Limpa o cache de não traduzido caso o mesmo nó volte depois para um ícone sem SVG, evitando deixar SVG antigo.
        unchangedTextValues.delete(node);
        translatedValues.set(node, '');
        node.nodeValue = '';
        return true;
    }

    // Campos nomeados pelo usuário em frases divididas (ex.: automação, plugin): identifica pelos trechos vizinhos (em inglês ou já traduzidos).
    const USER_NAME_SLOTS = [['Agents created by', 'run in a dedicated']];
    function isFragmentNode(n, source) {
        if (!n || n === GAP_UNKNOWN || n.nodeType !== Node.TEXT_NODE || !n.nodeValue) return false;
        // Os fragmentos originais e traduzidos são curtos: evita normalizar trechos longos dos vizinhos.
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
                // Traduz atributos: placeholder, title, aria-label (elementos isolados e controles internos já são interceptados em translateElementAttributes)
                translateElementAttributes(node);

                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                if (tag === 'OPTION' && !node.hasAttribute('value')) return;
                if (isCodeOrEditor(node) || node.isContentEditable) {
                    if (!node.isContentEditable) translateIsolatedToolCallChrome(node);
                    return;
                }
                if (node.classList && (node.classList.contains('monaco-editor') || node.classList.contains('terminal') || node.classList.contains('xterm'))) return;

                // Trata o nó composto "Show <N> more..." no rodapé de FastPick / listas (incluindo badge filho como <span>Show 5</span> more...)
                const elText = node.textContent ? node.textContent.trim() : '';
                if (/^Show\s+\d+\s+more(?:\.\.\.|…)?$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length === 1 && node.childNodes.length === 1) {
                        const m = elText.match(/^Show\s+(\d+)\s+more(\.\.\.|…)?$/i);
                        if (m) {
                            textChildren[0].nodeValue = 'Mostrar mais ' + m[1] + (m[2] || '');
                            translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        }
                    } else {
                        for (const c of Array.from(node.childNodes)) {
                            if (c.nodeType === Node.TEXT_NODE) {
                                const v = c.nodeValue;
                                if (v === 'Show ' || norm(v) === 'Show') {
                                    c.nodeValue = 'Mostrar mais' + (/\s$/.test(v) ? ' ' : '');
                                    translatedValues.set(c, c.nodeValue);
                                } else if (/^more(\.\.\.|…)?$/i.test(v.trim())) {
                                    c.nodeValue = v.trim().match(/^more(\.\.\.|…)?$/i)[1] || '';
                                    translatedValues.set(c, c.nodeValue);
                                }
                            } else if (c.nodeType === Node.ELEMENT_NODE && c.childNodes && c.childNodes.length === 1 && c.firstChild.nodeType === Node.TEXT_NODE) {
                                const tc = c.firstChild;
                                const tv = tc.nodeValue;
                                const showNumMatch = tv.trim().match(/^Show\s+(\d+)$/i);
                                if (showNumMatch) {
                                    const lead = tv.match(/^\s*/)[0];
                                    const trail = tv.match(/\s*$/)[0];
                                    tc.nodeValue = lead + 'Mostrar mais ' + showNumMatch[1] + trail;
                                    translatedValues.set(tc, tc.nodeValue);
                                } else if (norm(tv) === 'Show') {
                                    tc.nodeValue = 'Mostrar mais' + (/\s$/.test(tv) ? ' ' : '');
                                    translatedValues.set(tc, tc.nodeValue);
                                } else if (/^more(\.\.\.|…)?$/i.test(tv.trim())) {
                                    tc.nodeValue = tv.trim().match(/^more(\.\.\.|…)?$/i)[1] || '';
                                    translatedValues.set(tc, tc.nodeValue);
                                }
                            }
                        }
                    }
                }

                // Trata o botão composto "Use <VoiceName>" no rodapé do seletor de voz
                if (node.getAttribute && node.getAttribute('data-testid') === 'voice-picker-use') {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const v = tc.nodeValue;
                        if (v === 'Use ' || norm(v) === 'Use') {
                            tc.nodeValue = 'Usar ';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                // Trata os parágrafos da mensagem de boas-vindas do Coordinator (v2.31.0)
                if (node.getAttribute && node.getAttribute('data-testid') === 'coordinator-welcome') {
                    const paragraphs = node.querySelectorAll ? node.querySelectorAll('p') : [];
                    for (const p of paragraphs) {
                        const pNorm = norm(p.textContent || '');
                        if (/^Welcome to\s+(.+?)\.\s*I coordinate the work for this project\./i.test(pNorm)) {
                            const strongEl = p.querySelector && p.querySelector('strong');
                            const nameClone = strongEl ? strongEl.cloneNode(true) : null;
                            p.textContent = '';
                            p.appendChild(document.createTextNode('Boas-vindas ao '));
                            if (nameClone) p.appendChild(nameClone);
                            p.appendChild(document.createTextNode('. Eu coordeno o trabalho deste projeto. Você pode me fazer perguntas ou atribuir tarefas, e eu responderei diretamente ou iniciarei trabalhadores em paralelo.'));
                            p.setAttribute('translate', 'no');
                        } else if (/^(?:You\s+can follow the workers in the Dashboard|Você\s+pode acompanhar os trabalhadores no Painel)/i.test(pNorm)) {
                            p.textContent = 'Você pode acompanhar os trabalhadores no Painel, e eu publicarei atualizações quando as tarefas forem concluídas ou precisarem da sua atenção.';
                            p.setAttribute('translate', 'no');
                        }
                    }
                    return;
                }

                // Trata nós de texto divididos de boas-vindas "Get Anything Done with <AppName>"
                if (/^Get Anything Done with\s+(.+)$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2 && norm(textChildren[0].nodeValue) === 'Get Anything Done with') {
                        textChildren[0].nodeValue = 'Faça tudo com ';
                        translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                    }
                }

                // Trata nós de texto divididos "Available for <projectId> project"
                if (/^Available for\s+.+?\s+project$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const n = norm(tc.nodeValue);
                        if (n === 'Available for') {
                            tc.nodeValue = 'Disponível para o projeto ';
                            translatedValues.set(tc, tc.nodeValue);
                        } else if (n === 'project') {
                            tc.nodeValue = '';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                // Trata a introdução do painel lateral do plugin "Stream and control <pluginName> directly in the side pane."
                if (/^(?:Stream and control|Transmitir e controlar)\s+.+?\s+(?:directly in the side pane|diretamente no painel lateral)\.?$/i.test(elText)) {
                    const modal = findSidecarDetailsModal(node);
                    for (const c of Array.from(node.childNodes)) {
                        if (c.nodeType === Node.TEXT_NODE) {
                            const n = norm(c.nodeValue);
                            if (/^(?:Stream and control|Transmitir e controlar)$/i.test(n)) {
                                c.nodeValue = 'Transmitir e controlar ';
                                translatedValues.set(c, c.nodeValue);
                            } else if (/^(?:directly in the side pane|diretamente no painel lateral)\.?$/i.test(n)) {
                                c.nodeValue = ' diretamente no painel lateral' + (n.endsWith('.') ? '.' : '');
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
                    // Avalia os espaços entre os filhos após traduzir todos: ao passar pelo espaço, o nó seguinte ainda não havia sido traduzido.
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
                // O React reescreveu este nó (conteúdo diferente do último gravado por este motor): descarta registros anteriores de tradução e bordas
                // para não reutilizá-los por engano (ex.: se o nó passar a ser conteúdo do usuário ou nome de ícone).
                if (translatedValues.has(node) && translatedValues.get(node) !== originalVal) {
                    translatedValues.delete(node);
                    edgeSpacedBase.delete(node);
                }
                // Se um espaço colapsado foi substituído pelo React por outro texto ou limpo e reescrito, deixa de ser restaurável.
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

                // Trata texto segmentado "Show ", num, " more..." (ou badge filho "Show <N>") no rodapé de FastPick / listas
                const parentText = node.parentElement && node.parentElement.textContent ? node.parentElement.textContent.trim() : '';
                if (isFilePathOrUri(originalVal.trim()) || isFilePathOrUri(parentText)) return;
                if (parentText && (
                    /^(?:Show\s+\d+\s+more|Mostrar\s+mais\s+\d+(?:\s+more)?)(?:\.\.\.|…)?$/i.test(parentText) ||
                    (node.parentElement.getAttribute && node.parentElement.getAttribute('value')?.startsWith('fastpick-show-more:'))
                )) {
                    if (originalVal === 'Show ' || norm(originalVal) === 'Show') {
                        node.nodeValue = 'Mostrar mais' + (/\s$/.test(originalVal) ? ' ' : '');
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                    const moreTail = originalVal.trim().match(/^more(\.\.\.|…)?$/i);
                    if (moreTail) {
                        node.nodeValue = moreTail[1] || '';
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                }
                const showNumBadgeMatch = parentText && originalVal.trim().match(/^Show\s+(\d+)$/i);
                if (showNumBadgeMatch && /^Show\s+\d+$/i.test(parentText)) {
                    const gp = node.parentElement.parentElement;
                    const gpText = gp ? (dfsParentTexts.get(gp) || originalParentTexts.get(gp) || (gp.textContent ? gp.textContent.trim() : '')) : '';
                    if (/^Show\s+\d+\s+more(?:\.\.\.|…)?$/i.test(gpText) || (gp && gp.getAttribute && gp.getAttribute('value')?.startsWith('fastpick-show-more:'))) {
                        const lead = originalVal.match(/^\s*/)[0];
                        const trail = originalVal.match(/\s*$/)[0];
                        node.nodeValue = lead + 'Mostrar mais ' + showNumBadgeMatch[1] + trail;
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                }

                // Essencial: se for texto placeholder de skeleton, marca obrigatoriamente para não traduzir
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
                    if (originalVal !== 'Novo') {
                        translatedValues.set(node, 'Novo');
                        node.nodeValue = 'Novo';
                    }
                    return;
                }
                if (valNorm === 'Unavailable' && isModelMenuText(node)) {
                    const unavailLabel = 'Indisponível';
                    if (originalVal !== unavailLabel) {
                        translatedValues.set(node, unavailLabel);
                        node.nodeValue = unavailLabel;
                    }
                    return;
                }
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && node.parentElement?.getAttribute?.('data-testid') === 'swarm-unread-divider') {
                    const unreadLabel = 'Novas mensagens';
                    if (originalVal !== unreadLabel) {
                        translatedValues.set(node, unreadLabel);
                        node.nodeValue = unreadLabel;
                    }
                    return;
                }
                if (cachedValue === originalVal || unchangedTextValues.get(node) === originalVal) return;

                // Campos nomeados pelo usuário em frases divididas não são traduzidos, mesmo que o nome coincida com uma entrada do dicionário (ex.: plugin chamado Settings)
                if (isUserNameSlot(node)) {
                    unchangedTextValues.set(node, originalVal);
                    return;
                }

                // O botão em pílula de predefinição de permissões no rodapé da entrada usa shrink-0 + whitespace-nowrap; usar rótulos curtos evita comprimir o seletor de modelo na mesma linha
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
                        const isSingleFile = /^file\s+changed$/i.test(valNorm);
                        scopedFilesChangedHit = (originalVal.startsWith(' ') ? ' ' : '') + (isSingleFile ? 'arquivo alterado' : 'arquivos alterados');
                    }
                }
                const commonTrans = scopedSwarmHit !== null
                    ? scopedSwarmHit
                    : (scopedFilesChangedHit !== null ? scopedFilesChangedHit : translateExactOrDynamic(valNorm));
                let appliedDynamicOrDict = false;
                if (commonTrans !== null) {
                    newVal = commonTrans;
                    appliedDynamicOrDict = true;
                } else {
                    const ctxTrans = translateContextualText(node, originalVal, valNorm);
                    if (ctxTrans !== null) {
                        newVal = ctxTrans;
                        appliedDynamicOrDict = true;
                    } else {
                        const swarmComp = inSwarmText ? translateSwarmComposite(originalVal) : null;
                        if (swarmComp !== null) {
                            newVal = swarmComp;
                            appliedDynamicOrDict = true;
                        } else if (valNorm.length > 15 && valNorm.includes(' ') && longMissCache.get(node) !== valNorm) {
                            // Substituição deslizante de frases longas e correspondência inteligente para truncamento no final
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
                if (appliedDynamicOrDict) {
                    if (newVal === valNorm) {
                        newVal = originalVal;
                    } else {
                        const hasLeadSep = /^[ \t]+/.test(originalVal) && Boolean(node.previousSibling);
                        const hasTrailSep = /[ \t]+$/.test(originalVal) && Boolean(node.nextSibling);
                        const startsWithPunctOrClose = /^[.,:;!?)\]]/.test(newVal) || /^["”'’](?:[.,:;!?]|$)/.test(newVal);
                        const endsWithOpenDelim = /[(\[]$/.test(newVal) || /(?:^|[\s:(\[])["“'‘]$/.test(newVal);
                        if (hasLeadSep && !/^\s/.test(newVal) && !startsWithPunctOrClose) newVal = ' ' + newVal;
                        if (hasTrailSep && !/\s$/.test(newVal) && !endsWithOpenDelim) newVal = newVal + ' ';
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
                    // O nome acessível do host do ícone de fonte mudou: ajusta o SVG substituto (se o host perder o nome, o SVG assume o nome do ícone)
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

    // Vínculo de disparo em múltiplas fases
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
