#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Inclui os caminhos comuns do Node.js e dos gerenciadores de versão, inclusive com sudo.
REAL_USER="${SUDO_USER:-${USER:-}}"
REAL_HOME=""
if [ -n "$REAL_USER" ] && command -v getent >/dev/null 2>&1; then
    REAL_HOME="$(getent passwd "$REAL_USER" 2>/dev/null | cut -d: -f6)"
fi
if [ -z "$REAL_HOME" ] || [ ! -d "$REAL_HOME" ]; then
    if [ -n "$REAL_USER" ] && [ -d "/home/$REAL_USER" ]; then
        REAL_HOME="/home/$REAL_USER"
    else
        REAL_HOME="${HOME:-}"
    fi
fi

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
for p in \
    "$REAL_HOME/.volta/bin" \
    "$REAL_HOME/.asdf/shims" \
    "$REAL_HOME/.local/share/mise/shims" \
    "$REAL_HOME/.local/bin" \
    "$REAL_HOME/.fnm/current/bin" \
    "$REAL_HOME/.local/share/fnm/aliases/default/bin"
do
    [ -d "$p" ] && export PATH="$p:$PATH"
done
# Ordena as versões e dá preferência ao Node.js mais recente no PATH.
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
    for d in "$REAL_HOME"/.nvm/versions/node/*/bin; do
        [ -d "$d" ] && printf '%s\n' "$d"
    done | awk -F/ '{
        seg = $(NF-1);
        if (match(seg, /[0-9]+(\.[0-9]+)*/)) {
            split(substr(seg, RSTART, RLENGTH), a, ".");
            printf "%06d%06d%06d\t%d\t%s\n", a[1]+0, a[2]+0, a[3]+0, a[1]+0, $0;
        }
    }' | LC_ALL=C sort | cut -f2-
)

HAS_BRAND_ARG=false
for arg in "$@"; do
    if [[ "$arg" == --brand-title* ]]; then
        HAS_BRAND_ARG=true
    fi
done

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "======================================================"
    echo " [ERRO] Node.js não encontrado, não é possível aplicar a tradução."
    echo " Instale o Node.js (https://nodejs.org ou o gerenciador de pacotes) e tente de novo."
    echo "======================================================"
    echo ""
    exit 1
fi

EXTRA_ARGS=()
if [ "$HAS_BRAND_ARG" = false ]; then
    BRAND_MODE="english"
    if [ -t 0 ]; then
        echo "====== Instalando a tradução pt-BR do Antigravity (Linux) ======"
        echo "Nome da marca no canto superior esquerdo:"
        echo "[1] Mostrar Antigravity (recomendado)"
        echo "[2] Não mostrar"
        printf "Digite 1 ou 2 (Enter escolhe 1): "
        read -r BRAND_CHOICE
        if [ "$BRAND_CHOICE" = "2" ]; then
            BRAND_MODE="hidden"
        fi
    fi
    EXTRA_ARGS+=(--brand-title "$BRAND_MODE")
fi

node localization_engine.js "${EXTRA_ARGS[@]}" "$@"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "Falhou. Veja as mensagens de erro acima."
    exit "$EXIT_CODE"
fi

echo ""
echo "Pronto. Abra o Antigravity de novo para ver a tradução."
exit 0
