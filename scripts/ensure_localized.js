/**
 * ensure_localized.js - Autoverificação da tradução antes de iniciar (Windows)
 *
 * Contexto: o Antigravity usa electron-updater com autoDownload=true e autoInstallOnAppQuit=true;
 * ao sair do aplicativo, uma atualização baixada pode ser instalada silenciosamente e substituir
 * resources\app.asar por inteiro, removendo a tradução.
 *
 * Uso:
 *   node scripts/ensure_localized.js                 # Apenas verifica e informa o status
 *   node scripts/ensure_localized.js --fix           # Reaplica a tradução se estiver ausente/desatualizada e o app estiver fechado
 *   node scripts/ensure_localized.js --fix --launch  # Repara automaticamente e inicia o Antigravity
 * Aceita --brand-title <mode> e --install-dir <dir> (não aceita --huifu).
 * Códigos de saída: 0 = traduzido (ou reparado); 2 = não traduzido/desatualizado e não reparado; 1 = erro ou falha no reparo.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');
const { readAsarLayout } = require('../src/asar_patcher');

const ROOT = path.resolve(__dirname, '..');
const SIGNATURE_START = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const SIGNATURE_END = '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';

const BRAND_TITLE_ALIASES = {
    english: 'english',
    en: 'english',
    default: 'english',
    hidden: 'hidden',
    hide: 'hidden',
    none: 'hidden',
    translated: 'translated',
    pt: 'translated',
    'pt-br': 'translated',
    ptbr: 'translated'
};

function createLogger() {
    return {
        log: (...args) => console.log(...args),
        error: (...args) => console.error(...args)
    };
}

function parseArgs(argv) {
    let fix = false;
    let launchApp = false;
    let installDir = null;
    let brandTitle = null;
    const passthrough = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--fix') {
            fix = true;
        } else if (arg === '--launch') {
            launchApp = true;
        } else if (arg === '--huifu') {
            throw new Error('ensure_localized.js não aceita o parâmetro --huifu; para desinstalar e restaurar o original em inglês, execute localization_engine.js --huifu.');
        } else if (arg === '--install-dir') {
            if (i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('--')) {
                throw new Error('--install-dir exige um caminho válido!');
            }
            installDir = argv[++i];
        } else if (arg.startsWith('--install-dir=')) {
            installDir = arg.slice('--install-dir='.length);
            if (!installDir) {
                throw new Error('O caminho de --install-dir= não pode ficar vazio!');
            }
        } else if (arg === '--brand-title') {
            if (i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('--')) {
                throw new Error('--brand-title exige um valor válido (aceitos: english / hidden / translated)!');
            }
            brandTitle = argv[++i];
        } else if (arg.startsWith('--brand-title=')) {
            brandTitle = arg.slice('--brand-title='.length);
            if (!brandTitle) {
                throw new Error('O valor de --brand-title= não pode ficar vazio!');
            }
        } else {
            passthrough.push(arg);
        }
    }

    if (brandTitle !== null) {
        const normalizedBrand = BRAND_TITLE_ALIASES[brandTitle.toLowerCase()];
        if (!normalizedBrand) {
            throw new Error(`Valor não reconhecido para --brand-title: "${brandTitle}" (aceitos: english / hidden / translated).`);
        }
        brandTitle = normalizedBrand;
    }

    return { fix, launch: launchApp, installDir, brandTitle, passthrough };
}

function normalizeInstallDir(rawDir) {
    if (!rawDir) return null;
    let resolved = path.resolve(rawDir);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && /app\.asar$/i.test(resolved)) {
        resolved = path.dirname(resolved);
    }
    if (/[\\/]resources$/i.test(resolved) && fs.existsSync(path.join(resolved, 'app.asar'))) {
        resolved = path.dirname(resolved);
    }
    return resolved;
}

function hasResources(dir) {
    return !!dir && fs.existsSync(path.join(dir, 'resources', 'app.asar'));
}

function cleanRegistryIconPath(rawValue) {
    let v = String(rawValue || '').trim();
    v = v.replace(/,\s*-?\d+\s*$/, '').trim();
    v = v.replace(/^"|"$/g, '').trim();
    if (/\.exe$/i.test(v)) {
        v = path.dirname(v);
    }
    return v;
}

function detectInstallDir(manualDir, execFileSyncFn = child_process.execFileSync) {
    if (manualDir) {
        const normalized = normalizeInstallDir(manualDir);
        if (!normalized || !hasResources(normalized)) {
            throw new Error(`Diretório de instalação informado manualmente é inválido ou não contém resources\\app.asar: ${manualDir}`);
        }
        return normalized;
    }

    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidate) => {
        if (!candidate) return;
        const normalized = normalizeInstallDir(candidate);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            candidates.push(normalized);
        }
    };

    addCandidate(process.env.ANTIGRAVITY_INSTALL_DIR);
    addCandidate(process.env.ANTIGRAVITY_HOME);

    for (const root of [
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ]) {
        try {
            const out = execFileSyncFn(
                'cmd',
                ['/d', '/u', '/c', `reg query "${root}" /s /f Antigravity /d`],
                { encoding: 'utf16le', stdio: 'pipe', timeout: 5000 }
            );
            for (const line of String(out || '').split(/\r?\n/)) {
                const m = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
                if (!m) continue;
                addCandidate(cleanRegistryIconPath(m[2]));
            }
        } catch (e) { /* A chave do Registro pode não existir ou não ter permissão; seguir para os próximos caminhos */ }
    }

    for (const drive of ['C', 'D', 'E', 'F']) {
        addCandidate(`${drive}:\\Programs\\Antigravity`);
        addCandidate(`${drive}:\\Antigravity`);
    }
    if (process.env.ProgramFiles) addCandidate(path.join(process.env.ProgramFiles, 'Antigravity'));
    if (process.env['ProgramFiles(x86)']) addCandidate(path.join(process.env['ProgramFiles(x86)'], 'Antigravity'));
    addCandidate('C:\\Program Files\\Antigravity');
    if (process.env.LOCALAPPDATA) addCandidate(path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity'));

    return candidates.find(hasResources) || null;
}

