const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const childProcess = require('node:child_process');
const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('../src/asar_patcher');
const { patchPreloadJs, patchUtilsJs, patchMenuJs, patchTrayJs, patchLoadingOverlayJs, patchMainProcessModule } = require('../src/main_patches');
const { loadEngine } = require('./helpers/runtime-loader.cjs');

const signature = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const signatureEnd = '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';

function writeArchive(destination, entries, unpackDirs = []) {
    const header = { files: {} };
    const bodies = [];
    let offset = 0;
    for (const [relative, value] of Object.entries(entries)) {
        const parts = relative.split('/');
        let node = header;
        let current = '';
        for (const part of parts.slice(0, -1)) {
            current = current ? `${current}/${part}` : part;
            node.files[part] ||= { files: {} };
            node = node.files[part];
            if (unpackDirs.includes(current)) node.unpacked = true;
        }
        const body = Buffer.from(value.body);
        const entry = { size: body.length };
        if (value.unpacked) {
            entry.unpacked = true;
        } else {
            entry.offset = String(offset);
            offset += body.length;
            bodies.push(body);
        }
        node.files[parts.at(-1)] = entry;
    }
    const json = Buffer.from(JSON.stringify(header));
    const payloadSize = Math.ceil((json.length + 4) / 4) * 4;
    const prefix = Buffer.alloc(12 + payloadSize);
    prefix.writeUInt32LE(4, 0);
    prefix.writeUInt32LE(payloadSize + 4, 4);
    prefix.writeUInt32LE(payloadSize, 8);
    prefix.writeUInt32LE(json.length, 12);
    json.copy(prefix, 16);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, Buffer.concat([prefix, ...bodies]));
}

test('patchAsarArchive updates target files in-place and preserves unpacked layout', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-asar-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'package.json': { body: '{"version":"2.30.0"}' },
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: true },
    }, ['node_modules/mcp']);

    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => `${orig}\n${signature}`],
    ]));

    validateAsarCandidate(src, dst, signature);
    const layout = readAsarLayout(dst);
    assert.equal(layout.files.get('node_modules/mcp/index.js').unpacked, true);
    assert.equal(layout.files.get('package.json').body.toString('utf8'), '{"version":"2.30.0"}');
});

test('validateAsarCandidate rejects tampered non-target files or lost unpacked flags', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-asar-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const badUnpacked = path.join(root, 'bad-unpacked.asar');
    const baseEntries = {
        'dist/preload.js': { body: `// original\n${signature}` },
        'package.json': { body: '{"version":"2.30.0"}' },
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: true },
    };
    writeArchive(src, baseEntries, ['node_modules/mcp']);
    writeArchive(badUnpacked, {
        ...baseEntries,
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: false },
    });

    assert.throws(() => validateAsarCandidate(src, badUnpacked, signature), /ASAR layout changed/);
});

test('patchUtilsJs injects localization only into verified sidecar-iframe child frames', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-sidecar-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'dist/utils.js': { body: "const path_1 = { default: require('path') };\nconst fs = require('fs');\nconst electron_1 = require('electron');\nfunction configureWindow(win, hubContents, guardExternalNavigation) {\n    hubContents.on('will-navigate', guardExternalNavigation);\n}\nmodule.exports = { configureWindow };" },
        'package.json': { body: '{"version":"2.31.0"}' },
    });

    const translationJs = `${signature}\nwindow.__localizedSidecar = true;\n${signatureEnd}`;
    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => patchPreloadJs(orig, translationJs, signature, signatureEnd)],
        ['dist/utils.js', orig => patchUtilsJs(orig, signature, signatureEnd)],
    ]));
    validateAsarCandidate(src, dst, signature);

    const layout = readAsarLayout(dst);
    const patchedPreload = layout.files.get('dist/preload.js').body.toString('utf8');
    const patchedUtils = layout.files.get('dist/utils.js').body.toString('utf8');
    new vm.Script(patchedUtils);

    const distDir = path.join(root, 'dist-sim');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'preload.js'), patchedPreload, 'utf8');

    const hubListeners = new Map();
    const winListeners = new Map();
    const injectedScripts = [];
    const mainFrame = {
        url: 'https://127.0.0.1:51000/index.html',
        origin: 'https://127.0.0.1:51000',
        isDestroyed: () => false,
        executeJavaScript(expr) {
            const ChromeURL = class extends URL {
                get origin() {
                    return this.protocol === 'plugin:' ? `plugin://${this.hostname}` : super.origin;
                }
            };
            const evalDom = vm.createContext({
                URL: ChromeURL,
                location: { href: 'https://127.0.0.1:51000/index.html', origin: 'https://127.0.0.1:51000' },
                document: {
                    querySelectorAll(sel) {
                        assert.equal(sel, 'iframe[data-testid="sidecar-iframe"]');
                        return [
                            { getAttribute: name => (name === 'src' ? 'http://127.0.0.1:52123/index.html?conversationId=abc' : null) },
                            { getAttribute: name => (name === 'src' ? 'plugin://swarm-auth/?conversationId=abc' : null) },
                        ];
                    },
                },
            });
            return Promise.resolve(vm.runInContext(expr, evalDom));
        },
    };
    const hubContents = {
        mainFrame,
        isDestroyed: () => false,
        on(ev, fn) { hubListeners.set(ev, [...(hubListeners.get(ev) || []), fn]); },
        off(ev, fn) { hubListeners.set(ev, (hubListeners.get(ev) || []).filter(f => f !== fn)); },
    };
    const win = {
        isDestroyed: () => false,
        on(ev, fn) { winListeners.set(ev, [...(winListeners.get(ev) || []), fn]); },
    };

    const utilsMod = { exports: {} };
    vm.runInNewContext(patchedUtils, {
        module: utilsMod,
        exports: utilsMod.exports,
        __dirname: distDir,
        globalThis: {},
        URL,
        Promise,
        require(name) {
            if (name === 'path') return path;
            if (name === 'fs') return fs;
            if (name === 'electron') return { webFrameMain: { fromId: () => null } };
            throw new Error(`Unexpected module in utils.js: ${name}`);
        },
    });
    utilsMod.exports.configureWindow(win, hubContents, () => {});

    const finishLoadHandlers = hubListeners.get('did-frame-finish-load') || [];
    assert.equal(finishLoadHandlers.length, 1);

    const makeFrame = ({ url, origin, parent = mainFrame }) => ({
        url,
        origin,
        parent,
        isDestroyed: () => false,
        executeJavaScript(code) {
            injectedScripts.push({ url, code });
            return Promise.resolve();
        },
    });

    const browserFrame = makeFrame({ url: 'http://localhost:3000/app', origin: 'http://localhost:3000' });
    const sidecarFrame = makeFrame({ url: 'http://127.0.0.1:52123/index.html?conversationId=abc', origin: 'http://127.0.0.1:52123' });
    const pluginSidecarFrame = makeFrame({ url: 'plugin://swarm-auth/?conversationId=abc', origin: 'plugin://swarm-auth' });
    const unknownPluginFrame = makeFrame({ url: 'plugin://other-auth/', origin: 'plugin://other-auth' });
    const nestedSrcdoc = makeFrame({ url: 'about:srcdoc', origin: 'null', parent: sidecarFrame });

    finishLoadHandlers[0]({ frame: mainFrame }, true, 1, 1);
    finishLoadHandlers[0]({ frame: browserFrame }, false, 1, 2);
    finishLoadHandlers[0]({ frame: nestedSrcdoc }, false, 1, 3);
    finishLoadHandlers[0]({ frame: sidecarFrame }, false, 1, 4);
    finishLoadHandlers[0]({ frame: pluginSidecarFrame }, false, 1, 5);
    finishLoadHandlers[0]({ frame: unknownPluginFrame }, false, 1, 6);
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(injectedScripts.length, 2);
    assert.equal(injectedScripts[0].url, 'http://127.0.0.1:52123/index.html?conversationId=abc');
    assert.equal(injectedScripts[0].code, translationJs);
    assert.equal(injectedScripts[1].url, 'plugin://swarm-auth/?conversationId=abc');
    assert.equal(injectedScripts[1].code, translationJs);

    for (const fn of winListeners.get('closed') || []) fn();
    assert.equal((hubListeners.get('did-frame-finish-load') || []).length, 0);
    assert.equal((hubListeners.get('did-frame-navigate') || []).length, 0);
});

