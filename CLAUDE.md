# CLAUDE.md

As instruções do projeto ficam em um só lugar, para Claude e outros agentes:

@AGENTS.md

## Específico do Claude

- Responder e escrever documentação em português do Brasil.
- Subagentes de busca e revisão são somente leitura.
- Tradução em lote: um módulo por vez, validando o JSON antes de passar ao próximo.
- Ao fim de cada etapa do roteiro, atualizar "Estado atual" no `AGENTS.md`.
