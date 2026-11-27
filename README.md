# Antigravity 2 em português do Brasil

Tradução da interface do Antigravity 2 (editor de código com agentes de IA, do Google) para português do Brasil. Um script em Node.js, sem dependências, grava a tradução dentro do `resources/app.asar` do aplicativo. Antes disso ele guarda uma cópia do original (`app.asar.bak`), e você pode voltar ao inglês quando quiser.

> **Projeto da comunidade, não oficial.** Não tem ligação com o Google. Esta é a versão pt-BR de [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn). O recurso de proxy e o chinês tradicional do original foram removidos.

A base do tradutor é o Antigravity 2.35.1. No Windows, a aplicação da tradução e a restauração do pacote original foram verificadas em uma cópia do Antigravity 2.36.0.

## Instalar

Requisito: [Node.js](https://nodejs.org) (versão LTS).

1. Baixe o projeto (botão **Code**, **Download ZIP**, e extraia) ou use `git clone`.
2. Feche o Antigravity por completo.
3. Execute o instalador do seu sistema:

| Sistema | Instalar | Desinstalar |
| :--- | :--- | :--- |
| Windows | duplo clique em `Instalar-pt-BR.bat` | duplo clique em `Desinstalar-pt-BR.bat` |
| macOS (não testado nesta versão) | duplo clique em `Instalar-pt-BR.command` | duplo clique em `Desinstalar-pt-BR.command` |
| Linux (não testado nesta versão) | `./install_linux.sh` | `./uninstall_linux.sh` |

4. O instalador pergunta como mostrar a marca no canto superior esquerdo: mostrar `Antigravity` (padrão) ou não mostrar.
5. Abra o Antigravity de novo.

No macOS, se o sistema bloquear o arquivo, rode `chmod +x *.command` no Terminal ou use **Ajustes do Sistema, Privacidade e Segurança, Abrir mesmo assim**.

## Depois de uma atualização automática (Windows)

O Antigravity atualiza sozinho em segundo plano ao fechar e a atualização sobrescreve o `app.asar`, então a interface volta para o inglês. Para não precisar reinstalar a cada vez, abra o programa por `Iniciar-Antigravity.bat` (crie um atalho na Área de Trabalho). Antes de abrir, ele confere se a tradução ainda está lá e a reaplica se preciso. Se a reaplicação falhar, ele avisa em vez de abrir o app em inglês.

Se preferir, feche o Antigravity e rode `Instalar-pt-BR.bat` de novo.

## Dúvidas frequentes

**Erro dizendo que falta o Node.js.** Instale o Node.js (LTS) em [nodejs.org](https://nodejs.org) e rode o instalador de novo.

**Erro de permissão.** No Windows, clique com o botão direito em `Instalar-pt-BR.bat` e escolha **Executar como administrador**. No macOS 13 ou mais novo, o aplicativo em `/Applications` é protegido pelo sistema: em **Ajustes do Sistema, Privacidade e Segurança, Gerenciamento de Apps**, libere o Terminal (ou o terminal que você usa), feche-o por completo e rode o instalador outra vez. Se ainda falhar, libere também **Acesso Total ao Disco**.

**A interface voltou para o inglês.** Foi uma atualização do Antigravity. Veja a seção acima.

**Como voltar ao inglês.** Rode o desinstalador do seu sistema. Ele restaura o `app.asar` original.

## Corrigir ou sugerir uma tradução

Os textos ficam em `dicts/*.json`, no formato `"texto em inglês": "tradução"`. A chave em inglês não muda; edite só o valor.

| Arquivo | Conteúdo |
| :--- | :--- |
| `common.json` | termos comuns, barra lateral, login, botões |
| `menu_nav.json` | menus do sistema |
| `page_main.json` | conversa, editor, espaço de trabalho |
| `page_agents.json` | agentes, subagentes, Swarm |
| `page_settings.json` | painel de configurações e permissões |
| `page_mcp_knowledge.json` | servidores MCP e base de conhecimento |

Depois de editar:

1. Rode `node scripts/compare_dicts.js` para validar os dicionários.
2. Feche o Antigravity e rode o instalador de novo.

Para sugerir uma correção, abra uma issue ou um pull request com o texto em inglês, a tradução atual e a sugerida. As regras de tradução e o glossário ficam no [AGENTS.md](AGENTS.md#regras-de-tradução).

## Desenvolvimento

Precisa do Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`.

```sh
npm ci
npm test
node scripts/compare_dicts.js
```

Para achar textos novos depois de uma atualização do Antigravity (com o aplicativo aberto):

```sh
node scripts/dev_tool.js scan-ui    # textos da interface ainda sem tradução
node scripts/dev_tool.js dump-mcp   # catálogo de servidores MCP
```

Estrutura:

- `localization_engine.js`: detecta a instalação, monta o dicionário, aplica e restaura.
- `src/preload_runtime.js`: tradução do DOM em tempo de execução, com isolamento do conteúdo de código, terminal e conversa.
- `src/main_patches.js`: menus, bandeja, atualização e diálogos nativos.
- `src/asar_patcher.js`: leitura e gravação do ASAR com verificação de integridade.
- `dicts/`: dicionários.
- `scripts/`: `compare_dicts.js`, `dev_tool.js`, `ensure_localized.js`.
- `tests/`: testes com `node --test` e `jsdom`.

## Créditos

- [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn): projeto original, em chinês, do qual este é derivado (MIT).
- [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese): dicionários que o projeto original cita como base de parte dos termos (MIT).

## Licença

[MIT](LICENSE). Copyright 2026 qqxpee.