test('patchPreloadJs prevents ASI syntax/runtime errors when original preload lacks trailing semicolon', () => {
    const original = 'const x = 1';
    const payload = `${signature}\n(() => { globalThis.__ran = true; })();\n${signatureEnd}`;
    const patched = patchPreloadJs(original, payload, signature, signatureEnd);
    const ctx = { globalThis: {} };
    vm.runInNewContext(patched, ctx);
    assert.equal(ctx.globalThis.__ran, true);
});

test('patchTrayJs count replacement is bounded and cleanTrayJsContent restores original expression', () => {
    const originalTray = [
        'function createTray() {',
        '    const actions = [];',
        "    countItem.label = (count > 0 ? count + ' agents' : 'No agents') + ' running';",
        '    const tail = "keep \' running\'; untouched";',
        '}',
        'function insertTrayMenuItem(position, options) {}',
    ].join('\n');

    const patched = patchTrayJs(originalTray);
    assert.match(patched, /agentes em execução/);
    assert.match(patched, /const tail = "keep ' running'; untouched";/);

    const previous = patched.replace("'agente em execução' : 'agentes em execução'", "'old agent' : 'old agents'");
    assert.notEqual(previous, patched);
    assert.equal(patchTrayJs(previous), patched, 'reapplying must restore the saved expression and localize the count');
    assert.equal(patchTrayJs(patched), patched);
});

test('validateAsarCandidate allows newly patched main-process dialog modules and cleanElectronCache clears Partitions caches', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-main-dialog-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'dist/main.js': { body: "const opts = { buttons: ['Cancel', 'Quit'], title: 'Confirm Quit', message: 'Are you sure you want to quit?' };" },
        'dist/provisionSplash.js': { body: 'const h = `<div>Setting up WSL: ${escapeHtml(distro)}</div>`;' },
        'package.json': { body: '{"version":"2.32.2"}' },
    });

    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => `${orig}\n${signature}`],
        ['dist/main.js', orig => patchMainProcessModule('dist/main.js', orig)],
        ['dist/provisionSplash.js', orig => patchMainProcessModule('dist/provisionSplash.js', orig)],
    ]));
    validateAsarCandidate(src, dst, signature);

    const layout = readAsarLayout(dst);
    assert.match(layout.files.get('dist/main.js').body.toString('utf8'), /Confirmar saída/);
    assert.match(layout.files.get('dist/provisionSplash.js').body.toString('utf8'), /Configurando o WSL:/);

    if (process.platform === 'win32') {
        const fakeAppData = path.join(root, 'AppData', 'Roaming');
        const topCache = path.join(fakeAppData, 'Antigravity', 'Code Cache');
        const partCache = path.join(fakeAppData, 'Antigravity', 'Partitions', 'hub-browser-123', 'Code Cache');
        const ideCache = path.join(fakeAppData, 'Antigravity IDE', 'Partitions', 'hub-browser-abc', 'Cache');
        const keepData = path.join(fakeAppData, 'Antigravity', 'Partitions', 'hub-browser-123', 'Local Storage');
        for (const dir of [topCache, partCache, ideCache, keepData]) {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'dummy.bin'), 'x');
        }
        const prevAppData = process.env.APPDATA;
        process.env.APPDATA = fakeAppData;
        t.after(() => { process.env.APPDATA = prevAppData; });
        loadEngine().cleanElectronCache();
        assert.equal(fs.existsSync(topCache), false);
        assert.equal(fs.existsSync(partCache), false);
        assert.equal(fs.existsSync(ideCache), false);
        assert.equal(fs.existsSync(keepData), true);
    }
});

test('requiring localization_engine from node -e does not invoke main() or kill Antigravity', () => {
    const childProcess = require('node:child_process');
    const engineDir = path.resolve(__dirname, '..');
    const out = childProcess.execFileSync(
        process.execPath,
        ['-e', "const eng = require('./localization_engine'); console.log(typeof eng.generateJs);"],
        { cwd: engineDir, encoding: 'utf8' }
    ).trim();
    assert.equal(out, 'function');
});

test('readAsarLayout rejects invalid headerSize2 framing and compareDicts rejects non-object JSON', t => {
    const { compareDicts } = require('../scripts/compare_dicts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-guard-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const badAsar = path.join(root, 'bad.asar');
    writeArchive(badAsar, { 'dist/preload.js': { body: 'x' } });
    const raw = fs.readFileSync(badAsar);
    raw.writeUInt32LE(2, 8);
    fs.writeFileSync(badAsar, raw);
    assert.throws(() => readAsarLayout(badAsar), /Truncated ASAR header/);

    const dictDir = path.join(root, 'dicts');

    fs.mkdirSync(dictDir, { recursive: true });

    fs.writeFileSync(path.join(dictDir, 'test.json'), '["not-an-object"]', 'utf8');

    assert.equal(compareDicts(dictDir), false);
});

test('patchTrayJs and patchUtilsJs guard missing actions and missing win variables at runtime', () => {
    const traySample = 'function createTray(actions) { const contextMenu = actions || []; tray.setContextMenu(contextMenu); return contextMenu; } function emptyTray() { const contextMenu = []; tray.setContextMenu(contextMenu); }';
    const trayPatched = patchTrayJs(traySample);
    assert.match(trayPatched, /TRAY TRANSLATION START/);
    assert.match(trayPatched, /TRAY DOUBLE CLICK START/);
    const fakeTray = { setContextMenu() {}, on() {} };
    const builtMenu = vm.runInNewContext(`${trayPatched}; createTray([{ label: "Quit" }]);`, { tray: fakeTray });
    assert.equal(builtMenu[0].label, 'Sair');

    const trayWithoutActionsSample = 'function createTray() { const contextMenu = []; tray.setContextMenu(contextMenu); }';
    const trayWithoutActionsPatched = patchTrayJs(trayWithoutActionsSample);
    assert.doesNotThrow(() => {
        vm.runInNewContext(`${trayWithoutActionsPatched}; createTray();`, { tray: fakeTray });
    });

    const utilsSample = "function attach(hubContents, guardExternalNavigation) { hubContents.on('will-navigate', guardExternalNavigation); }";
    const utilsPatched = patchUtilsJs(utilsSample, signature, signatureEnd);
    assert.match(utilsPatched, /SIDECAR TRANSLATION START/);
    const hubEvents = {};
    const fakeHub = {
        isDestroyed: () => false,
        mainFrame: { executeJavaScript: () => Promise.resolve(false) },
        on: (ev, cb) => { hubEvents[ev] = cb; }
    };
    vm.runInNewContext(`${utilsPatched}; attach(hubContents, () => {});`, {
        hubContents: fakeHub,
        electron_1: { webFrameMain: { fromId: () => null } },
        console
    });
    assert.doesNotThrow(() => hubEvents['did-frame-finish-load']({}, false, 1, 2));
});

test('ensureWritePermission returns false on EPERM/EACCES and true on writable directories without chmod', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-write-perm-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const engineDir = path.resolve(__dirname, '..');

    const runProbe = (mockCode) => {
        const script = [
            "const fs = require('fs');",
            "Object.defineProperty(process, 'platform', { value: 'win32' });",
            mockCode ? `fs.writeFileSync = () => { const e = new Error('denied'); e.code = '${mockCode}'; throw e; };` : '',
            "const { ensureWritePermission } = require('./localization_engine');",
            `process.stdout.write(String(ensureWritePermission(${JSON.stringify(root)})));`
        ].join('\n');
        const res = childProcess.spawnSync(process.execPath, ['-e', script], { cwd: engineDir, encoding: 'utf8' });
        assert.equal(res.status, 0, res.stderr);
        return res.stdout.trim();
    };

    assert.equal(runProbe('EPERM'), 'false');
    assert.equal(runProbe('EACCES'), 'false');
    assert.equal(runProbe(null), 'true');
});

