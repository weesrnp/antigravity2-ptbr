const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

async function render(t, html, options = {}) {
    const dom = createDom(html);
    t.after(() => dom.window.close());
    dom.window.eval(loadRuntime(options));
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 20));
    return dom.window.document;
}

test('usage labels retain percentages and full multi-unit reset durations', async t => {
    const doc = await render(t, '<span id="limit">5h limit</span><span id="percent">83</span><span id="left">% left</span><span id="reset">Resets in 4d 9h</span>');
    assert.equal(doc.querySelector('#limit').textContent, 'Limite de 5 horas');
    assert.equal(doc.querySelector('#percent').textContent, '83');
    assert.equal(doc.querySelector('#left').textContent, '% restante');
    assert.equal(doc.querySelector('#reset').textContent, 'Redefine em 4 dias 9 h');
});

test('usage tooltips support long and compact duration labels', async t => {
    const doc = await render(t, '<span id="long" title="Resets in 1 week, 2 days, 3 hours, 4 minutes">100% left</span><span id="short">Resets in &lt;1m</span>');
    assert.equal(doc.querySelector('#long').title, 'Redefine em 1 semana 2 dias 3 h 4 min');
    assert.equal(doc.querySelector('#long').textContent, '100% restante');
    assert.equal(doc.querySelector('#short').textContent, 'Redefine em <1 min');
});

test('unknown reset formats keep their original time instead of discarding it', async t => {
    const doc = await render(t, '<span id="x">Resets in an unknown duration</span>');
    assert.equal(doc.querySelector('#x').textContent, 'Resets in an unknown duration');
});

test('bare durations do not claim that a future quota reset happened ago', async t => {
    const html = '<span id="duration">1w</span><span id="elapsed">5h ago</span><span id="plain-now">now</span><div data-testid="conversation-row-sidebar"><small id="row">3d</small><small id="row-now">now</small></div>';
    const doc = await render(t, html);
    assert.equal(doc.querySelector('#duration').textContent, '1 sem');
    assert.equal(doc.querySelector('#elapsed').textContent, 'há 5 h');
    assert.equal(doc.querySelector('#plain-now').textContent, 'now');
    assert.equal(doc.querySelector('#row').textContent, 'há 3 d');
    assert.equal(doc.querySelector('#row-now').textContent, 'agora');
});

test('New model badges use a status translation without changing New commands', async t => {
    const doc = await render(t, '<div role="menu" aria-label="Select model, current: Example"><div role="menuitem">Example <span id="badge">New</span></div></div><button id="command">New</button>', { dictionaryOverrides: { New: 'Criar' } });
    assert.equal(doc.querySelector('#badge').textContent, 'Novo');
    assert.equal(doc.querySelector('#command').textContent, 'Criar');
});

test('New badges resolve model menu names through ARIA label references', async t => {
    const doc = await render(t, '<button id="trigger" aria-label="Select model, current: Example">Example</button><div role="menu" aria-labelledby="trigger"><div role="menuitem">Example <span id="badge">New</span></div></div><span id="label">Select model</span><div role="menu" aria-labelledby="label"><span id="text-badge">New</span></div><button id="command">New</button>', { dictionaryOverrides: { New: 'Criar' } });
    assert.equal(doc.querySelector('#badge').textContent, 'Novo');
    assert.equal(doc.querySelector('#text-badge').textContent, 'Novo');
    assert.equal(doc.querySelector('#command').textContent, 'Criar');
});

test('late model menu roles and labels correct an already cached New translation', async t => {
    const doc = await render(t, '<button id="trigger">Example</button><div id="menu"><div role="menuitem">Example <span id="badge">New</span></div></div><button id="command">New</button>', { dictionaryOverrides: { New: 'Criar' } });
    assert.equal(doc.querySelector('#badge').textContent, 'Criar');
    const menu = doc.querySelector('#menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', 'trigger');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(doc.querySelector('#badge').textContent, 'Criar');
    doc.querySelector('#trigger').setAttribute('aria-label', 'Select model, current: Example');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(doc.querySelector('#badge').textContent, 'Novo');
    assert.equal(doc.querySelector('#command').textContent, 'Criar');
});

