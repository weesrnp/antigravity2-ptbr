# Antigravity em português do Brasil

Versão pt-BR de [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn) (MIT): um motor em Node.js que injeta a tradução no `resources/app.asar` do Antigravity, com backup e restauração do original.

## Estado atual (2026-11-27)

- Etapa 1 do roteiro concluída: código do original importado sem alterações, do commit `8ee9617`, anunciado para Antigravity `v2.35.1+`. O `.clinerules` e o `.cursorrules` foram deixados de fora, porque este arquivo os substitui.
- Linha de base no Windows: `node --check` passa em todos os arquivos, `compare_dicts.js` passa e `npm test` dá 82 aprovados, 0 falhas e 3 pulados (testes só de macOS).
- Tirei do `.gitignore` herdado a linha que ignorava `AGENTS.md`. A pasta ainda não é um repositório git.
- Versão instalada na máquina de desenvolvimento: `2.36.0`, em `%LOCALAPPDATA%\Programs\Antigravity`. A compatibilidade com ela ainda não foi testada.
- Node `v26.13.0`.

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

## Onde há texto em chinês além dos dicionários

Traduzir só `dicts/` deixa a interface meio em chinês. Há texto também em:

- `src/preload_runtime.js` (cerca de 1.260 linhas com caracteres chineses, muitas são regras dinâmicas de substituição)
- `src/main_patches.js` (cerca de 710)
- `tests/*.cjs` (cerca de 880; as asserções esperam o texto chinês)
- `localization_engine.js`, `scripts/*.js` (mensagens de log e comentários)
- Nomes e conteúdo dos `.bat` e `.command`

Seletores CSS que citam `aria-label` traduzido (ex.: `[aria-label="文件查看器"]`) precisam receber exatamente o mesmo texto pt-BR definido no dicionário. Se divergirem, o isolamento falha e o motor pode traduzir conteúdo de arquivo.

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

Disponível depois de importar o código. Antes de declarar pronto:

```powershell
npm ci
npm test
node --check localization_engine.js
node scripts/compare_dicts.js
```

- Repetir `node --check` em cada arquivo de `src/` e `scripts/`.
- `compare_dicts.js` hoje compara `dicts/` com `dicts_tw/`. Precisa ser reescrito para validar: JSON válido, nenhuma chave duplicada, nenhum valor vazio e nenhum caractere chinês restante.
- Teste passando não prova que a tela está certa: a conferência visual no Antigravity é feita pelo usuário.

## Atualização do Antigravity

Com o Antigravity aberto, `node scripts/dev_tool.js scan-ui` e `dump-mcp` listam em `scratch/` o texto novo. Depois de traduzir, atualizar as bases com `--update-baseline`.

## Roteiro

1. Importar o código do original e rodar os testes sem alterações, para ter a linha de base.
2. Remover chinês tradicional e proxy.
3. Traduzir os dicionários, um módulo por vez.
4. Traduzir `preload_runtime.js` e `main_patches.js`, ajustando os testes junto.
5. Traduzir scripts, instaladores e README; o usuário instala e confere as telas.