test('ensureWritePermission tells root users on macOS to grant App Management instead of retrying sudo', () => {
    const engineDir = path.resolve(__dirname, '..');
    const runDarwinRootProbe = errCode => {
        const script = [
            "const fs = require('fs');",

            "Object.defineProperty(process, 'platform', { value: 'darwin' });",
            "Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true });",
            `fs.accessSync = () => { const e = new Error('denied'); e.code = ${JSON.stringify(errCode)}; throw e; };`,
            "const { ensureWritePermission } = require('./localization_engine');",
            "process.stdout.write('RESULT=' + ensureWritePermission('/Applications/Antigravity.app/Contents/Resources'));"
        ].filter(Boolean).join('\n');
        const res = childProcess.spawnSync(process.execPath, ['-e', script], { cwd: engineDir, encoding: 'utf8' });
        assert.equal(res.status, 0, res.stderr);
        return `${res.stdout}\n${res.stderr}`;
    };

    for (const code of ['EPERM', 'EACCES']) {
        const output = runDarwinRootProbe(code);
        assert.match(output, /RESULT=false/);
        assert.match(output, /Gerenciamento de Apps/);
        assert.match(output, /Cmd\+Q/);
    }
});

test('resignAppOnMac and canRestartApp skip non-bundle staging dirs while preserving rollback on real bundle failure', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-mac-bundle-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const enginePath = path.resolve(__dirname, '..', 'localization_engine.js');
    const source = fs.readFileSync(enginePath, 'utf8').replace(/\bmain\(\);\s*$/, '');

    const createMacEngine = (codesignStatus) => {
        const spawned = [];
        const ctx = vm.createContext({
            __dirname: path.dirname(enginePath),
            __filename: enginePath,
            Buffer,
            console: { log() {}, warn() {}, error() {} },
            process: {
                argv: [process.execPath, enginePath],
                platform: 'darwin',
                env: { ...process.env },
                execPath: process.execPath,
                exit() { throw new Error('unexpected exit'); },
            },
            require(name) {
                if (name === 'child_process' || name === 'node:child_process') {
                    return {
                        spawnSync(cmd, args) {
                            spawned.push({ cmd, args });
                            if (cmd === 'codesign') return { status: codesignStatus, stdout: '', stderr: codesignStatus === 0 ? '' : 'codesign failed' };
                            return { status: 0, stdout: '', stderr: '' };
                        },
                        execFileSync() { return ''; },
                        execSync() { return ''; },
                    };
                }
                if (name === './src/asar_patcher' || name === './src/main_patches') {
                    return require(path.resolve(__dirname, '..', name));
                }
                return require(name);
            },
        });
        vm.runInContext(source, ctx, { filename: enginePath });
        return { ctx, spawned };
    };

    // 1. Fake .app directory without Contents/MacOS or Contents/Info.plist
    const fakeBundle = path.join(root, 'staging.app');
    const fakeResources = path.join(fakeBundle, 'Contents', 'Resources');
    fs.mkdirSync(fakeResources, { recursive: true });
    const sim1 = createMacEngine(1);
    assert.equal(sim1.ctx.resignAppOnMac(fakeResources), true);
    assert.equal(sim1.ctx.canRestartApp(fakeBundle), false);
    assert.equal(sim1.spawned.length, 0);

    // 2. Plain staging directory without .app
    const plainStaging = path.join(root, 'plain-staging', 'resources');
    fs.mkdirSync(plainStaging, { recursive: true });
    const sim2 = createMacEngine(1);
    assert.equal(sim2.ctx.resignAppOnMac(plainStaging), true);
    assert.equal(sim2.ctx.canRestartApp(plainStaging), false);
    assert.equal(sim2.spawned.length, 0);

    // 3. Real .app bundle with Contents/MacOS: codesign failure must return false for rollback
    const realBundle = path.join(root, 'Antigravity.app');
    const realResources = path.join(realBundle, 'Contents', 'Resources');
    fs.mkdirSync(path.join(realBundle, 'Contents', 'MacOS'), { recursive: true });
    fs.mkdirSync(realResources, { recursive: true });
    const simFail = createMacEngine(1);
    assert.equal(simFail.ctx.resignAppOnMac(realResources), false);
    assert.equal(simFail.ctx.canRestartApp(realBundle), true);
    assert.ok(simFail.spawned.some(c => c.cmd === 'codesign'));
});

test('patchLoadingOverlayJs silently skips when <div class="text"> is absent and translates legacy markup', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        const modernOverlay = '<body><svg class="logo"></svg></body>';
        assert.equal(patchLoadingOverlayJs(modernOverlay), modernOverlay);

        assert.equal(warnings.length, 0);

        const legacyOverlay = '<div class="text">Loading Antigravity</div>';
        assert.match(patchLoadingOverlayJs(legacyOverlay), /Carregando o Antigravity\.\.\./);

        assert.equal(warnings.length, 0);
    } finally {
        console.warn = origWarn;
    }
});

test('main-process patches cover v2.33.0 wizardHtml, remoteManager dialogs and resilient sshPrompts buttons', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-v233-main-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const wizardSample = [
        '<title>Welcome to Antigravity</title>',
        '<div class="text" style="font-size: 13px;">Setting up…</div>',
        '<h1>Welcome to the new Antigravity!</h1>',
        "<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>",
        '<span>Download the Antigravity IDE</span>',
        '<button class="btn-primary" id="btn-skip">Explore the new Antigravity</button>'
    ].join('\n');

    const wizard = patchMainProcessModule('dist/ideInstall/wizardHtml.js', wizardSample);
    assert.match(wizard, /Boas-vindas ao Antigravity/);
    assert.match(wizard, /Configurando…/);
    assert.match(wizard, /Explorar o novo Antigravity/);

    assert.match(wizard, /editor de código/);

    const remoteSample = [
        "title: 'Choose another SSH config file',",
        "buttons: ['Choose Another File…', 'Cancel'],",
        "title: 'Could not restart the SSH server',",
        "message: `${entry.label} still runs Antigravity server ${running}.`,",
        "buttons: ['Allow', \"Don't Allow\"],",
        "title: 'Microphone access',",
        "message: `Allow ${label} to use your microphone?`,",
        "buttons: ['Continue', 'Cancel'],",
        "message: `Finish this sign-in on ${entry.label}?`,",
        "buttons: ['Take Over', 'Cancel'],",
        "title: 'Shared home directory',",
        "const what = terminals === 0 ? 'agent or task' : 'agent, task or terminal';",
        "buttons: ['Restart', 'Later'],",
        "title: 'Restart SSH server',",
        "detail: `Any ${what} still running on it stops. The server starts again with this app's version.`,"
    ].join('\n');

    const remote = patchMainProcessModule('dist/remote/remoteManager.js', remoteSample);
    assert.match(remote, /Escolher outro arquivo de configuração SSH/);
    assert.match(remote, /buttons: \['Permitir', 'Não permitir'\]/);
    assert.match(remote, /Acesso ao microfone/);
    assert.match(remote, /Concluir este login em \$\{entry\.label\}\?/);
    assert.match(remote, /Diretório pessoal compartilhado/);
    assert.match(remote, /agente ou tarefa/);
    assert.match(remote, /buttons: \['Reiniciar', 'Mais tarde'\]/);

    assert.match(remote, /agente, tarefa ou terminal/);

    const sshSample = [
        "(who) => (isAccount(who) ? ['Password', who] : undefined),",
        "? `${asked[0]} for ${hostPromptsMarked ? asked[1] : label}`",
        "return `Question from ${who}`;",
        '<button id="cancel" class="custom-sec">Cancel</button><button id="continue" class="custom-cta">Continue</button>'
    ].join('\n');
    const ssh = patchMainProcessModule('dist/remote/sshPrompts.js', sshSample);
    assert.match(ssh, /\['Senha', who\]/);
    assert.match(ssh, /Pergunta de \$\{who\}/);
    assert.match(ssh, />Cancelar<\/button><button id="continue" class="custom-cta">Continuar<\/button>/);

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'dist/ideInstall/wizardHtml.js': { body: wizardSample },
    });
    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => `${orig}\n${signature}`],
        ['dist/ideInstall/wizardHtml.js', orig => patchMainProcessModule('dist/ideInstall/wizardHtml.js', orig)],
    ]));
    assert.doesNotThrow(() => validateAsarCandidate(src, dst, signature));
});

