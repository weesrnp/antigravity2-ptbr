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
    console.log(`[patch] Injetando o gancho de tradução do painel Sidecar em utils.js...`);
    const cleaned = cleanUtilsJsContent(utilsContent);
    const targetStr = "hubContents.on('will-navigate', guardExternalNavigation);";
    const idx = cleaned.indexOf(targetStr);
    if (idx === -1) {
        console.warn(`[aviso] Ponto de inserção do gancho do Sidecar não encontrado em utils.js.`);
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
                    console.warn('[tradução] Falha na injeção no Sidecar:', err && err.message ? err.message : err);
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

    console.log(`[patch] Gancho de tradução do painel Sidecar injetado com sucesso!`);
    return cleaned.substring(0, idx) + sidecarHookJs + "\n    " + cleaned.substring(idx);
}

function patchPreloadJs(content, translationJs, signatureStart, signatureEnd) {
    console.log(`[patch] Injetando o código de tradução em preload.js...`);
    const cleanedContent = cleanJsContent(content, signatureStart, signatureEnd);
    const newContent = cleanedContent + "\n;\n" + translationJs;
    console.log(`[patch] Injeção concluída!`);
    return newContent;
}

function patchMenuJs(menuContent) {
    console.log(`[patch] Injetando o código de tradução do menu em menu.js...`);
    const menuCleaned = cleanMenuJsContent(menuContent);

    const menuTranslationJs = `
    /* --- MENU TRANSLATION START --- */
    // ==========================================
    // Antigravity Native Menu Chinese Translation
    // ==========================================
    const translations = ${`{
        'File': 'Arquivo',
        'Edit': 'Editar',
        'View': 'Exibir',
        'Window': 'Janela',
        'Help': 'Ajuda',
        'New Window': 'Nova janela',
        'Create Project': 'Criar projeto',
        'Command Palette': 'Paleta de comandos',
        'Docs': 'Documentação',
        'Check for Updates': 'Verificar atualizações',
        'Checking for Updates...': 'Verificando atualizações...',
        'Downloading Update...': 'Baixando atualização...',
        'Restart to Update': 'Reiniciar para atualizar',
        'Toggle Developer Tools': 'Alternar ferramentas do desenvolvedor',
        'Undo': 'Desfazer',
        'Redo': 'Refazer',
        'Cut': 'Recortar',
        'Copy': 'Copiar',
        'Paste': 'Colar',
        'Select All': 'Selecionar tudo',
        'Minimize': 'Minimizar',
        'Maximize': 'Maximizar',
        'Close': 'Fechar',
        'Zoom': 'Zoom',
        'Reset Zoom': 'Redefinir zoom',
        'Actual Size': 'Tamanho real',
        'Zoom In': 'Ampliar',
        'Zoom Out': 'Reduzir',
        'Toggle Full Screen': 'Alternar tela cheia',
        'Toggle Between Light/Dark Themes': 'Alternar entre tema claro/escuro',
        'Split Terminal': 'Dividir terminal',
        'Split Conversation Horizontally': 'Dividir conversa horizontalmente',
        'Split Conversation Vertically': 'Dividir conversa verticalmente',
        'Split': 'Dividir',
        'Split Right': 'Dividir à direita',
        'Split Down': 'Dividir abaixo',
        'Replace With New': 'Substituir por nova conversa',
        'Show in File Explorer': 'Mostrar no Explorador de Arquivos',
        'Reveal in Finder': 'Mostrar no Finder',
        'Find in conversation': 'Localizar na conversa',
        'Connect to WSL': 'Conectar ao WSL',
        'Reopen Locally': 'Reabrir localmente',
        'About Antigravity': 'Sobre o Antigravity',
        'Settings...': 'Configurações...',
        'Preferences...': 'Preferências...',
        'Services': 'Serviços',
        'Hide Antigravity': 'Ocultar Antigravity',
        'Hide Others': 'Ocultar outros',
        'Show All': 'Mostrar tudo',
        'Quit Antigravity': 'Sair do Antigravity',
        'Quit': 'Sair',
        'Paste and Match Style': 'Colar e corresponder ao estilo',
        'Delete': 'Excluir',
        'Bring All to Front': 'Trazer tudo para a frente',
        'Close Window': 'Fechar janela',
        'Version': 'Versão',
        'Reload': 'Recarregar',
        'Force Reload': 'Forçar recarregamento',
        'Substitutions': 'Substituições',
        'Show Substitutions': 'Mostrar substituições',
        'Smart Quotes': 'Aspas inteligentes',
        'Smart Dashes': 'Travessões inteligentes',
        'Text Replacement': 'Substituição de texto',
        'Speech': 'Fala',
        'Start Speaking': 'Começar a falar',
        'Stop Speaking': 'Parar de falar',
        'Reload Window': 'Recarregar janela',
        'Toggle Fullscreen': 'Alternar tela cheia',
        'Toggle Full-Screen': 'Alternar tela cheia',
        'Enter Full Screen': 'Entrar em tela cheia',
        'Exit Full Screen': 'Sair da tela cheia',
        'Appearance': 'Aparência',
        'Select Theme': 'Selecionar tema',
        'Toggle Sidebar': 'Alternar barra lateral',
        'Customize Sidebar': 'Personalizar barra lateral',
        'Toggle Aux Pane': 'Alternar painel auxiliar',
        'Toggle Terminal': 'Alternar terminal',
        'Toggle Secondary Side Bar': 'Alternar barra lateral secundária',
        'Open Command Palette': 'Abrir paleta de comandos',
        'Open Launchpad': 'Abrir Launchpad',
        'Open Project Picker': 'Abrir seletor de projetos',
        'Open Conversation History': 'Abrir histórico de conversas',
        'Open Keyboard Shortcuts': 'Abrir atalhos de teclado',
        'Keyboard Shortcuts': 'Atalhos de teclado',
        'Remove From Split': 'Sair da divisão',
        'Remove from Split': 'Remover da divisão',
        'Equalize Split Panes': 'Igualar painéis divididos',
        'Next Aux Pane Tab': 'Próxima aba do painel auxiliar',
        'Previous Aux Pane Tab': 'Aba anterior do painel auxiliar',
        'Collapse All Folders': 'Recolher todas as pastas',
        'Expand All Folders': 'Expandir todas as pastas',
        'Word Wrap': 'Quebra automática de linha',
        'Toggle Word Wrap': 'Alternar quebra automática de linha',
        'Front': 'Trazer tudo para a frente',
        'Show Previous Tab': 'Mostrar aba anterior',
        'Show Next Tab': 'Mostrar próxima aba',
        'Move Tab to New Window': 'Mover aba para nova janela',
        'Merge All Windows': 'Mesclar todas as janelas',
        'Tile Window to Left of Screen': 'Ladrilhar janela à esquerda da tela',
        'Tile Window to Right of Screen': 'Ladrilhar janela à direita da tela',
        'Move Window to Left Side of Screen': 'Mover janela para o lado esquerdo da tela',
        'Move Window to Right Side of Screen': 'Mover janela para o lado direito da tela',
        'Fill': 'Preencher',
        'Center': 'Centralizar',
        'Move & Resize': 'Mover e redimensionar',
        'New Conversation': 'Nova conversa',
        'New Remote Window': 'Nova janela remota',
        'New Editor Window': 'Nova janela do editor',
        'New Tab': 'Nova aba',
        'New Terminal Tab': 'Nova aba de terminal',
        'Open...': 'Abrir...',
        'Open Folder...': 'Abrir pasta...',
        'Open Folder': 'Abrir pasta',
        'Open Workspace...': 'Abrir espaço de trabalho...',
        'Open Workspace': 'Abrir espaço de trabalho',
        'Open Recent': 'Abrir recente',
        'Clear Menu': 'Limpar menu',
        'Clear Recently Opened': 'Limpar itens abertos recentemente',
        'Save': 'Salvar',
        'Save As...': 'Salvar como...',
        'Save All': 'Salvar tudo',
        'Revert File': 'Reverter arquivo',
        'Close Tab': 'Fechar aba',
        'Close Editor': 'Fechar editor',
        'Close Folder': 'Fechar pasta',
        'Close Project': 'Fechar projeto',
        'Connect to Remote...': 'Conectar ao remoto...',
        'Connect to Remote Workspace': 'Conectar a espaço de trabalho remoto',
        'Connect to SSH...': 'Conectar ao SSH...',
        'Show in File Manager': 'Mostrar no gerenciador de arquivos',
        'Open in Editor': 'Abrir no editor',
        'Exit': 'Sair',
        'Find': 'Localizar',
        'Find...': 'Localizar...',
        'Find in Conversation': 'Localizar na conversa',
        'Find Next': 'Localizar próximo',
        'Find Previous': 'Localizar anterior',
        'Replace': 'Substituir',
        'Replace...': 'Substituir...',
        'Spelling and Grammar': 'Ortografia e gramática',
        'Show Spelling and Grammar': 'Mostrar ortografia e gramática',
        'Check Document Now': 'Verificar documento agora',
        'Check Spelling While Typing': 'Verificar ortografia ao digitar',
        'Check Grammar With Spelling': 'Verificar gramática com ortografia',
        'Correct Spelling Automatically': 'Corrigir ortografia automaticamente',
        'Smart Copy/Paste': 'Copiar/colar inteligente',
        'Smart Links': 'Links inteligentes',
        'Data Detectors': 'Detectores de dados',
        'Transformations': 'Transformações',
        'Make Upper Case': 'Converter em maiúsculas',
        'Make Lower Case': 'Converter em minúsculas',
        'Capitalize': 'Iniciais maiúsculas',
        'Start Dictation...': 'Iniciar ditado...',
        'Emoji & Symbols': 'Emojis e símbolos',
        'Copy conversation markdown': 'Copiar Markdown da conversa',
        'Copy Conversation Markdown': 'Copiar Markdown da conversa',
        'Check for Updates...': 'Verificar atualizações...',
        'Download Update': 'Baixar atualização',
        'Restart to Update...': 'Reiniciar para atualizar...',
        'Settings': 'Configurações',
        'Preferences': 'Preferências',
        'Open Settings': 'Abrir configurações',
        'Hide': 'Ocultar',
        'Sign In': 'Entrar',
        'Sign Out': 'Sair',
        'Sign out': 'Sair',
        'Install Shell Command': 'Instalar comando de shell',
        'Install IDE': 'Instalar IDE',
        'Documentation': 'Documentação',
        'Release Notes': 'Notas de versão',
        'Report Issue': 'Relatar problema',
        'Send Feedback': 'Enviar feedback',
        'Provide Feedback': 'Enviar feedback',
        'Download Diagnostics': 'Baixar diagnóstico',
        'Show Logs': 'Mostrar logs',
        'Open Logs Folder': 'Abrir pasta de logs',
        'About': 'Sobre',
        'Privacy Policy': 'Política de privacidade',
        'Terms of Service': 'Termos de serviço',
        'License': 'Licença',
        'Developer': 'Desenvolvedor',
        'Developer: Reset NUX': 'Desenvolvedor: redefinir introdução para novos usuários',
        'Developer: Reset Onboarding': 'Desenvolvedor: redefinir integração inicial',
        'Restart Main Language Server': 'Reiniciar servidor de linguagem principal',
        'Clear Cache': 'Limpar cache',
        'View Usage': 'Ver uso'
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
                item.label = cleanLabel.replace(/^Version\\s*([\\d\\.]*)$/i, (match, v) => v ? "Versão " + v : "Versão");
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
        console.log(`[patch] Tradução do menu injetada com sucesso!`);
        return menuCleaned.substring(0, idx) + menuTranslationJs + "\n    " + menuCleaned.substring(idx);
    } else {
        console.warn(`[aviso] Ponto de inserção não encontrado em menu.js.`);
        return menuCleaned;
    }
}