function queryTasklistHasAntigravity(execFileSyncFn) {
    try {
        const out = execFileSyncFn(
            'tasklist',
            ['/fi', 'imagename eq Antigravity.exe', '/nh'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }
        );
        return String(out || '').toLowerCase().includes('antigravity.exe');
    } catch (e) {
        throw new Error(`Não foi possível verificar o status do Antigravity.exe via tasklist: ${e.message}`);
    }
}

function isRunning(installDir, execFileSyncFn = child_process.execFileSync) {
    if (!queryTasklistHasAntigravity(execFileSyncFn)) {
        return false;
    }

    let psOut;
    try {
        psOut = execFileSyncFn(
            'powershell',
            [
                '-NoProfile',
                '-Command',
                "Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\" | ForEach-Object { if ($_.ExecutablePath) { $_.ExecutablePath } else { '__EMPTY_PATH__' } }"
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 8000 }
        );
    } catch (e) {
        throw new Error(`Antigravity.exe está em execução, mas não foi possível consultar o caminho do processo; operação cancelada para evitar corromper arquivos: ${e.message}`);
    }

    const lines = String(psOut || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.includes('__EMPTY_PATH__')) {
        throw new Error('Antigravity.exe está em execução, mas não foi possível ler o caminho do executável (pode estar rodando como administrador). Feche o Antigravity completamente e tente novamente.');
    }
    if (lines.length === 0) {
        if (queryTasklistHasAntigravity(execFileSyncFn)) {
            throw new Error('Antigravity.exe está em execução, mas nenhum caminho de processo foi obtido. Feche o Antigravity completamente e tente novamente.');
        }
        return false;
    }

    const target = path.resolve(installDir).toLowerCase();
    return lines.some(p => path.dirname(path.resolve(p)).toLowerCase() === target);
}

function isLocalized(asarPath) {
    return fs.readFileSync(asarPath).indexOf(Buffer.from(SIGNATURE_START, 'utf8')) !== -1;
}

