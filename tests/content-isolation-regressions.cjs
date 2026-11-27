const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

const settle = () => new Promise(resolve => setTimeout(resolve, 35));

async function fixture(t, html, beforeInject, runtimeOptions) {
    const dom = createDom(html);
    t.after(() => dom.window.close());
    beforeInject?.(dom.window);
    dom.window.eval(loadRuntime(runtimeOptions));
    await settle();
    return dom.window;
}

test('File Viewer isolation survives translating its accessible name', async t => {
    const w = await fixture(t, '<div aria-label="File Viewer"><span id="file">Settings</span></div><button id="ui">Settings</button>');
    assert.equal(w.document.querySelector('#file').textContent, 'Settings');
    assert.equal(w.document.querySelector('#ui').textContent, 'Configurações');
    const file = w.document.querySelector('#file');
    file.parentElement.setAttribute('aria-label', 'Visualizador de arquivos');
    file.textContent = 'Knowledge';
    await settle();
    assert.equal(file.textContent, 'Knowledge', 'subsequent mutations inside the file viewer must stay isolated');
});

test('textarea initial value and defaultValue are preserved while unfocused', async t => {
    const w = await fixture(t, '<textarea id="draft">Settings</textarea><button>Settings</button>');
    const draft = w.document.querySelector('#draft');
    assert.equal(draft.value, 'Settings');
    assert.equal(draft.defaultValue, 'Settings');
    assert.equal(draft.textContent, 'Settings');
    assert.equal(w.document.querySelector('button').textContent, 'Configurações');
});

test('textarea dirty value and focused value survive initial and subsequent translation', async t => {
    const w = await fixture(t, '<textarea id="draft">Settings</textarea>', window => {
        const draft = window.document.querySelector('#draft');
        draft.value = 'Knowledge';
        draft.focus();
    });
    const draft = w.document.querySelector('#draft');
    assert.equal(draft.value, 'Knowledge');
    assert.equal(draft.defaultValue, 'Settings');
    draft.blur();
    draft.defaultValue = 'New Conversation';
    await settle();
    assert.equal(draft.value, 'Knowledge', 'changing the default must not overwrite the dirty draft');
    assert.equal(draft.defaultValue, 'New Conversation');
});

test('input values and contenteditable drafts remain unmodified', async t => {
    const w = await fixture(t, '<input id="input" value="Settings"><div contenteditable="true" id="editable">Knowledge</div><div contenteditable="plaintext-only" id="plain">Settings</div>');
    const input = w.document.querySelector('#input');
    assert.equal(input.value, 'Settings');
    assert.equal(input.defaultValue, 'Settings');
    assert.equal(w.document.querySelector('#editable').textContent, 'Knowledge');
    assert.equal(w.document.querySelector('#plain').textContent, 'Settings');
    input.value = 'Knowledge';
    w.document.querySelector('#editable').textContent = 'New Conversation';
    await settle();
    assert.equal(input.value, 'Knowledge');
    assert.equal(input.defaultValue, 'Settings');
    assert.equal(w.document.querySelector('#editable').textContent, 'New Conversation');
});

test('user messages, AI responses, code and URI-marked previews remain isolated', async t => {
    const w = await fixture(t, `
      <div data-testid="user-input-step"><div data-quotable="true" id="user">Settings</div></div>
      <div data-testid="planner-response-text" id="ai">Knowledge</div>
      <pre id="pre">Settings</pre><code id="code">Knowledge</code>
      <div data-file-uri="file:///example.txt" id="file">New Conversation</div>
      <div data-uri="file:///example.txt" id="uri">Settings</div>
      <div translate="no" id="no">Knowledge</div>
      <div id="absolute">C:\\Settings\\New Conversation</div>
      <div id="url">file:///Settings/Knowledge</div>
      <button id="ui">Settings</button>
    `);
    for (const [id, expected] of [
        ['user', 'Settings'], ['ai', 'Knowledge'], ['pre', 'Settings'], ['code', 'Knowledge'],
        ['file', 'New Conversation'], ['uri', 'Settings'], ['no', 'Knowledge'],
        ['absolute', 'C:\\Settings\\New Conversation'], ['url', 'file:///Settings/Knowledge'],
    ]) {
        assert.equal(w.document.getElementById(id).textContent, expected, id);
    }
    assert.equal(w.document.querySelector('#ui').textContent, 'Configurações');
});

test('protected shadow hosts keep initial and dynamic descendants untouched', async t => {
    let shadow;
    const w = await fixture(t, '<div id="host" data-file-uri="file:///example.txt"></div>', window => {
        shadow = window.document.querySelector('#host').attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span id="inside">Settings</span>';
    });
    assert.equal(shadow.querySelector('#inside').textContent, 'Settings');
    shadow.querySelector('#inside').textContent = 'Knowledge';
    const added = w.document.createElement('span');
    added.textContent = 'New Conversation';
    shadow.appendChild(added);
    await settle();
    assert.equal(shadow.querySelector('#inside').textContent, 'Knowledge');
    assert.equal(added.textContent, 'New Conversation');
});

test('native select preserves implicit and explicit option values and selection', async t => {
    const w = await fixture(t, '<form><select name="choice" id="pick"><option>Settings</option><option value="stable-id" selected>Knowledge</option></select></form>');
    const pick = w.document.querySelector('#pick');
    assert.equal(pick.options[0].value, 'Settings', 'an implicit value must not become a translated label');
    assert.equal(pick.options[1].value, 'stable-id');
    assert.equal(pick.options[1].defaultSelected, true);
    assert.equal(pick.selectedIndex, 1);
    assert.equal(pick.value, 'stable-id');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'stable-id');
});

test('dynamic native option updates preserve form submission values', async t => {
    const w = await fixture(t, '<form><select name="choice" id="pick"><option>Settings</option></select></form>');
    const pick = w.document.querySelector('#pick');
    pick.options[0].textContent = 'Knowledge';
    await settle();
    assert.equal(pick.options[0].value, 'Knowledge');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'Knowledge');
    const added = w.document.createElement('option');
    added.textContent = 'New Conversation';
    pick.appendChild(added);
    pick.selectedIndex = 1;
    await settle();
    assert.equal(added.value, 'New Conversation');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'New Conversation');
});

test('input and textarea placeholders and titles are translated while values remain untouched', async t => {
    const w = await fixture(t, '<input id="search" placeholder="Search tasks..." title="Search tasks..." value="Settings"><textarea id="draft" placeholder="Search conversations...">Settings</textarea>');
    const search = w.document.querySelector('#search');
    const draft = w.document.querySelector('#draft');
    assert.equal(search.getAttribute('placeholder'), 'Pesquisar tarefas...');
    assert.equal(search.getAttribute('title'), 'Pesquisar tarefas...');
    assert.equal(search.value, 'Settings');
    assert.equal(draft.getAttribute('placeholder'), 'Pesquisar conversas...');
    assert.equal(draft.value, 'Settings');
});

test('dynamic permission choices translate around commands without altering payloads or code blocks', async t => {
    const cmd = `'$p="$HOME\\.gemini\\GEMINI.md"; Get-Content $p'`;
    const w = await fixture(t, `
        <h2 id="title">Allow running this command outside the sandbox?</h2>
        <button id="conv"></button>
        <button id="proj"></button>
        <button id="unscoped"></button>
        <button id="static-conv">Yes, and always allow in this conversation</button>
        <pre id="code">Yes, and always allow 'command'</pre>
    `, window => {
        window.document.getElementById('conv').textContent = `Yes, and always allow ${cmd} in this conversation`;
        window.document.getElementById('proj').textContent = `Yes, and always allow ${cmd} in this project`;
        window.document.getElementById('unscoped').textContent = `Yes, and always allow echo run  in this conversation`;
    });
    assert.equal(w.document.getElementById('title').textContent, 'Permitir a execução deste comando fora do sandbox?');
    assert.equal(w.document.getElementById('conv').textContent, `Sim, e sempre permitir executar ${cmd} nesta conversa`);
    assert.equal(w.document.getElementById('proj').textContent, `Sim, e sempre permitir executar ${cmd} neste projeto`);
    assert.equal(w.document.getElementById('unscoped').textContent, 'Sim, e sempre permitir executar echo run  in this conversation');
    assert.equal(w.document.getElementById('static-conv').textContent, 'Sim, e sempre permitir nesta conversa');
    assert.equal(w.document.getElementById('code').textContent, "Yes, and always allow 'command'");
});

test('permission write-in translates reject label and placeholder while preserving input value', async t => {
    const w = await fixture(t, '<label><input type="radio" value="__write_in__"><div><span id="reject">No</span><textarea id="answer" data-testid="ask-question-writein" placeholder="(tell the agent what to do instead)">No</textarea></div></label><span id="other">No</span>');
    const answer = w.document.getElementById('answer');
    assert.equal(w.document.getElementById('reject').textContent, 'Não');
    assert.equal(answer.getAttribute('placeholder'), '(diga ao agente o que fazer)');
    assert.equal(answer.value, 'No');
    assert.equal(w.document.getElementById('other').textContent, 'No');
});