test('ensure_localized validates flags, decodes UTF-16LE registry paths, guards elevated processes and aborts launch on fix failure', t => {
    const ensure = require('../scripts/ensure_localized');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-ensure-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // 1. Bat file must remain pure 7-bit ASCII with CRLF
    const batPath = path.resolve(__dirname, '..', 'Iniciar-Antigravity.bat');
    const batBuf = fs.readFileSync(batPath);
    assert.equal([...batBuf].some(b => b > 127), false, 'launcher bat must be pure 7-bit ASCII');
    assert.equal(/(?<!\r)\n/.test(batBuf.toString('latin1')), false, 'launcher bat must use CRLF');

    // 2. Argument parsing & --huifu rejection & \resources normalization
    const fakeInstall = path.join(root, 'AG Tradução');
    const fakeRes = path.join(fakeInstall, 'resources');
    fs.mkdirSync(fakeRes, { recursive: true });
    writeArchive(path.join(fakeRes, 'app.asar'), { 'dist/preload.js': { body: '// original' } });

    const parsed = ensure.parseArgs([
        '--fix',
        '--launch',
        `--install-dir=${fakeRes}`,
        '--brand-title=hidden'
    ]);
    assert.equal(parsed.fix, true);
    assert.equal(parsed.launch, true);
    assert.equal(parsed.brandTitle, 'hidden');

    assert.equal(ensure.normalizeInstallDir(parsed.installDir), path.resolve(fakeInstall));
    assert.throws(() => ensure.parseArgs(['--huifu']), /não aceita o parâmetro --huifu/);
    assert.throws(() => ensure.parseArgs(['--install-dir']), /--install-dir exige um caminho válido!/);
    assert.throws(() => ensure.parseArgs(['--install-dir=']), /O caminho de --install-dir= não pode ficar vazio/);
    assert.throws(() => ensure.parseArgs(['--brand-title=unknown']), /Valor não reconhecido para --brand-title:/);

    // 3. Registry UTF-16LE + negative/quoted icon index cleanup
    const regOut = [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ag',
        `    DisplayIcon    REG_SZ    "${path.join(fakeInstall, 'Antigravity.exe')}",-1`
    ].join('\r\n');
    const detected = ensure.detectInstallDir(null, (cmd, args) => {
        assert.equal(cmd, 'cmd');
        assert.deepEqual(args.slice(0, 3), ['/d', '/u', '/c']);
        return regOut;
    });
    assert.equal(detected, path.resolve(fakeInstall));

    // 4. isRunning guards against tasklist / PowerShell failures and elevated empty ExecutablePath
    assert.equal(ensure.isRunning(fakeInstall, () => 'INFO: No tasks are running.\r\n'), false);
    assert.throws(() => ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        throw new Error('WMI timeout');
    }), /não foi possível consultar o caminho do processo/);
    assert.throws(() => ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        return '__EMPTY_PATH__\r\n';
    }), /não foi possível ler o caminho do executável/);
    assert.equal(ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        return path.join(root, 'OtherInstall', 'Antigravity.exe') + '\r\n';
    }), false);
    assert.equal(ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        return path.join(fakeInstall, 'Antigravity.exe') + '\r\n';
    }), true);

    // 5. Non-win32 returns non-zero exit code
    assert.equal(ensure.main(['--fix'], { platform: 'linux' }), 1);

    // 6. --fix failure must abort launch and return non-zero; prefs are persisted & inherited
    const fakeAppData = path.join(root, 'AppData');
    const prevAppData = process.env.APPDATA;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.APPDATA = fakeAppData;
    process.env.XDG_CONFIG_HOME = fakeAppData;
    t.after(() => {
        process.env.APPDATA = prevAppData;
        process.env.XDG_CONFIG_HOME = prevXdg;
    });

    ensure.saveLocalizationPref(fakeInstall, { brandTitle: 'hidden' });
    let launchCalled = false;
    let capturedEngineArgs = null;
    const code = ensure.main(['--fix', '--launch', `--install-dir=${fakeInstall}`], {
        platform: 'win32',
        execFileSync: () => 'INFO: No tasks.\r\n',
        spawnSync: (_exe, args) => {
            capturedEngineArgs = args;
            return { status: 1 };
        },
        spawn: () => {
            launchCalled = true;
            return { unref() {} };
        }
    });
    assert.equal(code, 1);
    assert.equal(launchCalled, false);
    assert.ok(!capturedEngineArgs.includes('--tw') && !capturedEngineArgs.includes('--sc'));
    assert.ok(capturedEngineArgs.includes('--brand-title'));
    assert.ok(capturedEngineArgs.includes('hidden'));
    assert.ok(capturedEngineArgs.includes('--no-kill'));
});

test('Windows batch launchers use pure 7-bit ASCII with CRLF and no chcp to stay immune to CP936/CP950/CP65001 mojibake', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const launchers = {
        'Instalar-pt-BR.bat': 'node "%~dp0localization_engine.js" --interactive %*',
        'Desinstalar-pt-BR.bat': 'node "%~dp0localization_engine.js" --huifu %*',
        'Iniciar-Antigravity.bat': 'node "%~dp0scripts\\ensure_localized.js" --fix --launch %*',
    };
    for (const [file, command] of Object.entries(launchers)) {
        const buf = fs.readFileSync(path.join(repoRoot, file));
        for (let i = 0; i < buf.length; i++) {
            assert.ok(buf[i] <= 0x7f, `${file} contains non-ASCII byte 0x${buf[i].toString(16)} at offset ${i}`);
            if (buf[i] === 0x0a) {
                assert.equal(buf[i - 1], 0x0d, `${file} contains bare LF without CR at offset ${i}`);
            }
        }
        const text = buf.toString('ascii');
        assert.ok(text.split('\r\n').includes(command), file);
        assert.doesNotMatch(text, /--(?:tw|sc)\b|proxy_config/i);
        assert.equal(/\bchcp\b/i.test(text), false, `${file} must not call chcp`);
    }
});

