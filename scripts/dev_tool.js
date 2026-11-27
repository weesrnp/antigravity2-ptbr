/**
 * Antigravity Reverse-Engineering & Diagnostics Dev Tool
 * Conjunto unificado de ferramentas de diagnóstico e inspeção
 *
 * Uso:
 *   node scripts/dev_tool.js port                          # Exibe PID, portas e token CSRF do processo language_server ativo
 *   node scripts/dev_tool.js search <keyword>              # Pesquisa palavra-chave no main.js em execução
 *   node scripts/dev_tool.js slice <pos> [len]             # Exibe trecho do main.js em execução na posição indicada
 *   node scripts/dev_tool.js dump-mcp [--update-baseline]  # Exporta o catálogo oficial de MCP e compara com a base de referência
 *   node scripts/dev_tool.js scan-ui [--update-baseline]   # Varre strings da interface e dicas, comparando com a base e os dicionários
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const child_process = require('child_process');

function getLanguageServerCandidates() {
    const candidates = [];
    try {
        if (process.platform === 'win32') {
            const out = child_process.execSync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'language_server.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"',
                { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 }
            );
            if (!out || !out.trim()) return candidates;
            let procs = JSON.parse(out.trim());
            if (!Array.isArray(procs)) procs = [procs];

            for (const proc of procs) {
                const pid = Number(proc && proc.ProcessId);
                if (!Number.isInteger(pid) || pid <= 0) continue;
                const cmd = typeof proc.CommandLine === 'string' ? proc.CommandLine : '';
                const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
                const csrfToken = csrfMatch ? csrfMatch[1] : '';
                let ports = [];
                try {
                    const netOut = child_process.execSync(
                        `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort"`,
                        { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 }
                    );
                    ports = netOut.trim().split(/\r?\n/).map(p => parseInt(p.trim(), 10)).filter(p => Number.isInteger(p) && p > 0);
                } catch (portErr) {
                    console.warn(`[!] Falha ao consultar portas de escuta do processo ${pid}: ${portErr.message}`);
                }
                candidates.push({ pid, csrfToken, ports, cmd });
            }
        } else {
            const psOut = child_process.execSync('ps -ww -ax -o pid=,command=', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
            const lines = psOut.split(/\r?\n/).filter(l => l.includes('language_server') && (l.includes('--csrf_token') || l.includes('--https_server_port') || l.includes('--override_ide_name antigravity')));
            for (const line of lines) {
                const m = line.trim().match(/^(\d+)\s+(.+)$/);
                if (!m) continue;
                const pid = parseInt(m[1], 10);
                if (!Number.isInteger(pid) || pid <= 0) continue;
                const cmd = m[2];
                const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
                const csrfToken = csrfMatch ? csrfMatch[1] : '';
                const ports = [];
                try {
                    const lsofOut = child_process.execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pid}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
                    for (const pm of lsofOut.matchAll(/:(\d+)\s+\(LISTEN\)/g)) {
                        const portNum = parseInt(pm[1], 10);
                        if (Number.isInteger(portNum) && portNum > 0 && !ports.includes(portNum)) ports.push(portNum);
                    }
                } catch (portErr) {
                    let fallbackOk = false;
                    if (process.platform === 'linux') {
                        try {
                            const ssOut = child_process.execSync('ss -H -ltnp', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
                            const pidToken = `pid=${pid},`;
                            const pidTokenEnd = `pid=${pid})`;
                            for (const ssLine of ssOut.split(/\r?\n/)) {
                                if (!ssLine.includes(pidToken) && !ssLine.includes(pidTokenEnd)) continue;
                                const cols = ssLine.trim().split(/\s+/);
                                const localAddr = cols[3] || '';
                                const portMatch = localAddr.match(/:(\d+)$/);
                                if (portMatch) {
                                    const portNum = parseInt(portMatch[1], 10);
                                    if (Number.isInteger(portNum) && portNum > 0 && !ports.includes(portNum)) ports.push(portNum);
                                }
                            }
                            fallbackOk = true;
                        } catch (_ssErr) {}
                    }
                    if (!fallbackOk) {
                        console.warn(`[!] Falha ao consultar portas de escuta do processo ${pid}: ${portErr.message}`);
                    }
                }
                candidates.push({ pid, csrfToken, ports, cmd });
            }
        }
    } catch (e) {
        console.warn(`[!] Falha ao listar processos language_server: ${e.message}`);
    }
    return candidates;
}

async function findHttpsPort(ports) {
    for (const port of ports) {
        const ok = await new Promise(resolve => {
            const req = https.get(`https://127.0.0.1:${port}/main.js`, { rejectUnauthorized: false, timeout: 1500 }, res => {
                res.on('error', () => resolve(false));
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (ok) return port;
    }
    return null;
}

async function findActiveLanguageServer() {
    const candidates = getLanguageServerCandidates();
    if (candidates.length === 0) return null;
    for (const info of candidates) {
        const httpsPort = await findHttpsPort(info.ports);
        if (httpsPort) return { info, httpsPort };
    }
    return { info: candidates[0], httpsPort: null };
}

function fetchUrl(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, res => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} (${url})`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('error', reject);
            res.on('aborted', () => reject(new Error(`Resposta interrompida (${url})`)));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
        req.on('timeout', () => req.destroy(new Error(`Tempo limite excedido (${timeoutMs}ms): ${url}`)));
        req.on('error', reject);
    });
}

function postJsonRpc(url, csrfToken, payload, timeoutMs = 8000) {
    const reqBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            rejectUnauthorized: false,
            timeout: timeoutMs,
            headers: {
                'content-type': 'application/json',
                'x-codeium-csrf-token': csrfToken
            }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('error', reject);
            res.on('aborted', () => reject(new Error(`Resposta RPC interrompida (${url})`)));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                if (res.statusCode !== 200) {
                    return reject(new Error(`RPC retornou HTTP ${res.statusCode}: ${raw}`));
                }
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error(`Falha ao analisar JSON da resposta RPC: ${e.message}`));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error(`Tempo limite da requisição RPC excedido (${timeoutMs}ms): ${url}`)));
        req.on('error', reject);
        req.write(reqBody);
        req.end();
    });
}

async function requireActiveServer({ requireCsrf = false } = {}) {
    const active = await findActiveLanguageServer();
    if (!active) {
        console.error('[!] Processo language_server.exe em execução não detectado. Abra o Antigravity primeiro!');
        process.exitCode = 1;
        return null;
    }
    if (!active.httpsPort) {
        console.error('[!] Não foi possível detectar a porta HTTPS do language_server.');
        process.exitCode = 1;
        return null;
    }
    if (requireCsrf && !active.info.csrfToken) {
        console.error('[!] Não foi possível extrair o CSRF Token.');
        process.exitCode = 1;
        return null;
    }
    return active;
}

function loadDictNormalizedKeys(dictsDir, { lowercase = false, strict = false } = {}) {
    const keySet = new Set();
    const lowerSet = new Set();
    let hasError = false;
    if (!fs.existsSync(dictsDir)) return { exists: false, keySet, lowerSet, hasError };

    for (const f of fs.readdirSync(dictsDir).filter(x => x.endsWith('.json'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dictsDir, f), 'utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('A raiz do dicionário deve ser um objeto JSON');
            }
            for (const k of Object.keys(data)) {
                const nk = normalizeUiText(k);
                keySet.add(nk);
                if (lowercase) lowerSet.add(nk.toLowerCase());
            }
        } catch (e) {
            console.warn(`[!] Falha ao ler dicionário ${f}: ${e.message}`);
            hasError = true;
            if (strict) throw e;
        }
    }
    return { exists: true, keySet, lowerSet, hasError };
}

async function cmdPort() {
    const active = await findActiveLanguageServer();
    if (!active) {
        console.error('[!] Nenhum processo language_server.exe em execução encontrado.');
        process.exitCode = 1;
        return;
    }
    const { info, httpsPort } = active;
    console.log(`[+] language_server.exe detectado (PID: ${info.pid})`);
    console.log(`[+] Portas em escuta: ${info.ports.join(', ')}`);
    console.log(`[+] Token CSRF: ${info.csrfToken || 'não encontrado'}`);

    if (httpsPort) {
        console.log(`[+] Porta Web/SPA ativa: https://127.0.0.1:${httpsPort}`);
    } else {
        console.log('[-] Não foi possível conectar a nenhuma porta HTTPS Web');
        process.exitCode = 1;
    }
}

async function cmdSearch(keyword, contextLen = 300) {
    if (!keyword) {
        console.error('Uso: node scripts/dev_tool.js search <keyword> [contextLen]');
        process.exitCode = 1;
        return;
    }
    const clen = Number(contextLen);
    if (!Number.isInteger(clen) || clen < 0) {
        console.error(`Uso: contextLen deve ser um inteiro não negativo (recebido: ${contextLen})`);
        process.exitCode = 1;
        return;
    }
    const active = await requireActiveServer();
    if (!active) return;
    const { httpsPort } = active;

    console.log(`[*] Baixando e pesquisando "${keyword}" em https://127.0.0.1:${httpsPort}/main.js...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    console.log(`[*] Tamanho de main.js: ${(js.length / 1024 / 1024).toFixed(2)} MB`);

    let matchCount = 0;
    let idx = 0;
    while ((idx = js.indexOf(keyword, idx)) !== -1) {
        matchCount++;
        console.log(`\n=================== Ocorrência #${matchCount} (posição: ${idx}) ===================`);
        const start = Math.max(0, idx - clen);
        const end = Math.min(js.length, idx + keyword.length + clen);
        console.log(js.slice(start, end));
        idx += keyword.length;
    }

    console.log(`\n[*] Pesquisa concluída: ${matchCount} ${matchCount === 1 ? 'ocorrência encontrada' : 'ocorrências encontradas'}.`);
}

async function cmdSlice(startPos, length = 500) {
    const start = Number(startPos);
    const len = Number(length);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(len) || len <= 0) {
        console.error('Uso: node scripts/dev_tool.js slice <startPos>=0 [length>0]');
        process.exitCode = 1;
        return;
    }
    const active = await requireActiveServer();
    if (!active) return;

    const js = await fetchUrl(`https://127.0.0.1:${active.httpsPort}/main.js`);
    console.log(js.slice(start, start + len));
}

async function cmdDumpMcp(args = []) {
    const active = await requireActiveServer({ requireCsrf: true });
    if (!active) return;
    const { info, httpsPort } = active;
    const updateBaseline = args.includes('--update-baseline');

    console.log(`[*] Consultando catálogo MCP via Connect-Web RPC em https://127.0.0.1:${httpsPort}...`);
    const data = await postJsonRpc(
        `https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetAvailableCascadePlugins`,
        info.csrfToken,
        { os: process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'darwin' : 'linux'), searchQuery: '' }
    );
    if (!data || typeof data !== 'object' || !Array.isArray(data.plugins)) {
        throw new Error('GetAvailableCascadePlugins retornou uma estrutura de resposta inesperada');
    }
    const plugins = data.plugins;

    console.log(`[OK] ${plugins.length} ${plugins.length === 1 ? 'servidor MCP oficial obtido' : 'servidores MCP oficiais obtidos'} do cliente!`);

    // 1. Gravar cache local em scratch
    const scratchDir = path.join(__dirname, '..', 'scratch');
    fs.mkdirSync(scratchDir, { recursive: true });
    const outPath = path.join(scratchDir, 'mcp_catalog_official_raw.json');
    fs.writeFileSync(outPath, JSON.stringify(plugins, null, 2), 'utf-8');
    console.log(`[OK] Cache local atualizado em: ${outPath}`);

    // 2. Comparação incremental com o arquivo de referência (scripts/mcp_catalog_baseline.json)
    const baselinePath = path.join(__dirname, 'mcp_catalog_baseline.json');
    let baselineReadFailed = false;
    if (fs.existsSync(baselinePath)) {
        try {
            const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            if (!Array.isArray(baseline)) {
                throw new Error('mcp_catalog_baseline.json deve ser um array JSON');
            }
            const baselineIds = new Set(baseline.map(b => b.id));
            const pluginIds = new Set(plugins.map(p => p.id));

            const added = plugins.filter(p => !baselineIds.has(p.id));
            const removed = baseline.filter(b => !pluginIds.has(b.id));

            console.log('\n------------------ Comparação com a base (Diff) ------------------');
            console.log(`Obtidos agora: ${plugins.length} | Na base: ${baseline.length}`);

            if (added.length === 0 && removed.length === 0) {
                console.log('[OK] Totalmente alinhado com o arquivo de referência; nenhuma adição ou remoção encontrada!');
            } else {
                if (added.length > 0) {
                    console.log(`\n[+] ${added.length} ${added.length === 1 ? 'novo servidor MCP encontrado' : 'novos servidores MCP encontrados'}:`);
                    for (const item of added) {
                        console.log(`    + [${item.id}] ${item.title}`);
                    }
                }
                if (removed.length > 0) {
                    console.log(`\n[-] ${removed.length} ${removed.length === 1 ? 'servidor MCP removido' : 'servidores MCP removidos'}:`);
                    for (const item of removed) {
                        console.log(`    - [${item.id}] ${item.title}`);
                    }
                }
                const diffOutPath = path.join(scratchDir, 'mcp_catalog_diff.json');
                fs.writeFileSync(diffOutPath, JSON.stringify({
                    updatedAt: new Date().toISOString().slice(0, 10),
                    baselineCount: baseline.length,
                    currentCount: plugins.length,
                    added,
                    removed
                }, null, 2), 'utf-8');
                console.log(`[OK] Lista de diferenças salva em: ${diffOutPath}`);
            }
        } catch (e) {
            baselineReadFailed = true;
            console.warn('[!] Falha ao ler/comparar arquivo de referência:', e.message);
            process.exitCode = 1;
        }
    } else {
        console.log('[i] Arquivo de referência scripts/mcp_catalog_baseline.json não encontrado.');
    }

    // 3. Verificação de cobertura nos dicionários (carrega todos os dicts/*.json com normalização)
    const dictsDir = path.join(__dirname, '..', 'dicts');
    const dictResult = loadDictNormalizedKeys(dictsDir);
    if (dictResult.hasError) {
        process.exitCode = 1;
    }
    if (dictResult.exists) {
        const missing = plugins.filter(p => p.description && !dictResult.keySet.has(normalizeUiText(p.description)));
        console.log('\n------------------ Cobertura de tradução nos dicionários ------------------');
        if (missing.length === 0) {
            console.log(`[OK] Perfeito! Todas as ${plugins.length} descrições de MCP já constam nos dicionários pt-BR!`);
        } else {
            console.log(`[!] Atenção: ${missing.length} ${missing.length === 1 ? 'descrição de MCP ainda sem tradução no dicionário' : 'descrições de MCP ainda sem tradução nos dicionários'}:`);
            for (const m of missing) {
                console.log(`    * [${m.id}] ${m.title}`);
            }
        }
    }

    // 4. Atualizar arquivo de referência
    if (updateBaseline) {
        if (baselineReadFailed || dictResult.hasError) {
            throw new Error('Erro detectado ao ler a base ou os dicionários; --update-baseline cancelado para evitar corromper a referência');
        }
        fs.writeFileSync(baselinePath, JSON.stringify(plugins, null, 2), 'utf-8');
        console.log(`\n[OK] Lista atual gravada no arquivo de referência: ${baselinePath}`);
    } else {
        console.log('\nDica: para salvar os dados capturados como nova base de referência, adicione --update-baseline');
    }
}

function normalizeUiText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/[‘’]/g, "'")
               .replace(/[“”]/g, '"')
               .replace(/…/g, '...');
}

function isNaturalUiString(s) {
    if (!s || typeof s !== 'string') return false;
    const t = s.trim();
    if (t.length < 2 || t.length > 600) return false;
    if (!/^[A-Z0-9\[]/.test(t)) return false;
    if (!/[a-zA-Z]{2,}/.test(t)) return false;
    if (/^M[\s\d.-]/.test(t)) return false;
    if (/^(https?:|file:|mailto:|data:|chrome:|antigravity:|vscode:|ws:|wss:|go\/|b\/)/i.test(t)) return false;
    if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(t)) return false;
    if (!t.includes(' ')) {
        if (!/^[A-Z][a-z]{2,20}[.…!?:]?$/.test(t)) return false;
    } else {
        const withoutPlaceholders = t.replace(/\{\d+\}/g, 'X');
        if (/[{}[\]<>$\\|=+;`~^]/.test(withoutPlaceholders) && !/^\[(Dev Mode|Beta|Experimental)\]/i.test(t)) return false;
        if (/\b(function|return|const|var|let|import|export|typeof|undefined|null|true|false|Promise|Error|Object|Array|String|Number)\b/.test(withoutPlaceholders)) return false;
        if (/\b(flex|items-center|justify-|bg-|text-|border-|px-|py-|mt-|mb-|w-|h-|rounded|hidden|block|inline|relative|absolute|shrink-0|truncate|select-none|cursor-pointer|outline-none)\b/.test(withoutPlaceholders)) return false;
        const words = withoutPlaceholders.split(/\s+/);
        if (words.some(w => w.length > 40)) return false;
    }
    return true;
}

function normalizeTemplateLiteral(raw) {
    let out = '';
    let idx = 0;
    let slot = 0;
    while (idx < raw.length) {
        if (raw[idx] === '\\' && idx + 1 < raw.length) {
            out += raw.slice(idx, idx + 2);
            idx += 2;
            continue;
        }
        if (raw[idx] === '$' && raw[idx + 1] === '{') {
            let depth = 1;
            let j = idx + 2;
            while (j < raw.length && depth > 0) {
                if (raw[j] === '\\') { j += 2; continue; }
                if (raw[j] === '"' || raw[j] === "'" || raw[j] === '`') {
                    const q = raw[j++];
                    while (j < raw.length && raw[j] !== q) {
                        if (raw[j] === '\\') j += 2;
                        else j++;
                    }
                } else if (raw[j] === '{') {
                    depth++;
                } else if (raw[j] === '}') {
                    depth--;
                }
                j++;
            }
            if (depth !== 0) return null;
            out += `{${slot++}}`;
            idx = j;
            continue;
        }
        out += raw[idx++];
    }
    return out;
}

function extractUiStringsFromBundle(js) {
    const extracted = new Map();
    const addCandidate = (raw, category) => {
        if (!raw) return;
        let s = raw
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\u2026/g, '...')
            .replace(/\\u2014/g, '—')
            .replace(/\\u2013/g, '–')
            .trim();
        s = normalizeUiText(s);
        if (!isNaturalUiString(s)) return;
        if (!extracted.has(s)) extracted.set(s, new Set());
        extracted.get(s).add(category);
    };

    const propRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|emptyMessage|emptyText|errorMessage|helperText|confirmText|cancelText|buttonText|heading|subheading|subtitle|header|content|message|detail))\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    let m;
    while ((m = propRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        const val = m[3] !== undefined ? m[3] : m[4];
        addCandidate(val, `prop:${prop}`);
    }

    const condPropRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|heading|subheading|subtitle|header|content|message|detail))\s*:\s*[^,?{}]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = condPropRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        addCandidate(m[3] ?? m[4], `condProp:${prop}`);
        addCandidate(m[5] ?? m[6], `condProp:${prop}`);
    }

    const ternaryRegex = /(?:return|\b[a-zA-Z0-9_$]+\s*=)\s*[^;{}()]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = ternaryRegex.exec(js)) !== null) {
        addCandidate(m[1] ?? m[2], 'ternary');
        addCandidate(m[3] ?? m[4], 'ternary');
    }

    const ceRegex = /createElement\(\s*(?:[A-Za-z0-9_$.]+|"[a-z0-9-]+")\s*,\s*(?:null|void 0|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9_$.]+)\s*,([\s\S]{1,400}?)\)/g;
    while ((m = ceRegex.exec(js)) !== null) {
        const childrenChunk = m[1];
        const strMatches = childrenChunk.matchAll(/(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g);
        for (const sm of strMatches) {
            const idxInChunk = sm.index;
            const before = childrenChunk.slice(Math.max(0, idxInChunk - 25), idxInChunk);
            if (/(?:className|name|variant|size|id|key|type|role|href|target|rel|place|to|mode|style|stroke|fill|d|viewBox|data-[a-z-]+)\s*:\s*$/.test(before)) {
                continue;
            }
            addCandidate(sm[1] ?? sm[2], 'jsx:child');
        }
    }

    // 4. Filho string direto de createElement (evita truncamento por parênteses como "(invoked with /browser)")
    const directCeRegex = /createElement\(\s*(?:[A-Za-z0-9_$.]+|"[a-z0-9-]+")\s*,\s*(?:null|void 0|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9_$.]+)\s*,\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = directCeRegex.exec(js)) !== null) {
        addCandidate(m[1] ?? m[2], 'jsx:child');
    }

    // 5. Atributo condicional com string em apenas um ramo (ex.: description: cond ? "str" : createElement(...))
    const condPropSingleRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|heading|subheading|subtitle|header|content|message|detail))\s*:\s*[^,?{}]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = condPropSingleRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        addCandidate(m[3] ?? m[4], `condProp:${prop}`);
    }

    // 6. Template literals com crase (atributos e filhos diretos de createElement)
    const templatePropRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|emptyMessage|emptyText|errorMessage|helperText|confirmText|cancelText|buttonText|heading|subheading|subtitle|header|content|message|detail))\s*:\s*`((?:[^`\\]|\\.)*)`/g;
    while ((m = templatePropRegex.exec(js)) !== null) {
        const tpl = normalizeTemplateLiteral(m[3]);
        if (tpl && tpl.length <= 600 && !tpl.trimStart().startsWith('<')) {
            addCandidate(tpl, `tplProp:${m[1] || m[2]}`);
        }
    }

    const templateCeRegex = /createElement\(\s*(?:[A-Za-z0-9_$.]+|"[a-z0-9-]+")\s*,\s*(?:null|void 0|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9_$.]+)\s*,\s*`((?:[^`\\]|\\.)*)`/g;
    while ((m = templateCeRegex.exec(js)) !== null) {
        const tpl = normalizeTemplateLiteral(m[1]);
        if (tpl && tpl.length <= 600 && !tpl.trimStart().startsWith('<')) {
            addCandidate(tpl, 'tpl:jsx');
        }
    }

    return extracted;
}

async function cmdScanUi(args = []) {
    const active = await requireActiveServer();
    if (!active) return;
    const { info, httpsPort } = active;
    const updateBaseline = args.includes('--update-baseline');

    let appVersion = 'unknown';
    try {
        const indexHtml = await fetchUrl(`https://127.0.0.1:${httpsPort}/`);
        const verMatch = indexHtml.match(/"appVersion"\s*:\s*"([^"]+)"/);
        if (verMatch) appVersion = verMatch[1];
    } catch (e) {
        console.warn(`[!] Falha ao obter a versão do cliente: ${e.message}`);
    }

    console.log(`[*] Extraindo todas as strings de interface e dicas de https://127.0.0.1:${httpsPort}/main.js (v${appVersion})...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    const extracted = extractUiStringsFromBundle(js);

    // Extrai textos dinâmicos de UI enviados por experimentos Mendel via Connect-Web RPC (ex.: cartões de boas-vindas e avisos)
    if (info.csrfToken) {
        try {
            const mendelData = await postJsonRpc(
                `https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetMendelFlags`,
                info.csrfToken,
                {}
            );
            const exps = (mendelData && mendelData.experimentConfig && mendelData.experimentConfig.experiments) || (mendelData && mendelData.flags) || [];
            const walkJson = (obj, keyName) => {
                if (!obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) {
                    for (const item of obj) walkJson(item, keyName);
                    return;
                }
                for (const [k, v] of Object.entries(obj)) {
                    if (typeof v === 'string' && /^(title|description|label|sublabel|tooltip|placeholder|message|heading|subtitle)$/i.test(k)) {
                        const s = normalizeUiText(v);
                        if (isNaturalUiString(s)) {
                            if (!extracted.has(s)) extracted.set(s, new Set());
                            extracted.get(s).add(`mendel:${keyName}`);
                        }
                    } else if (v && typeof v === 'object') {
                        walkJson(v, keyName);
                    }
                }
            };
            for (const exp of exps) {
                const keyName = exp.keyString || exp.name || 'flag';
                if (/cli-announcement/i.test(keyName)) continue;
                const valStr = typeof exp.string === 'string' ? exp.string : (typeof exp.value === 'string' ? exp.value : '');
                if (!valStr) continue;
                const trimmed = valStr.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        walkJson(JSON.parse(trimmed), keyName);
                    } catch (jsonErr) {
                        console.warn(`[!] Falha ao analisar JSON do experimento Mendel ${keyName}: ${jsonErr.message}`);
                    }
                } else if (trimmed.includes(' ')) {
                    const s = normalizeUiText(trimmed);
                    if (isNaturalUiString(s)) {
                        if (!extracted.has(s)) extracted.set(s, new Set());
                        extracted.get(s).add(`mendel:${keyName}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`[!] Falha ao obter configuração de experimentos Mendel: ${e.message}`);
        }

        // Extrai strings dinâmicas do backend via RPC GetUserStatus / RetrieveUserQuotaSummary / GetSlashCommands e descrições dos comandos '/' embutidos
        let us = null;
        const recordRpcString = (rawText, source) => {
            const s = normalizeUiText(rawText || '');
            if (isNaturalUiString(s)) {
                if (!extracted.has(s)) extracted.set(s, new Set());
                extracted.get(s).add(source);
            }
        };
        try {
            us = await postJsonRpc(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetUserStatus`, info.csrfToken, {});
            for (const cfg of (us?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [])) {
                recordRpcString(cfg?.tagDescription, 'rpc:userStatus');
            }
            recordRpcString(us?.userStatus?.userTier?.upgradeSubscriptionText, 'rpc:userStatus');
        } catch (e) {
            console.warn(`[!] Falha ao obter strings dinâmicas de status do usuário: ${e.message}`);
        }

        try {
            const quota = await postJsonRpc(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, info.csrfToken, {});
            for (const grp of (quota?.response?.groups || quota?.groups || [])) {
                recordRpcString(grp?.description, 'rpc:quotaSummary');
                for (const bkt of (grp?.buckets || [])) {
                    recordRpcString(bkt?.displayName, 'rpc:quotaSummary');
                    recordRpcString(bkt?.description, 'rpc:quotaSummary');
                }
            }
        } catch (e) {
            console.warn(`[!] Falha ao obter strings dinâmicas do resumo de cota: ${e.message}`);
        }

        try {
            const defaultModel = us?.userStatus?.cascadeModelConfigData?.defaultOverrideModelConfig?.modelOrAlias;
            const scData = await postJsonRpc(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetSlashCommands`, info.csrfToken, {
                cascadeConfig: {
                    plannerConfig: {
                        planModel: defaultModel?.model || 'MODEL_PLACEHOLDER_M26',
                        requestedModel: defaultModel || { model: 'MODEL_PLACEHOLDER_M26' }
                    }
                }
            });
            for (const cmd of (scData?.commands || [])) {
                const defPath = cmd.info?.definitionPath || '';
                if (defPath && !/[\\/]\.gemini[\\/]antigravity[\\/]builtin[\\/]/i.test(defPath)) continue;
                recordRpcString(cmd.description, 'rpc:slashCommand');
            }
        } catch (e) {
            console.warn(`[!] Falha ao obter descrições de comandos de barra embutidos: ${e.message}`);
        }
    }

    const allStrings = [...extracted.keys()].sort();
    console.log(`[OK] Extração concluída! ${allStrings.length} ${allStrings.length === 1 ? 'string de interface e dica encontrada' : 'strings de interface e dicas encontradas'}.`);

    // Carrega os dicionários pt-BR atuais
    const dictsDir = path.join(__dirname, '..', 'dicts');
    const dictResult = loadDictNormalizedKeys(dictsDir, { lowercase: true });
    if (dictResult.hasError) {
        process.exitCode = 1;
    }
    const dictSet = dictResult.keySet;
    const dictLowerSet = dictResult.lowerSet;

    // Compara com o arquivo de referência (scripts/ui_strings_baseline.json)
    const baselinePath = path.join(__dirname, 'ui_strings_baseline.json');
    let addedStrings = allStrings;
    let baselineReadFailed = false;
    if (fs.existsSync(baselinePath)) {
        try {
            const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            if (!baselineData || typeof baselineData !== 'object') {
                throw new Error('ui_strings_baseline.json resultou em valor vazio ou não objeto');
            }
            const baseList = Array.isArray(baselineData) ? baselineData : (Array.isArray(baselineData.strings) ? baselineData.strings : null);
            if (!baseList) {
                throw new Error('ui_strings_baseline.json não possui o array strings');
            }
            const baseSet = new Set(baseList);
            const curSet = new Set(allStrings);

            addedStrings = allStrings.filter(s => !baseSet.has(s));
            const removedStrings = baseList.filter(s => !curSet.has(s));

            console.log('\n------------------ Comparação incremental de versão (UI Diff) ------------------');
            console.log(`Versão de referência: v${baselineData.version || 'desconhecida'} (${baseList.length}) | Versão atual: v${appVersion} (${allStrings.length})`);
            if (addedStrings.length === 0 && removedStrings.length === 0) {
                console.log('[OK] Totalmente igual à versão de referência; nenhuma mudança de strings de interface detectada!');
            } else {
                console.log(`[+] Adicionadas: ${addedStrings.length} | [-] Removidas: ${removedStrings.length}`);
            }
        } catch (e) {
            baselineReadFailed = true;
            console.warn('[!] Falha ao ler arquivo de referência da UI:', e.message);
            process.exitCode = 1;
        }
    } else {
        console.log('\n[i] Arquivo de referência de strings da UI ainda não criado (scripts/ui_strings_baseline.json).');
    }

    // Verifica quantas das novas strings ainda não estão traduzidas
    const untranslatedNew = addedStrings
        .filter(s => !dictSet.has(s) && !dictLowerSet.has(s.toLowerCase()))
        .map(s => ({ str: s, cats: [...(extracted.get(s) || [])].join(',') }));

    console.log('\n------------------ Cobertura de tradução das novas strings ------------------');
    if (untranslatedNew.length === 0) {
        console.log('[OK] Perfeito! Todas as novas strings de interface e dicas já estão cobertas pelos dicionários pt-BR!');
    } else {
        console.log(`[!] ${untranslatedNew.length} ${untranslatedNew.length === 1 ? 'nova string sem tradução encontrada' : 'novas strings sem tradução encontradas'}:`);
        for (const item of untranslatedNew.slice(0, 40)) {
            console.log(`    * [${item.cats}] ${item.str}`);
        }
        if (untranslatedNew.length > 40) {
            console.log(`    ... e mais ${untranslatedNew.length - 40} (lista completa salva em scratch/untranslated_ui_diff.json)`);
        }
        const scratchDir = path.join(__dirname, '..', 'scratch');
        fs.mkdirSync(scratchDir, { recursive: true });
        const diffOutPath = path.join(scratchDir, 'untranslated_ui_diff.json');
        fs.writeFileSync(diffOutPath, JSON.stringify(untranslatedNew, null, 2), 'utf8');
        console.log(`[OK] Lista incremental de pendentes salva em: ${diffOutPath}`);
    }

    if (updateBaseline) {
        if (baselineReadFailed || dictResult.hasError) {
            throw new Error('Erro detectado ao ler a base ou os dicionários; --update-baseline cancelado para evitar corromper a referência');
        }
        const payload = {
            version: appVersion,
            updatedAt: new Date().toISOString().slice(0, 10),
            count: allStrings.length,
            strings: allStrings
        };
        fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`\n[OK] ${allStrings.length} strings de UI da v${appVersion} gravadas no arquivo de referência: ${baselinePath}`);
    } else {
        console.log('\nDica: após concluir a tradução, adicione --update-baseline para salvar esta versão como nova referência.');
    }
}

async function main() {
    const [,, command, ...args] = process.argv;
    switch (command) {
        case 'port':
            await cmdPort();
            break;
        case 'search':
            await cmdSearch(args[0], args[1]);
            break;
        case 'slice':
            await cmdSlice(args[0], args[1]);
            break;
        case 'dump-mcp':
            await cmdDumpMcp(args);
            break;
        case 'scan-ui':
            await cmdScanUi(args);
            break;
        default:
            console.log('Conjunto de ferramentas de engenharia reversa e diagnóstico do Antigravity (dev_tool.js)');
            console.log('Comandos disponíveis:');
            console.log('  node scripts/dev_tool.js port                          - Exibe PID, portas e CSRF Token do language_server');
            console.log('  node scripts/dev_tool.js search <keyword>              - Pesquisa palavra-chave no main.js em execução');
            console.log('  node scripts/dev_tool.js slice <pos> [len]             - Exibe trecho do main.js na posição indicada');
            console.log('  node scripts/dev_tool.js dump-mcp [--update-baseline]  - Exporta catálogo MCP oficial e compara com a referência');
            console.log('  node scripts/dev_tool.js scan-ui [--update-baseline]   - Varre strings da interface e compara com base e dicionários');
            break;
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('[Erro]', err.message);
        process.exitCode = 1;
    });
}

module.exports = {
    normalizeUiText,
    isNaturalUiString,
    extractUiStringsFromBundle
};