test('Worked for / Thought for progress headers translate trailing update counts in pt-BR', async t => {
    const html = `
      <button id="worked-combined">Worked for 3m · 1 update</button>
      <button id="thought-combined">Thought for 12s · 4 updates</button>
      <button id="split-header"><span>Worked for 3m</span><span> · 1 update</span></button>
      <span id="standalone-update">2 updates</span>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('worked-combined').textContent, 'Trabalhou por 3 min · 1 atualização');
    assert.equal(w.document.getElementById('thought-combined').textContent, 'Raciocinou por 12 s · 4 atualizações');
    assert.equal(w.document.getElementById('split-header').textContent, 'Trabalhou por 3 min · 1 atualização');
    assert.equal(w.document.getElementById('standalone-update').textContent, '2 atualizações');
});

test('Swarm sidecar UI translates chrome, onboarding, overview cards, graph replay, legend and filters while isolating board messages and roster IDs', async t => {
    const swarmHtml = `
      <div id="board" data-testid="swarm-board">
        <header class="header">
          <div class="header-row">
            <h1 id="swarm-title" data-testid="swarm-title">Revisão das quatro versões da apresentação</h1>
            <span id="live" title="Updates automatically" data-testid="swarm-live"><span id="live-label">Live</span></span>
          </div>
          <nav class="tabs" aria-label="Swarm views" data-testid="swarm-tabs">
            <button id="tab-ov" data-testid="swarm-tab-overview">Overview</button>
            <button id="tab-feed" data-testid="swarm-tab-feed">Board<span id="cnt-feed">10</span></button>
            <button id="tab-mem" data-testid="swarm-tab-members">Members<span id="cnt-mem">6</span></button>
            <button id="tab-graph" data-testid="swarm-tab-graph">Graph</button>
            <button id="tab-raw" data-testid="swarm-tab-raw">Raw</button>
          </nav>
        </header>
        <section id="tab-overview">
          <div class="o2">
            <div class="o2-onb-h" id="onb-title">Your swarm is starting</div>
            <div class="o2-progt" id="ov-progt"><b>3 of 10</b> tasks done</div>
            <div class="o2-st" id="ov-blocked">Blocked</div>
            <span class="o2-dot" id="ov-dot" aria-label="queued"></span>
            <div class="o2-mnow" id="ov-quota">@worker-2 ran out of quota — Rate limit exceeded</div>
          </div>
          <div id="ov-notice">The narrator (<b>narrator-1</b>) was stopped. Ask the coordinator to add a new one (<code>@narrator-1</code>).</div>
          <div id="ov-ack">Last change: “<button class="ref">#42</button>”</div>
        </section>
        <section id="tab-body-feed">
          <input id="f-search" type="search" placeholder="Search" aria-label="Search posts">
          <button id="f-toggle" title="Filters" aria-label="Filters"></button>
          <select id="f-agent" aria-label="Filter by poster">
            <option value="">From anyone</option>
            <option value="coordinator">From coordinator</option>
          </select>
          <select id="f-mention" aria-label="Filter by recipient">
            <option value="">To anyone</option>
            <option value="@none">To no one</option>
            <option value="@all">To @all</option>
            <option value="critic-architect">To critic-architect</option>
          </select>
          <button id="chip-coord" title="coordinator · Coordinator · Active · 3 posts\nClick to hide from the board">
            <span class="chip-name">coordinator (you)</span>
          </button>
          <button id="chip-idle" title="worker-2: No posts yet"></button>
          <div class="divider" data-testid="swarm-unread-divider" id="unread-div">New</div>
          <div class="msg-body md" id="post-body">@critic-architect Settings Overview Board Live Graph</div>
          <span class="sys-text" id="sys-msg">created #design — Overview Board</span>
        </section>
        <section id="tab-body-graph">
          <div class="player">
            <button id="replay-play" title="Play / pause replay (space)" aria-label="Play replay"></button>
            <button id="replay-live" title="Show everything and follow live">Live</button>
            <span id="replay-label"><b>10</b> of 10 · #10 at 9:00 (+15m 25s)</span>
            <label class="switch" title="Hide killed and inactive members from the graph"><span>Hide inactive</span></label>
            <label class="switch" title="Draw @all as an edge to every member"><span>Expand @all</span></label>
            <select id="replay-timing" aria-label="Replay pacing" title="Replay pacing">
              <option value="even" selected>Even pacing</option>
              <option value="real">Real-time gaps</option>
            </select>
          </div>
          <svg id="graph" data-testid="swarm-graph" aria-label="Who @mentions whom">
            <path class="edge"><title id="edge-tip">coordinator → critic-architect: 5 direct, 2 via @all</title></path>
            <g class="node">
              <title id="node-tip">coordinator · Coordinator · Active · 5 steps · 3 posts\nClick to open conversation</title>
              <text class="node-label" id="node-coord">coordinator</text>
            </g>
          </svg>
          <div class="graph-legend">
            <span class="legend-item" id="lg-1">@mention, width = count</span>
            <span class="legend-item" id="lg-2">via @all</span>
            <span class="legend-item" id="lg-3">posted with no mention</span>
            <span class="legend-item" id="lg-4">@all posts, drawn by Expand @all</span>
          </div>
        </section>
        <section id="tab-body-raw">
          <div class="raw-meta"><span class="path" id="raw-path">/Users/demo/board.jsonl</span><span class="size" id="raw-size">· 4.2 KB · 10 lines</span></div>
          <pre id="raw" class="raw">{"agent":"coordinator","text":"Settings"}</pre>
        </section>
      </div>
      <div id="same-doc-outside-swarm">
        <span id="outside-board">Board</span>
        <span id="outside-graph">Graph</span>
        <span id="outside-raw">Raw</span>
      </div>
    `;
    const w = await fixture(t, swarmHtml);

    assert.equal(w.document.getElementById('live').getAttribute('title'), 'Atualiza automaticamente');
    assert.equal(w.document.getElementById('live-label').textContent, 'Ao vivo');
    assert.equal(w.document.getElementById('tab-ov').textContent, 'Visão geral');
    assert.equal(w.document.getElementById('tab-feed').textContent, 'Quadro10');
    assert.equal(w.document.getElementById('tab-mem').textContent, 'Membros6');
    assert.equal(w.document.getElementById('tab-graph').textContent, 'Grafo');
    assert.equal(w.document.getElementById('tab-raw').textContent, 'Bruto');
    assert.equal(w.document.getElementById('onb-title').textContent, 'Seu Swarm está iniciando');
    assert.equal(w.document.getElementById('ov-progt').textContent, '3 / 10 tarefas concluídas');
    assert.equal(w.document.getElementById('ov-blocked').textContent, 'Bloqueado');
    assert.equal(w.document.getElementById('ov-dot').getAttribute('aria-label'), 'na fila');
    assert.equal(w.document.getElementById('ov-quota').textContent, '@worker-2 ficou sem cota — Rate limit exceeded');
    assert.equal(w.document.getElementById('ov-notice').textContent, 'O narrador (narrator-1) foi encerrado. Peça ao coordenador para adicionar um novo (@narrator-1).');
    assert.equal(w.document.getElementById('ov-ack').textContent, 'Última alteração: "#42"');
    assert.equal(w.document.getElementById('f-search').getAttribute('placeholder'), 'Pesquisar');
    assert.equal(w.document.getElementById('f-search').getAttribute('aria-label'), 'Pesquisar publicações');
    assert.equal(w.document.getElementById('f-toggle').getAttribute('title'), 'Filtros');
    assert.equal(w.document.getElementById('f-agent').options[0].textContent, 'De qualquer pessoa');
    assert.equal(w.document.getElementById('f-agent').options[1].textContent, 'De coordinator');
    assert.equal(w.document.getElementById('f-agent').options[1].value, 'coordinator');
    assert.equal(w.document.getElementById('f-mention').options[0].textContent, 'Para qualquer pessoa');
    assert.equal(w.document.getElementById('f-mention').options[1].textContent, 'Para ninguém');
    assert.equal(w.document.getElementById('f-mention').options[2].textContent, 'Para @all');
    assert.equal(w.document.getElementById('f-mention').options[3].textContent, 'Para critic-architect');
    assert.equal(w.document.getElementById('chip-coord').getAttribute('title'), 'coordinator · Coordenador · Ativo · 3 publicações\nClique para ocultar do quadro');
    assert.equal(w.document.querySelector('#chip-coord .chip-name').textContent, 'coordinator (você)');
    assert.equal(w.document.getElementById('chip-idle').getAttribute('title'), 'worker-2: Nenhuma publicação ainda');
    assert.equal(w.document.getElementById('unread-div').textContent, 'Novas mensagens');
    assert.equal(w.document.getElementById('replay-label').textContent, '10 / 10 · #10 às 9:00 (+15 min 25 s)');
    w.document.getElementById('replay-label').innerHTML = '<b>10 posts</b> over 15m 25s';
    await settle();
    assert.equal(w.document.getElementById('replay-label').textContent, '10 publicações ao longo de 15 min 25 s');
    assert.equal(w.document.getElementById('replay-timing').options[0].textContent, 'Ritmo uniforme');
    assert.equal(w.document.getElementById('replay-timing').options[1].textContent, 'Intervalos em tempo real');
    assert.equal(w.document.getElementById('replay-timing').value, 'even');
    assert.equal(w.document.getElementById('edge-tip').textContent, 'coordinator → critic-architect: 5 diretas, 2 via @all');
    assert.equal(w.document.getElementById('node-tip').textContent, 'coordinator · Coordenador · Ativo · 5 etapas · 3 publicações\nClique para abrir a conversa');
    assert.equal(w.document.getElementById('node-coord').textContent, 'coordinator');
    assert.equal(w.document.getElementById('lg-1').textContent, '@menção, largura = quantidade');
    assert.equal(w.document.getElementById('lg-2').textContent, 'via @all');
    assert.equal(w.document.getElementById('lg-3').textContent, 'publicado sem menção');
    assert.equal(w.document.getElementById('lg-4').textContent, 'Publicações @all, desenhadas por Expandir @all');
    assert.equal(w.document.getElementById('raw-path').textContent, '/Users/demo/board.jsonl');
    assert.equal(w.document.getElementById('raw-size').textContent, '· 4.2 KB · 10 linhas');
    assert.equal(w.document.getElementById('raw').textContent, '{"agent":"coordinator","text":"Settings"}');
    assert.equal(w.document.getElementById('post-body').textContent, '@critic-architect Settings Overview Board Live Graph');
    assert.equal(w.document.getElementById('sys-msg').textContent, 'created #design — Overview Board');
    assert.equal(w.document.getElementById('outside-board').textContent, 'Board');
    assert.equal(w.document.getElementById('outside-graph').textContent, 'Graph');
    assert.equal(w.document.getElementById('outside-raw').textContent, 'Raw');

    const nonSwarm = await fixture(t, '<div id="plain-board">Board</div><div id="plain-graph">Graph</div><div id="plain-raw">Raw</div>');
    assert.equal(nonSwarm.document.getElementById('plain-board').textContent, 'Board');
    assert.equal(nonSwarm.document.getElementById('plain-graph').textContent, 'Graph');
    assert.equal(nonSwarm.document.getElementById('plain-raw').textContent, 'Raw');
});

test('subagent incoming message header and input placeholder translate in pt-BR', async t => {
    const html = `
      <div>
        <button id="incoming-parent">Message from Parent Agent</button>
        <button id="incoming-role">Message from Codebase Researcher</button>
        <div id="placeholder-full">Message subagent, @ to mention, / for actions</div>
        <div id="placeholder-short">Message subagent, @ to mention</div>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('incoming-parent').textContent, 'Mensagem de Agente pai');
    assert.equal(w.document.getElementById('incoming-role').textContent, 'Mensagem de Codebase Researcher');
    assert.equal(w.document.getElementById('placeholder-full').textContent, 'Envie uma mensagem ao subagente, @ para mencionar, / para ações');
    assert.equal(w.document.getElementById('placeholder-short').textContent, 'Envie uma mensagem ao subagente, @ para mencionar');
});