test('interactive brand prompt resolves choices and skips prompting when --brand-title is explicit', async t => {
    const repoRoot = path.resolve(__dirname, '..');
    const { PassThrough } = require('stream');
    const engine = require(path.join(repoRoot, 'localization_engine.js'));
    assert.equal(engine.resolveBrandTitleChoice('1'), 'english');
    assert.equal(engine.resolveBrandTitleChoice('2'), 'hidden');
    assert.equal(engine.resolveBrandTitleChoice('3'), 'translated');
    assert.equal(engine.resolveBrandTitleChoice(''), 'english');

    const logs = [];
    const input = new PassThrough();
    const output = new PassThrough();
    const choice = engine.promptBrandTitleMode({
        input,
        output,
        log: (line) => logs.push(line)
    });
    input.end('2\n');
    assert.equal(await choice, 'hidden');
    assert.deepEqual(logs.filter(Boolean), [
        'Escolha como exibir a marca no canto superior esquerdo:',
        '[1] Manter em inglês: Antigravity (recomendado)',
        '[2] Ocultar nome da marca',
        '[3] Usar nome traduzido do dicionário',
    ]);
    assert.equal(output.read().toString(), 'Escolha [1/2/3] (Enter usa 1 por padrão): ');

    const eofLogs = [];
    const eofInput = new PassThrough();
    const eofOutput = new PassThrough();
    const defaultChoice = engine.promptBrandTitleMode({
        input: eofInput,
        output: eofOutput,
        log: (line) => eofLogs.push(line)
    });
    eofInput.end();
    assert.equal(await defaultChoice, 'english');
    assert.ok(eofLogs.some(l => l.includes('Escolha como exibir a marca no canto superior esquerdo:')));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-interactive-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const fakeInstall = path.join(root, 'Antigravity');
    const fakeRes = path.join(fakeInstall, 'resources');
    fs.mkdirSync(fakeRes, { recursive: true });
    writeArchive(path.join(fakeRes, 'app.asar'), { 'dist/preload.js': { body: '// original' } });

    const fakeAppData = path.join(root, 'AppData');
    const fixtureEnv = { ...process.env, HOME: root, SUDO_USER: '', APPDATA: fakeAppData, XDG_CONFIG_HOME: fakeAppData };
    const resInteractive = childProcess.spawnSync(
        process.execPath,
        [path.join(repoRoot, 'localization_engine.js'), '--interactive', `--install-dir=${fakeInstall}`, '--no-kill'],
        {
            cwd: repoRoot,
            input: '2\n',
            encoding: 'utf8',
            env: fixtureEnv
        }
    );
    assert.equal(resInteractive.status, 0, resInteractive.stderr || resInteractive.stdout);
    assert.ok(resInteractive.stdout.includes('Escolha como exibir a marca no canto superior esquerdo:'));
    assert.ok(resInteractive.stdout.includes('[1/2] Aplicando tradução...'));
    assert.ok(resInteractive.stdout.includes('[2/2] Aplicação concluída!'));
    const prefPath = path.join(fakeAppData, 'Antigravity', 'localization-prefs.json');
    const installKey = path.resolve(fakeInstall).toLowerCase();
    assert.equal(JSON.parse(fs.readFileSync(prefPath, 'utf8'))[installKey].brandTitle, 'hidden');

    const resExplicit = childProcess.spawnSync(
        process.execPath,
        [path.join(repoRoot, 'localization_engine.js'), '--interactive', '--brand-title=translated', `--install-dir=${fakeInstall}`, '--no-kill'],
        {
            cwd: repoRoot,
            input: '',
            encoding: 'utf8',
            env: fixtureEnv
        }
    );
    assert.equal(resExplicit.status, 0, resExplicit.stderr || resExplicit.stdout);
    assert.equal(resExplicit.stdout.includes('Escolha como exibir a marca no canto superior esquerdo:'), false);
    assert.equal(JSON.parse(fs.readFileSync(prefPath, 'utf8'))[installKey].brandTitle, 'translated');
});

test('main-process patches cover v2.35.1 remote disconnectedPage and signInCallback HTML', () => {
    const discOrig = [
        "const BUTTON_LABELS = { reconnect: 'Reconnect', stop: 'Stop Server', close: 'Close', };",
        "const title = restarting ? 'Restarting…' : connecting ? 'Reconnecting…' : 'Disconnected';",
        "const heading = restarting ? `Restarting the Antigravity server on ${host}…` : connecting ? `Reconnecting to ${host}…` : `Disconnected from ${host}`;",
        "const body = restarting ? 'This window opens it again once it has started.' : connecting ? page.serverStopped ? `Its server on ${host} stopped, and its agents with it.` : `Agents keep running on ${host}.` : page.serverStopped ? `Its agents on ${host} stopped with it.` : `Agents keep running on ${host} unless its server stopped.`;"
    ].join('\n');
    const disconnected = patchMainProcessModule('dist/remote/disconnectedPage.js', discOrig);
    assert.match(disconnected, /Reconectar/);
    assert.match(disconnected, /Parar servidor/);
    assert.match(disconnected, /Desconectado/);
    assert.match(disconnected, /Desconectado de \$\{host\}/);

    const cbOrig = [
        "const SIGNED_IN = page('You have successfully authenticated.', 'You can close this tab and return to Antigravity.');",
        "return page(\"Sign-in didn't finish\", `Antigravity couldn't reach ${host} to finish signing in. ` +",
        "'Sign in again from Antigravity.');"
    ].join('\n');
    const callback = patchMainProcessModule('dist/remote/signInCallback.js', cbOrig);
    assert.match(callback, /Você foi autenticado com sucesso\./);
    assert.match(callback, /O login não foi concluído/);

    const capOrig = `<title>Browser Stream Capture</title>\nconst err = 'Capture session failed';`;
    const capture = patchMainProcessModule('dist/browserStream/capturePage.js', capOrig);
    assert.match(capture, /<title>Captura de transmissão do navegador<\/title>/);
    assert.match(capture, /'Falha na sessão de captura'/);
});

test('checkSupportedNodeVersion rejects Node < 16 and accepts Node >= 16 (including 18.x without warnings)', () => {
    const { checkSupportedNodeVersion } = require('../localization_engine');
    assert.equal(typeof checkSupportedNodeVersion, 'function');
    assert.equal(checkSupportedNodeVersion(), true);

    const nodeDescriptor = Object.getOwnPropertyDescriptor(process.versions, 'node');
    const origError = console.error;
    const origWarn = console.warn;
    const errors = [];
    const warnings = [];
    console.error = (...args) => errors.push(args.join(' '));
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        for (const oldVer of ['12.22.12', '14.21.3']) {
            Object.defineProperty(process.versions, 'node', { value: oldVer, configurable: true });
            assert.equal(checkSupportedNodeVersion(), false);
            assert.ok(errors.some(msg => msg.includes(oldVer)));
        }

        Object.defineProperty(process.versions, 'node', { value: '16.20.2', configurable: true });
        assert.equal(checkSupportedNodeVersion(), true);
        assert.ok(warnings.some(msg => msg.includes('16.20.2')));

        warnings.length = 0;
        for (const okVer of ['18.20.3', '18.20.8']) {
            Object.defineProperty(process.versions, 'node', { value: okVer, configurable: true });
            assert.equal(checkSupportedNodeVersion(), true);
        }
        assert.equal(warnings.length, 0);
    } finally {
        console.error = origError;
        console.warn = origWarn;
        if (nodeDescriptor) {
            Object.defineProperty(process.versions, 'node', nodeDescriptor);
        }
    }
});

