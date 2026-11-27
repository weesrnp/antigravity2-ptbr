#!/bin/bash
# Ao rodar como root, troca o PATH por diretórios do sistema antes de qualquer comando: o PATH recebido
# pode ter pastas graváveis pelo usuário na frente e executar programas de mesmo nome como root.
# O PATH recebido só serve para localizar o node.
if [ "$EUID" -eq 0 ]; then INCOMING_PATH="$PATH"; export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"

# Adiciona caminhos comuns do macOS (Intel e Apple Silicon, nvm/fnm/volta/asdf/mise).
# O node é procurado só na fase de usuário; na fase root usa-se apenas a pasta do node já encontrado.
if [ "$EUID" -ne 0 ]; then
    REAL_USER="${SUDO_USER:-$USER}"
    REAL_HOME=""
    if [ -n "$REAL_USER" ] && command -v dscl >/dev/null 2>&1; then
        REAL_HOME=$(dscl . -read "/Users/$REAL_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')
    fi
    if [ -z "$REAL_HOME" ] || [ ! -d "$REAL_HOME" ]; then
        if [ -n "$REAL_USER" ] && [ -d "/Users/$REAL_USER" ]; then
            REAL_HOME="/Users/$REAL_USER"
        else
            REAL_HOME="$HOME"
        fi
    fi
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/opt/local/bin:$PATH"
    for p in "$REAL_HOME/.volta/bin" "$REAL_HOME/.asdf/shims" "$REAL_HOME/.local/share/mise/shims" "$REAL_HOME/.local/bin" "$REAL_HOME/.fnm/current/bin" "$REAL_HOME/.local/share/fnm/aliases/default/bin" "$REAL_HOME/Library/Application Support/fnm/aliases/default/bin"; do
        [ -d "$p" ] && export PATH="$p:$PATH"
    done
    # Ordena por versão e só põe no PATH as de versão igual ou maior (compatível com o sort BSD do macOS,
    # evita que um nvm antigo tome o lugar de um mais novo).
    CURR_NODE_MAJOR=0
    if command -v node >/dev/null 2>&1; then
        CURR_NODE_MAJOR=$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')
        CURR_NODE_MAJOR=${CURR_NODE_MAJOR:-0}
    fi
    while IFS=$'\t' read -r cand_major p; do
        if [ -d "$p" ] && [ "${cand_major:-0}" -ge "$CURR_NODE_MAJOR" ]; then
            export PATH="$p:$PATH"
            CURR_NODE_MAJOR=$cand_major
        fi
    done < <(
        for d in "$REAL_HOME"/.nvm/versions/node/*/bin /opt/homebrew/opt/node@*/bin /usr/local/opt/node@*/bin; do
            [ -d "$d" ] && printf '%s\n' "$d"
        done | awk -F/ '{
            seg = $(NF-1);
            if (match(seg, /[0-9]+(\.[0-9]+)*/)) {
                split(substr(seg, RSTART, RLENGTH), a, ".");
                printf "%06d%06d%06d\t%d\t%s\n", a[1]+0, a[2]+0, a[3]+0, a[1]+0, $0;
            }
        }' | LC_ALL=C sort | cut -f2-
    )
fi

# Verifica permissão de administrador; se não for root, eleva com sudo mantendo o ambiente.
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " Aviso: alterar aplicativos em /Applications no macOS exige permissão de administrador."
    echo " Digite abaixo a senha do seu Mac (ela não aparece enquanto você digita) e tecle Enter:"
    echo "======================================================"
    # Após a elevação, o PATH tem só os diretórios do sistema e a pasta do node (sistema primeiro).
    # O PATH completo do usuário não vai para o root, para não rodar como root um programa
    # de mesmo nome que esteja numa pasta gravável.
    USER_NODE="$(command -v node || true)"
    ROOT_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
    if [ -n "$USER_NODE" ]; then ROOT_PATH="$ROOT_PATH:$(dirname "$USER_NODE")"; fi
    exec /usr/bin/sudo /usr/bin/env "PATH=$ROOT_PATH" "SUDO_USER=$USER" /bin/bash "$SCRIPT_PATH" "$@"
fi
# Na fase root o PATH é sempre refeito: diretórios do sistema primeiro, mais a pasta do node.
# Pela elevação acima o PATH já chega assim; ao rodar direto como root, a ordem recebida não é
# confiável e só serve para localizar o node.
ROOT_NODE="$(export PATH="${INCOMING_PATH:-$PATH}"; command -v node || true)"
if [ -z "$ROOT_NODE" ]; then
    for cand in /usr/local/bin/node /opt/homebrew/bin/node; do
        if [ -x "$cand" ]; then ROOT_NODE="$cand"; break; fi
    done
fi
export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE:+:$(dirname "$ROOT_NODE")}"

# Verifica o Node.js
if ! command -v node &> /dev/null; then
    echo ""
    echo "======================================================"
    echo " [ERRO] Node.js não encontrado; não é possível instalar a tradução."
    echo " Baixe o Node.js (versão LTS) em https://nodejs.org e tente de novo."
    echo "======================================================"
    echo ""
    echo "Tecle qualquer tecla para sair..."
    read -n 1 -s
    exit 1
fi

# Verifica se --brand-title já veio pela linha de comando
HAS_BRAND_ARG=false
HAS_CUSTOM_INSTALL_DIR=false
for arg in "$@"; do
    if [[ "$arg" == --brand-title* ]]; then
        HAS_BRAND_ARG=true
    elif [[ "$arg" == --install-dir* ]]; then
        HAS_CUSTOM_INSTALL_DIR=true
    fi
done

EXTRA_ARGS=()
if [ "$HAS_BRAND_ARG" = false ]; then
    BRAND_MODE="english"
    if [ -t 0 ]; then
        echo "====== Instalando a tradução pt-BR do Antigravity no macOS ======"
        echo "Escolha como mostrar a marca no canto superior esquerdo:"
        echo "[1] Mostrar Antigravity (recomendado)"
        echo "[2] Não mostrar a marca"
        printf "Digite 1 ou 2 (Enter assume 1): "
        read -r BRAND_CHOICE
        if [ "$BRAND_CHOICE" = "2" ]; then
            BRAND_MODE="hidden"
        fi
    fi
    EXTRA_ARGS+=(--brand-title "$BRAND_MODE")
fi

if [ "$HAS_CUSTOM_INSTALL_DIR" = false ] && [ -d "/Applications/Antigravity.app" ]; then
    EXTRA_ARGS+=(--install-dir "/Applications/Antigravity.app")
fi

node localization_engine.js "${EXTRA_ARGS[@]}" "$@"

if [ $? -ne 0 ]; then
    echo ""
    echo "Falhou! Leia as mensagens de erro acima."
    read -n 1 -s
    exit 1
fi

echo ""
echo "Concluído. A janela fecha sozinha em 5 segundos (ou tecle qualquer tecla)..."
read -t 5 -n 1 -s || true
exit 0