test('NUX onboarding split TextNodes and post-onboarding welcome tip translate without global single-word pollution', async t => {
    const html = `
      <div>
        <span id="nux-card1">Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\u2019t show you ads or let advertisers influence what Antigravity says.</span>
        <span id="nux-card1-split">Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\u2019t show you ads or let advertisers influence what <b>Antigravity</b> says.</span>
        <span id="nux-card3"><b>Antigravity</b>\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.</span>
        <span id="nux-terms-title">Help us improve Antigravity.</span>
        <span id="nux-terms-desc">Allow Google to collect and use your Interactions data, subject to the <a href="#">Google <b>Antigravity</b> Terms of Service</a> and <a href="#">Google Privacy Policy</a>. You can control this from your settings at any point.</span>
        <p id="nux-enterprise">For <b>your plan</b>, <b>Antigravity</b> does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts).</p>
        <p id="nux-analytics"><b>Antigravity</b> does not collect any of your prompts, content, or model responses but does collect general usage patterns such as feature adoption and active user counts (\u201cproduct analytics\u201d). Telemetry data will be handled in accordance with the Google Privacy Policy.</p>
        <li><a href="#">Privacy Notice</a> (excluding product analytics data)</li>
        <p id="nux-news">Sign up for newsletters, tips and tricks, and other notifications about <b>Antigravity</b>.</p>
        <p id="welcome-tip" data-testid="post-onboarding-welcome-tip"><span>Tip:</span> Press <kbd>⌘⇧A</kbd> to switch to the Gemini app. Your agents keep working in the background.</p>
        <span id="random-says">says.</span>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('nux-card1-split').textContent, 'Personalize sua experiência no agente, nos plugins e no produto pelas configurações e pelo marketplace. Não exibiremos anúncios nem permitiremos que anunciantes influenciem o que Antigravity diz.');
    assert.equal(w.document.getElementById('nux-card3').textContent, 'Antigravity conta com agentes poderosos que ajudarão você a realizar muito mais, melhor e mais rápido do que antes, mas lembre-se sempre de verificar as ações realizadas pelo agente.');
    assert.equal(w.document.getElementById('nux-terms-title').textContent, 'Ajude a melhorar o Antigravity.');
    assert.equal(w.document.getElementById('nux-terms-desc').textContent, 'Permitir que o Google colete e use os dados das suas interações, sujeito aos Termos de Serviço do Google Antigravity e à Política de Privacidade do Google. Você pode controlar isso nas configurações a qualquer momento.');
    assert.equal(w.document.getElementById('nux-enterprise').textContent, 'Para seu plano, Antigravity não coleta nenhum dos seus prompts, conteúdos ou respostas do modelo, mas ainda coleta padrões gerais de uso (por exemplo, adoção de recursos e contagem de usuários ativos).');
    assert.equal(w.document.getElementById('nux-analytics').textContent, 'Antigravity não coleta nenhum dos seus prompts, conteúdos ou respostas do modelo, mas coleta padrões gerais de uso, como adoção de recursos e número de usuários ativos ("Análise de produto"). Os dados de telemetria são tratados conforme a Política de Privacidade do Google.');
    assert.equal(w.document.querySelector('li').textContent, 'Aviso de privacidade (exceto dados de análise do produto)');
    assert.equal(w.document.getElementById('nux-news').textContent, 'Receba newsletters, dicas e outras notificações sobre Antigravity.');
    assert.equal(w.document.getElementById('welcome-tip').textContent, 'Dica: Pressione ⌘⇧A para alternar para o app Gemini. Seus agentes continuam trabalhando em segundo plano.');
    assert.equal(w.document.getElementById('random-says').textContent, 'says.');

    const reactCard3 = w.document.createElement('span');
    reactCard3.append(
        w.document.createTextNode('Antigravity'),
        w.document.createTextNode('\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.')
    );
    w.document.body.appendChild(reactCard3);
    await settle();
    assert.equal(reactCard3.textContent, 'Antigravity conta com agentes poderosos que ajudarão você a realizar muito mais, melhor e mais rápido do que antes, mas lembre-se sempre de verificar as ações realizadas pelo agente.');
});

test('v2.32.1 SSH, macOS permissions, multi-agent layout, draft capsule and plugin credentials translate without single-word pollution', async t => {
    const html = `
      <div>
        <div id="ssh-err" data-testid="ssh-connect-error"><span id="ssh-err-title">Couldn\u2019t connect to </span></div>
        <p id="ssh-empty">No hosts in ~/.ssh/config yet. Type one above.</p>
        <div id="ssh-cfg-title">SSH Config (~/.ssh/config)</div>
        <button id="ssh-hidden">3 hidden hosts</button>
        <div id="ssh-connecting">Connecting to devbox\u2026</div>
        <span id="perm-badge-miss" data-testid="computer-permissions-badge-accessibility">Missing</span>
        <span id="perm-badge-ok" data-testid="computer-permissions-badge-screenRecording">Granted \u2713</span>
        <span id="perm-tip">Click <strong>Open \u2197</strong> to open macOS Privacy &amp; Security.</span>
        <div id="layout-bar" data-agy-layout-bar="">
          <span id="layout-label">Layout</span>
          <div id="layout-select" aria-label="Layout" data-agy-layout="stage">
            <span id="opt-stage" data-agy-layout-option="stage">Stage</span>
            <span id="opt-desktop" data-agy-layout-option="desktop">Desktop</span>
            <span id="opt-grid" data-agy-layout-option="grid">Grid</span>
          </div>
        </div>
        <button id="tile-focus" title="Codebase \u00b7 worker-1 (Focus this tile)">Codebase</button>
        <button id="tile-back" title="Codebase \u00b7 worker-1 (Back to all agents)">Back to all agents</button>
        <div id="icon-rg" role="radiogroup" aria-label="Icon"></div>
        <div id="color-rg" role="radiogroup" aria-label="Color"></div>
        <button id="draft-btn" aria-label="Resume 2 comment drafts"><span>2 Drafts</span></button>
        <p id="plugin-creds">Sign-ins to GitHub, Linear are kept in the cloud with your account. Other credentials stay on this machine. Credentials are only sent to the domains listed.</p>
        <p id="sandbox-warn-two">Default and Auto need the terminal sandbox, which isn't available on this host.</p>
        <p id="sandbox-warn-one">Default needs the terminal sandbox, which isn't available on this host.</p>
        <span id="org-managed" title="managed by your organization">managed by your organization</span>
        <span id="msg-ing">Messaging Codebase Researcher</span>
        <span id="msg-ed">Messaged Codebase Researcher</span>
        <p id="msg-prose">Messaging other services over HTTP requires valid credentials.</p>
        <div id="save-err">Failed to save project settings: Network error</div>

        <span id="plain-click">Click</span>
        <span id="plain-missing">Missing</span>
        <span id="plain-layout">Layout</span>
        <span id="plain-stage">Stage</span>
        <span id="plain-design">Design</span>
        <div id="plain-icon" aria-label="Icon">Icon</div>
        <div id="plain-color" aria-label="Color">Color</div>
      </div>
    `;
    const w = await fixture(t, html);
    w.document.getElementById('ssh-err-title').appendChild(w.document.createTextNode('devbox'));
    w.document.getElementById('ssh-empty').textContent = '';
    w.document.getElementById('ssh-empty').append(
        w.document.createTextNode('No hosts in '),
        w.document.createTextNode('~/.ssh/config'),
        w.document.createTextNode(' yet. Type one above.')
    );
    await settle();

    assert.equal(w.document.getElementById('ssh-err-title').textContent, 'Não foi possível conectar a devbox');
    assert.equal(w.document.getElementById('ssh-empty').textContent, 'Ainda não há hosts em ~/.ssh/config. Digite um acima.');
    assert.equal(w.document.getElementById('ssh-cfg-title').textContent, 'Configuração SSH (~/.ssh/config)');
    assert.equal(w.document.getElementById('ssh-hidden').textContent, '3 hosts ocultos');
    assert.equal(w.document.getElementById('ssh-connecting').textContent, 'Conectando a devbox…');
    assert.equal(w.document.getElementById('perm-badge-miss').textContent, 'Ausente');
    assert.equal(w.document.getElementById('perm-badge-ok').textContent, 'Concedido ✓');
    assert.equal(w.document.getElementById('perm-tip').textContent, 'Clique em Abrir ↗ para abrir Privacidade e Segurança do macOS.');
    assert.equal(w.document.getElementById('layout-label').textContent, 'Layout');
    assert.equal(w.document.getElementById('layout-select').getAttribute('aria-label'), 'Layout');
    assert.equal(w.document.getElementById('opt-stage').textContent, 'Palco');
    assert.equal(w.document.getElementById('opt-desktop').textContent, 'Desktop');
    assert.equal(w.document.getElementById('opt-grid').textContent, 'Grade');
    assert.equal(w.document.getElementById('tile-focus').getAttribute('title'), 'Codebase · worker-1 (Focar este bloco)');
    assert.equal(w.document.getElementById('tile-back').getAttribute('title'), 'Codebase · worker-1 (Voltar para todos os agentes)');
    assert.equal(w.document.getElementById('icon-rg').getAttribute('aria-label'), 'Ícone');
    assert.equal(w.document.getElementById('color-rg').getAttribute('aria-label'), 'Cor');
    assert.equal(w.document.getElementById('draft-btn').getAttribute('aria-label'), 'Retomar 2 rascunhos de comentário');
    assert.equal(w.document.getElementById('draft-btn').textContent, '2 rascunhos');
    assert.equal(w.document.getElementById('plugin-creds').textContent, 'Os logins em GitHub, Linear ficam salvos na nuvem com a sua conta. As outras credenciais ficam nesta máquina. As credenciais são enviadas somente aos domínios listados.');
    assert.equal(w.document.getElementById('sandbox-warn-two').textContent, 'Padrão e Automático precisam do sandbox de terminal, que não está disponível neste host.');
    assert.equal(w.document.getElementById('sandbox-warn-one').textContent, 'Padrão precisa do sandbox de terminal, que não está disponível neste host.');
    assert.equal(w.document.getElementById('org-managed').textContent, 'gerenciado pela sua organização');
    assert.equal(w.document.getElementById('org-managed').getAttribute('title'), 'gerenciado pela sua organização');
    assert.equal(w.document.getElementById('msg-ing').textContent, 'Enviando mensagem para Codebase Researcher');
    assert.equal(w.document.getElementById('msg-ed').textContent, 'Mensagem enviada para Codebase Researcher');
    assert.equal(w.document.getElementById('msg-prose').textContent, 'Messaging other services over HTTP requires valid credentials.');
    assert.equal(w.document.getElementById('save-err').textContent, 'Falha ao salvar as configurações do projeto: Network error');

    assert.equal(w.document.getElementById('plain-click').textContent, 'Click');
    assert.equal(w.document.getElementById('plain-missing').textContent, 'Missing');
    assert.equal(w.document.getElementById('plain-layout').textContent, 'Layout');
    assert.equal(w.document.getElementById('plain-stage').textContent, 'Stage');
    assert.equal(w.document.getElementById('plain-design').textContent, 'Design');
    assert.equal(w.document.getElementById('plain-icon').getAttribute('aria-label'), 'Icon');
    assert.equal(w.document.getElementById('plain-color').getAttribute('aria-label'), 'Color');
});

test('protected containers isolate attributes and scripts while contextual siblings and duration boundaries hold', async t => {
    const html = `
      <div>
        <div class="monaco-editor">
          <input id="monaco-input" placeholder="Search" title="Settings" aria-label="Filter">
        </div>
        <div class="terminal">
          <span id="term-span" title="Close">Settings</span>
        </div>
        <div data-testid="planner-response-text">
          <span id="ai-span" title="Open">Open</span>
        </div>
        <input id="normal-input" placeholder="Search">
        <script id="inline-script">const label = "Settings";</script>
        <p id="archived-tip">View archived in the sidebar <b>More</b> menu)</p>
        <p id="unsafe-link">Proceed to <span>example.com</span> (unsafe)</p>
        <span id="dur-ms">Thought for 12ms</span>
        <span id="dur-mo">Thought for 5mo</span>
        <span id="dur-m">Thought for 5m</span>
      </div>
    `;
    const w = await fixture(t, html);
    const monacoInput = w.document.getElementById('monaco-input');
    assert.equal(monacoInput.getAttribute('placeholder'), 'Search');
    assert.equal(monacoInput.getAttribute('title'), 'Settings');
    assert.equal(monacoInput.getAttribute('aria-label'), 'Filter');
    assert.equal(w.document.getElementById('term-span').getAttribute('title'), 'Close');
    assert.equal(w.document.getElementById('term-span').textContent, 'Settings');
    assert.equal(w.document.getElementById('ai-span').getAttribute('title'), 'Open');
    assert.equal(w.document.getElementById('ai-span').textContent, 'Open');
    assert.equal(w.document.getElementById('normal-input').getAttribute('placeholder'), 'Pesquisar');

    w.document.getElementById('inline-script').firstChild.nodeValue = 'Settings';
    await settle();
    assert.equal(w.document.getElementById('inline-script').textContent, 'Settings');

    assert.equal(w.document.getElementById('archived-tip').textContent, 'Ver arquivados no menu Mais da barra lateral');
    assert.equal(w.document.getElementById('unsafe-link').textContent, 'Continuar para example.com (não seguro)');
    assert.equal(w.document.getElementById('dur-ms').textContent, 'Raciocinou por 12ms');
    assert.equal(w.document.getElementById('dur-mo').textContent, 'Raciocinou por 5mo');
    assert.equal(w.document.getElementById('dur-m').textContent, 'Raciocinou por 5 min');
});

test('v2.32.2 template literals, voice mic prompts, plugin/skill labels and Best of N external descriptions translate in pt-BR', async t => {
    const html = `
      <div>
        <h2 id="voice-title">Choose Antigravity's Voice</h2>
        <span id="mic-inline">Microphone blocked. Allow in System Settings.</span>
        <p id="mic-split">Microphone blocked. Allow in <a href="#">Privacy Settings</a>.</p>
        <p id="perm-act">Agent needs permission to act on /tmp/demo</p>
        <p id="dl-block">The browser blocked the download of report.pdf: the agent browser does not download this file type (text/html)</p>
        <span id="nav-block">Blocked navigation to "https://example.invalid"</span>
        <span id="partner-plugins">Build with Google Plugins</span>
        <span id="open-plugin">Open the figma plugin</span>
        <span id="open-skill">Open my-skill skill</span>
        <span id="mcp-cfg">The github MCP server requires configuration parameters before it can be started.</span>
        <span id="auto-created">Created automation "Daily Sync".</span>
        <button id="unfold-btn" title="Unfold lines 10-25">Unfold lines 10-25</button>
        <select><option id="mic-opt" value="">System default (Built-in Mic)</option></select>
        <div id="slash-compact"><span>compact</span><span>Compact the conversation now (summarize history to free up the context window).</span></div>
        <div id="slash-plan"><span>plan</span><span>Plan carefully before executing a task.</span></div>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('voice-title').textContent, 'Escolher a voz do Antigravity');
    assert.equal(w.document.getElementById('mic-inline').textContent, 'Microfone bloqueado. Permita em Configurações do sistema.');
    assert.equal(w.document.getElementById('mic-split').textContent, 'Microfone bloqueado. Permita em Configurações de privacidade.');
    assert.equal(w.document.getElementById('perm-act').textContent, 'O agente precisa de permissão para agir em /tmp/demo');
    assert.equal(w.document.getElementById('dl-block').textContent, 'O navegador bloqueou o download de report.pdf: o navegador do agente não baixa este tipo de arquivo (text/html)');
    assert.equal(w.document.getElementById('nav-block').textContent, 'Navegação bloqueada para: "https://example.invalid"');
    assert.equal(w.document.getElementById('partner-plugins').textContent, 'Criar com plugins do Google');
    assert.equal(w.document.getElementById('open-plugin').textContent, 'Abrir o plugin figma');
    assert.equal(w.document.getElementById('open-skill').textContent, 'Abrir habilidade my-skill');
    assert.equal(w.document.getElementById('mcp-cfg').textContent, 'O servidor MCP github precisa de parâmetros de configuração antes de poder ser iniciado.');
    assert.equal(w.document.getElementById('auto-created').textContent, 'Automação criada: "Daily Sync".');
    assert.equal(w.document.getElementById('unfold-btn').getAttribute('title'), 'Expandir linhas 10-25');
    assert.equal(w.document.getElementById('mic-opt').textContent, 'Padrão do sistema (Built-in Mic)');
    assert.equal(w.document.getElementById('slash-compact').children[0].textContent, 'compact');
    assert.equal(w.document.getElementById('slash-compact').children[1].textContent, 'Compactar a conversa agora (resumir o histórico para liberar a janela de contexto).');
    assert.equal(w.document.getElementById('slash-plan').children[0].textContent, 'plan');
    assert.equal(w.document.getElementById('slash-plan').children[1].textContent, 'Planejar com cuidado antes de executar uma tarefa.');
});

