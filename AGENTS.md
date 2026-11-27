# Antigravity em português do Brasil

Versão pt-BR de [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn) (MIT): um motor em Node.js que injeta a tradução no `resources/app.asar` do Antigravity, com backup e restauração do original.

## Estado atual (2026-11-27)

- A base é o commit `8ee9617` do original, anunciado para Antigravity 2.35.1+. A versão em português usa seis dicionários com 5.289 entradas. Os cinco lotes de revisão resultaram em 149 correções.
- No Windows com Node.js 26.11.1, a suíte teve 82 aprovações, zero falhas e três testes específicos dos lançadores macOS pulados. Na cópia do Antigravity 2.36.0, o patch alterou 26 arquivos internos do ASAR. A restauração recuperou o SHA-256 original.

## Escopo

- Um único idioma: `pt-BR`. Remover `dicts_tw/`, a opção `--tw`, `--sc` e as checagens de chinês tradicional.
- Plataforma prioritária: Windows. Manter os caminhos de macOS e Linux do original, declarando no README que não foram testados.
- Não portar o recurso de proxy (`proxy_config/`, `injectProxyIfNeeded`, `restoreProxyIfNeeded`): ele resolve bloqueio de rede na China.
- A marca no canto superior esquerdo fica `Antigravity` (padrão `--brand-title english`).
- Preservar o `LICENSE` com o copyright de `qqxpee` e creditar o original no README, além de `yiheng8023/antigravity-chinese`, citado por ele.

## Estrutura alvo

| Caminho | Função |
| :--- | :--- |
| `localization_engine.js` | Detecta a instalação, monta o dicionário, aplica e restaura (`--huifu`) |
| `src/asar_patcher.js` | Lê e regrava o ASAR com verificação de integridade |
| `src/preload_runtime.js` | Tradução do DOM em tempo de execução, regras dinâmicas e isolamento de conteúdo |
| `src/main_patches.js` | Menus, bandeja, atualização, diálogos nativos |
| `dicts/*.json` | Seis módulos, cerca de 5.300 entradas: `"texto em inglês": "tradução"` |
| `scripts/` | `compare_dicts.js`, `dev_tool.js`, `ensure_localized.js` |
| `tests/` | Regressões com `node --test` e `jsdom` |

## Onde atualizar a tradução

Além de `dicts/`, revise as regras dinâmicas de `src/preload_runtime.js`, os diálogos nativos de `src/main_patches.js`, as mensagens do motor e os lançadores. Ajuste as asserções correspondentes em `tests/`. O primeiro elemento de cada par em `MAIN_PROCESS_TEXT_TABLES` identifica o trecho exato do aplicativo e precisa ser preservado.

Seletores CSS com um `aria-label` traduzido, como `Visualizador de arquivos`, precisam coincidir com o dicionário. Confira que tanto o seletor inglês quanto o português protegem o conteúdo exibido após alterações no DOM.

## Regras de tradução

- As chaves (inglês) não mudam. Só os valores.
- Traduzir a partir do inglês da chave; o chinês serve apenas para tirar dúvida de contexto.
- Português do Brasil com acentuação completa, em UTF-8 sem BOM.
- Botões e comandos no infinitivo (`Salvar`, `Abrir pasta`). Tratamento por "você", sem "o senhor".
- Preservar placeholders, atalhos, nomes de produto, URLs e identificadores de código.
- Português costuma ser mais longo que o inglês: em botão, aba e menu, preferir a forma curta.
- Plural e ordem das palavras nas regras dinâmicas devem ser revistos um a um (o chinês não flexiona plural).
- Não adicionar palavra solta genérica (`Type`, `Use`) nem fragmento de frase ao dicionário global: o motor traduziria em lugares errados. Resolver pelo contexto do elemento em `preload_runtime.js`.

| Inglês | pt-BR |
| :--- | :--- |
| Agent / Subagent | Agente / Subagente |
| Workspace | Espaço de trabalho |
| Settings / Preferences | Configurações / Preferências |
| File / Folder | Arquivo / Pasta |
| Skill / Plugin | Habilidade / Plugin |
| Prompt, token, commit, branch, MCP, Swarm, Sidecar | sem tradução |

Termo novo e recorrente entra nesta tabela antes de ser aplicado.

## Regras de segurança

- Agente não roda o instalador (`localization_engine.js`, `.bat`, `ensure_localized.js --fix`) sem pedido do usuário: ele fecha o Antigravity e altera o programa instalado.
- Não editar o `app.asar` instalado à mão. O backup `app.asar.bak` nunca é sobrescrito por um arquivo já traduzido.
- Nunca traduzir editor de código, terminal, mensagens do usuário ou respostas do modelo. Mudança nos seletores de isolamento exige teste.
- `git push`, publicação de release e criação de repositório só a pedido.

## Convenções de arquivo

- `.bat`: CRLF. Sem acentos no conteúdo, para não depender da página de código do `cmd`.
- `.command` e `.sh`: LF, UTF-8 sem BOM, bit executável no Git.
- Manter o padrão de fim de linha de cada arquivo herdado.
- O caminho do projeto tem acentos (`Tradução`): testar os `.bat` a partir dele.
- Temporários vão para `scratch/` (no `.gitignore`).

## Verificação

Antes de integrar uma alteração, execute as verificações na raiz do repositório.

```powershell
npm ci
npm test
node --check localization_engine.js
node scripts/compare_dicts.js
```

- Repetir `node --check` em cada arquivo de `src/` e `scripts/`.
- `compare_dicts.js` verifica sintaxe JSON, chaves duplicadas, valores vazios, caracteres CJK e preservação de placeholders, tags, URLs e trechos entre crases.
- Teste passando não prova que a tela está certa: a conferência visual no Antigravity é feita pelo usuário.

## Atualização do Antigravity

Com o Antigravity aberto, `node scripts/dev_tool.js scan-ui` e `dump-mcp` listam em `scratch/` o texto novo. Depois de traduzir, atualizar as bases com `--update-baseline`.

## Roteiro

1. Importar o código do original e rodar os testes sem alterações, para ter a linha de base.
2. Remover chinês tradicional e proxy.
3. Traduzir os dicionários, um módulo por vez.
4. Traduzir `preload_runtime.js` e `main_patches.js`, ajustando os testes junto.
5. Traduzir scripts, instaladores e README; o usuário instala e confere as telas.