test('combined limit and reset duration labels translate in pt-BR', async t => {
    const html = '<span id="weekly">Weekly limit, resets in 5d 22h</span><span id="daily">Daily limit, resets in 3h 15m</span><span id="short">5h limit, resets in &lt;1m</span><span id="days">7d limit</span>';
    const doc = await render(t, html);
    assert.equal(doc.querySelector('#weekly').textContent, 'Limite semanal, redefine em 5 dias 22 h');
    assert.equal(doc.querySelector('#daily').textContent, 'Limite diário, redefine em 3 h 15 min');
    assert.equal(doc.querySelector('#short').textContent, 'Limite de 5 horas, redefine em <1 min');
    assert.equal(doc.querySelector('#days').textContent, 'Limite de 7 dias');
});

test('server-returned RPC quota and model tooltip strings translate in pt-BR', async t => {
    const html = [
        '<span id="tip">The original Gemini 4 model for advanced workflows</span>',
        '<span id="tip-dyn">The original Gemini 3.5 Pro model for advanced workflows.</span>',
        '<span id="bucket">Gemini 4 Argon Weekly Limit</span>',
        '<span id="grp">Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash</span>',
        '<span id="argon">For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.</span>',
        '<span id="hit-5h-apply">You have hit your 5-hour limit, so the weekly limit does not currently apply. Your 5-hour limit will refresh in 36 minutes.</span>',
        '<span id="hit-5h-credits">You have hit your 5-hour limit, it will refresh in 36 minutes. If on a supported paid plan, you can use AI credits in the interim.</span>',
        '<span id="used-5h">You have used some of your 5-hour limit, it will fully refresh in 4 hours, 54 minutes.</span>'
    ].join('');

    const doc = await render(t, html);
    assert.equal(doc.querySelector('#tip').textContent, 'O modelo Gemini 4 original para fluxos de trabalho avançados');
    assert.equal(doc.querySelector('#tip-dyn').textContent, 'O modelo Gemini 3.5 Pro original para fluxos de trabalho avançados');
    assert.equal(doc.querySelector('#bucket').textContent, 'Limite semanal de Gemini 4 Argon');
    assert.equal(doc.querySelector('#grp').textContent, 'Modelos deste grupo: Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash');
    assert.equal(doc.querySelector('#argon').textContent, 'Nos planos Pro pagos, a cota do Argon é separada. Uma cota maior do Argon (incluída no grupo de cota maior do Gemini) está disponível nos planos Ultra.');
    assert.equal(doc.querySelector('#hit-5h-apply').textContent, 'Você atingiu seu limite de 5 horas, e o limite semanal não se aplica no momento. Seu limite de 5 horas será renovado em 36 min.');
    assert.equal(doc.querySelector('#hit-5h-credits').textContent, 'Você atingiu seu limite de 5 horas, que será renovado em 36 min. Se estiver em um plano pago compatível, você pode usar créditos de IA enquanto isso.');
    assert.equal(doc.querySelector('#used-5h').textContent, 'Renova em 4 horas e 54 minutos');
});