test('runtime guards non-DOM sandboxes, preserves restore_page TextNode, and handles See all & mixed Show more', async t => {
    const vm = require('node:vm');
    assert.doesNotThrow(() => {
        vm.runInNewContext(loadRuntime(), { setTimeout, clearTimeout, console });
    });

    const w = await fixture(t, `
        <span id="icon" class="google-symbols">restore_page</span>
        <button id="mixed-show"><span id="badge">Show 5</span> more...</button>
        <button id="see-all">See all (5)</button>
    `);
    const icon = w.document.getElementById('icon');
    const textNodes = Array.from(icon.childNodes).filter(n => n.nodeType === w.Node.TEXT_NODE);
    assert.equal(textNodes.length, 1);
    assert.equal(textNodes[0].nodeValue, '');
    assert.equal(icon.querySelectorAll('svg[data-ag-icon-fallback="restore_page"]').length, 1);

    textNodes[0].nodeValue = 'restore_page';
    w.__agCnRuntimeStart();
    await settle();
    assert.equal(icon.querySelectorAll('svg[data-ag-icon-fallback="restore_page"]').length, 1);
    assert.equal(textNodes[0].nodeValue, '');

    assert.equal(w.document.getElementById('badge').textContent, 'Mostrar mais 5');
    assert.equal(w.document.getElementById('mixed-show').lastChild.nodeValue, '...');
    assert.equal(w.document.getElementById('see-all').textContent, 'Ver tudo (5)');
});

test('v2.33.0 browsing data, keybinding scheme, bundles, coordinator pickers, permissions and dynamic prompts translate in pt-BR without single-word pollution', async t => {
    const html = `
      <div>
        <h2 id="browsing-title">Clear Browsing Data?</h2>
        <span id="browsing-history">Browsing history</span>
        <span id="cookies-site">Cookies by Site</span>
        <span id="kb-scheme">Keybinding Scheme</span>
        <span id="browser-agent">Enable Browser Agent</span>
        <button id="add-bundle">Add bundle</button>
        <button id="rm-bundle">Remove bundle</button>
        <button id="insert-main">Insert into main conversation</button>
        <button id="sq-unarch">Unarchive the main conversation to insert</button>
        <p id="cookie-err" data-testid="browser-site-data-delete-error">Couldn't delete cookies for <span>example.com</span>. Try again.</p>
        <div id="clearing-site">Clearing cookies and site data for example.com</div>
        <p id="no-match-split" data-testid="browser-site-data-no-match">No sites match \u201c<span>alpha.dev</span>\u201d.</p>
        <div id="no-match-full">No sites match "beta.dev".</div>
        <div id="kb-filter">Inspect live bindings or record custom key chords filtered to <code>antigravity.</code> commands.</div>
        <div id="signin-remote">You're signing in on devbox-01. Your sign-in stays on that machine.</div>
        <button id="mcp-acc" aria-label="Account this MCP server uses: work@example.com"></button>
        <button id="go-turn" aria-label="Go to turn 3 of 12"></button>
        <button id="plan-steps" aria-label="Plan, 2 of 5 steps done"></button>
        <button id="rm-shortcut" aria-label="Remove shortcut Cmd+K for Command Palette"></button>
        <button id="reset-cmd" aria-label="Reset command palette to default"></button>
        <div id="no-bundles">No bundles found for</div>
        <div id="no-plugins-q">No plugins found for "lint".</div>
        <div id="dup-folder">Duplicate folder name</div>
        <div id="dup-rule">Duplicate rule name</div>
        <div id="dup-wf">Duplicate workflow name</div>
        <div id="bundle-prefix">3 plugins. Disabling or removing the bundle applies only to the ones it installed.</div>
        <div id="comment-pg">Comment on page 2</div>
        <div id="edit-comment">Edit comment: fix typo</div>
        <div id="export-err">Failed to export artifact</div>
        <div id="del-ws-err">Failed to delete workspace</div>
        <div id="gh-lbl" aria-label="GitHub: Authentication required"></div>
        <div id="ssh-lbl">SSH: devbox-01</div>
        <div id="see-doc">See Docs: https://example.com</div>
        <input id="acc-lbl" aria-label="Label for work@example.com" />
        <button id="more-lbl" aria-label="More for devbox-01"></button>
        <button id="safe-del-ws">Delete Workspace</button>
        <button id="unsafe-del-var">Delete MyCustomVar</button>
        <div id="meta-row" class="flex flex-wrap items-baseline gap-1 text-xs text-muted-foreground"><span id="meta-init">Initialized with</span><code>defaultConfig</code></div>
        <div id="meta-decl-row" class="flex flex-wrap items-baseline gap-1 text-xs text-muted-foreground"><span id="meta-decl">Declared by</span><code>corePkg</code></div>
        <p id="prose-init">Initialized with a custom environment variable for testing.</p>
        <button id="ico-robot" data-testid="coordinator-icon-option-smart_toy" role="radio" aria-label="Robot"></button>
        <button id="ico-code" data-testid="coordinator-icon-option-code_blocks" role="radio" aria-label="Code"></button>
        <button id="ico-flask" data-testid="coordinator-icon-option-science" role="radio" aria-label="Flask"></button>
        <button id="col-blue" data-testid="coordinator-color-option-blue" role="radio" aria-label="Blue"></button>
        <button id="perm-q1">Allow browser downloads from this site?</button>
        <button id="perm-q2">Save rule to always allow running this command outside the sandbox?</button>
        <span id="loc-btn" aria-label="Where the agent runs, current: This computer"></span>
        <button id="plan-go">Proceed with implementation plan and 3 comments</button>
        <div id="upd-prog">You have 2 conversations in progress. Updating will interrupt them, and they will automatically resume once the update completes.</div>
        <div id="model-gone">Gemini 2.5 Pro is no longer available. Runs use Gemini 3 Flash instead.</div>
        <div role="menu" aria-label="Select model"><span id="model-unavail">Unavailable</span></div>
        <span id="plain-unavail">Unavailable</span>
        <div id="model-avail-1">Claude 3.7 Sonnet is currently available to Pro users.</div>
        <div id="model-avail-2">Gemini 2.5 Pro is now available on Google AI Pro. Third-party model access will no longer be available starting on May 15, 2026.</div>
        <div id="model-dep-only">Claude 3.5 Sonnet will no longer be available on your current plan starting on 2026-06-01</div>
        <div id="model-dep-3p">Third-party model access will no longer be available on your current plan starting on 15 July 2026.</div>
        <div id="icon-safe"><span id="w-code">Code</span><span id="w-eye">Eye</span><span id="w-hub">Hub</span><span id="w-shield">Shield</span><span id="w-robot">Robot</span><span id="w-flask">Flask</span></div>
        <button id="plain-radio" role="radio" aria-label="Code"></button>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('browsing-title').textContent, 'Limpar dados de navegação?');
    assert.equal(w.document.getElementById('browsing-history').textContent, 'Histórico de navegação');
    assert.equal(w.document.getElementById('cookies-site').textContent, 'Cookies por site');
    assert.equal(w.document.getElementById('kb-scheme').textContent, 'Esquema de atalhos de teclado');
    assert.equal(w.document.getElementById('browser-agent').textContent, 'Ativar agente de navegador');
    assert.equal(w.document.getElementById('add-bundle').textContent, 'Adicionar pacote');
    assert.equal(w.document.getElementById('rm-bundle').textContent, 'Remover pacote');
    assert.equal(w.document.getElementById('insert-main').textContent, 'Inserir na conversa principal');
    assert.equal(w.document.getElementById('sq-unarch').textContent, 'Desarquive a conversa principal para inserir');
    assert.equal(w.document.getElementById('cookie-err').textContent, 'Não foi possível excluir os cookies de example.com. Tente novamente.');
    assert.equal(w.document.getElementById('clearing-site').textContent, 'Limpando cookies e dados do site de example.com');
    assert.equal(w.document.getElementById('no-match-split').textContent, 'Nenhum site corresponde a "alpha.dev".');
    assert.equal(w.document.getElementById('no-match-full').textContent, 'Nenhum site corresponde a "beta.dev".');
    assert.equal(w.document.getElementById('kb-filter').textContent, 'Inspecione os atalhos ativos ou grave combinações personalizadas filtradas pelo prefixo antigravity. nos comandos.');
    assert.equal(w.document.getElementById('signin-remote').textContent, 'Você está entrando em devbox-01. Seu login permanece nessa máquina.');
    assert.equal(w.document.getElementById('mcp-acc').getAttribute('aria-label'), 'Conta usada por este servidor MCP: work@example.com');
    assert.equal(w.document.getElementById('go-turn').getAttribute('aria-label'), 'Ir para o turno 3 de 12');
    assert.equal(w.document.getElementById('plan-steps').getAttribute('aria-label'), 'Plano, 2 de 5 etapas concluídas');
    assert.equal(w.document.getElementById('rm-shortcut').getAttribute('aria-label'), 'Remover atalho Cmd+K para Paleta de comandos');
    assert.equal(w.document.getElementById('reset-cmd').getAttribute('aria-label'), 'Redefinir Paleta de comandos para o padrão');
    assert.equal(w.document.getElementById('no-bundles').textContent, 'Nenhum pacote encontrado para:');
    assert.equal(w.document.getElementById('no-plugins-q').textContent, 'Nenhum plugin encontrado para "lint"');
    assert.equal(w.document.getElementById('dup-folder').textContent, 'Nome de pasta duplicado');
    assert.equal(w.document.getElementById('dup-rule').textContent, 'Nome de regra duplicado');
    assert.equal(w.document.getElementById('dup-wf').textContent, 'Nome de fluxo de trabalho duplicado');
    assert.equal(w.document.getElementById('bundle-prefix').textContent, '3 plugins. Desativar ou remover o pacote se aplica apenas aos que ele instalou.');
    assert.equal(w.document.getElementById('export-err').textContent, 'Falha ao exportar o artefato');
    assert.equal(w.document.getElementById('del-ws-err').textContent, 'Falha ao excluir espaço de trabalho');
    assert.equal(w.document.getElementById('gh-lbl').getAttribute('aria-label'), 'GitHub: Autenticação necessária');
    assert.equal(w.document.getElementById('ssh-lbl').textContent, 'SSH: devbox-01');
    assert.equal(w.document.getElementById('see-doc').textContent, 'Ver Documentação: https://example.com');
    assert.equal(w.document.getElementById('comment-pg').textContent, 'Comentário na página 2');
    assert.equal(w.document.getElementById('edit-comment').textContent, 'Editar comentário: fix typo');
    assert.equal(w.document.getElementById('acc-lbl').getAttribute('aria-label'), 'Rótulo para work@example.com');
    assert.equal(w.document.getElementById('more-lbl').getAttribute('aria-label'), 'Mais para devbox-01');
    assert.equal(w.document.getElementById('safe-del-ws').textContent, 'Excluir espaço de trabalho');
    assert.equal(w.document.getElementById('unsafe-del-var').textContent, 'Delete MyCustomVar');
    assert.equal(w.document.getElementById('meta-init').textContent, 'Inicializado com');
    assert.equal(w.document.getElementById('meta-decl').textContent, 'Declarado por');
    assert.equal(w.document.getElementById('prose-init').textContent, 'Initialized with a custom environment variable for testing.');
    assert.equal(w.document.getElementById('ico-robot').getAttribute('aria-label'), 'Robô');
    assert.equal(w.document.getElementById('ico-code').getAttribute('aria-label'), 'Código');
    assert.equal(w.document.getElementById('ico-flask').getAttribute('aria-label'), 'Frasco');
    assert.equal(w.document.getElementById('col-blue').getAttribute('aria-label'), 'Azul');
    assert.equal(w.document.getElementById('perm-q1').textContent, 'Permitir downloads do navegador deste site?');
    assert.equal(w.document.getElementById('perm-q2').textContent, 'Salvar regra para sempre permitir executar este comando fora do sandbox?');
    assert.equal(w.document.getElementById('loc-btn').getAttribute('aria-label'), 'Onde o agente executa, atual: Este computador');
    assert.equal(w.document.getElementById('plan-go').textContent, 'Prosseguir com o plano de implementação e 3 comentários');
    assert.equal(w.document.getElementById('upd-prog').textContent, 'Você tem 2 conversas em andamento. A atualização vai interrompê-las e elas serão retomadas automaticamente quando a atualização terminar.');
    assert.equal(w.document.getElementById('model-gone').textContent, 'Gemini 2.5 Pro não está mais disponível. As execuções usam Gemini 3 Flash no lugar.');
    assert.equal(w.document.getElementById('model-unavail').textContent, 'Indisponível');
    assert.equal(w.document.getElementById('plain-unavail').textContent, 'Unavailable');
    assert.equal(w.document.getElementById('model-avail-1').textContent, 'Claude 3.7 Sonnet está disponível atualmente para usuários Pro.');
    assert.equal(w.document.getElementById('model-avail-2').textContent, 'Gemini 2.5 Pro agora está disponível para Google AI Pro. O acesso a modelos de terceiros deixará de estar disponível a partir de 15 de maio de 2026.');
    assert.equal(w.document.getElementById('model-dep-only').textContent, 'Claude 3.5 Sonnet deixará de estar disponível no seu plano atual a partir de 1 de junho de 2026');
    assert.equal(w.document.getElementById('model-dep-3p').textContent, 'O acesso a modelos de terceiros deixará de estar disponível no seu plano atual a partir de 15 de julho de 2026.');
    assert.equal(w.document.getElementById('w-code').textContent, 'Code');
    assert.equal(w.document.getElementById('w-eye').textContent, 'Eye');
    assert.equal(w.document.getElementById('w-hub').textContent, 'Hub');
    assert.equal(w.document.getElementById('w-shield').textContent, 'Shield');
    assert.equal(w.document.getElementById('w-robot').textContent, 'Robot');
    assert.equal(w.document.getElementById('w-flask').textContent, 'Flask');
    assert.equal(w.document.getElementById('plain-radio').getAttribute('aria-label'), 'Code');
});

test('v2.34.0 orchestrator settings, sidebar customization, dynamic templates and contextual hints translate in pt-BR', async t => {
    const html = `
      <div>
        <h2 id="orch-title">Orchestrator Settings</h2>
        <span id="think-eff">Thinking effort</span>
        <button id="cust-sb" aria-label="Customize Sidebar">Customize Sidebar</button>
        <p id="screen-lock">Screen locked: agents can't use this Mac until you unlock it</p>
        <div id="disc-err">Couldn't disconnect GitHub: network timeout</div>
        <div id="load-err">Failed to load page Settings: 500</div>
        <button id="more-opt" aria-label="More options for devbox-01">...</button>
        <span id="new-conv">Opens the New Conversation screen for this workspace</span>
        <p id="send-hint"><span>Messages now send immediately. Configure in</span><a href="#">Settings</a></p>
        <p id="sys-click"><span>In System Settings, click</span><strong>Privacy</strong></p>
        <p id="already-on"><span>Already on? Select</span><strong>Antigravity</strong></p>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('orch-title').textContent, 'Configurações do orquestrador');
    assert.equal(w.document.getElementById('think-eff').textContent, 'Esforço de raciocínio');
    assert.equal(w.document.getElementById('cust-sb').getAttribute('aria-label'), 'Personalizar barra lateral');
    assert.equal(w.document.getElementById('screen-lock').textContent, 'Tela bloqueada: os agentes não podem usar este Mac até você desbloqueá-lo');
    assert.equal(w.document.getElementById('disc-err').textContent, 'Não foi possível desconectar GitHub: network timeout');
    assert.equal(w.document.getElementById('load-err').textContent, 'Falha ao carregar a página Settings: 500');
    assert.equal(w.document.getElementById('more-opt').getAttribute('aria-label'), 'Mais opções para devbox-01');
    assert.equal(w.document.getElementById('new-conv').textContent, 'Abre a tela de nova conversa para este espaço de trabalho');
    assert.equal(w.document.getElementById('send-hint').querySelector('span').textContent, 'As mensagens agora são enviadas imediatamente. Configure em');
    assert.equal(w.document.getElementById('sys-click').querySelector('span').textContent, 'Em Configurações do Sistema, clique em ');
    assert.equal(w.document.getElementById('already-on').querySelector('span').textContent, 'Já está ativado? Selecione ');
});