test('compareNodeVersions, resolveCheckNode and macOS .command launchers avoid BSD-incompatible sort -V', () => {
    const { compareNodeVersions, resolveCheckNode } = require('../localization_engine');
    const sorted = ['v8.17.0', 'v24.2.0', 'v14.21.3', 'v20.18.0'].sort(compareNodeVersions);
    assert.deepEqual(sorted, ['v8.17.0', 'v14.21.3', 'v20.18.0', 'v24.2.0']);
    assert.equal(resolveCheckNode(), process.execPath);

    const fs = require('fs');
    const path = require('path');
    const cmdFiles = ['Instalar-pt-BR.command', 'Desinstalar-pt-BR.command'];
    for (const file of cmdFiles) {
        const raw = fs.readFileSync(path.join(__dirname, '..', file));
        assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), `${file} must not have UTF-8 BOM`);
        const text = raw.toString('utf8');
        assert.ok(!text.includes('\r\n'), `${file} must use LF line endings`);
        assert.ok(!/\bsort\s+-V\b/.test(text), `${file} must not use GNU-only sort -V on macOS`);
        assert.match(text, /CURR_NODE_MAJOR/);
        assert.doesNotMatch(text, /--(?:tw|sc)\b|(?:http|https|all|no)_proxy=/i, file);
    }
});

test('ensure_localized detects outdated injected preload payload and refreshes localization when --fix is set', t => {
    const ensure = require('../scripts/ensure_localized');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-outdated-'));
    const prevAppData = process.env.APPDATA;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.APPDATA = path.join(root, 'AppData');
    process.env.XDG_CONFIG_HOME = path.join(root, 'AppData');
    t.after(() => {
        process.env.APPDATA = prevAppData;
        process.env.XDG_CONFIG_HOME = prevXdg;
        fs.rmSync(root, { recursive: true, force: true });
    });

    const fakeInstall = path.join(root, 'Antigravity');
    const fakeRes = path.join(fakeInstall, 'resources');
    fs.mkdirSync(fakeRes, { recursive: true });
    fs.writeFileSync(path.join(fakeInstall, 'Antigravity.exe'), '');

    const staleBlock = [
        '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */',
        '(() => { window.__agCnRuntimeStart = () => {}; const map = new Map(Object.entries({"Model":"Modelo"})); })();',
        '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */'
    ].join('\n');
    const asarPath = path.join(fakeRes, 'app.asar');
    writeArchive(asarPath, { 'dist/preload.js': { body: '// base\n' + staleBlock } });

    assert.equal(ensure.isLocalized(asarPath), true);
    assert.equal(ensure.isLocalizationCurrent(asarPath, { brandTitle: 'english' }), false);

    // Status check without --fix returns 2 when payload is outdated; --launch without --fix still launches and returns 0
    assert.equal(ensure.main([`--install-dir=${fakeInstall}`, '--brand-title=english'], {
        platform: 'win32',
        execFileSync: () => 'INFO: No tasks.\r\n'
    }), 2);
    let launchedWithoutFix = false;
    assert.equal(ensure.main(['--launch', `--install-dir=${fakeInstall}`, '--brand-title=english'], {
        platform: 'win32',
        execFileSync: () => 'INFO: No tasks.\r\n',
        spawn: () => {
            launchedWithoutFix = true;
            return { unref() {} };
        }
    }), 0);
    assert.equal(launchedWithoutFix, true);

    const freshBlock = ensure.buildExpectedInjectedBlock({ brandTitle: 'english' });
    let reInjected = false;
    let launched = false;
    const code = ensure.main(['--fix', '--launch', `--install-dir=${fakeInstall}`, '--brand-title=english'], {
        platform: 'win32',
        execFileSync: () => 'INFO: No tasks.\r\n',
        spawnSync: () => {
            reInjected = true;
            writeArchive(asarPath, { 'dist/preload.js': { body: '// base\n' + freshBlock } });
            return { status: 0 };
        },
        spawn: () => {
            launched = true;
            return { unref() {} };
        }
    });
    assert.equal(code, 0);
    assert.equal(reInjected, true);
    assert.equal(launched, true);
    assert.equal(ensure.isLocalizationCurrent(asarPath, { brandTitle: 'english' }), true);
});

