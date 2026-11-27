<p align="center">
  <img src="assets/banner.jpg" alt="Antigravity 2 em português do Brasil" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22.22.2-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Electron-ASAR%20Patcher-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Idioma-pt--BR-009C3B?style=for-the-badge" alt="pt-BR" />
  <img src="https://img.shields.io/badge/Licen%C3%A7a-MIT-blue?style=for-the-badge" alt="Licença MIT" />
</p>

# Antigravity 2 em português do Brasil

Tradução da interface do Antigravity 2 (editor de código com agentes de IA, do Google) para português do Brasil. Um script em Node.js, sem dependências externas, aplica a tradução diretamente no `resources/app.asar` do aplicativo. Antes de alterar qualquer coisa, ele salva uma cópia do arquivo original (`app.asar.bak`) para que você possa restaurar o inglês quando quiser.

> **Projeto comunitário e não oficial.** Sem vínculo com o Google. Esta é a adaptação pt-BR do [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn), sem o recurso de proxy nem o suporte ao chinês tradicional do projeto original.

Baseado na versão 2.35.1 e testado no Windows com o Antigravity 2.36.0.

## Instalar

Requisito: [Node.js](https://nodejs.org) (versão LTS).

1. Baixe o projeto (**Code** → **Download ZIP** e extraia) ou clone com `git clone`.
2. Feche o Antigravity por completo.
3. Rode o instalador do seu sistema:

| Sistema | Instalar | Desinstalar |
| :--- | :--- | :--- |
| Windows | duplo clique em `Instalar-pt-BR.bat` | duplo clique em `Desinstalar-pt-BR.bat` |
| macOS (não testado nesta versão) | duplo clique em `Instalar-pt-BR.command` | duplo clique em `Desinstalar-pt-BR.command` |
| Linux (não testado nesta versão) | `./install_linux.sh` | `./uninstall_linux.sh` |

4. Durante a instalação, escolha se quer manter o nome `Antigravity` no canto superior esquerdo (padrão) ou ocultá-lo.
5. Abra o Antigravity novamente.

No macOS, se o sistema bloquear a execução, rode `chmod +x *.command` no Terminal ou libere em **Ajustes do Sistema → Privacidade e Segurança → Abrir mesmo assim**.

## Depois de uma atualização automática (Windows)

O Antigravity atualiza em segundo plano ao fechar e sobrescreve o `app.asar`, fazendo a interface voltar para o inglês. Para não precisar reinstalar a cada atualização, abra o programa pelo `Iniciar-Antigravity.bat` (vale criar um atalho na Área de Trabalho). Antes de iniciar, ele verifica se a tradução continua aplicada e a reaplica quando necessário. Se algo falhar, ele exibe um aviso em vez de abrir o aplicativo em inglês.

Se preferir fazer manualmente, feche o Antigravity e rode `Instalar-pt-BR.bat` outra vez.

## Dúvidas frequentes

**Falta o Node.js.** Instale a versão LTS em [nodejs.org](https://nodejs.org) e execute o instalador novamente.

**Erro de permissão.** No Windows, clique com o botão direito em `Instalar-pt-BR.bat` e escolha **Executar como administrador**. No macOS 13 ou superior, o aplicativo em `/Applications` tem proteção do sistema: em **Ajustes do Sistema → Privacidade e Segurança → Gerenciamento de Apps**, autorize o seu Terminal, feche-o por completo e rode o instalador de novo. Se o erro continuar, libere também **Acesso Total ao Disco**.

**A interface voltou para o inglês.** O Antigravity foi atualizado em segundo plano. Use o `Iniciar-Antigravity.bat` ou rode o instalador outra vez.

**Como voltar ao inglês.** Execute o desinstalador do seu sistema para restaurar o `app.asar` original.

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