test('v2.34.0 Swarm Hive map, GIF export, and live timer/subagent counters translate in pt-BR', async t => {
    const html = `
        <div id="swarm-title">Untitled swarm</div>
        <button id="tab-hive">Hive</button>
        <div class="o2 hv">
            <div class="hv-bar">
                <div class="hv-sum"><span><b>12</b> threads</span><span class="busy"><i></i>3 working</span><span class="warn"><i></i>1 waiting</span><span class="bad"><i></i>2 stuck</span><span class="ok"><i></i>4 done</span></div>
                <div class="btn-group hv-zoom" aria-label="Zoom">
                    <button id="z-out" title="Zoom out" aria-label="Zoom out"></button>
                    <button id="z-in" title="Zoom in" aria-label="Zoom in"></button>
                    <button id="z-fit" title="Fit the whole swarm" aria-label="Fit the whole swarm"></button>
                </div>
            </div>
            <svg class="hv-svg" aria-label="Where each worker is, by thread"></svg>
            <div class="hv-bees">
                <button id="bee-work" class="hv-bee working" title="@worker-1 · Codebase Researcher · Working for @coordinator" aria-label="@worker-1 · Codebase Researcher · Working for @coordinator"><span class="hv-nm" id="nm-work">worker-1</span></button>
                <button id="bee-wait" class="hv-bee wait" title="@worker-2 · Waiting on @coordinator"><span class="hv-nm" id="nm-wait">design</span></button>
            </div>
            <div class="hv-key" aria-hidden="true">
                <span id="k-done"><i></i>Tasks done</span>
                <span id="k-sent"><i></i>Message just sent</span>
                <span id="k-waiton"><i></i>Waiting on</span>
                <span id="k-work"><i></i>Working</span>
                <span id="k-wait"><i></i>Waiting</span>
                <span id="k-ok"><i></i>Done</span>
            </div>
            <section class="hv-card">
                <span id="card-prog">3 of 5 done</span>
                <span id="card-bees">2 bees</span>
                <button id="row-open" title="Open @worker-1">x</button>
                <p id="card-empty">No one is on this thread yet.</p>
            </section>
            <span id="stall">Swarm stalled — no agents working</span>
            <span id="coord-ask">The coordinator asked. Answer it in its chat.</span>
            <span id="live-tip" title="Latest action: Reading config">x</span>
            <span id="exp-btn">Export GIF</span>
            <span id="exp-pct">Exporting 42%</span>
            <span id="exp-done">Exported swarm-graph.gif (12 frames · 1.2 MB)</span>
            <span id="exp-save">Right-click image to save, or open in a new tab.</span>
        </div>
        <span id="timers">Waiting for 2 timers</span>
        <span id="timer1">Waiting for timer</span>
        <span id="subrun">3 subagents/tasks running</span>
        <span id="subblk">1 subagent blocked</span>
    `;

    const doc = await render(t, html);
    assert.equal(doc.getElementById('tab-hive').textContent, 'Hive');
    assert.equal(doc.querySelector('.hv-zoom').getAttribute('aria-label'), 'Zoom');
    assert.equal(doc.getElementById('z-out').getAttribute('title'), 'Reduzir');
    assert.equal(doc.getElementById('z-in').getAttribute('title'), 'Aumentar zoom');
    assert.equal(doc.getElementById('z-fit').getAttribute('title'), 'Ajustar a todo o Swarm');
    assert.equal(doc.querySelector('.hv-svg').getAttribute('aria-label'), 'Onde cada trabalhador está, por tópico');
    assert.equal(doc.querySelector('.hv-sum').textContent, '12 tópicos3 trabalhando1 aguardando2 travados4 concluídos');
    assert.equal(doc.getElementById('k-done').textContent, 'Tarefas concluídas');
    assert.equal(doc.getElementById('k-sent').textContent, 'Mensagem recém-enviada');
    assert.equal(doc.getElementById('k-waiton').textContent, 'Aguardando');
    assert.equal(doc.getElementById('k-work').textContent, 'Trabalhando');
    assert.equal(doc.getElementById('k-wait').textContent, 'Aguardando');
    assert.equal(doc.getElementById('k-ok').textContent, 'Concluído');
    assert.equal(doc.getElementById('bee-work').getAttribute('title'), '@worker-1 · Codebase Researcher · Trabalhando para @coordinator');
    assert.equal(doc.getElementById('bee-wait').getAttribute('title'), '@worker-2 · Aguardando @coordinator');
    assert.equal(doc.getElementById('nm-work').textContent, 'worker-1');
    assert.equal(doc.getElementById('nm-wait').textContent, 'design');
    assert.equal(doc.getElementById('card-prog').textContent, '3 de 5 concluídos');
    assert.equal(doc.getElementById('card-bees').textContent, '2 membros');
    assert.equal(doc.getElementById('row-open').getAttribute('title'), 'Abrir @worker-1');
    assert.equal(doc.getElementById('card-empty').textContent, 'Ninguém está neste tópico ainda.');
    assert.equal(doc.getElementById('stall').textContent, 'Swarm parado — nenhum agente trabalhando');
    assert.equal(doc.getElementById('coord-ask').textContent, 'O coordenador fez uma pergunta. Responda no chat dele.');
    assert.equal(doc.getElementById('live-tip').getAttribute('title'), 'Ação mais recente: Reading config');
    assert.equal(doc.getElementById('exp-btn').textContent, 'Exportar GIF');
    assert.equal(doc.getElementById('exp-pct').textContent, 'Exportando 42%');
    assert.equal(doc.getElementById('exp-done').textContent, 'Exportado swarm-graph.gif (12 quadros · 1.2 MB)');
    assert.equal(doc.getElementById('exp-save').textContent, 'Clique com o botão direito na imagem para salvar ou abra em uma nova aba.');
    assert.equal(doc.getElementById('timers').textContent, 'Aguardando 2 temporizadores');
    assert.equal(doc.getElementById('timer1').textContent, 'Aguardando temporizador');
    assert.equal(doc.getElementById('subrun').textContent, '3 subagentes/tarefas em execução');
    assert.equal(doc.getElementById('subblk').textContent, '1 subagente bloqueado');
});