test('Linux native support detects install dirs, wrappers, /proc PIDs, XDG caches, and shell scripts use LF + UTF-8', t => {
    const repoRoot = path.resolve(__dirname, '..');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-linux-support-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // 1. Linux shell launchers must use LF (no CRLF), UTF-8 without BOM, and version-sorted nvm lookup
    for (const shFile of ['install_linux.sh', 'uninstall_linux.sh']) {
        const shPath = path.join(repoRoot, shFile);
        const buf = fs.readFileSync(shPath);
        assert.equal(buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false, `${shFile} must not have UTF-8 BOM`);
        assert.equal(buf.includes(0x0d), false, `${shFile} must use LF line endings`);
        assert.match(buf.toString('utf8'), /CURR_NODE_MAJOR/, `${shFile} must use version-sorted nvm lookup`);
        assert.doesNotMatch(buf.toString('utf8'), /\p{Script=Han}|--tw\b|--sc\b|\/Applications\b/u);
        if (process.platform !== 'win32') {
            const stat = fs.statSync(shPath);
            assert.ok((stat.mode & 0o111) !== 0, `${shFile} must be executable`);
            const check = childProcess.spawnSync('bash', ['-n', shPath], { encoding: 'utf8' });
            assert.equal(check.status, 0, check.stderr);
        }
    }

    const engine = require(path.join(repoRoot, 'localization_engine.js'));

    // 2. Wrapper script & .desktop parsing
    const fakeInstall = path.join(root, 'opt', 'antigravity');
    const fakeRes = path.join(fakeInstall, 'resources');
    fs.mkdirSync(fakeRes, { recursive: true });
    writeArchive(path.join(fakeRes, 'app.asar'), { 'dist/preload.js': { body: '// original' } });
    const fakeBin = path.join(fakeInstall, 'antigravity');
    fs.writeFileSync(fakeBin, '#!/bin/sh\n', 'utf8');

    const wrapperPath = path.join(root, 'wrapper-antigravity');
    const wrapperTarget = process.platform === 'win32' ? '/opt/antigravity-test' : fakeInstall;
    fs.writeFileSync(wrapperPath, `#!/bin/bash\nAPP_DIR="${wrapperTarget}"\nexec "$APP_DIR/antigravity" "$@"\n`, 'utf8');
    const wrapperDirs = engine.extractLinuxDirsFromWrapper(wrapperPath);
    assert.ok(wrapperDirs.includes(wrapperTarget));

    const desktopPath = path.join(root, 'antigravity.desktop');
    fs.writeFileSync(desktopPath, `[Desktop Entry]\nName=Antigravity\nExec="${wrapperPath}" %U\n`, 'utf8');
    const desktopDirs = engine.extractLinuxDirsFromDesktopFile(desktopPath);
    assert.ok(desktopDirs.includes(wrapperTarget));

    assert.equal(engine.resolveLinuxAppRoot(fakeRes), path.resolve(fakeInstall));
    assert.equal(engine.findLinuxExecutable(fakeInstall), fakeBin);
    assert.equal(engine.findLinuxExecutable(fakeRes), fakeBin);

    if (process.platform === 'linux') {
        assert.equal(engine.canRestartApp(fakeInstall), true);
        assert.equal(engine.canRestartApp(path.join(root, 'empty-dir')), false);

        // 3. Auto-detect via ANTIGRAVITY_INSTALL_DIR and PATH wrapper
        const prevEnvDir = process.env.ANTIGRAVITY_INSTALL_DIR;
        process.env.ANTIGRAVITY_INSTALL_DIR = fakeInstall;
        t.after(() => {
            if (prevEnvDir === undefined) delete process.env.ANTIGRAVITY_INSTALL_DIR;
            else process.env.ANTIGRAVITY_INSTALL_DIR = prevEnvDir;
        });
        assert.equal(engine.detectInstallationDir(), path.resolve(fakeInstall));

        // 4. /proc PID matching scoped to installDir
        const fakeProc = path.join(root, 'proc');
        const otherInstall = path.join(root, 'other', 'antigravity');
        fs.mkdirSync(otherInstall, { recursive: true });
        const otherBin = path.join(otherInstall, 'antigravity');
        fs.writeFileSync(otherBin, '', 'utf8');
        fs.mkdirSync(path.join(fakeProc, '424242'), { recursive: true });
        fs.mkdirSync(path.join(fakeProc, '424243'), { recursive: true });
        fs.mkdirSync(path.join(fakeProc, '424244'), { recursive: true });
        fs.symlinkSync(fakeBin, path.join(fakeProc, '424242', 'exe'));
        fs.symlinkSync(otherBin, path.join(fakeProc, '424243', 'exe'));
        fs.symlinkSync('/bin/sh', path.join(fakeProc, '424244', 'exe'));
        assert.deepEqual(engine.findLinuxAppPids(fakeInstall, fakeProc), [424242]);
        assert.deepEqual(engine.findLinuxAppPids(fakeRes, fakeProc), [424242]);

        // 5. XDG_CONFIG_HOME cache cleanup preserves Local Storage and clears Antigravity / antigravity caches
        const fakeConfig = path.join(root, 'xdg-config');
        const topCache = path.join(fakeConfig, 'Antigravity', 'Code Cache');
        const partCache = path.join(fakeConfig, 'Antigravity', 'Partitions', 'hub-browser-1', 'Cache');
        const lowerCache = path.join(fakeConfig, 'antigravity', 'GPUCache');
        const keepData = path.join(fakeConfig, 'Antigravity', 'Partitions', 'hub-browser-1', 'Local Storage');
        for (const d of [topCache, partCache, lowerCache, keepData]) {
            fs.mkdirSync(d, { recursive: true });
            fs.writeFileSync(path.join(d, 'dummy.bin'), 'x');
        }
        const prevXdg = process.env.XDG_CONFIG_HOME;
        process.env.XDG_CONFIG_HOME = fakeConfig;
        t.after(() => {
            if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
            else process.env.XDG_CONFIG_HOME = prevXdg;
        });
        engine.cleanElectronCache();
        assert.equal(fs.existsSync(topCache), false);
        assert.equal(fs.existsSync(partCache), false);
        assert.equal(fs.existsSync(lowerCache), false);
        assert.equal(fs.existsSync(keepData), true);

        // 6. ensureWritePermission on Linux non-TTY returns false for unwritable dir instead of invoking sudo
        if (process.getuid && process.getuid() !== 0) {
            const roDir = path.join(root, 'readonly-res');
            fs.mkdirSync(roDir, { recursive: true });
            fs.chmodSync(roDir, 0o555);
            t.after(() => { try { fs.chmodSync(roDir, 0o755); } catch (_e) {} });
            const permCheck = childProcess.spawnSync(
                process.execPath,
                ['-e', `const { ensureWritePermission } = require('./localization_engine'); process.stdout.write(String(ensureWritePermission(${JSON.stringify(roDir)})));`],
                { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
            );
            assert.equal(permCheck.status, 0, permCheck.stderr);
            assert.equal(permCheck.stdout.trim(), 'false');
        }
    }

    // 7. Linux root EACCES must not emit macOS-only App Management / Cmd+Q guidance
    const linuxRootScript = [
        "const fs = require('fs');",
        "Object.defineProperty(process, 'platform', { value: 'linux' });",
        "Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true });",
        "fs.accessSync = () => { const e = new Error('denied'); e.code = 'EACCES'; throw e; };",
        "const { ensureWritePermission } = require('./localization_engine');",
        "process.stdout.write('RESULT=' + ensureWritePermission('/opt/antigravity/resources'));"
    ].join('\n');
    const linuxRootRes = childProcess.spawnSync(process.execPath, ['-e', linuxRootScript], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(linuxRootRes.status, 0, linuxRootRes.stderr);
    const linuxRootOut = `${linuxRootRes.stdout}\n${linuxRootRes.stderr}`;
    assert.match(linuxRootOut, /RESULT=false/);
    assert.doesNotMatch(linuxRootOut, /Gerenciamento de Apps|Cmd\+Q/);
});
test('menu translation covers v2.35.1 View/Edit items (Reload, Substitutions, Speech)', () => {
    const { patchMenuJs } = require('../src/main_patches');
    const sample = [
        "const electron_1 = { Menu: { setApplicationMenu(m) { this.applied = m; } } };",
        "const menu = { items: [",
        "  { label: 'View', submenu: { items: [{ label: 'Reload' }, { label: 'Force Reload' }] } },",
        "  { label: 'Edit', submenu: { items: [",
        "    { label: 'Substitutions', submenu: { items: [{ label: 'Smart Quotes' }, { label: 'Text Replacement' }] } },",
        "    { label: 'Speech', submenu: { items: [{ label: 'Start Speaking' }, { label: 'Stop Speaking' }] } }",
        "  ] } }",
        "] };",
        "electron_1.Menu.setApplicationMenu(menu);",
        "module.exports = menu;"
    ].join('\n');
    const labels = () => {
        const mod = { exports: {} };
        vm.runInNewContext(patchMenuJs(sample), { module: mod, console: { log() {}, warn() {} } });
        const out = [];
        const walk = items => items.forEach(i => { out.push(i.label); if (i.submenu) walk(i.submenu.items); });
        walk(mod.exports.items);
        return out;
    };

    assert.deepEqual(labels(), ['Exibir', 'Recarregar', 'Forçar recarregamento', 'Editar', 'Substituições', 'Aspas inteligentes', 'Substituição de texto', 'Fala', 'Começar a falar', 'Parar de falar']);
});

test('main-process patches cover v2.35.1 SSH remote flow, passkey window, WSL messages and page lang', () => {
    const { MAIN_PROCESS_PATCH_TARGETS } = require('../src/main_patches');
    for (const rel of ['dist/remote/sshArgs.js', 'dist/remote/sshConnection.js', 'dist/remote/sshDestination.js', 'dist/remote/sshConfigHosts.js',
        'dist/remote/sshBridge.js', 'dist/remote/sshErrorText.js', 'dist/wsl.js', 'dist/cablev2.js', 'dist/qrEncoder.js', 'dist/browserStream/capturePage.js']) {
        assert.ok(MAIN_PROCESS_PATCH_TARGETS.includes(rel), `${rel} deve estar entre os módulos do processo principal`);
    }

    const argsSrc = [
        "exports.LINUX_HOST_NEEDED = 'Antigravity needs a Linux host on x64 or arm64 with glibc 2.26 or newer.';",
        'function describe(code, prompts) {',
        '    switch (code) {',
        "        case 'CONNECTION_FAILED':",
        "            return `Couldn't connect to the SSH host. Check its name, your network and ssh config (e.g. a ProxyCommand), and that ssh to it works in a terminal${prompts === 'no' ? ' without a prompt' : ''}.`;",
        "        case 'UNSUPPORTED_HOST':",
        "            return `The SSH host isn't supported. ${exports.LINUX_HOST_NEEDED} Windows and macOS hosts aren't supported yet.`;",
        '        default:',
        "            return `Couldn't connect to the SSH host (${String(code)}).`;",
        '    }',
        '}',
        'return describe;'
    ].join('\n');
    const describe = new Function('exports', patchMainProcessModule('dist/remote/sshArgs.js', argsSrc))({});
    assert.equal(describe('CONNECTION_FAILED', 'yes'), 'Não foi possível conectar ao host SSH. Verifique o nome do host, sua rede e a configuração do ssh (por exemplo, um ProxyCommand) e confirme que o ssh para ele funciona em um terminal.');
    assert.equal(describe('UNSUPPORTED_HOST'), 'Este host SSH não é compatível. O Antigravity precisa de um host Linux x64 ou arm64 com glibc 2.26 ou mais recente. Hosts Windows e macOS ainda não são compatíveis.');
    assert.equal(describe('WEIRD'), 'Não foi possível conectar ao host SSH (WEIRD).');

    assert.equal(describe('CONNECTION_FAILED', 'no'), 'Não foi possível conectar ao host SSH. Verifique o nome do host, sua rede e a configuração do ssh (por exemplo, um ProxyCommand) e confirme que o ssh para ele funciona em um terminal sem nenhum prompt.');

    const connSrc = [
        'function describeExit(code, signal, lastLine) {',
        '    const how = signal ? `signal ${signal}` : `exit code ${code}`;',
        '    return lastLine',
        '        ? `ssh exited (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`',
        '        : `ssh exited (${how}).`;',
        '}',
        'function status(label) { return `Downloading the Antigravity server on ${label}…`; }',
        'return { describeExit, status };'
    ].join('\n');
    const connPatched = patchMainProcessModule('dist/remote/sshConnection.js', connSrc);
    const conn = new Function('types_1', connPatched)({ sanitizeRemoteText: s => s });
    assert.equal(conn.describeExit(255, null, ''), 'ssh encerrou (código de saída 255).');
    assert.equal(conn.describeExit(null, 'SIGTERM', 'Connection reset'), 'ssh encerrou (sinal SIGTERM): Connection reset');
    assert.equal(conn.status('devbox'), 'Baixando o servidor do Antigravity em devbox…');
    assert.equal(patchMainProcessModule('dist/remote/sshConnection.js', connPatched), connPatched, 'reaplicar deve preservar o resultado');

    // Verifica o diagnóstico completo, incluindo o caminho e a sugestão de correção.
    const cfgSrc = [
        'const invalid = (problem) => new Error(`The SSH config file ${problem}`);',
        'const NOT_CONFIG = "isn\'t an SSH config file";',
        "const CHOOSE_CONFIG = 'Choose a file of ssh settings, such as ~/.ssh/config.';",
        'const notConfig = (why) => ({ what: NOT_CONFIG, why, fix: CHOOSE_CONFIG });',
        'const BINARY = notConfig("it\'s a binary file");',
        'function describeSshConfigProblem(file, { what, why, fix }) {',
        '    return `${file} ${what}: ${why}. ${fix}`;',
        '}',
        "const shown = 'cfg';",
        "return [describeSshConfigProblem('/bin/ls', BINARY), invalid(`must be an absolute path (got ${shown}).`).message, invalid(`${shown} doesn't exist or can't be read.`).message];"
    ].join('\n');
    assert.deepEqual(new Function(patchMainProcessModule('dist/remote/sshConfigHosts.js', cfgSrc))(), [
        '/bin/ls não é um arquivo de configuração do SSH: é um arquivo binário. Escolha um arquivo de configurações do ssh, como ~/.ssh/config.',
        'O arquivo de configuração do SSH deve ser um caminho absoluto (recebido: cfg).',
        'O arquivo de configuração do SSH cfg não existe ou não pode ser lido.'
    ]);

    const errSrc = [
        "function logPath() { return '/tmp/main.log'; }",
        'function codeAndLogs(err) { return `Error code: ${err.code}\\nLogs: ${logPath()}`; }',
        'function detailOf(err, label) { const text = err.message; return err.reportedByRemote ? `${label} reported: ${text}` : text; }',
        'return { codeAndLogs, detailOf };'
    ].join('\n');
    const errors = new Function(patchMainProcessModule('dist/remote/sshErrorText.js', errSrc))();
    assert.equal(errors.codeAndLogs({ code: 'UNKNOWN' }), 'Código do erro: UNKNOWN\nLogs: /tmp/main.log');
    assert.equal(errors.detailOf({ reportedByRemote: true, message: 'disk full' }, 'devbox'), 'devbox informou: disk full');

    const rm = patchMainProcessModule('dist/remote/remoteManager.js', [
        "title: 'Could not restart the SSH server',",
        "this.reportError(err, entry.label, 'Could not restart the SSH server', win);",
        "this.reportError(err, entry.label, 'Could not stop the SSH server', win);",
        "this.reportError(err, entry.label, 'Sign-in failed', win);",
        "throw new types_1.RemoteError('CANCELLED', 'Connection cancelled.');"
    ].join('\n'));
    assert.equal(rm.split('Não foi possível reiniciar o servidor SSH').length - 1, 2);
    for (const label of ["'Não foi possível parar o servidor SSH'", "'Falha no login'", "'Conexão cancelada.'"]) assert.ok(rm.includes(label), label);

    const wslMain = patchMainProcessModule('dist/main.js', 'const msg = `Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`;');
    assert.ok(wslMain.includes('`Não foi possível instalar o servidor na distribuição WSL "${WSL_DISTRO}":\\n${err.message}`'));
    const cable = patchMainProcessModule('dist/cablev2.js', "<html lang=\"en\"><title>Passkeys</title> updateStatus('Connecting to your device…')");
    assert.equal(cable, "<html lang=\"pt-BR\"><title>Chaves de acesso</title> updateStatus('Conectando ao seu dispositivo…')");

    const promptHtml = '`<!doctype html><html lang="en"${dark ? \' class="dark"\' : \'\'}>`';

    assert.equal(patchMainProcessModule('dist/remote/sshPrompts.js', promptHtml), '`<!doctype html><html lang="pt-BR"${dark ? \' class="dark"\' : \'\'}>`');
    for (const rel of ['dist/ideInstall/wizardHtml.js', 'dist/remote/disconnectedPage.js', 'dist/remote/signInCallback.js', 'dist/cablev2.js']) {
        assert.equal(patchMainProcessModule(rel, '<html lang="en">'), '<html lang="pt-BR">', rel);

    }
});

test('patchMenuJs translates Unicode ellipsis, Reload, Speech, Fullscreen and Window menu items in pt-BR', () => {
    const menuOrig = "electron_1.Menu.setApplicationMenu(menu);";
    const runMenu = () => {
        const patched = patchMenuJs(menuOrig);
        const menuObj = {
            items: [
                { label: 'Settings…' },
                { label: 'Check for Updates…' },
                { label: 'Reload' },
                { label: 'Force Reload' },
                { label: 'Speech', submenu: { items: [{ label: 'Start Speaking' }, { label: 'Stop Speaking' }] } },
                { label: 'Toggle Fullscreen' },
                { label: 'Enter Full Screen' },
                { label: 'Emoji & Symbols' }
            ]
        };
        const ctx = {
            menu: menuObj,
            electron_1: { Menu: { setApplicationMenu() {} } }
        };
        vm.runInNewContext(patched, ctx);
        return menuObj.items;
    };

    const items = runMenu();
    assert.equal(items[0].label, 'Configurações...');
    assert.equal(items[1].label, 'Verificar atualizações...');
    assert.equal(items[2].label, 'Recarregar');
    assert.equal(items[3].label, 'Forçar recarregamento');
    assert.equal(items[4].label, 'Fala');
    assert.equal(items[4].submenu.items[0].label, 'Começar a falar');
    assert.equal(items[4].submenu.items[1].label, 'Parar de falar');
    assert.equal(items[5].label, 'Alternar tela cheia');
    assert.equal(items[6].label, 'Entrar em tela cheia');
    assert.equal(items[7].label, 'Emojis e símbolos');
});
