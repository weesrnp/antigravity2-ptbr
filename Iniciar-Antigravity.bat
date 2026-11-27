@echo off
rem Inicia o Antigravity. Se uma atualizacao automatica apagou a traducao, aplica de novo antes de abrir.
rem Para esconder a marca no canto superior esquerdo, adicione --brand-title hidden depois de --launch.
node "%~dp0scripts\ensure_localized.js" --fix --launch %*
if %errorlevel% neq 0 (
    echo.
    echo [!] A verificacao da traducao nao terminou bem. Leia as mensagens acima.
    pause
    exit /b %errorlevel%
)
timeout /t 3 >nul 2>&1 || exit /b 0