test('region eligibility errors, login FAQ link, Available for project, and step counters translate in pt-BR', async t => {
    const html = `
      <div>
        <p id="loc-err">Your current account is not eligible for Antigravity, because it is not currently available in your location.</p>
        <p id="not-elig">This account is not eligible for Antigravity.</p>
        <p id="reg-unsup">Your current region is not supported.</p>
        <p id="faq-wrap">Please verify your account, then sign in again to continue. Learn more by visiting our <a id="faq-link" href="#">FAQ</a>.</p>
        <span id="verify-btn">Verify</span>
        <span id="lower-verify">verify</span>
        <span id="avail-proj">Available for my-gcp-proj project</span>
        <span id="avail-proj-split">Available for <code>my-gcp-proj</code> project</span>
        <span id="plan-steps" aria-label="Plan, 3 of 5 steps done"></span>
        <span id="q-of" aria-label="Question 2 of 4"></span>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('loc-err').textContent, 'Sua conta atual não é elegível para o Antigravity, porque ele não está disponível na sua localização no momento.');
    assert.equal(w.document.getElementById('not-elig').textContent, 'Esta conta não é elegível para o Antigravity.');
    assert.equal(w.document.getElementById('reg-unsup').textContent, 'Sua região não é compatível.');
    assert.equal(w.document.getElementById('faq-link').textContent, 'Perguntas frequentes');
    assert.equal(w.document.getElementById('verify-btn').textContent, 'Verificar');
    assert.equal(w.document.getElementById('lower-verify').textContent, 'verify');
    assert.equal(w.document.getElementById('avail-proj').textContent, 'Disponível para o projeto my-gcp-proj');
    assert.equal(w.document.getElementById('avail-proj-split').textContent, 'Disponível para o projeto my-gcp-proj');
    assert.equal(w.document.getElementById('plan-steps').getAttribute('aria-label'), 'Plano, 3 de 5 etapas concluídas');
    assert.equal(w.document.getElementById('q-of').getAttribute('aria-label'), 'Pergunta 2 de 4');
});

test('v2.35.0 inbox mode, dictation languages, plugin permissions and dynamic templates translate in pt-BR', async t => {
    const html = `
      <div>
        <span id="inbox-mode">Inbox Mode</span>
        <span id="dict-lang">Dictation languages</span>
        <span id="plug-perm">Plugin permissions</span>
        <p id="revoke-msg">All file permissions will be revoked. The plugin will ask before doing this again.</p>
        <span id="ai-credits">Available AI credits: 1,250</span>
        <button id="dismiss-btn" aria-label="Dismiss: Update ready">x</button>
        <span id="move-to">Move to Archive</span>
        <span id="new-ws">New workspace...</span>
        <span id="no-lang">No matching languages for "klingon"</span>
        <span id="rm-from">Remove from Favorites</span>
        <button id="rev-all" aria-label="Revoke all: GitHub">Revoke all</button>
        <button id="rev-one" aria-label="Revoke: Read files">x</button>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('inbox-mode').textContent, 'Modo caixa de entrada');
    assert.equal(w.document.getElementById('dict-lang').textContent, 'Idiomas de ditado');
    assert.equal(w.document.getElementById('plug-perm').textContent, 'Permissões do plugin');
    assert.equal(w.document.getElementById('revoke-msg').textContent, 'Todas as permissões de arquivos serão revogadas. O plugin vai pedir permissão antes de fazer isso novamente.');
    assert.equal(w.document.getElementById('ai-credits').textContent, 'Créditos de IA disponíveis: 1,250');
    assert.equal(w.document.getElementById('dismiss-btn').getAttribute('aria-label'), 'Dispensar: Update ready');
    assert.equal(w.document.getElementById('move-to').textContent, 'Mover para Arquivo');
    assert.equal(w.document.getElementById('new-ws').textContent, 'Novo espaço de trabalho...');
    assert.equal(w.document.getElementById('no-lang').textContent, 'Nenhum idioma correspondente a "klingon"');
    assert.equal(w.document.getElementById('rm-from').textContent, 'Remover de Favoritos');
    assert.equal(w.document.getElementById('rev-all').getAttribute('aria-label'), 'Revogar tudo: GitHub');
    assert.equal(w.document.getElementById('rev-all').textContent, 'Revogar todas');
    assert.equal(w.document.getElementById('rev-one').getAttribute('aria-label'), 'Revogar: Read files');
});

