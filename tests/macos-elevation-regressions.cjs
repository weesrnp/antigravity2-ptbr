const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const repo = path.join(__dirname, '..');
const launchers = ['Instalar-pt-BR.command', 'Desinstalar-pt-BR.command'];
const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

// Confere o PATH entregue ao processo privilegiado pelos inicializadores do macOS.
test('macOS launchers elevate with absolute sudo, env and bash, and hand root only the system directories (first) plus the Node.js directory', { skip: process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0) }, t => {
    for (const file of launchers) {
        const text = fs.readFileSync(path.join(repo, file), 'utf8');
        assert.doesNotMatch(text, /PATH=\$PATH/, `${file} encaminhou o PATH do usuário para root`);
        // Os gerenciadores de versões só entram no PATH na fase de usuário.
        assert.match(text, /if \[ "\$EUID" -ne 0 \]; then\n {4}REAL_USER=/, `${file} deve acrescentar caminhos apenas na fase do usuário`);
        const code = text.split('\n').filter(line => !/^\s*(#|echo\b)/.test(line));
        for (const line of code) {
            assert.doesNotMatch(line, /(^|[\s;&|(])sudo\s/, `${file} invocou sudo por nome: ${line.trim()}`);
        }
        const elevations = code.filter(line => /^\s*exec \/usr\/bin\/sudo\b/.test(line));
        assert.equal(elevations.length, 1, `${file} deve elevar privilégios uma vez`);
        assert.match(elevations[0], /^\s*exec \/usr\/bin\/sudo \/usr\/bin\/env "PATH=\$ROOT_PATH" .* \/bin\/bash "\$SCRIPT_PATH" "\$@"$/, file);
        assert.doesNotMatch(elevations[0], /(?:https?|all|no)_proxy=/i, file);
    }
    // Na cópia de teste, um sudo falso registra os argumentos da elevação.
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-sudo-'));
    t.after(() => fs.rmSync(shim, { recursive: true, force: true }));
    const fakeSudo = path.join(shim, 'sudo');
    fs.writeFileSync(fakeSudo, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    for (const file of launchers) {
        const copy = path.join(shim, file);
        fs.writeFileSync(copy, fs.readFileSync(path.join(repo, file), 'utf8').split('/usr/bin/sudo').join(fakeSudo), { mode: 0o755 });
        const run = spawnSync('/bin/bash', [copy], {
            encoding: 'utf8', input: '', timeout: 20000,
            env: { ...process.env, PATH: shim + path.delimiter + process.env.PATH }
        });
        const args = run.stdout.split('\n');
        const pathArg = args.find(a => a.startsWith('PATH='));
        assert.ok(pathArg, `${file} não elevou com sudo env PATH=…: ${run.stdout}${run.stderr}`);
        assert.equal(args[args.indexOf(pathArg) - 1], '/usr/bin/env', `${file} deve definir PATH via /usr/bin/env`);
        const dirs = pathArg.slice('PATH='.length).split(':');
        assert.deepEqual(dirs.slice(0, 4), SYSTEM_PATH.split(':'), file);
        assert.equal(dirs.includes(shim), false, file);
        assert.ok(dirs.length <= 5, `${file} pode acrescentar apenas o diretório do Node: ${pathArg}`);
        const sudoUser = args.findIndex(a => a.startsWith('SUDO_USER='));
        assert.equal(args[sudoUser + 1], '/bin/bash', file);
    }
});

// Na fase root, o PATH recebido só serve para localizar o Node.
// As ferramentas externas devem vir primeiro dos diretórios do sistema.
test('macOS launchers rebuild PATH in the root phase from the system directories plus the Node.js directory only', { skip: process.platform === 'win32' }, t => {
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-rootphase-'));
    t.after(() => fs.rmSync(shim, { recursive: true, force: true }));
    const marker = path.join(shim, 'dirname-ran');
    fs.writeFileSync(path.join(shim, 'dirname'), `#!/bin/sh\ntouch "${marker}"\n/usr/bin/dirname "$@"\n`, { mode: 0o755 });
    for (const file of launchers) {
        const text = fs.readFileSync(path.join(repo, file), 'utf8');
        const sanitize = text.split('\n').find(line => line.startsWith('if [ "$EUID" -eq 0 ]; then'));
        assert.ok(sanitize, `${file} deve limpar o PATH ao iniciar como root`);
        const start = text.indexOf('ROOT_NODE="$(');
        assert.ok(start > 0 && text.includes('export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE'), `${file} deve reconstruir o PATH na fase root`);
        const fakeNodeDir = fs.mkdtempSync(path.join(shim, 'node-'));
        fs.writeFileSync(path.join(fakeNodeDir, 'node'), '#!/bin/sh\n', { mode: 0o755 });
        const probe = spawnSync('/bin/bash', ['-c', `${sanitize.replace('"$EUID"', '0')}\n${text.slice(start).split('\n').slice(0, 7).join('\n')}\necho "$PATH"`], {
            encoding: 'utf8', timeout: 20000,
            env: { ...process.env, PATH: [shim, fakeNodeDir, '/usr/bin', '/bin'].join(path.delimiter) }
        });
        assert.equal(probe.stdout.trim(), `${SYSTEM_PATH}:${fakeNodeDir}`, `${file}: ${probe.stderr}`);
        assert.equal(fs.existsSync(marker), false, `${file} executou dirname do PATH recebido como root`);
    }
});

test('macOS launchers started directly as root replace PATH before running any command', { skip: process.platform === 'win32' }, t => {
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-ptbr-rootpath-'));
    t.after(() => fs.rmSync(shim, { recursive: true, force: true }));
    const marker = path.join(shim, 'ran');
    for (const tool of ['dirname', 'basename', 'awk', 'sed', 'sort', 'cut', 'dscl']) {
        fs.writeFileSync(path.join(shim, tool), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
    }
    for (const file of launchers) {
        const lines = fs.readFileSync(path.join(repo, file), 'utf8').split('\n');
        const at = lines.findIndex(line => line.startsWith('if [ "$EUID" -eq 0 ]; then'));
        assert.ok(at > 0, `${file} deve limpar o PATH ao iniciar como root`);
        // Antes de limpar o PATH, só são permitidos o shebang, comentários e linhas vazias.
        for (const line of lines.slice(0, at)) {
            assert.match(line, /^(#.*|\s*)$/, `${file} executou antes de limpar o PATH: ${line}`);
        }
        const probe = spawnSync('/bin/bash', ['-c', `${lines[at].replace('"$EUID"', '0')}\necho "$PATH"\ndirname /a/b >/dev/null`], {
            encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: [shim, '/usr/bin', '/bin'].join(path.delimiter) }
        });
        assert.equal(probe.stdout.split('\n')[0], SYSTEM_PATH, `${file}: ${probe.stderr}`);
        assert.equal(fs.existsSync(marker), false, `${file} executou como root um programa do PATH recebido`);
    }
});