function getPrefsFilePath() {
    const baseDir = process.platform === 'win32'
        ? (process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
        : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
    return path.join(baseDir, 'Antigravity', 'localization-prefs.json');
}

function loadLocalizationPref(installDir) {
    try {
        const prefsPath = getPrefsFilePath();
        if (!fs.existsSync(prefsPath)) return null;
        const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const entry = raw[path.resolve(installDir).toLowerCase()];
        return entry && typeof entry === 'object' ? entry : null;
    } catch (e) {
        return null;
    }
}

function saveLocalizationPref(installDir, pref) {
    try {
        const prefsPath = getPrefsFilePath();
        let data = {};
        if (fs.existsSync(prefsPath)) {
            const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                data = raw;
            }
        }
        data[path.resolve(installDir).toLowerCase()] = {
            brandTitle: String(pref.brandTitle || 'english'),
            updatedAt: new Date().toISOString()
        };
        fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
        fs.writeFileSync(prefsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.warn(`[Aviso] Falha ao salvar preferências de tradução: ${e.message}`);
    }
}

function detectAsarLocalizationPrefs(asarPath) {
    try {
        const layout = readAsarLayout(asarPath);
        const preload = layout.files.get('dist/preload.js');
        if (!preload || !preload.body) return null;
        const text = preload.body.toString('utf8');
        const idx = text.indexOf(SIGNATURE_START);
        if (idx === -1) return null;
        const injected = text.slice(idx);

        let brandTitle = 'english';
        const dictMatch = injected.match(/new Map\(Object\.entries\((\{[\s\S]*?\})\)\);/);
        if (dictMatch) {
            const dict = JSON.parse(dictMatch[1]);
            if (Object.prototype.hasOwnProperty.call(dict, 'Antigravity')) {
                brandTitle = dict.Antigravity === '' ? 'hidden' : 'translated';
            }
        }
        return {
            brandTitle
        };
    } catch (e) {
        return null;
    }
}

function resolveEffectivePrefs({ parsed, installDir, asarPath, localized }) {
    const saved = loadLocalizationPref(installDir);
    const detected = localized ? detectAsarLocalizationPrefs(asarPath) : null;

    let inherited = false;
    let brandTitle = 'english';
    if (parsed.brandTitle !== null) {
        brandTitle = parsed.brandTitle;
    } else if (saved && saved.brandTitle) {
        brandTitle = saved.brandTitle;
        inherited = true;
    } else if (detected && detected.brandTitle) {
        brandTitle = detected.brandTitle;
        inherited = true;
    }

    return {
        brandTitle,
        inherited
    };
}

function pendingUpdate() {
    const dir = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'antigravity-updater', 'pending');
    return dir && fs.existsSync(dir) && fs.readdirSync(dir).some(f => /\.exe$/i.test(f)) ? dir : null;
}

function launch(installDir, logger = createLogger(false), spawnFn = child_process.spawn) {
    const exe = path.join(installDir, 'Antigravity.exe');
    if (!fs.existsSync(exe)) {
        logger.error(`[Erro] Não encontrado: ${exe}`);
        return false;
    }
    const child = spawnFn(exe, [], { detached: true, stdio: 'ignore', cwd: installDir });
    if (child && typeof child.unref === 'function') child.unref();
    logger.log('[Iniciar] Antigravity iniciado.');
    return true;
}

