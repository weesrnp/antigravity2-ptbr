const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

// Regressões de espaçamento, ícones SVG e nomes na interface.
// Estes valores de teste acionam a regra CJK mesmo com o dicionário de produção em pt-BR.
const cjkFixture = { dictionaryOverrides: {
    Settings: '設定',
    Help: '說明',
    'Agents created by': '由 ',
    'run in a dedicated': ' 建立於',
    'Test workspace': '工作區',
} };

const settle = () => new Promise(resolve => setTimeout(resolve, 35));

test('CJK gap handling follows node removal, deep inline edits, author whitespace, reused separators and streaming neighbors', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // Desativa as varreduras agendadas para medir apenas as mutações do teste.
    win.setTimeout = () => 0;
    win.eval(loadRuntime(cjkFixture));
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };

    const removal = add('<span>Settings<!----> <!----><b>Help</b>Bob</span>');
    const deep = add('<span>Settings<!----> <!----><a><span><span><span>Help</span></span></span></a></span>');
    const author = add('<span style="white-space:pre-wrap">甲<!----> <!---->乙</span>');
    const sep = add('<span>Settings<!----> <!---->Help</span>');
    const stream = doc.createTextNode('測試');
    const host = doc.createElement('div');
    host.setAttribute('data-testid', 'planner-response-text');
    const section = doc.createElement('section');
    for (let i = 0; i < 1200; i++) { const s = doc.createElement('span'); s.textContent = 'abcdefghij'; section.append(s); }
    host.append(stream, section);
    const box = doc.createElement('div');
    box.append('甲', ' ', host);
    doc.body.append(box);
    await pause();
    assert.equal(removal.textContent, '設定說明Bob');
    assert.equal(deep.textContent, '設定說明');
    // Espaços escolhidos pelo autor entre caracteres CJK devem permanecer.
    assert.equal(author.textContent, '甲 乙');

    // Remover um nó também exige reavaliar os espaços vizinhos.
    removal.querySelector('b').remove();
    // Uma alteração dentro de quatro elementos inline deve restaurar o espaço externo.
    deep.querySelector('a span span span').firstChild.data = 'Bob';
    await pause();
    assert.equal(removal.textContent, '設定 Bob');
    assert.equal(deep.textContent, '設定 Bob');

    // Se o React reutilizar o separador, o runtime deve descartar o registro anterior.
    const sepSpan = sep.firstChild;
    const gap = Array.from(sepSpan.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE && n.data === '');
    gap.data = '/';
    await pause();
    gap.data = '';
    await pause();
    sepSpan.firstChild.data = 'Alice';
    sepSpan.lastChild.data = 'Bob';
    await pause();
    assert.equal(sep.textContent, 'AliceBob');

    // A resposta em streaming fica isolada e não deve ser lida para calcular o espaço.
    const desc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'textContent');
    let hostReads = 0;
    Object.defineProperty(host, 'textContent', { configurable: true, get() { hostReads++; return desc.get.call(this); } });
    for (let i = 0; i < 3; i++) { stream.data = '測試' + i; await pause(); }
    delete host.textContent;
    assert.equal(hostReads, 0);
    assert.ok(box.textContent.startsWith('甲 測試2'), box.textContent.slice(0, 8));
});

