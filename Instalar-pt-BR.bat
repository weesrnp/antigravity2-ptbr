@echo off
title Antigravity pt-BR - Instalador

echo.
echo Instalando a traducao para portugues do Brasil...
echo Feche o Antigravity antes de continuar.
echo.

node "%~dp0localization_engine.js" --interactive %*

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] A traducao falhou. Leia as mensagens acima e confira se o Node.js esta instalado.
    echo Download do Node.js: https://nodejs.org
    pause
    exit /b 1
)

echo.
echo Instalacao concluida. Abra o Antigravity novamente.
echo A janela fecha sozinha em 5 segundos...
timeout /t 5 2>nul || exit /b 0