test('v2.35.1 deep audit strings, dynamic templates and split DOM nodes translate in pt-BR', async t => {
    const html = `
      <div>
        <span id="answered">Answered in chat</span>
        <span id="auto-res">Auto-Resolve</span>
        <button id="back5" aria-label="Back 5s (←)">b</button>
        <span id="clone-loc">Clone locally</span>
        <span id="site-reach">This site can’t be reached</span>
        <span id="page-work">This page isn’t working</span>
        <p id="quota-reset">Your quota for Gemini 4 Pro will reset on Dec 1, 2026. Switch to another available model to continue.</p>
        <p id="need-credits">You need at least 50 AI Credits to send messages. To continue using Gemini 4 Pro now, purchase more AI Credits.</p>
        <span id="retry-in">Model unavailable, retrying in 5s (attempt 2/3)</span>
        <span id="attach-img">3 image attachments</span>
        <span id="left-hm">2h 15m left</span>
        <span id="best-of">Start Best-of-<span>3</span></span>
        <div id="gen-steps">Generation Steps (<span>4</span>)</div>
        <div id="no-mcp">No MCP servers found for "<span>foo</span>"</div>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('answered').textContent, 'Respondido no chat');
    assert.equal(w.document.getElementById('auto-res').textContent, 'Resolver automaticamente');
    assert.equal(w.document.getElementById('back5').getAttribute('aria-label'), 'Voltar 5 s (←)');
    assert.equal(w.document.getElementById('clone-loc').textContent, 'Clonar localmente');
    assert.equal(w.document.getElementById('site-reach').textContent, 'Não foi possível acessar este site');
    assert.equal(w.document.getElementById('page-work').textContent, 'Esta página não está funcionando');
    assert.equal(w.document.getElementById('quota-reset').textContent, 'Sua cota para Gemini 4 Pro será redefinida em 1 de dezembro de 2026. Mude para outro modelo disponível para continuar.');
    assert.equal(w.document.getElementById('need-credits').textContent, 'Você precisa de pelo menos 50 créditos de IA para enviar mensagens. Para continuar usando Gemini 4 Pro agora, compre mais créditos de IA.');
    assert.equal(w.document.getElementById('retry-in').textContent, 'Modelo indisponível, tentando novamente em 5 s (tentativa 2/3)');
    assert.equal(w.document.getElementById('attach-img').textContent, '3 anexos de imagem');
    assert.equal(w.document.getElementById('left-hm').textContent, '2 h 15 min restantes');
    assert.equal(w.document.getElementById('best-of').textContent, 'Iniciar Best-of-3');
    assert.equal(w.document.getElementById('gen-steps').textContent, 'Etapas de geração (4)');
    assert.equal(w.document.getElementById('no-mcp').textContent, 'Nenhum servidor MCP encontrado para "foo"');
});

test('v2.35.1 additional UI badges, attributes, plan toggles and published branches hold in pt-BR', async t => {
    const html = `
      <div>
        <span id="inbox">Inbox</span>
        <span id="resolved">Resolved</span>
        <span id="prov">Provisioning</span>
        <span id="chosen">Chosen</span>
        <button id="applied-btn" aria-label="Applied DarkTheme">Applied</button>
        <button id="show-btn" aria-label="Show MyPlugin">x</button>
        <span id="plan-tog">Build API. Show plan</span>
        <span id="published">Published feat/x to origin.</span>
        <span id="err-line">Error: timeout</span>
        <span id="trig">Triggered nightly-sync</span>
        <span id="tok">Rules: 1,200 tokens</span>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('inbox').textContent, 'Caixa de entrada');
    assert.equal(w.document.getElementById('resolved').textContent, 'Resolvido');
    assert.equal(w.document.getElementById('prov').textContent, 'Provisionando');
    assert.equal(w.document.getElementById('chosen').textContent, 'Escolhido');
    assert.equal(w.document.getElementById('applied-btn').getAttribute('aria-label'), 'Aplicou DarkTheme');
    assert.equal(w.document.getElementById('applied-btn').textContent, 'Aplicado');
    assert.equal(w.document.getElementById('show-btn').getAttribute('aria-label'), 'Mostrar MyPlugin');
    assert.equal(w.document.getElementById('plan-tog').textContent, 'Build API. Mostrar plano');
    assert.equal(w.document.getElementById('published').textContent, 'Publicado feat/x em origin.');
    assert.equal(w.document.getElementById('err-line').textContent, 'Erro: timeout');
    assert.equal(w.document.getElementById('trig').textContent, 'Acionou nightly-sync');
    assert.equal(w.document.getElementById('tok').textContent, 'Regras: 1,200 tokens');
});

test('PR #68 short words do not pollute lowercase identifiers and Show <host> in the list again translates cleanly', async t => {
    const html = `
      <div>
        <span id="lc-move">move</span>
        <span id="lc-never">never</span>
        <span id="lc-self">self</span>
        <span id="lc-failed">failed</span>
        <span id="lc-resolve">resolve</span>
        <span id="tc-move">Move</span>
        <button id="show-host" aria-label="Show example.com in the list again">x</button>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('lc-move').textContent, 'move');
    assert.equal(w.document.getElementById('lc-never').textContent, 'never');
    assert.equal(w.document.getElementById('lc-self').textContent, 'self');
    assert.equal(w.document.getElementById('lc-failed').textContent, 'failed');
    assert.equal(w.document.getElementById('lc-resolve').textContent, 'resolve');
    assert.equal(w.document.getElementById('tc-move').textContent, 'Mover');
    assert.equal(w.document.getElementById('show-host').getAttribute('aria-label'), 'Mostrar example.com na lista novamente');
});

test('v2.35.1 icon-font fallbacks stay untranslated, permission pill uses short labels, history titles stay isolated, and Show N more keeps the source ellipsis', async t => {
    const html = `
        <span id="i-comment" class="google-symbols" style="font-size: 18px">comment</span>
        <span id="i-quote" class="google-symbols">format_quote</span>
        <span id="i-laptop" class="google-symbols">laptop_shield</span>
        <span id="i-unknown" class="google-symbols">settings</span>
        <button data-testid="permissions-selector-trigger"><span id="pill-turbo">Turbo</span></button>
        <button data-testid="permissions-selector-trigger"><span id="pill-default">Default</span></button>
        <span id="plain-default">Default</span>
        <div data-testid="conversation-row-history"><span id="hist-title" class="truncate">Settings</span></div>
        <button id="more-plain">Show 3 more</button>
        <button id="more-ell">Show 3 more...</button>
    `;
    const w = await fixture(t, html);
    const doc = w.document;
    for (const [id, name] of [['i-comment', 'comment'], ['i-quote', 'format_quote'], ['i-laptop', 'laptop_shield']]) {
        const el = doc.getElementById(id);
        assert.equal(el.querySelectorAll(`svg[data-ag-icon-fallback="${name}"]`).length, 1, name);
        assert.equal(el.textContent, '', `${name} não deve aparecer como texto nem ser traduzido`);
    }
    // O tamanho do SVG acompanha a fonte do elemento, inclusive quando medida em rem.
    assert.equal(doc.querySelector('#i-comment svg').getAttribute('width'), '1em');
    assert.equal(doc.getElementById('i-unknown').textContent, 'settings');
    assert.equal(doc.getElementById('pill-turbo').textContent, 'Turbo');
    assert.equal(doc.getElementById('pill-default').textContent, 'Padrão');
    assert.equal(doc.getElementById('plain-default').textContent, 'Padrão');
    assert.equal(doc.getElementById('hist-title').textContent, 'Settings');
    assert.equal(doc.getElementById('more-plain').textContent, 'Mostrar mais 3');
    assert.equal(doc.getElementById('more-ell').textContent, 'Mostrar mais 3...');

    // O React pode trocar o ícone sem trocar o nó de texto. Deve haver apenas um SVG.
    const quoteText = Array.from(doc.getElementById('i-quote').childNodes).find(n => n.nodeType === w.Node.TEXT_NODE);
    quoteText.nodeValue = 'comment';
    await settle();
    assert.equal(doc.querySelectorAll('#i-quote svg').length, 1);
    assert.equal(doc.querySelector('#i-quote svg').getAttribute('data-ag-icon-fallback'), 'comment');
});

test('v2.35.1 React-split sentences keep spacing, automation hints translate their nouns, and pt-BR templates read naturally', async t => {
    // Nós de texto, espaços e limites de fragmentos reproduzem o DOM da versão 2.35.1.
    const html = `
        <span role="status" id="ps2">In System Settings, click <strong>+</strong>, choose<!----> <!----><strong>Antigravity</strong>, then turn it on.<!----> <!---->Already on? Select <strong>Antigravity</strong>, click <strong>–</strong>, then<!----> <!---->click <strong>+</strong> and add it again.</span>
        <span id="kb">Inspect live bindings or record custom key chords filtered to<!----> <code>antigravity.</code> <!---->commands.</span>
        <span id="msg">Messages now send immediately. Configure in<!----> <span class="whitespace-nowrap"><button>settings</button>.</span></span>
        <span id="wk2"><span class="font-semibold">Weekly</span> on<!----> <!----><span class="font-semibold">Monday</span> around<!----> <!----><span class="font-semibold">9:00 AM</span></span>
        <div id="dp">Agents created by <!---->Foo Plugin<!----> run in a dedicated<!----> <!---->project<!----> with its own permissions, which you can change anytime in the <!---->project<!----> settings page.<!----> On top of those defaults, Foo Plugin requests the access below.</div>
        <div id="toast">Agents created by this automation run in a dedicated project with its own permissions. You can change the permissions in the project settings page.</div>
        <div id="stopn">Stop 3 items?</div>
        <div id="noapp" class="text-muted-foreground">No plugin found for<!----> <!----><span class="font-mono">foo-bar</span>.</div>
        <div id="perm2">Antigravity needs both to use your computer.</div>
        <div id="relaunch">Relaunch Antigravity to finish Screen Recording.</div>
        <div id="tool1">1 tool</div><div id="tool2">5 tools · sign in for more</div>
        <div id="conn">Connecting to devbox…</div><div id="conn2">Connecting to devbox</div>
        <div data-testid="running-selection-bar"><span id="sel" class="text-foreground">3<!----> selected</span></div>
    `;
    const expected = {
        ps2: 'Em Configurações do Sistema, clique em +, escolha Antigravity, depois ative-o. Já está ativado? Selecione Antigravity, clique em –, depois clique em + e adicione-o novamente.',
        kb: 'Inspecione os atalhos ativos ou grave combinações personalizadas filtradas pelo prefixo antigravity. nos comandos.',
        msg: 'As mensagens agora são enviadas imediatamente. Configure em Configurações.',
        wk2: 'Semanalmente na segunda-feira por volta de 9:00 AM',
        dp: 'Os agentes criados por Foo Plugin são executados em um projeto dedicado com permissões próprias, que você pode alterar a qualquer momento nas configurações do projeto. Além desses padrões, Foo Plugin solicita o acesso abaixo.',
        toast: 'Os agentes criados por esta automação são executados em um ambiente dedicado (projeto) com permissões próprias. Você pode alterar as permissões na página de configurações de projeto.',
        stopn: 'Parar 3 itens?',
        noapp: 'Nenhum plugin encontrado para foo-bar.',
        perm2: 'Antigravity precisa de ambas as permissões para controlar seu computador.',
        relaunch: 'Reinicie Antigravity para concluir a configuração de "Gravação de tela".',
        tool1: '1 ferramenta',
        tool2: '5 ferramentas · entre para ver mais',
        conn: 'Conectando a devbox…',
        conn2: 'Conectando a devbox',
        sel: '3 selecionados'
    };
    const w = await fixture(t, html);
    for (const [id, translation] of Object.entries(expected)) {
        assert.equal(w.document.getElementById(id).textContent, translation, `${id}`);
    }
    // O espaço entre dois botões é um separador visível.
    const w2 = await fixture(t, '<div id="pair"><button>Cancel</button> <button>Settings</button></div>');
    assert.equal(w2.document.getElementById('pair').textContent, 'Cancelar Configurações');
});

test('plugin and feature names stay in the original language in pt-BR (#63)', async t => {
    const html = `
        <span id="n1">Chief of Staff</span><span id="n2">Concierge</span><span id="n3">Data Agent Kit</span>
        <span id="n4">Google Workspace</span><span id="n5">Google Developer Knowledge</span>
        <span id="s1">Sent to Chief of Staff</span><span id="s2">Chief of Staff voice mode is active</span>
        <span id="s3">Welcome to the Concierge</span>
    `;
    const names = { n1: 'Chief of Staff', n2: 'Concierge', n3: 'Data Agent Kit', n4: 'Google Workspace', n5: 'Google Developer Knowledge' };
    const w = await fixture(t, html);
    for (const [id, name] of Object.entries(names)) assert.equal(w.document.getElementById(id).textContent, name, `${name}`);
    assert.equal(w.document.getElementById('s1').textContent, 'Enviado ao Chief of Staff');
    // Concierge é o nome do produto.
    assert.equal(w.document.getElementById('s2').textContent, 'O modo de voz do Chief of Staff está ativo');
    assert.equal(w.document.getElementById('s3').textContent, 'Boas-vindas ao Concierge');
});

test('CJK gap collapse is undone when React reuses neighbor text nodes, and nested markup is walked once', async t => {
    const html = '<span id="pair">Settings<!----> <!---->Help</span>';
    const w = await fixture(t, html, undefined, { dictionaryOverrides: { Settings: '设置', Help: '帮助' } });
    const pair = w.document.getElementById('pair');
    assert.equal(pair.textContent, '设置帮助');
    // Ao reutilizar os nós em inglês, o React recupera o espaço entre eles.
    pair.firstChild.data = 'Alice';
    pair.lastChild.data = 'Bob';
    await settle();
    assert.equal(pair.textContent, 'Alice Bob');
    pair.firstChild.data = 'Settings';
    pair.lastChild.data = 'Help';
    await settle();
    assert.equal(pair.textContent, '设置帮助');
    // Verificar os vizinhos não pode disparar novas travessias da mesma subárvore.
    const vm = require('node:vm');
    const counter = createDom('');
    t.after(() => counter.window.close());
    const js = loadRuntime();
    const prefix = js.slice(0, js.indexOf('    const observer ='))
        .replace('function translateNode(node) {', 'function translateNode(node) {globalThis.calls++;');
    const context = { Node: counter.window.Node, document: counter.window.document, setTimeout, clearTimeout, console, calls: 0 };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const doc = counter.window.document;
    let nested = doc.createElement('span');
    nested.append('X');
    const depth = 12;
    for (let i = 0; i < depth; i++) {
        const parent = doc.createElement('span');
        parent.append('X甲', ' ', nested);
        nested = parent;
    }
    doc.body.append(nested);
    context.hooks.translateNode(nested);
    const nodes = 3 * depth + 2;
    assert.ok(context.calls <= 2 * nodes, `translateNode called ${context.calls} times for ${nodes} nodes`);
});

test('slash command names and sidebar plugin names remain in English while descriptions and working hints translate in pt-BR', async t => {
    const html = `
      <div>
        <div role="listbox">
          <div role="option"><span id="cmd-goal">goal</span><span id="desc-goal">Run until the specified goal is completely finished</span></div>
          <div role="option"><span id="cmd-schedule">schedule</span><span id="desc-schedule">Run an instruction on a recurring schedule or as a one-time timer</span></div>
          <div role="option"><span id="cmd-plan">plan</span><span id="desc-plan">Plan carefully before executing a task.</span></div>
          <div role="option"><span id="cmd-plugin">plugin</span></div>
          <div role="option"><span id="cmd-automation">automation</span></div>
          <div role="option"><span id="cmd-grill">grill-me</span></div>
          <div role="option"><span id="cmd-learn">learn</span></div>
          <div role="option"><span id="cmd-boost">boost</span></div>
          <div role="option"><span id="cmd-btw">btw</span></div>
          <div role="option"><span id="cmd-slash">/schedule</span></div>
          <div role="option"><span id="cmd-split-prefix">/</span><span id="cmd-models">models</span><span id="desc-models">Select model</span></div>
        </div>
        <aside data-testid="sidebar">
          <section>
            <h3 id="sb-plugins-hdr">Plugins</h3>
            <div data-plugin-id="chrome-devtools"><span id="plug-chrome">Chrome DevTools</span><button id="plug-open-chrome" aria-label="Open the Chrome DevTools plugin">Open</button></div>
            <div><span id="plug-mwg">Modern Web Guidance</span></div>
            <div><span id="plug-ws">Google Workspace</span></div>
            <div><span id="plug-dak">Data Agent Kit</span></div>
            <button id="plug-open-k" aria-label="Open the Knowledge plugin"><span id="plug-knowledge">Knowledge</span></button>
            <button id="plug-mkp">Open Marketplace</button>
            <button id="plug-more">See more</button>
          </section>
          <section>
            <h3 id="sb-other-hdr">Knowledge</h3>
          </section>
        </aside>
        <div id="work-hook">Hook Json SessionStart</div>
        <div id="work-run">Running scan dicts for slug and lowercase keys</div>
        <div id="work-dur">1m 31s</div>
        <p id="prose-run">Running tests on CI requires valid credentials.</p>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('cmd-goal').textContent, 'goal');
    assert.equal(w.document.getElementById('desc-goal').textContent, 'Executar até que o objetivo especificado seja totalmente concluído');
    assert.equal(w.document.getElementById('cmd-schedule').textContent, 'schedule');
    assert.equal(w.document.getElementById('desc-schedule').textContent, 'Executar uma instrução de forma recorrente ou como um temporizador único');
    assert.equal(w.document.getElementById('cmd-plan').textContent, 'plan');
    assert.equal(w.document.getElementById('desc-plan').textContent, 'Planejar com cuidado antes de executar uma tarefa.');
    assert.equal(w.document.getElementById('cmd-plugin').textContent, 'plugin');
    assert.equal(w.document.getElementById('cmd-automation').textContent, 'automation');
    assert.equal(w.document.getElementById('cmd-grill').textContent, 'grill-me');
    assert.equal(w.document.getElementById('cmd-learn').textContent, 'learn');
    assert.equal(w.document.getElementById('cmd-boost').textContent, 'boost');
    assert.equal(w.document.getElementById('cmd-btw').textContent, 'btw');
    assert.equal(w.document.getElementById('cmd-slash').textContent, '/schedule');
    assert.equal(w.document.getElementById('cmd-models').textContent, 'models');
    assert.equal(w.document.getElementById('desc-models').textContent, 'Selecionar modelo');

    assert.equal(w.document.getElementById('sb-plugins-hdr').textContent, 'Plugins');
    assert.equal(w.document.getElementById('plug-chrome').textContent, 'Chrome DevTools');
    assert.equal(w.document.getElementById('plug-open-chrome').getAttribute('aria-label'), 'Abrir o plugin Chrome DevTools');
    assert.equal(w.document.getElementById('plug-mwg').textContent, 'Modern Web Guidance');
    assert.equal(w.document.getElementById('plug-ws').textContent, 'Google Workspace');
    assert.equal(w.document.getElementById('plug-dak').textContent, 'Data Agent Kit');
    assert.equal(w.document.getElementById('plug-knowledge').textContent, 'Knowledge');
    assert.equal(w.document.getElementById('plug-open-k').getAttribute('aria-label'), 'Abrir o plugin Knowledge');
    assert.equal(w.document.getElementById('plug-mkp').textContent, 'Abrir marketplace');
    assert.equal(w.document.getElementById('plug-more').textContent, 'Ver mais');
    assert.equal(w.document.getElementById('sb-other-hdr').textContent, 'Conhecimento');

    assert.equal(w.document.getElementById('work-hook').textContent, 'Hook Json SessionStart');
    assert.equal(w.document.getElementById('work-run').textContent, 'Executando scan dicts for slug and lowercase keys');
    assert.equal(w.document.getElementById('work-dur').textContent, '1 min 31 s');
    assert.equal(w.document.getElementById('prose-run').textContent, 'Running tests on CI requires valid credentials.');
});