function main(argv = process.argv.slice(2), deps = {}) {
    const platform = deps.platform || process.platform;
    const execFileSyncFn = deps.execFileSync || child_process.execFileSync;
    const spawnSyncFn = deps.spawnSync || child_process.spawnSync;
    const spawnFn = deps.spawn || child_process.spawn;

    let parsed;
    try {
        parsed = parseArgs(argv);
    } catch (e) {
        createLogger().error(`[Erro] ${e.message}`);
        return 1;
    }

    const earlyLogger = createLogger();
    if (platform !== 'win32') {
        earlyLogger.log('[Aviso] O inicializador de autoverificação só oferece suporte ao Windows no momento; no macOS, execute novamente Instalar-pt-BR.command após atualizar.');
        return 1;
    }

    let installDir;
    try {
        installDir = detectInstallDir(parsed.installDir, execFileSyncFn);
    } catch (e) {
        earlyLogger.error(`[Erro] ${e.message}`);
        return 1;
    }
    if (!installDir) {
        earlyLogger.error('[Erro] Diretório de instalação do Antigravity não encontrado; use --install-dir para especificar.');
        return 1;
    }

    const asarPath = path.join(installDir, 'resources', 'app.asar');
    let localized = isLocalized(asarPath);
    const prefs = resolveEffectivePrefs({ parsed, installDir, asarPath, localized });
    let upToDate = localized && isLocalizationCurrent(asarPath, prefs);
    const logger = createLogger();

    if (prefs.inherited) {
        logger.log(`[Preferência] Mantendo configuração de tradução salva: brand-title=${prefs.brandTitle}`);
    }
    if (localized || parsed.brandTitle !== null) {
        saveLocalizationPref(installDir, prefs);
    }

    let running;
    try {
        running = isRunning(installDir, execFileSyncFn);
    } catch (e) {
        logger.error(`[Erro] ${e.message}`);
        return 1;
    }

    const pending = pendingUpdate();
    const statusText = !localized
        ? 'Não traduzido (pode ter sido sobrescrito pela atualização automática oficial)'
        : (upToDate ? 'Traduzido' : 'Traduzido (dicionário ou motor local atualizado; sincronização necessária)');
    logger.log(`[Verificação] Diretório de instalação: ${installDir}`);
    logger.log(`[Verificação] Status da tradução: ${statusText}`);
    logger.log(`[Verificação] Status de execução: ${running ? 'Em execução' : 'Parado'}`);
    if (pending) {
        logger.log(`[Aviso] Pacote de atualização oficial baixado detectado: ${pending}`);
        logger.log('        Ao sair do Antigravity, ele será instalado silenciosamente e sobrescreverá a tradução; na próxima abertura por este inicializador, o reparo será automático.');
    }

    let fixFailed = false;
    if ((!localized || !upToDate) && parsed.fix) {
        if (running) {
            logger.log('[Ignorado] O Antigravity está em execução; o reparo automático foi ignorado para não encerrar sua sessão à força. Feche o aplicativo completamente e execute novamente.');
        } else {
            const engineArgs = [
                '--brand-title',
                prefs.brandTitle,
                '--no-kill',
                '--install-dir',
                installDir
            ];
            for (const extra of parsed.passthrough) {
                if (extra !== '--no-kill') engineArgs.push(extra);
            }
            logger.log(`[Reparo] Reaplicando a tradução: node localization_engine.js ${engineArgs.join(' ')}`);
            const res = spawnSyncFn(
                process.execPath,
                [path.join(ROOT, 'localization_engine.js'), ...engineArgs],
                { stdio: 'inherit', cwd: ROOT }
            );
            localized = res.status === 0 && isLocalized(asarPath);
            upToDate = localized && isLocalizationCurrent(asarPath, prefs);
            if (localized) {
                saveLocalizationPref(installDir, prefs);
                logger.log('[OK] Tradução restaurada.');
            } else {
                fixFailed = true;
                logger.error(`[ERRO] Falha ao reaplicar a tradução (código de saída ${res.status ?? 1}); inicialização cancelada. Verifique as mensagens acima.`);
                return 1;
            }
        }
    }

    if (parsed.launch) {
        if (running) {
            logger.log('[Aviso] O Antigravity já está em execução; não foi iniciado novamente.');
        } else if (!localized || fixFailed) {
            logger.error('[ERRO] O cliente não está traduzido no momento; inicialização cancelada (use --fix para reparar automaticamente antes de iniciar).');
            return 2;
        } else if (!launch(installDir, logger, spawnFn)) {
            return 1;
        }
    }

    return (localized && (upToDate || (!parsed.fix && parsed.launch))) ? 0 : 2;
}

function buildExpectedInjectedBlock(prefs) {
    const { generateJs } = require('../localization_engine');
    return generateJs({
        brandTitle: String((prefs && prefs.brandTitle) || 'english')
    });
}

function isLocalizationCurrent(asarPath, prefs) {
    try {
        const layout = readAsarLayout(asarPath);
        const preload = layout.files.get('dist/preload.js');
        if (!preload || !preload.body) return false;
        const text = preload.body.toString('utf8');
        const startIdx = text.indexOf(SIGNATURE_START);
        if (startIdx === -1) return false;
        const endIdx = text.indexOf(SIGNATURE_END, startIdx);
        if (endIdx === -1) {
            return !text.slice(startIdx).includes('__agCnRuntimeStart');
        }
        const actualBlock = text.slice(startIdx, endIdx + SIGNATURE_END.length);
        return actualBlock === buildExpectedInjectedBlock(prefs);
    } catch (e) {
        return false;
    }
}

if (require.main === module) {
    try {
        process.exitCode = main();
    } catch (e) {
        console.error('[Erro]', e.message);
        process.exitCode = 1;
    }
}

module.exports = {
    parseArgs,
    normalizeInstallDir,
    cleanRegistryIconPath,
    detectInstallDir,
    isRunning,
    isLocalized,
    buildExpectedInjectedBlock,
    isLocalizationCurrent,
    getPrefsFilePath,
    loadLocalizationPref,
    saveLocalizationPref,
    detectAsarLocalizationPrefs,
    resolveEffectivePrefs,
    launch,
    main
};