test('icon fallbacks clean up after the icon class is removed and keep accessible names; attribute rules and source ellipsis survive', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // Desativa as varreduras agendadas entre as asserções sobre os ícones.
    win.setTimeout = () => 0;
    win.eval(loadRuntime());
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };

    const icon = add('<span class="google-symbols">comment</span>');
    const buttons = add('<button><span class="google-symbols">comment</span></button><button><span class="google-symbols" aria-hidden="true">comment</span></button>');
    const labels = add('<button aria-label="Label for Foo">a</button><button aria-label="Open the Swarm UI">b</button><button aria-label="Open Settings">c</button>');
    const ellipsis = add('<span>Show 3 more results…</span><button title="Show 3 more…">x</button>');
    await pause();

    // Ao reutilizar o texto e remover a classe do ícone, o React deve perder também o SVG.
    const iconSpan = icon.firstChild;
    assert.equal(iconSpan.querySelectorAll('svg').length, 1);
    iconSpan.className = '';
    Array.from(iconSpan.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE).data = 'Help';
    await pause();
    assert.equal(iconSpan.querySelectorAll('svg').length, 0);
    assert.equal(iconSpan.textContent, 'Ajuda');

    // O SVG fornece o nome acessível quando o botão depende apenas do ícone.
    const [named, hidden] = buttons.querySelectorAll('svg');
    assert.equal(named.getAttribute('role'), 'img');
    assert.equal(named.getAttribute('aria-label'), 'Comentar');
    assert.equal(hidden.getAttribute('aria-hidden'), 'true');
    assert.equal(hidden.hasAttribute('aria-label'), false);

    // Uma frase em inglês capturada como nome permanece intacta.
    const [labelFor, swarm, open] = labels.querySelectorAll('button');
    assert.equal(labelFor.getAttribute('aria-label'), 'Rótulo para Foo');
    assert.equal(swarm.getAttribute('aria-label'), 'Open the Swarm UI');
    assert.equal(open.getAttribute('aria-label'), 'Abrir configurações');

    // Preserva o caractere único de reticências da origem.
    assert.equal(ellipsis.querySelector('span').textContent, 'Mostrar mais 3 resultados…');
    assert.equal(ellipsis.querySelector('button').getAttribute('title'), 'Mostrar mais 3…');
});

test('CJK spacing keeps the space beside Latin or symbols, ignores reused nodes, skips fillers the same way on both sides, re-checks grown ancestors, stays bounded and leaves editors alone', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // O jsdom precisa de isContentEditable para simular a mudança para um editor.
    Object.defineProperty(win.HTMLElement.prototype, 'isContentEditable', { configurable: true, get() { return !!this.closest('[contenteditable="true"]'); } });
    // Desativa as varreduras agendadas durante a contagem de leituras.
    win.setTimeout = () => 0;
    win.eval(loadRuntime(cjkFixture));
    const el = (tag, ...parts) => { const e = doc.createElement(tag); for (const p of parts) e.append(p); return e; };
    const para = (...parts) => { const p = el('p', ...parts); doc.body.append(p); return p; };
    // Fragmentos separados por nós, como no diálogo de permissões.
    const rest = [' run in a dedicated', ' ', 'Test workspace'];
    const tail = '建立於工作區';

    // Ao lado de letras latinas ou símbolos o espaço deve permanecer.
    const google = para('by allowing Google to collect and use my Interactions data, subject to the Google ', el('a', 'Privacy Policy'));
    const crumb = para('Settings - ', el('a', 'General'));
    // O React pode reutilizar um nó traduzido para conteúdo do usuário.
    const reused = para('Settings', ' ', '乙');
    // O nome pode vir após um nó de texto vazio.
    const filler = para('Agents created by ', '', '我的外掛', ...rest);
    // O React insere um terceiro filho no início do elemento inline.
    const inline = el('span', el('b', '我的'), el('i', '外掛'));
    const grown = para('Agents created by ', inline, ...rest);
    // O parágrafo se torna editável somente após a tradução.
    const editable = para('Agents created by ', 'Foo', ...rest);
    await pause();

    assert.equal(google.textContent, 'permitindo que o Google colete e use meus dados de interações, conforme a Política de privacidade');
    assert.equal(crumb.textContent, 'Configurações - Geral');

    assert.equal(reused.textContent, '設定乙');
    reused.firstChild.data = '甲';
    await pause();
    assert.equal(reused.textContent, '甲 乙');
    // Um texto digitado igual a uma tradução antiga continua sendo conteúdo do usuário.
    reused.firstChild.data = '設定';
    await pause();
    assert.equal(reused.textContent, '設定 乙');

    assert.equal(filler.textContent, '由我的外掛' + tail);
    filler.childNodes[2].data = 'Foo';
    await pause();
    assert.equal(filler.textContent, '由 Foo ' + tail);

    assert.equal(grown.textContent, '由我的外掛' + tail);
    inline.prepend(el('em', 'Foo'));
    await pause();
    assert.ok(grown.textContent.startsWith('由 Foo我的外掛 建立'), grown.textContent);

    assert.equal(editable.textContent, '由 Foo ' + tail);
    editable.setAttribute('contenteditable', 'true');
    editable.childNodes[1].data = '我的';
    await pause();
    assert.equal(editable.textContent, '由 我的 ' + tail);

    // A quantidade de vizinhos lidos deve ser limitada mesmo com muitos nós vazios.
    const nodeTypeDesc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'nodeType');
    const countReads = async fillers => {
        const reply = el('div');
        for (let i = 0; i < fillers; i++) reply.append('');
        const stream = doc.createTextNode('x');
        reply.append(stream);
        para('Settings', ' ', reply);
        await pause();
        let reads = 0;
        Object.defineProperty(win.Node.prototype, 'nodeType', { configurable: true, get() { reads++; return nodeTypeDesc.get.call(this); } });
        try {
            for (let i = 0; i < 3; i++) { stream.data = 'y' + i; await pause(); }
        } finally {
            Object.defineProperty(win.Node.prototype, 'nodeType', nodeTypeDesc);
        }
        return reads;
    };
    const few = await countReads(0);
    const many = await countReads(1000);
    assert.ok(many - few < 200, `Leituras de nodeType: ${few} sem nós vazios e ${many} com 1000 nós vazios`);
});