function patchTrayJs(trayContent) {
    console.log(`[patch] Injetando a tradução do menu da bandeja em tray.js...`);
    let trayCleaned = cleanTrayJsContent(trayContent);
    const trayTranslationsJson = JSON.stringify({
        'No agents running': 'Nenhum agente em execução',
        'Open Antigravity': 'Abrir Antigravity',
        'Connect to WSL': 'Conectar ao WSL',
        'Reopen Locally': 'Reabrir localmente',
        'Quit': 'Sair'
    });
    const openPrefix = 'Abrir ';

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
        console.warn(`[aviso] Função createTray não encontrada em tray.js.`);
    }

    const dblClickTarget = /tray\.setContextMenu\(contextMenu\);/;
    const dblClickReplacement = `tray.setContextMenu(contextMenu);
    /* --- TRAY DOUBLE CLICK START --- */
    if (typeof actions !== 'undefined' && Array.isArray(actions) && typeof tray !== 'undefined' && tray && typeof tray.on === 'function') {
        const openAction = actions.find(item => item && typeof item.click === 'function' && !['Quit', 'Sair'].includes(item.label));
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
    const replacementCount = "countItem.label = count > 0 ? `${count} ${count === 1 ? 'agente em execução' : 'agentes em execução'}` : 'Nenhum agente em execução';";
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
        console.log(`[patch] Tradução do menu da bandeja injetada com sucesso (${hitCount} pontos)!`);
    } else {
        console.warn(`[aviso] Nenhum ponto de injeção da bandeja encontrado em tray.js.`);
    }
    return trayPatched;
}

function patchLoadingOverlayJs(loadingContent) {
    if (!loadingContent.includes('<div class="text">')) {
        return loadingContent;
    }
    console.log(`[patch] Injetando a tradução da tela de carregamento em loadingOverlay.js...`);
    const replacementText = '<div class="text">Carregando o Antigravity...</div>';

    const out = loadingContent
        .replace('<div class="text">Loading Antigravity</div>', replacementText)
        // texto de instalações anteriores (outro idioma): troca qualquer texto do bloco
        .replace(/<div class="text">[^<]*<\/div>/, replacementText);

    if (out !== loadingContent) {
        console.log(`[patch] Tradução da tela de carregamento injetada com sucesso!`);
    } else {
        console.warn(`[aviso] Texto da tela de carregamento não encontrado em loadingOverlay.js.`);
    }
    return out;
}

function patchUpdaterJs(updaterContent) {
    console.log(`[patch] Injetando a tradução da janela de atualização em updater.js...`);
    const targetOptions = `                title: 'Check for Updates',
                message: 'No updates available',
                buttons: ['OK'],`;
    const replacementOptions = `                title: 'Verificar atualizações',
                message: 'Nenhuma atualização disponível',
                buttons: ['OK'],`;

    const out = updaterContent
        .replace(targetOptions, replacementOptions)
        .replace('MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', `MenuUpdateStep["CheckForUpdates"] = ${'"Verificar atualizações"'};`)
        .replace('MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', `MenuUpdateStep["CheckingForUpdates"] = ${'"Verificando atualizações..."'};`)
        .replace('MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', `MenuUpdateStep["DownloadingUpdate"] = ${'"Baixando atualização..."'};`)
        .replace('MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', `MenuUpdateStep["RestartToUpdate"] = ${'"Reiniciar para atualizar"'};`);
    if (out !== updaterContent) {
        console.log(`[patch] Tradução da janela de atualização injetada com sucesso!`);
    } else {
        console.warn(`[aviso] Ponto de inserção da janela de atualização não encontrado em updater.js.`);
    }
    return out;
}

const MAIN_PROCESS_TEXT_TABLES = {
    'dist/main.js': [
        ["buttons: ['Cancel', 'Quit'],", "buttons: ['Cancelar', 'Sair'],"],
        ["title: 'Confirm Quit',", "title: 'Confirmar saída',"],
        ["message: 'Are you sure you want to quit?',", "message: 'Tem certeza de que deseja sair?',"],
        [
            "detail: 'There may be agents or background tasks running.',",
            "detail: 'Pode haver agentes ou tarefas em segundo plano em execução.',"
        ],
        ["label: 'New Window',", "label: 'Nova janela',"],
        ["showErrorBox('Binary not found', msg)", "showErrorBox('Executável não encontrado', msg)"],
        ["showErrorBox('WSL setup failed', msg)", "showErrorBox('Falha na configuração do WSL', msg)"],
        ["showErrorBox('Startup failed', msg)", "showErrorBox('Falha na inicialização', msg)"],
        ["title: 'WSL distro not found',", "title: 'Distribuição WSL não encontrada',"],
        [
            'message: `The WSL distro "${WSL_DISTRO}" is no longer installed.`,',
            'message: `A distribuição WSL "${WSL_DISTRO}" não está mais instalada.`,'
        ],
        [
            "detail: 'Antigravity opened on Windows instead.',",
            "detail: 'O Antigravity foi aberto no Windows.',"
        ],
        [
            '`Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`',
            '`Não foi possível instalar o servidor na distribuição WSL "${WSL_DISTRO}":\\n${err.message}`'
        ]
    ],
    'dist/ipcHandlers.js': [
        [
            "showErrorBox('Cannot open folder', t.error)",
            "showErrorBox('Não foi possível abrir a pasta', t.error)"
        ],
        [
            "message: 'Folder is on the Windows filesystem',",
            "message: 'A pasta está no sistema de arquivos do Windows',"
        ],
        ["title: 'Open workspace',", "title: 'Abrir espaço de trabalho',"],
        ["title: 'Open workspaces',", "title: 'Abrir espaços de trabalho',"],
        ["title: 'Select Download Folder',", "title: 'Selecionar pasta de download',"]
    ],
    'dist/remote/remoteManager.js': [
        ["title: 'Choose an SSH config file',", "title: 'Escolher um arquivo de configuração SSH',"],
        ["buttons: ['Stop Server', 'Cancel'],", "buttons: ['Parar servidor', 'Cancelar'],"],
        ["title: 'Stop SSH server',", "title: 'Parar servidor SSH',"],
        [
            "message: `Stop the Antigravity server on ${entry.label}?`,",
            "message: `Parar o servidor do Antigravity em ${entry.label}?`,"
        ],
        [
            "'Agents running on this host will stop and its window will close. '",
            "'Os agentes em execução neste host serão interrompidos e a janela dele será fechada. '"
        ],
        ["'The server starts again the next time you connect.'", "'O servidor é iniciado novamente na próxima conexão.'"],
        ["message: `Not connected to ${label}`,", "message: `Não conectado a ${label}`,"],
        [
            "detail: 'Reconnect first, then stop its server.',",
            "detail: 'Reconecte primeiro e depois pare o servidor.',"
        ],
        ["title: 'SSH connection failed',", "title: 'Falha na conexão SSH',"],
        ["buttons: ['Sign In', 'Cancel'],", "buttons: ['Entrar', 'Cancelar'],"],
        ["title: 'Sign in',", "title: 'Entrar',"],
        [
            "message: `Sign in to your organization for ${entry.label}?`,",
            "message: `Entrar na sua organização para ${entry.label}?`,"
        ],
        [
            "'Continue only if you just chose to sign in with your organization '",
            "'Continue somente se você acabou de escolher entrar com sua organização '"
        ],
        [
            "`in this window. ${entry.label} will get access to your `",
            "`nesta janela. ${entry.label} terá acesso à `"
        ],
        [
            '"organization\'s Google Cloud account.\\n"',
            '"conta do Google Cloud da sua organização.\\n"'
        ],
        [
            "`Workforce pool: ${names[1]}  Provider: ${names[2]}`",
            "`Pool de Workforce: ${names[1]}  Provedor: ${names[2]}`"
        ],
        ["`Identity provider: ${provider}`", "`Provedor de identidade: ${provider}`"],
        [
            "message: `${name} can't be the SSH config file`,",
            "message: `${name} não pode ser o arquivo de configuração SSH`,"
        ],
        ["title: 'Choose another SSH config file',", "title: 'Escolher outro arquivo de configuração SSH',"],
        [
            "buttons: ['Choose Another File…', 'Cancel'],",
            "buttons: ['Escolher outro arquivo…', 'Cancelar'],"
        ],
        ["title: 'Could not restart the SSH server',", "title: 'Não foi possível reiniciar o servidor SSH',"],
        [
            "message: `${entry.label} still runs Antigravity server ${running}.`,",
            "message: `${entry.label} ainda executa o servidor do Antigravity ${running}.`,"
        ],
        ["buttons: ['Allow', \"Don't Allow\"],", "buttons: ['Permitir', 'Não permitir'],"],
        ["title: 'Microphone access',", "title: 'Acesso ao microfone',"],
        [
            "message: `Allow ${label} to use your microphone?`,",
            "message: `Permitir que ${label} use seu microfone?`,"
        ],
        [
            "detail: `The page in this window comes from ${label}. If you allow it, that ` +",
            "detail: `A página desta janela vem de ${label}. Se você permitir, esse ` +"
        ],
        [
            "\"host can use this computer's microphone for voice whenever one of \" +",
            "\"host poderá usar o microfone deste computador para voz sempre que uma \" +"
        ],
        [
            "'its windows is open. Antigravity asks again after you quit it.',",
            "'de suas janelas estiver aberta. O Antigravity pergunta de novo depois que você sair dele.',"
        ],
        ["buttons: ['Continue', 'Cancel'],", "buttons: ['Continuar', 'Cancelar'],"],
        [
            "message: `Finish this sign-in on ${entry.label}?`,",
            "message: `Concluir este login em ${entry.label}?`,"
        ],
        [
            "detail: `Continue only if you just chose to sign in from the ${entry.label} ` +",
            "detail: `Continue somente se você acabou de escolher entrar pela janela de ${entry.label}. ` +"
        ],
        [
            "'window. Your browser opens the sign-in page; once you sign in, ' +",
            "'Seu navegador abre a página de login; depois que você entrar, ' +"
        ],
        [
            "`${entry.label} gets access to that account.\\n` +",
            "`${entry.label} terá acesso a essa conta.\\n` +"
        ],
        [
            "`Sign-in page: ${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,",
            "`Página de login: ${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,"
        ],
        ["buttons: ['Take Over', 'Cancel'],", "buttons: ['Assumir', 'Cancelar'],"],
        ["title: 'Shared home directory',", "title: 'Diretório pessoal compartilhado',"],
        [
            "? `This window's Antigravity server runs on ${host}, another machine that shares your home directory.`",
            "? `O servidor do Antigravity desta janela está em execução em ${host}, outra máquina que compartilha seu diretório pessoal.`"
        ],
        [
            "? `Your Antigravity server runs on ${host}, another machine that shares your home directory.`",
            "? `Seu servidor do Antigravity está em execução em ${host}, outra máquina que compartilha seu diretório pessoal.`"
        ],
        [
            ": `${host}, another machine that shares your home directory, started your Antigravity server.`,",
            ": `${host}, outra máquina que compartilha seu diretório pessoal, iniciou seu servidor do Antigravity.`,"
        ],
        [
            "? `${label} reached ${here} this time. Cancel and reconnect to try again for ${host}, or take over to stop the server on ${host}, and its agents, and run it on ${here} instead.`",
            "? `Desta vez, ${label} se conectou a ${here}. Cancele e reconecte para tentar novamente em ${host}, ou assuma o controle para parar o servidor em ${host}, e seus agentes, e executá-lo em ${here}.`"
        ],
        [
            "? `${label} reached ${here}. Take over to stop the server on ${host}, and its agents, and run it on ${here} instead. To keep it running, connect to ${host}.`",
            "? `${label} se conectou a ${here}. Assuma o controle para parar o servidor em ${host}, e seus agentes, e executá-lo em ${here}. Para mantê-lo em execução, conecte-se a ${host}.`"
        ],
        [
            ": `${label} reached ${here}. Take over only if that server no longer runs, for example if ${host} was shut down or replaced: if it still runs, both servers would write the same files. To check, connect to ${host}.`,",
            ": `${label} se conectou a ${here}. Assuma o controle somente se esse servidor não estiver mais em execução, por exemplo se ${host} foi desligado ou substituído: se ele ainda estiver em execução, os dois servidores gravariam os mesmos arquivos. Para conferir, conecte-se a ${host}.`,"
        ],
        [
            "const what = terminals === 0 ? 'agent or task' : 'agent, task or terminal';",
            "const what = terminals === 0 ? 'agente ou tarefa' : 'agente, tarefa ou terminal';"
        ],
        ["buttons: ['Restart', 'Later'],", "buttons: ['Reiniciar', 'Mais tarde'],"],
        ["title: 'Restart SSH server',", "title: 'Reiniciar servidor SSH',"],
        [
            "message: `${label} is running server ${running}; this app is ${expected}. Restart the server now?`,",
            "message: `${label} está executando o servidor ${running}; este app está na versão ${expected}. Reiniciar o servidor agora?`,"
        ],
        [
            "detail: `Any ${what} still running on it stops. The server starts again with this app's version.`,",
            "detail: `Qualquer ${what} ainda em execução nele será interrompido. O servidor é iniciado novamente com a versão deste app.`,"
        ],
        // Títulos de diálogo passados como argumento de reportError() (devem vir depois das linhas de title acima)
        ["'Could not restart the SSH server'", "'Não foi possível reiniciar o servidor SSH'"],
        ["'Could not stop the SSH server'", "'Não foi possível parar o servidor SSH'"],
        ["'Sign-in failed'", "'Falha no login'"],
        ["'Connection cancelled.'", "'Conexão cancelada.'"]
    ],
    'dist/remote/sshPrompts.js': [
        // O idioma da página só muda para zh-TW no modo tradicional; aqui vira pt-BR
        ['<html lang="en"', '<html lang="pt-BR"'],
        [
            "message: confirm ? `${label} asks:` : 'Touch your security key',",
            "message: confirm ? `${label} pergunta:` : 'Toque na sua chave de segurança',"
        ],
        [
            "const TOUCH_TITLE = 'Touch your security key';",
            "const TOUCH_TITLE = 'Toque na sua chave de segurança';"
        ],
        [
            "<p class=\"context\">Connecting to <span id=\"label\"></span></p>",
            "<p class=\"context\">Conectando a <span id=\"label\"></span></p>"
        ],
        [
            "buttons: confirm ? ['Yes', 'No'] : ['Cancel'],",
            "buttons: confirm ? ['Sim', 'Não'] : ['Cancelar'],"
        ],
        [
            ">Asked again: your last answer may not have worked.<",
            ">Perguntando de novo: sua última resposta pode não ter funcionado.<"
        ],
        [">That's too long.<", ">O texto é longo demais.<"],
        ['>Cancel</button>', '>Cancelar</button>'],
        ['>Continue</button>', '>Continuar</button>'],
        [
            "(who) => (isAccount(who) ? ['Password', who] : undefined),",
            "(who) => (isAccount(who) ? ['Senha', who] : undefined),"
        ],
        [
            "(who) => (isAccount(who) ? ['Current password', who] : undefined),",
            "(who) => (isAccount(who) ? ['Senha atual', who] : undefined),"
        ],
        [
            "(who) => (isAccount(who) ? ['New password', who] : undefined),",
            "(who) => (isAccount(who) ? ['Nova senha', who] : undefined),"
        ],
        [
            "(who) => (isAccount(who) ? ['Confirm new password', who] : undefined),",
            "(who) => (isAccount(who) ? ['Confirmar nova senha', who] : undefined),"
        ],
        ["['Passphrase', baseName(key)]", "['Frase secreta', baseName(key)]"],
        [
            "? `${asked[0]} for ${hostPromptsMarked ? asked[1] : label}`",
            "? `${asked[0]} de ${hostPromptsMarked ? asked[1] : label}`"
        ],
        [
            "? `Trust ${hostName(host.split(' (')[0])}?`",
            "? `Confiar em ${hostName(host.split(' (')[0])}?`"
        ],
        ["? `Connect to ${hostName(host)} anyway?`", "? `Conectar a ${hostName(host)} mesmo assim?`"],
        ["return 'Accept updated host keys?';", "return 'Aceitar as chaves de host atualizadas?';"],
        [
            "return key ? `Add ${baseName(key.split(' (')[0])} to ssh-agent?` : undefined;",
            "return key ? `Adicionar ${baseName(key.split(' (')[0])} ao ssh-agent?` : undefined;"
        ],
        ["return `Question from ${who}`;", "return `Pergunta de ${who}`;"],
        ["return `Verification code for ${who}`;", "return `Código de verificação de ${who}`;"],
        ["return `Password for ${who}`;", "return `Senha de ${who}`;"],
        [
            "return /\\bpin\\b/i.test(text) ? `PIN for ${who}` : `Sign in to ${who}`;",
            "return /\\bpin\\b/i.test(text) ? `PIN de ${who}` : `Entrar em ${who}`;"
        ]
    ],
    'dist/deviceChooser.js': [
        ["hid: 'HID device',", "hid: 'dispositivo HID',"],
        ["usb: 'USB device',", "usb: 'dispositivo USB',"],
        ["serial: 'serial port',", "serial: 'dispositivo serial',"],
        ["'Unknown device'", "'Dispositivo desconhecido'"],
        ["title: 'Connect a device',", "title: 'Conectar um dispositivo',"],
        [
            "message: `${origin} wants to connect to a ${KIND_NOUNS[kind]}`,",
            "message: `${origin} quer se conectar a um ${KIND_NOUNS[kind]}`,"
        ],
        ["? 'Select a device:'", "? 'Selecione um dispositivo:'"],
        [": 'No compatible devices found.',", ": 'Nenhum dispositivo compatível encontrado.',"],
        [
            "buttons: [...snapshot.map(({ label }) => label), 'Cancel'],",
            "buttons: [...snapshot.map(({ label }) => label), 'Cancelar'],"
        ]
    ],
    'dist/webauthn.js': [
        [
            "details.relyingPartyId || 'this site'",
            "details.relyingPartyId || 'este site'"
        ],
        ["title: 'Choose a Passkey',", "title: 'Escolher uma chave de acesso',"],
        ["message: `Sign in to ${rpLabel}`,", "message: `Entrar em ${rpLabel}`,"],
        [
            "detail: 'Select a passkey account to continue:',",
            "detail: 'Selecione uma conta de chave de acesso para continuar:',"
        ],
        [
            "buttons: [...accountLabels, 'Cancel'],",
            "buttons: [...accountLabels, 'Cancelar'],"
        ]
    ],
    'dist/webviewPopupSecurity.js': [
        ["insecure: 'Not secure',", "insecure: 'Não seguro',"],
        ["dangerous: '⚠ Not secure',", "dangerous: '⚠ Não seguro',"],
        ["'Your connection to this site is not secure',", "'Sua conexão com este site não é segura',"],
        [
            "'You should not enter any sensitive information on this site (for '",
            "'Você não deve inserir informações sensíveis neste site (por '"
        ],
        [
            "'example, passwords or credit cards), because it could be stolen by '",
            "'exemplo, senhas ou cartões de crédito), pois elas podem ser roubadas por '"
        ],
        ["'attackers.',", "'invasores.',"],
        ["'Connection is secure',", "'A conexão é segura',"],
        [
            "'Your information (for example, passwords or credit card numbers) is '",
            "'Suas informações (por exemplo, senhas ou números de cartão de crédito) são '"
        ],
        ["'private when it is sent to this site.',", "'privadas quando enviadas a este site.',"],
        [
            "['Connection security information is not available for this page']",
            "['As informações de segurança da conexão não estão disponíveis para esta página']"
        ],
        [": 'unknown'", ": 'desconhecido'"],
        ["'Certificate is valid' : 'Certificate details'", "'O certificado é válido' : 'Detalhes do certificado'"],
        ["`Error: ${state.certificateError}`", "`Erro: ${state.certificateError}`"],
        [
            "`Issued to: ${certificate.subjectName}`",
            "`Emitido para: ${certificate.subjectName}`"
        ],
        ["`Issued by: ${certificate.issuer}`", "`Emitido por: ${certificate.issuer}`"],
        [
            "`Valid from: ${formatDate(certificate.validFromMs)}`",
            "`Válido de: ${formatDate(certificate.validFromMs)}`"
        ],
        [
            "`Valid until: ${formatDate(certificate.validToMs)}`",
            "`Válido até: ${formatDate(certificate.validToMs)}`"
        ],
        ["`Protocol: ${certificate.protocol}`", "`Protocolo: ${certificate.protocol}`"],
        ["(state.url || 'This page')", "(state.url || 'Esta página')"],
        ["label: 'Connection info…',", "label: 'Informações da conexão…',"],
        ["title: 'Connection info',", "title: 'Informações da conexão',"],
        ["buttons: ['OK'],", "buttons: ['OK'],"]
    ],
    'dist/provisionSplash.js': [
        [
            "<div>Setting up WSL: ${escapeHtml(distro)}</div>",
            "<div>Configurando o WSL: ${escapeHtml(distro)}</div>"
        ]
    ],
    'dist/ideInstall/wizardHtml.js': [
        // O idioma da página só muda para zh-TW no modo tradicional; aqui vira pt-BR
        ['<html lang="en"', '<html lang="pt-BR"'],
        ["<title>Welcome to Antigravity</title>", "<title>Boas-vindas ao Antigravity</title>"],
        [">Setting up…</div>", ">Configurando…</div>"],
        ["<h1>Welcome to the new Antigravity!</h1>", "<h1>Boas-vindas ao novo Antigravity!</h1>"],
        [
            "<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>",
            "<p>O Antigravity foi redesenhado para colocar os agentes em primeiro lugar, com novos recursos. Se você ainda quiser um editor de código, pode baixá-lo como um app separado chamado <b>Antigravity IDE</b>.</p>"
        ],
        [
            "<span>Download the Antigravity IDE</span>",
            "<span>Baixar o Antigravity IDE</span>"
        ],
        [">Explore the new Antigravity</button>", ">Explorar o novo Antigravity</button>"]
    ],
    'dist/remote/disconnectedPage.js': [
        // O idioma da página só muda para zh-TW no modo tradicional; aqui vira pt-BR
        ['<html lang="en"', '<html lang="pt-BR"'],
        ["reconnect: 'Reconnect',", "reconnect: 'Reconectar',"],
        ["stop: 'Stop Server',", "stop: 'Parar servidor',"],
        ["close: 'Close',", "close: 'Fechar',"],
        ["? 'Restarting…'", "? 'Reiniciando…'"],
        ["? 'Reconnecting…'", "? 'Reconectando…'"],
        [": 'Disconnected';", ": 'Desconectado';"],
        [
            "? `Restarting the Antigravity server on ${host}…`",
            "? `Reiniciando o servidor do Antigravity em ${host}…`"
        ],
        ["? `Reconnecting to ${host}…`", "? `Reconectando a ${host}…`"],
        [": `Disconnected from ${host}`;", ": `Desconectado de ${host}`;"],
        [
            "? 'This window opens it again once it has started.'",
            "? 'Esta janela será aberta novamente quando o servidor for iniciado.'"
        ],
        [
            "? `Its server on ${host} stopped, and its agents with it.`",
            "? `O servidor em ${host} foi parado, e seus agentes junto com ele.`"
        ],
        [": `Agents keep running on ${host}.`", ": `Os agentes continuam em execução em ${host}.`"],
        ["? `Its agents on ${host} stopped with it.`", "? `Os agentes em ${host} foram parados junto com ele.`"],
        [
            ": `Agents keep running on ${host} unless its server stopped.`;",
            ": `Os agentes continuam em execução em ${host}, a menos que o servidor tenha sido parado.`;"
        ]
    ],
    'dist/remote/signInCallback.js': [
        // O idioma da página só muda para zh-TW no modo tradicional; aqui vira pt-BR
        ['<html lang="en"', '<html lang="pt-BR"'],
        [
            "const SIGNED_IN = page('You have successfully authenticated.', 'You can close this tab and return to Antigravity.');",
            "const SIGNED_IN = page('Você foi autenticado com sucesso.', 'Você pode fechar esta aba e voltar ao Antigravity.');"
        ],
        [
            "return page(\"Sign-in didn't finish\", `Antigravity couldn't reach ${host} to finish signing in. ` +",
            "return page('O login não foi concluído', `O Antigravity não conseguiu alcançar ${host} para concluir o login. ` +"
        ],
        [
            "return page(\"Sign-in didn't finish\", 'This sign-in came back from another server than the sign-in page you ' +",
            "return page('O login não foi concluído', 'Este login voltou de um servidor diferente da página de login que você ' +"
        ],
        [
            "`agreed to, so Antigravity didn't pass it on to ${host}.`);",
            "`aceitou, por isso o Antigravity não o repassou para ${host}.`);"
        ],
        [
            "return page(\"Sign-in didn't finish\", `Antigravity on ${host} couldn't finish signing in (HTTP ${status}). ` +",
            "return page('O login não foi concluído', `O Antigravity em ${host} não conseguiu concluir o login (HTTP ${status}). ` +"
        ],
        ["'Sign in again from Antigravity.');", "'Entre novamente pelo Antigravity.');"]
    ],
    'dist/browserStream/capturePage.js': [
        ["<title>Browser Stream Capture</title>", "<title>Captura de transmissão do navegador</title>"],
        ["'Capture session failed'", "'Falha na sessão de captura'"]
    ],
    // v2.35.1: texto de explicação e rótulos da área de detalhes do diálogo de erro SSH
    'dist/remote/sshErrorText.js': [
        ["'The connection was closed before it finished.'", "'A conexão foi fechada antes de terminar.'"],
        [
            "`Windows SSH hosts aren't supported yet. ${sshArgs_1.LINUX_HOST_NEEDED}`",
            "`Hosts SSH com Windows ainda não são compatíveis. ${sshArgs_1.LINUX_HOST_NEEDED}`"
        ],
        [
            "`Error code: ${err.code}\\nLogs: ${logPath()}`",
            "`Código do erro: ${err.code}\\nLogs: ${logPath()}`"
        ],
        ["`${text}\\nLogs: ${logPath()}`", "`${text}\\nLogs: ${logPath()}`"],
        ["`${label} reported: ${text}`", "`${label} informou: ${text}`"]
    ],
    // Janela de leitura de QR code da chave de acesso
    'dist/cablev2.js': [
        // O idioma da página só muda para zh-TW no modo tradicional; aqui vira pt-BR
        ["<html lang=\"en\">", "<html lang=\"pt-BR\">"],
        ["<title>Passkeys</title>", "<title>Chaves de acesso</title>"],
        [
            "<h1 class=\"sheet-title\">Passkeys</h1>",
            "<h1 class=\"sheet-title\">Chaves de acesso</h1>"
        ],
        [
            "<p class=\"mechanism-header\">Use your phone or tablet</p>",
            "<p class=\"mechanism-header\">Use seu celular ou tablet</p>"
        ],
        [
            ">Scan this QR code with the camera on the device that has your passkey for ${safeRpId}</p>",
            ">Escaneie este QR code com a câmera do dispositivo que tem sua chave de acesso para ${safeRpId}</p>"
        ],
        [
            "onclick=\"window.close()\">Cancel</button>",
            "onclick=\"window.close()\">Cancelar</button>"
        ],
        ["title: 'Passkeys'", "title: 'Chaves de acesso'"],
        ["updateStatus('Connecting to your device…')", "updateStatus('Conectando ao seu dispositivo…')"],
        [
            "updateStatus('Verify on your device to continue…')",
            "updateStatus('Verifique no seu dispositivo para continuar…')"
        ]
    ],
    'dist/qrEncoder.js': [
        ["aria-label=\"Passkey QR code\"", "aria-label=\"QR code da chave de acesso\""]
    ],
    // Mensagens de erro da caixa de falha de conexão SSH e da página de desconexão (códigos de erro para agentes de IA e textos só de log permanecem em inglês)

    'dist/remote/sshArgs.js': [
        [
            "'Antigravity needs a Linux host on x64 or arm64 with glibc 2.26 or newer.'",
            "'O Antigravity precisa de um host Linux x64 ou arm64 com glibc 2.26 ou mais recente.'"
        ],
        [
            "`Couldn't connect to the SSH host (${String(code)}).`",
            "`Não foi possível conectar ao host SSH (${String(code)}).`"
        ],
        [
            "'SSH authentication failed. Check your password, code or keys, then try again.'",
            "'Falha na autenticação SSH. Verifique sua senha, código ou chaves e tente novamente.'"
        ],
        [
            "'SSH authentication failed. Click Reconnect to sign in again.'",
            "'Falha na autenticação SSH. Clique em \"Reconectar\" para entrar novamente.'"
        ],
        [
            "\"SSH authentication failed. Antigravity can't answer password or code prompts on Windows yet: set up key-based login with ssh-agent, then try again.\"",
            "'Falha na autenticação SSH. O Antigravity ainda não consegue responder a prompts de senha ou código no Windows: configure o login por chave com ssh-agent e tente novamente.'"
        ],
        [
            "\"That SSH host isn't valid. Enter an alias from your SSH config or a host like user@host or user@host:2222.\"",
            "'Este host SSH não é válido. Informe um alias da sua configuração SSH ou um host como user@host ou user@host:2222.'"
        ],
        [
            "\"The host's SSH key is unknown or has changed. Save it with ssh in a terminal. If it changed, ask the host's owner first: the connection may be intercepted.\"",
            "'A chave SSH do host é desconhecida ou mudou. Salve-a com ssh em um terminal. Se mudou, consulte primeiro o responsável pelo host: a conexão pode estar sendo interceptada.'"
        ],
        [
            "\"The host's SSH key has changed or isn't trusted. If it changed, ask the host's owner first: the connection may be intercepted.\"",
            "'A chave SSH do host mudou ou não é confiável. Se mudou, consulte primeiro o responsável pelo host: a conexão pode estar sendo interceptada.'"
        ],
        [
            "`Couldn't connect to the SSH host. Check its name, your network and ssh config (e.g. a ProxyCommand), and that ssh to it works in a terminal${prompts === 'no' ? ' without a prompt' : ''}.`",
            "`Não foi possível conectar ao host SSH. Verifique o nome do host, sua rede e a configuração do ssh (por exemplo, um ProxyCommand) e confirme que o ssh para ele funciona em um terminal${prompts === 'no' ? ' sem nenhum prompt' : ''}.`"
        ],
        [
            "\"SSH can't use your SSH config file. Fix the problem ssh reports, or choose another config file.\"",
            "'O SSH não consegue usar seu arquivo de configuração SSH. Corrija o problema informado pelo ssh ou escolha outro arquivo de configuração.'"
        ],
        [
            "'SSH port forwarding failed. Make sure the server allows TCP forwarding (AllowTcpForwarding) for your account, then try again.'",
            "'Falha no encaminhamento de portas SSH. Confirme que o servidor permite encaminhamento TCP (AllowTcpForwarding) para sua conta e tente novamente.'"
        ],
        [
            "`The SSH host isn't supported. ${exports.LINUX_HOST_NEEDED} Windows and macOS hosts aren't supported yet.`",
            "`Este host SSH não é compatível. ${exports.LINUX_HOST_NEEDED} Hosts Windows e macOS ainda não são compatíveis.`"
        ],
        [
            "'Another host that shares your home directory runs the Antigravity server. Connect to that host, or connect again and choose Take Over.'",
            "'Outro host que compartilha seu diretório pessoal está executando o servidor do Antigravity. Conecte-se a esse host ou conecte novamente e escolha \"Assumir\".'"
        ],
        [
            "\"Couldn't install the Antigravity server on the SSH host. Make sure it has free disk space, and that it or this computer can download from the internet.\"",
            "'Não foi possível instalar o servidor do Antigravity no host SSH. Confirme que há espaço livre em disco e que o host ou este computador consegue baixar da internet.'"
        ],
        [
            "`The Antigravity server failed to start on the SSH host. See its log in ~/${types_1.REMOTE_INSTALL_ROOT}/data on that host.`",
            "`O servidor do Antigravity falhou ao iniciar no host SSH. Veja o log em ~/${types_1.REMOTE_INSTALL_ROOT}/data nesse host.`"
        ],
        [
            "'The Antigravity server on the SSH host stopped. Reconnect to start it again.'",
            "'O servidor do Antigravity no host SSH foi interrompido. Reconecte para iniciá-lo novamente.'"
        ],
        [
            "'The SSH connection closed. Check your network connection, then reconnect.'",
            "'A conexão SSH foi encerrada. Verifique sua conexão de rede e reconecte.'"
        ],
        ["'The connection was cancelled.'", "'A conexão foi cancelada.'"],
        [
            "\"Couldn't connect to the SSH host. Try ssh to it in a terminal, and see the Antigravity log for details.\"",
            "'Não foi possível conectar ao host SSH. Tente usar o ssh para ele em um terminal e consulte o log do Antigravity para ver os detalhes.'"
        ]
    ],
    // Mensagens de progresso da tela de conexão e erros exibidos nas caixas de diálogo
    'dist/remote/sshConnection.js': [
        ["`Connecting to ${this.label}…`", "`Conectando a ${this.label}…`"],
        ["'Waiting for your answer…'", "'Aguardando sua resposta…'"],
        [
            "`Uploading the Antigravity server to ${this.label}…`",
            "`Enviando o servidor do Antigravity para ${this.label}…`"
        ],
        [
            "`Connecting to the Antigravity server on ${this.label}…`",
            "`Conectando ao servidor do Antigravity em ${this.label}…`"
        ],
        ["`Checking ${label}…`", "`Verificando ${label}…`"],
        [
            "`Waiting for another window to finish installing on ${label}…`",
            "`Aguardando outra janela terminar a instalação em ${label}…`"
        ],
        [
            "`Replacing an invalid server binary on ${label}…`",
            "`Substituindo um binário de servidor inválido em ${label}…`"
        ],
        [
            "`Downloading the Antigravity server on ${label}…`",
            "`Baixando o servidor do Antigravity em ${label}…`"
        ],
        [
            "`Installed the Antigravity server on ${label}.`",
            "`Servidor do Antigravity instalado em ${label}.`"
        ],
        [
            "`Starting the Antigravity server on ${label}…`",
            "`Iniciando o servidor do Antigravity em ${label}…`"
        ],
        [
            "`Connecting to the running server on ${label}…`",
            "`Conectando ao servidor em execução em ${label}…`"
        ],
        [
            "`Restarting the Antigravity server on ${label}…`",
            "`Reiniciando o servidor do Antigravity em ${label}…`"
        ],
        [
            "`Checking whether another host still runs your Antigravity server…`",
            "`Verificando se outro host ainda executa seu servidor do Antigravity…`"
        ],
        [
            "`Moving the Antigravity server to ${label}…`",
            "`Movendo o servidor do Antigravity para ${label}…`"
        ],
        ["`Timed out connecting to ${this.label}.`", "`Tempo esgotado ao conectar a ${this.label}.`"],
        ["'Connection cancelled.'", "'Conexão cancelada.'"],
        ["'Not connected.'", "'Não conectado.'"],
        [
            "exports.PROMPT_CANCELLED = 'Sign-in cancelled.';",
            "exports.PROMPT_CANCELLED = 'Login cancelado.';"
        ],
        [
            "`The Antigravity server on ${this.label} has no HTTP port to stop it through.`",
            "`O servidor do Antigravity em ${this.label} não tem porta HTTP para ser parado.`"
        ],
        [
            "`The Antigravity server on ${this.label} refused to stop (HTTP ${status}).`",
            "`O servidor do Antigravity em ${this.label} recusou-se a parar (HTTP ${status}).`"
        ],
        [
            "`Could not confirm that the Antigravity server on ${this.label} stopped` +",
            "`Não foi possível confirmar que o servidor do Antigravity em ${this.label} foi parado` +"
        ],
        [
            "(rpcError ? ` (${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}).` : '.')",
            "(rpcError ? ` (${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}).` : '.')"
        ],
        ["why = 'it has no HTTP port';", "why = 'ele não tem porta HTTP';"],
        ["why = 'an invalid answer';", "why = 'resposta inválida';"],
        [
            "`The Antigravity server on ${this.label} didn't give this window a sign-in token (${why}).`",
            "`O servidor do Antigravity em ${this.label} não deu um token de login a esta janela (${why}).`"
        ],
        [
            "`${this.label} did not start the setup within ${Math.round(firstLineMs / 1000)} s. ` +",
            "`${this.label} não iniciou a configuração em ${Math.round(firstLineMs / 1000)} s. ` +"
        ],
        [
            "'ssh (e.g. a ProxyCommand or ProxyJump login) or a command in ' +",
            "'O ssh (por exemplo, um login com ProxyCommand ou ProxyJump) ou um comando em ' +"
        ],
        [
            "'your shell startup files (e.g. ~/.bashrc) may be waiting for input.'",
            "'seus arquivos de inicialização do shell (por exemplo, ~/.bashrc) pode estar aguardando entrada.'"
        ],
        ["\"Couldn't answer ssh's prompt.\"", "'Não foi possível responder ao prompt do ssh.'"],
        [
            "`Could not run \"${sshBin}\". Install OpenSSH or set ANTIGRAVITY_SSH_BIN.`",
            "`Não foi possível executar \"${sshBin}\". Instale o OpenSSH ou defina ANTIGRAVITY_SSH_BIN.`"
        ],
        ["`Could not run ssh: ${err.message}`", "`Não foi possível executar o ssh: ${err.message}`"],
        [
            "`ssh could not listen on its SOCKS port ${this.socksPort}.`",
            "`O ssh não conseguiu escutar na porta SOCKS ${this.socksPort}.`"
        ],
        [
            "`${this.label} asked for an upload it can't need.`",
            "`${this.label} solicitou um envio que não deveria ser necessário.`"
        ],
        [
            "`${this.label} sent a line longer than ${MAX_LINE_CHARS} characters.`",
            "`${this.label} enviou uma linha com mais de ${MAX_LINE_CHARS} caracteres.`"
        ],
        [
            "`Neither ${this.label} nor this computer could download the Antigravity server: ${errorMessage(err)}`",
            "`Nem ${this.label} nem este computador conseguiram baixar o servidor do Antigravity: ${errorMessage(err)}`"
        ],
        [
            "`The Antigravity server on ${this.label} stopped.`",
            "`O servidor do Antigravity em ${this.label} parou.`"
        ],
        [
            "`The connection to ${this.label} was lost: ${describeExit(code, signal, this.stderrTail)}`",
            "`A conexão com ${this.label} foi perdida: ${describeExit(code, signal, this.stderrTail)}`"
        ],
        [
            "'The SSH server does not allow port forwarding (AllowTcpForwarding).'",
            "'O servidor SSH não permite encaminhamento de portas (AllowTcpForwarding).'"
        ],
        [
            "`The Antigravity server on ${this.label} did not respond through the SSH tunnel (${(0, types_1.sanitizeRemoteText)(lastErr, 200)}).`",
            "`O servidor do Antigravity em ${this.label} não respondeu pelo túnel SSH (${(0, types_1.sanitizeRemoteText)(lastErr, 200)}).`"
        ],
        [
            "`${this.label} asked to open a sign-in at ${origin} that can't finish on that host, so it was not opened.`",
            "`${this.label} pediu para abrir um login em ${origin} que não pode ser concluído nesse host, por isso ele não foi aberto.`"
        ],
        [
            "`The sign-in request of the Antigravity server on ${this.label} doesn't match what this app expects, so it was not opened. ` +",
            "`A solicitação de login do servidor do Antigravity em ${this.label} não corresponde ao que este app espera, por isso não foi aberta. ` +"
        ],
        [
            "'Update Antigravity, or restart the server on that host.'",
            "'Atualize o Antigravity ou reinicie o servidor nesse host.'"
        ],
        [
            "`Local port ${port} is in use, so the sign-in callback can't ` +",
            "`A porta local ${port} está em uso, então o callback de login não consegue ` +"
        ],
        [
            "`reach ${this.label}. Close the program using it and sign in again. ` +",
            "`alcançar ${this.label}. Feche o programa que a usa e entre novamente. ` +"
        ],
        ["'The connection was closed.'", "'A conexão foi fechada.'"],
        ["'Could not get a free loopback port.'", "'Não foi possível obter uma porta de loopback livre.'"],
        [
            "const how = signal ? `signal ${signal}` : `exit code ${code}`;",
            "const how = signal ? `sinal ${signal}` : `código de saída ${code}`;"
        ],
        [
            "? `ssh exited (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`",
            "? `ssh encerrou (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`"
        ],
        [": `ssh exited (${how}).`", ": `ssh encerrou (${how}).`"]
    ],
    // Validação de formato do campo de host SSH
    'dist/remote/sshDestination.js': [
        ["'The user name before \"@\" is missing.'", "'Falta o nome de usuário antes de \"@\".'"],
        ["'The user name must not start with \"-\".'", "'O nome de usuário não pode começar com \"-\".'"],
        ["`\"${shown}\" isn't a valid user name.`", "`\"${shown}\" não é um nome de usuário válido.`"],
        ["'The host name is missing.'", "'Falta o nome do host.'"],
        ["'The host name must not start with \"-\".'", "'O nome do host não pode começar com \"-\".'"],
        ["`\"${host}\" isn't a valid host name.`", "`\"${host}\" não é um nome de host válido.`"],
        [
            "`Invalid port \"${port}\": use a number from 1 to 65535.`",
            "`Porta \"${port}\" inválida: use um número de 1 a 65535.`"
        ],
        [
            "`\"${addr}\" isn't a valid IPv6 address. Write an IPv6 address with a port in brackets, for example [::1]:2222.`",
            "`\"${addr}\" não é um endereço IPv6 válido. Escreva o endereço IPv6 com porta entre colchetes, por exemplo [::1]:2222.`"
        ],
        [
            "`Missing \"]\" after the IPv6 address in \"${hostPort}\".`",
            "`Falta \"]\" depois do endereço IPv6 em \"${hostPort}\".`"
        ],
        [
            "`Invalid percent-encoding in the user name \"${s}\".`",
            "`Codificação percentual inválida no nome de usuário \"${s}\".`"
        ],
        [
            "'Write \"@\" inside the user name of an ssh:// URI as %40.'",
            "'Em uma URI ssh://, escreva \"@\" dentro do nome de usuário como %40.'"
        ],
        [
            "'Write an IPv6 address in an ssh:// URI in brackets, for example ssh://[::1]:2222.'",
            "'Em uma URI ssh://, escreva o endereço IPv6 entre colchetes, por exemplo ssh://[::1]:2222.'"
        ],
        [
            "'Enter an SSH host, for example \"devbox\" or \"user@host:2222\".'",
            "'Informe um host SSH, por exemplo \"devbox\" ou \"user@host:2222\".'"
        ],
        [
            "`The SSH host is too long (at most ${MAX_DESTINATION_LENGTH} characters).`",
            "`O host SSH é longo demais (no máximo ${MAX_DESTINATION_LENGTH} caracteres).`"
        ],
        ["'The SSH host must not start with \"-\".'", "'O host SSH não pode começar com \"-\".'"],
        [
            "'The SSH host must not contain spaces or control characters.'",
            "'O host SSH não pode conter espaços nem caracteres de controle.'"
        ],
        [
            "`The SSH host must not contain ${describeChar(bad[0])}.`",
            "`O host SSH não pode conter ${describeChar(bad[0])}.`"
        ]
    ],
    // Resultado da verificação do arquivo de configuração SSH (frases reordenadas para o português)
    'dist/remote/sshConfigHosts.js': [
        ["`The SSH config file ${problem}`", "`O arquivo de configuração do SSH ${problem}`"],
        ["`${shown} isn't a file.`", "`${shown} não é um arquivo.`"],
        [
            "`${shown} can be changed by others: it must be yours or root's, and not group- or world-writable.`",
            "`${shown} pode ser alterado por outras pessoas: ele deve pertencer a você ou ao root e não pode permitir gravação para o grupo ou para todos.`"
        ],
        [
            "const NOT_CONFIG = \"isn't an SSH config file\";",
            "const NOT_CONFIG = 'não é um arquivo de configuração do SSH';"
        ],
        [
            "const CHOOSE_CONFIG = 'Choose a file of ssh settings, such as ~/.ssh/config.';",
            "const CHOOSE_CONFIG = 'Escolha um arquivo de configurações do ssh, como ~/.ssh/config.';"
        ],
        [
            "const UNREADABLE = \"is saved in a way ssh can't read\";",
            "const UNREADABLE = 'foi salvo em um formato que o ssh não consegue ler';"
        ],
        [
            "const SAVE_AS_UTF8 = 'Save it as UTF-8 without a byte-order mark.';",
            "const SAVE_AS_UTF8 = 'Salve-o como UTF-8 sem marca de ordem de bytes (BOM).';"
        ],
        ["notConfig(\"it's a binary file\")", "notConfig('é um arquivo binário')"],
        ["notConfig('it holds a key or certificate')", "notConfig('contém uma chave ou um certificado')"],
        [
            "notConfig('it holds SSH public keys, like a .pub or authorized_keys file')",
            "notConfig('contém chaves públicas SSH, como um arquivo .pub ou authorized_keys')"
        ],
        [
            "notConfig('it lists SSH host keys, like known_hosts')",
            "notConfig('lista chaves de host SSH, como o known_hosts')"
        ],
        ["why: 'it starts with a byte-order mark',", "why: 'começa com uma marca de ordem de bytes (BOM)',"],
        ["why: \"it's saved as UTF-16\",", "why: 'foi salvo em UTF-16',"],
        [
            "return `${file} ${what}: ${why}. ${fix}`;",
            "return `${file} ${what}: ${why}. ${fix}`;"
        ],
        ["invalid('must be a path on one line.')", "invalid('deve ser um caminho em uma única linha.')"],
        ["`must be an absolute path (got ${shown}).`", "`deve ser um caminho absoluto (recebido: ${shown}).`"],
        [
            "`must be on one of this computer's drives (got ${shown}).`",
            "`deve estar em uma das unidades deste computador (recebido: ${shown}).`"
        ],
        ["`can't be on a network share (${shown}).`", "`não pode estar em um compartilhamento de rede (${shown}).`"],
        ["`${shown} doesn't exist or can't be read.`", "`${shown} não existe ou não pode ser lido.`"],
        [
            "`${shown} is now a link: choose the file again.`",
            "`${shown} agora é um link: escolha o arquivo novamente.`"
        ],
        ["`${shown} is over 4 MiB.`", "`${shown} tem mais de 4 MiB.`"]
    ],
    // Verificação do host e do caminho do arquivo de configuração antes de conectar
    'dist/remote/sshBridge.js': [
        [
            "'The SSH config file must be a path of at most 4 KiB.'",
            "'O arquivo de configuração do SSH deve ser um caminho de no máximo 4 KiB.'"
        ],
        [
            "'Enter an SSH host, for example \"devbox\" or \"user@host\".'",
            "'Informe um host SSH, por exemplo \"devbox\" ou \"user@host\".'"
        ]
    ],
    // Windows: avisos ao abrir pastas no WSL
    'dist/wsl.js': [
        [
            "`This folder belongs to the WSL distro \"${unc[1]}\", but this window is connected to \"${distro}\".`",
            "`Esta pasta pertence à distribuição WSL \"${unc[1]}\", mas esta janela está conectada a \"${distro}\".`"
        ],
        [
            "'This folder is on the Windows filesystem. Accessing it from WSL (via /mnt) can be slow — for best performance keep projects inside the WSL filesystem.'",
            "'Esta pasta está no sistema de arquivos do Windows. Acessá-la pelo WSL (via /mnt) pode ser lento; para melhor desempenho, mantenha os projetos dentro do sistema de arquivos do WSL.'"
        ],
        [
            "`This location cannot be opened in WSL: ${winPath}`",
            "`Não é possível abrir este local no WSL: ${winPath}`"
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
        console.log(`[modificação] Tradução de diálogos e interface nativos injetada em ${relPath} (${hitCount} ${hitCount === 1 ? 'ocorrência' : 'ocorrências'})`);
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