test('sidecar plugin modal keeps plugin name untranslated, translates side-pane sentence, Title-Case section headings, and higher-tier upgrade notice', async t => {
    const html = `
      <div>
        <div role="dialog" id="sidecar-modal">
          <div id="hdr-row"><span id="modal-plugin">Context Usage</span><span id="modal-status">Running</span></div>
          <div id="modal-path">desktop-context/context</div>
          <div id="banner">
            <div id="banner-title">Side Pane UI Available</div>
            <p id="banner-desc-split">Stream and control <span>Context Usage</span> directly in the side pane.</p>
            <p id="banner-desc-single">Stream and control Context Usage directly in the side pane.</p>
            <button id="open-sp">Open in side pane</button>
          </div>
          <div><span id="lbl-type">Type</span><span>UI Plugin (SidePanel)</span></div>
          <div><span id="lbl-cmd">Command</span><span>node main.mjs</span></div>
          <div><span id="lbl-host">Host Endpoint</span></div>
        </div>
        <span id="outside-cu">Context usage</span>
        <h3 id="sec-nav">Navigation</h3>
        <h3 id="sec-sug">Suggestions</h3>
        <h3 id="sec-rec">Recommended</h3>
        <span id="lbl-days">Days</span>
        <span id="lc-nav">navigation</span>
        <p id="upgrade-ultra">You can upgrade to a higher Google AI Ultra plan to receive the highest rate limits.</p>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('modal-plugin').textContent, 'Context Usage');
    assert.equal(w.document.getElementById('modal-status').textContent, 'Em execução');
    assert.equal(w.document.getElementById('banner-title').textContent, 'Interface do painel lateral disponível');
    assert.equal(w.document.getElementById('banner-desc-split').textContent, 'Transmitir e controlar Context Usage diretamente no painel lateral.');
    assert.equal(w.document.getElementById('banner-desc-single').textContent, 'Transmitir e controlar Context Usage diretamente no painel lateral.');
    assert.equal(w.document.getElementById('open-sp').textContent, 'Abrir no painel lateral');
    assert.equal(w.document.getElementById('lbl-type').textContent, 'Tipo');
    assert.equal(w.document.getElementById('lbl-cmd').textContent, 'Comando');
    assert.equal(w.document.getElementById('lbl-host').textContent, 'Endpoint do host');
    assert.equal(w.document.getElementById('outside-cu').textContent, 'Uso do contexto');
    assert.equal(w.document.getElementById('sec-nav').textContent, 'Navegação');
    assert.equal(w.document.getElementById('sec-sug').textContent, 'Sugestões');
    assert.equal(w.document.getElementById('sec-rec').textContent, 'Recomendado');
    assert.equal(w.document.getElementById('lbl-days').textContent, 'Dias');
    assert.equal(w.document.getElementById('lc-nav').textContent, 'navigation');
    assert.equal(w.document.getElementById('upgrade-ultra').textContent, 'Você pode fazer upgrade para um plano Google AI Ultra de nível superior para receber os maiores limites de uso.');
});

test('folded step summaries without counts and plan mode tool labels translate while code blocks stay isolated', async t => {
    const html = `
      <div>
        <span id="fs-1">Explored, ran command</span>
        <span id="fs-2">Explored, edited, ran command</span>
        <span id="fs-3">Explored, ran 2 commands</span>
        <span id="fs-4">Exploring, running command</span>
        <span id="pm-exit">exit_plan_mode</span>
        <span id="pm-enter">enter_plan_mode</span>
        <code id="pm-code">exit_plan_mode</code>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('fs-1').textContent, 'Explorou, Executou comando');
    assert.equal(w.document.getElementById('fs-2').textContent, 'Explorou, Editou, Executou comando');
    assert.equal(w.document.getElementById('fs-3').textContent, 'Explorou, Executou 2 comandos');
    assert.equal(w.document.getElementById('fs-4').textContent, 'Explorando, Executando comando');
    assert.equal(w.document.getElementById('pm-exit').textContent, 'Sair do modo de planejamento');
    assert.equal(w.document.getElementById('pm-enter').textContent, 'Entrar no modo de planejamento');
    assert.equal(w.document.getElementById('pm-code').textContent, 'exit_plan_mode');
});