test('icon fallbacks handle blank text, host label removal and reused text nodes; capitalized names stay translatable and a moved source ellipsis keeps its form', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // Evita varreduras agendadas que alterem o ícone entre as asserções.
    win.setTimeout = () => 0;
    win.eval(loadRuntime(cjkFixture));
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };
    const textOf = el => Array.from(el.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE);

    const blank = add('<span class="google-symbols">comment</span>');
    const labelled = add('<button><span class="google-symbols" aria-label="Comments">comment</span></button>');
    const sentence = doc.createElement('p');
    for (const t of ['Agents created by ', '我的外掛', ' run in a dedicated', ' ', 'workspace', ' settings page.']) sentence.append(t);
    doc.body.append(sentence);
    const attrs = add('<button title="Keep: My Project">a</button><button aria-label="Label for Foo…">b</button>');
    await pause();

    // O SVG é removido quando o nome do ícone vira um espaço em branco.
    const blankHost = blank.firstChild;
    assert.equal(blankHost.querySelectorAll('svg').length, 1);
    textOf(blankHost).data = ' ';
    await pause();
    assert.equal(blankHost.querySelectorAll('svg').length, 0);

    // O nome acessível passa ao SVG quando o elemento perde seu próprio rótulo.
    const labelledHost = labelled.querySelector('.google-symbols');
    const labelledSvg = labelledHost.querySelector('svg');
    assert.equal(labelledSvg.getAttribute('aria-hidden'), 'true');
    labelledHost.removeAttribute('aria-label');
    await pause();
    assert.equal(labelledSvg.hasAttribute('aria-hidden'), false);
    assert.equal(labelledSvg.getAttribute('role'), 'img');
    assert.ok(labelledSvg.getAttribute('aria-label'));

    // Reutilizar o prefixo como ícone deve invalidar o texto salvo para espaçamento.
    const prefix = sentence.firstChild;
    assert.equal(prefix.data, '由');
    sentence.className = 'google-symbols';
    prefix.data = 'comment';
    await pause();
    assert.equal(sentence.querySelectorAll('svg').length, 1);
    sentence.childNodes[2].data = 'Foo';
    await pause();
    assert.equal(prefix.data, '');

    // Um nome próprio continua elegível para as regras de atributos.
    const [keep, labelFor] = attrs.querySelectorAll('button');
    assert.equal(keep.getAttribute('title'), 'Manter: My Project');
    // As reticências da origem preservam sua forma na tradução.
    assert.equal(labelFor.getAttribute('aria-label'), 'Rótulo para Foo…');
});

