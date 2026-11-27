#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# 补充 Linux 常见 Node.js 与版本管理器路径 (兼容 sudo 与 nvm/fnm/volta/asdf/mise)
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
# 按版本号升序排序后再按版本门槛前置到 PATH（避免旧版 nvm 覆盖新版 Node）
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

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "======================================================"
    echo " [ERRO] Node.js não encontrado, não é possível restaurar o original."
    echo " Instale o Node.js (https://nodejs.org ou o gerenciador de pacotes) e tente de novo."
    echo "======================================================"
    echo ""
    exit 1
fi

echo "====== Restaurando o Antigravity original em inglês (Linux) ======"

node localization_engine.js --huifu "$@"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "Falhou. Veja as mensagens de erro acima."
    exit "$EXIT_CODE"
fi

echo ""
echo "Pronto. Abra o Antigravity de novo para voltar ao inglês original."
exit 0
