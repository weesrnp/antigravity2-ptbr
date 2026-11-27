@echo off
title Antigravity pt-BR - Desinstalador

echo.
echo [1/2] Restaurando os arquivos originais...
node "%~dp0localization_engine.js" --huifu %*

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] A restauracao falhou. Leia as mensagens acima.
    pause
    exit /b 1
)

echo.
echo [2/2] Restauracao concluida.
echo.
echo [Aviso] O Antigravity voltou ao ingles original.
echo.
echo A janela fecha sozinha em 5 segundos...
timeout /t 5 2>nul || exit /b 0