test('dictionary fragments drop built-in edge spaces next to Chinese names, restore them when React swaps the name, and leave user-chosen names untranslated', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // Evita varreduras agendadas entre a tradução inicial e a troca do nome.
    win.setTimeout = () => 0;
    win.eval(loadRuntime(cjkFixture));
    // O nome ocupa o segundo nó de texto, como no diálogo real.
    const sentence = name => {
        const p = doc.createElement('p');
        for (const t of ['Agents created by ', name, ' run in a dedicated', ' ', 'Test workspace']) p.append(t);
        doc.body.append(p);
        return p;
    };
    const tail = '建立於工作區';
    const cjk = sentence('自動化任務');
    const latin = sentence('Foo Plugin');
    // O nome escolhido pelo usuário pode coincidir com uma chave do dicionário.
    const dictionaryName = sentence('Settings');
    await pause();
    assert.equal(cjk.textContent, '由自動化任務' + tail);
    assert.equal(latin.textContent, '由 Foo Plugin ' + tail);
    assert.equal(dictionaryName.textContent, '由 Settings ' + tail);

    cjk.childNodes[1].data = 'Foo Plugin';
    latin.childNodes[1].data = '我的外掛';
    await pause();
    assert.equal(cjk.textContent, '由 Foo Plugin ' + tail);
    assert.equal(latin.textContent, '由我的外掛' + tail);
});

test('pt-BR: automation sentence fragments keep spaces next to Chinese names, keep user-chosen names, and icon names stay untranslated', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    // Desativa as varreduras agendadas para observar apenas a troca de nome.
    win.setTimeout = () => 0;
    win.eval(loadRuntime());
    // O diálogo de automação mantém o nome em um nó de texto independente.
    const rest = [' run in a dedicated', ' ', 'workspace', ' with its own permissions, which you can change anytime in the ', 'workspace', ' settings page.'];
    const tail = ' são executados em um espaço de trabalho dedicado com permissões próprias, que você pode alterar a qualquer momento nas configurações do espaço de trabalho.';
    const sentence = name => { const p = doc.createElement('p'); for (const s of ['Agents created by ', name, ...rest]) p.append(s); doc.body.append(p); return p; };
    const cjk = sentence('我的插件');
    const latin = sentence('Foo Plugin');
    const dictName = sentence('Settings');
    const icons = doc.createElement('div');
    icons.innerHTML = '<span class="google-symbols">comment</span><span class="google-symbols">settings</span>';
    doc.body.append(icons);
    await settle();

    assert.equal(cjk.textContent, 'Os agentes criados por 我的插件' + tail);
    assert.equal(latin.textContent, 'Os agentes criados por Foo Plugin' + tail);
    // Preserva nomes escolhidos pelo usuário que também são chaves do dicionário.
    assert.equal(dictName.textContent, 'Os agentes criados por Settings' + tail);
    assert.equal(icons.querySelectorAll('svg[data-ag-icon-fallback="comment"]').length, 1);
    assert.equal(icons.textContent, 'settings');

    // O React troca os nomes sem recriar os elementos.
    cjk.childNodes[1].data = 'Foo Plugin';
    latin.childNodes[1].data = '我的插件';
    await settle();
    assert.equal(cjk.textContent, 'Os agentes criados por Foo Plugin' + tail);
    assert.equal(latin.textContent, 'Os agentes criados por 我的插件' + tail);
});