test('tool call section labels, truncation hints, hover notices, and progress pills translate safely in pt-BR', async t => {
    const html = `
      <div>
        <div id="btw-single">Applies to /btw and messages sent after this turn</div>
        <div id="btw-split">Applies to <code>/btw</code> and messages sent after this turn</div>
        <span id="fc-single">3 files changed</span>
        <span id="fc-one">1 file changed</span>
        <span id="fc-diff">3 files changed +66 -0</span>
        <div id="fc-split"><span>3</span><span> files changed</span></div>
        <p id="fc-prose">These files changed yesterday</p>
        <span id="st-single">3/3 steps</span>
        <span id="st-one">1/1 step</span>
        <div id="st-split"><span>3/3</span><span> steps</span></div>
        <span id="st-plain">steps</span>
        <div id="lbl-args">Arguments</div>
        <div id="lbl-out">Output</div>
        <div id="lbl-res">Result</div>
        <div id="lbl-resp">Response</div>
        <span id="lc-args">arguments</span>
        <span id="lc-res">result</span>
        <span id="lc-resp">response</span>
        <div id="tr-lines">... 24 more lines, truncated for display.</div>
        <div id="tr-one">… 1 more line, truncated for display.</div>
        <div id="tr-chars">... 120 more characters, truncated for display.</div>
        <div id="tr-split">... <span>24</span><span> more lines, truncated for display.</span></div>
        <div id="undo-rewind">Only the conversation will be rewound; your files will be left as-is.</div>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('btw-single').textContent, 'Vale para /btw e para as mensagens enviadas depois deste turno');
    assert.equal(w.document.getElementById('btw-split').textContent, 'Vale para /btw e para as mensagens enviadas depois deste turno');
    assert.equal(w.document.getElementById('fc-single').textContent, '3 arquivos alterados');
    assert.equal(w.document.getElementById('fc-one').textContent, '1 arquivo alterado');
    assert.equal(w.document.getElementById('fc-diff').textContent, '3 arquivos alterados +66 -0');
    assert.equal(w.document.getElementById('fc-split').textContent, '3 arquivos alterados');
    assert.equal(w.document.getElementById('fc-prose').textContent, 'These files changed yesterday');
    assert.equal(w.document.getElementById('st-single').textContent, '3/3 etapas');
    assert.equal(w.document.getElementById('st-one').textContent, '1/1 etapa');
    assert.equal(w.document.getElementById('st-split').textContent, '3/3 etapas');
    assert.equal(w.document.getElementById('st-plain').textContent, 'steps');
    assert.equal(w.document.getElementById('lbl-args').textContent, 'Argumentos');
    assert.equal(w.document.getElementById('lbl-out').textContent, 'Saída');
    assert.equal(w.document.getElementById('lbl-res').textContent, 'Resultado');
    assert.equal(w.document.getElementById('lbl-resp').textContent, 'Resposta');
    assert.equal(w.document.getElementById('lc-args').textContent, 'arguments');
    assert.equal(w.document.getElementById('lc-res').textContent, 'result');
    assert.equal(w.document.getElementById('lc-resp').textContent, 'response');
    assert.equal(w.document.getElementById('tr-lines').textContent, '... mais 24 linhas, truncadas para exibição.');
    assert.equal(w.document.getElementById('tr-one').textContent, '… mais 1 linha, truncada para exibição.');
    assert.equal(w.document.getElementById('tr-chars').textContent, '... mais 120 caracteres, truncados para exibição.');
    assert.equal(w.document.getElementById('tr-split').textContent, '... 24 linhas a mais, truncadas para exibição.');
    assert.equal(w.document.getElementById('undo-rewind').textContent, 'Somente a conversa será revertida; seus arquivos permanecerão como estão.');
});

test('third-party sidecar plugin iframes and aux-pane plugin tabs stay untranslated while built-in Swarm sidecars still translate', async t => {
    const thirdPartyHtml = `
      <div>
        <div id="sp-token">TOKEN USAGE</div>
        <div id="sp-tools">Tool calls</div>
        <div id="sp-sys">System prompt</div>
        <div id="sp-rules">Rules</div>
        <div id="sp-skills">Skills</div>
        <div id="sp-sub">Subagents</div>
        <div id="sp-plug">Plugins</div>
        <div id="sp-mcp">MCP Tools</div>
        <div id="sp-turns">105 turns</div>
      </div>
    `;
    const hostDom = createDom('<iframe id="third-party-frame"></iframe><iframe id="swarm-frame"></iframe>');
    t.after(() => hostDom.window.close());

    const thirdPartyFrame = hostDom.window.document.getElementById('third-party-frame');
    thirdPartyFrame.contentDocument.body.innerHTML = thirdPartyHtml;
    thirdPartyFrame.contentWindow.eval(loadRuntime());
    await settle();
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-token').textContent, 'TOKEN USAGE');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-tools').textContent, 'Tool calls');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-sys').textContent, 'System prompt');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-rules').textContent, 'Rules');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-skills').textContent, 'Skills');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-sub').textContent, 'Subagents');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-plug').textContent, 'Plugins');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-mcp').textContent, 'MCP Tools');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-turns').textContent, '105 turns');

    const swarmFrameHtml = `
      <div data-testid="swarm-board">
        <div id="tab-overview"><span id="sw-ov">Overview</span></div>
      </div>
    `;
    const swarmFrame = hostDom.window.document.getElementById('swarm-frame');
    swarmFrame.contentDocument.body.innerHTML = swarmFrameHtml;
    swarmFrame.contentWindow.eval(loadRuntime());
    await settle();
    assert.equal(swarmFrame.contentDocument.getElementById('sw-ov').textContent, 'Visão geral');

    const auxHtml = `
      <div>
        <div role="tablist">
          <button role="tab" id="tab-review">Review</button>
          <button role="tab" id="tab-cu">Context Usage</button>
          <button role="tab" id="tab-notes">Notes</button>
        </div>
        <div data-testid="aux-pane">
          <button id="aux-review">Review</button>
          <button id="aux-open-file">Open File</button>
          <button id="aux-side-q">Side Question</button>
          <button id="aux-cu">Context Usage</button>
          <div role="menuitem" id="menu-skills-used">Skills Used</div>
        </div>
        <span id="builtin-cu">Context usage</span>
        <iframe data-testid="sidecar-iframe" src="http://localhost:51956"></iframe>
      </div>
    `;
    const w = await fixture(t, auxHtml);
    assert.equal(w.document.getElementById('tab-review').textContent, 'Revisão');
    assert.equal(w.document.getElementById('tab-cu').textContent, 'Context Usage');
    assert.equal(w.document.getElementById('tab-notes').textContent, 'Notes');
    assert.equal(w.document.getElementById('aux-open-file').textContent, 'Abrir arquivo');
    assert.equal(w.document.getElementById('aux-side-q').textContent, 'Pergunta paralela');
    assert.equal(w.document.getElementById('aux-cu').textContent, 'Context Usage');
    assert.equal(w.document.getElementById('menu-skills-used').textContent, 'Habilidades usadas');
    assert.equal(w.document.getElementById('builtin-cu').textContent, 'Uso do contexto');
});

test('expanded tool call labels and truncation hints inside soft-isolated siblings translate while preserving code and thinking text', async t => {
    const html = `
      <div>
        <div data-testid="thinking-collapsible-trigger">Thought for 11s</div>
        <div id="thinking-body">Thinking about Arguments and Output in Result</div>
        <div id="tool-wrap">
          <div class="font-mono" id="mono-tool">
            <div id="mono-args">Arguments</div>
            <pre><code id="mono-code">{"Arguments": "Result"}</code></pre>
            <div id="mono-out">Output</div>
            <div id="mono-trunc">... 24 more lines, truncated for display.</div>
          </div>
          <div translate="no" id="tn-tool">
            <span id="tn-res">Result</span>
            <pre><code>ok</code></pre>
            <span id="tn-resp">Response</span>
          </div>
          <div class="code-block" id="cb-tool">
            <div id="cb-args">arguments</div>
            <pre><code>raw</code></pre>
            <div id="cb-out">output</div>
          </div>
        </div>
        <div id="normal-adj">
          <span id="adj-args">arguments</span>
          <pre><code>x = 1</code></pre>
        </div>
        <div id="hdr-wrap-box">
          <div class="header-row"><strong id="nested-args">Arguments</strong><button>Copy</button></div>
          <div class="code-viewer"><div class="code-line">raw line</div></div>
        </div>
        <em id="jsx-em-trunc">... 24 more lines, truncated for display.</em>
        <div data-testid="thinking-collapsible-trigger">Executed search</div>
        <div id="tool-step-body">
          <div id="step-args">Arguments</div>
          <div class="font-mono">output payload</div>
          <p><em id="step-em-trunc">... 12 more lines, truncated for display.</em></p>
        </div>
        <div translate="no" id="keep-tn">Knowledge</div>
        <span id="plain-lc">arguments</span>
      </div>
    `;
    const w = await fixture(t, html, win => {
      const em1 = win.document.getElementById('jsx-em-trunc');
      em1.textContent = '';
      for (const s of ['... ', '24', ' more ', 'lines', ', truncated for display.']) em1.appendChild(win.document.createTextNode(s));
      const em2 = win.document.getElementById('step-em-trunc');
      em2.textContent = '';
      for (const s of ['... ', '12', ' more ', 'lines', ', truncated for display.']) em2.appendChild(win.document.createTextNode(s));
    });
    assert.equal(w.document.getElementById('thinking-body').textContent, 'Thinking about Arguments and Output in Result');
    assert.equal(w.document.getElementById('mono-args').textContent, 'Argumentos');
    assert.equal(w.document.getElementById('mono-code').textContent, '{"Arguments": "Result"}');
    assert.equal(w.document.getElementById('mono-out').textContent, 'Saída');
    assert.equal(w.document.getElementById('mono-trunc').textContent, '... mais 24 linhas, truncadas para exibição.');
    assert.equal(w.document.getElementById('tn-res').textContent, 'Resultado');
    assert.equal(w.document.getElementById('tn-resp').textContent, 'Resposta');
    assert.equal(w.document.getElementById('cb-args').textContent, 'Argumentos');
    assert.equal(w.document.getElementById('cb-out').textContent, 'Saída');
    assert.equal(w.document.getElementById('adj-args').textContent, 'Argumentos');
    assert.equal(w.document.getElementById('nested-args').textContent, 'Argumentos');
    assert.equal(w.document.getElementById('jsx-em-trunc').textContent, '... mais 24 linhas, truncadas para exibição.');
    assert.equal(w.document.getElementById('step-args').textContent, 'Argumentos');
    assert.equal(w.document.getElementById('step-em-trunc').textContent, '... mais 12 linhas, truncadas para exibição.');
    assert.equal(w.document.getElementById('keep-tn').textContent, 'Knowledge');
    assert.equal(w.document.getElementById('plain-lc').textContent, 'arguments');
});

test('turn indicator hover attachments, counter, and command exit codes translate in pt-BR', async t => {
    const html = `
      <div>
        <div id="att-title">Resolver os três problemas acima (3 image attachments)</div>
        <span id="att-single">(1 image attachment)</span>
        <span id="att-file">(2 file attachments)</span>
        <span id="turn-cnt">4 of 14</span>
        <span id="exit-dot">· Exited with code 1</span>
        <span id="exit-bare">Exited with code 0</span>
        <div id="exit-comb">Ran npm test · Exited with code 1</div>
        <div id="exit-split"><span>Exited with code </span><span>1</span></div>
        <span id="ctx-folder">Folder</span>
        <span id="ctx-drive">Drive</span>
        <span id="lc-folder">folder</span>
        <span id="lc-drive">drive</span>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('att-title').textContent, 'Resolver os três problemas acima (3 anexos de imagem)');
    assert.equal(w.document.getElementById('att-single').textContent, '(1 anexo de imagem)');
    assert.equal(w.document.getElementById('att-file').textContent, '(2 anexos de arquivo)');
    assert.equal(w.document.getElementById('turn-cnt').textContent, '4 / 14');
    assert.equal(w.document.getElementById('exit-dot').textContent, '· Encerrado com código 1');
    assert.equal(w.document.getElementById('exit-bare').textContent, 'Encerrado com código 0');
    assert.equal(w.document.getElementById('exit-comb').textContent, 'Executou npm test · Encerrado com código 1');
    assert.equal(w.document.getElementById('exit-split').textContent, 'Encerrado com código 1');
    assert.equal(w.document.getElementById('ctx-folder').textContent, 'Pasta');
    assert.equal(w.document.getElementById('ctx-drive').textContent, 'Drive');
    assert.equal(w.document.getElementById('lc-folder').textContent, 'folder');
    assert.equal(w.document.getElementById('lc-drive').textContent, 'drive');
});