test('v2.35.1 model hover descriptions, deprecation notices, and locked-while-running tooltips localize while preserving effort labels', async t => {
    const html = [
        '<div data-testid="model-selector-panel">',
        '  <div id="hdr" data-testid="model-selector-header">Model</div>',
        '  <div id="row-neon"><span id="name-neon">Gemini 4 Neon</span> <span id="eff-med">Medium</span> <span id="badge-new">New</span></div>',
        '  <div id="row-flash"><span id="name-flash">Gemini 3.8 Flash</span> <span id="eff-high">High</span> <span id="badge-ls">Leaving Soon</span></div>',
        '  <div id="row-orch"><span id="name-orch">Orchestrator</span> <span id="sub-orch">Gemini 4 Neon High</span></div>',
        '  <div id="eff-low" data-testid="model-selector-effort-option">Low</div>',
        '  <div id="eff-xhigh" data-testid="model-selector-effort-option">Extra High</div>',
        '</div>',
        '<div id="tip-neon">For most deep reasoning and complex problems</div>',
        '<div id="tip-carbon">For your hardest, long-horizon tasks</div>',
        '<div id="tip-hydrogen">For speed and efficiency in execution tasks</div>',
        '<div id="tip-orch">Offloads routine steps to a faster executor. Same quality, fewer tokens used.</div>',
        '<div id="tip-flash">Use Hydrogen for better quality with lower quota usage. Leaving on Nov 30.</div>',
        '<div id="tip-argon">Use Carbon for better quality with lower quota usage. Leaving on Dec 15, 2026.</div>',
        '<div id="tip-leave-only">Leaving on Nov 30.</div>',
        '<div id="tip-btw-next">Applies to /btw and messages sent after this turn</div>',
        '<div id="tip-lock-model">Model cannot be changed while the agent is running</div>',
        '<div id="tip-lock-perm">Permissions cannot be changed while the agent is running</div>',
        '<div id="tip-lock-bon">Cannot start best-of-N mode while the agent is running</div>',
        '<button id="btn-lock-model" aria-label="Model: Gemini 4 Carbon Medium, Model cannot be changed while the agent is running"><span id="trig-label">Gemini 4 Carbon Medium</span></button>',
        '<button id="btn-sel-model" aria-label="Select model, current: Gemini 4 Carbon Medium"></button>',
        '<button id="btn-lock-perm" aria-label="Agent permissions preset: Auto, Permissions cannot be changed while the agent is running"></button>',
        '<span id="bon-count">3 models selected</span>',
        '<div id="tip-credits">You need at least 10 AI Credits to send messages. To continue using Claude Opus 5.5 now, purchase more AI Credits. Your plan\'s baseline quota will refresh on 2026/11/26 23:16:45.</div>',
        '<div id="tip-reset">Your quota for Gemini 4 Argon will reset on 2026/11/26 23:16:45. Switch to another available model to continue.</div>'
    ].join('');

    const doc = await render(t, html);
    assert.equal(doc.getElementById('hdr').textContent, 'Modelo');
    assert.equal(doc.getElementById('badge-new').textContent, 'Novo');
    assert.equal(doc.getElementById('badge-ls').textContent, 'Saindo em breve');
    // Thinking effort labels & model names stay in English
    assert.equal(doc.getElementById('eff-low').textContent, 'Low');
    assert.equal(doc.getElementById('eff-med').textContent, 'Medium');
    assert.equal(doc.getElementById('eff-high').textContent, 'High');
    assert.equal(doc.getElementById('eff-xhigh').textContent, 'Extra High');
    assert.equal(doc.getElementById('name-orch').textContent, 'Orchestrator');
    assert.equal(doc.getElementById('trig-label').textContent, 'Gemini 4 Carbon Medium');
    // Hover descriptions & locked-while-running tooltips
    assert.equal(doc.getElementById('tip-neon').textContent, 'Para a maioria dos raciocínios profundos e problemas complexos');
    assert.equal(doc.getElementById('tip-carbon').textContent, 'Para suas tarefas mais difíceis e de longo prazo');
    assert.equal(doc.getElementById('tip-hydrogen').textContent, 'Para velocidade e eficiência em tarefas de execução');
    assert.equal(doc.getElementById('tip-orch').textContent, 'Delega as etapas de rotina a um executor mais rápido. Mesma qualidade, menos tokens usados.');
    assert.equal(doc.getElementById('tip-flash').textContent, 'Use Hydrogen para obter mais qualidade com menor consumo de cota. Será desativado em 30 de novembro.');
    assert.equal(doc.getElementById('tip-argon').textContent, 'Use Carbon para obter mais qualidade com menor consumo de cota. Será desativado em 15 de dezembro de 2026.');
    assert.equal(doc.getElementById('tip-leave-only').textContent, 'Será desativado em 30 de novembro.');
    assert.equal(doc.getElementById('tip-btw-next').textContent, 'Vale para /btw e para as mensagens enviadas depois deste turno');
    assert.equal(doc.getElementById('tip-lock-model').textContent, 'Não é possível alterar o modelo enquanto o agente está em execução');
    assert.equal(doc.getElementById('tip-lock-perm').textContent, 'Não é possível alterar as permissões enquanto o agente está em execução');
    assert.equal(doc.getElementById('tip-lock-bon').textContent, 'Não é possível iniciar o modo best-of-N enquanto o agente está em execução');
    assert.equal(doc.getElementById('btn-lock-model').getAttribute('aria-label'), 'Modelo: Gemini 4 Carbon Medium, Não é possível alterar o modelo enquanto o agente está em execução');
    assert.equal(doc.getElementById('btn-sel-model').getAttribute('aria-label'), 'Selecionar modelo, atual: Gemini 4 Carbon Medium');
    assert.equal(doc.getElementById('btn-lock-perm').getAttribute('aria-label'), 'Predefinição de permissões do agente: Automático, Não é possível alterar as permissões enquanto o agente está em execução');
    assert.equal(doc.getElementById('bon-count').textContent, '3 modelos selecionados');
    assert.equal(doc.getElementById('tip-credits').textContent, 'Você precisa de pelo menos 10 créditos de IA para enviar mensagens. Para continuar usando Claude Opus 5.5 agora, compre mais créditos de IA. A cota básica do seu plano será renovada em 2026/11/26 23:16:45.');
    assert.equal(doc.getElementById('tip-reset').textContent, 'Sua cota para Gemini 4 Argon será redefinida em 2026/11/26 23:16:45. Mude para outro modelo disponível para continuar.');
});
