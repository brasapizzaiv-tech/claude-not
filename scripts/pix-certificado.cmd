@echo off
chcp 65001 >nul
setlocal
title Pix Sicoob - preparar certificado
echo.
echo  Este programa transforma o certificado (.pfx) nos dois textos que a Vercel precisa
echo  (PIX_SICOOB_CERT_B64 e PIX_SICOOB_KEY_B64). A senha fica so no seu computador.
echo.
set "OPENSSL=C:Program FilesGitmingw64binopenssl.exe"
if not exist "%OPENSSL%" set "OPENSSL=C:Program FilesGitSrbinopenssl.exe"
if not exist "%OPENSSL%" (
  echo  ERRO: nao achei o openssl do Git. Instale o Git for Windows e rode de novo.
  pause & exit /b 1
)
for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='Escolha o certificado (.pfx)'; $d.Filter='Certificado (*.pfx;*.p12)|*.pfx;*.p12'; if($d.ShowDialog() -eq 'OK'){$d.FileName}"`) do set "PFX=%%F"
if "%PFX%"=="" ( echo  Nenhum arquivo escolhido. & pause & exit /b 1 )
set "PASTA=%~dp0"
set "SAIDA=%USERPROFILE%\Desktop\pix-sicoob"
if not exist "%SAIDA%" mkdir "%SAIDA%"
echo.
echo  Arquivo: %PFX%
echo  Digite a senha do certificado quando pedir (ela nao aparece na tela).
echo.
"%OPENSSL%" pkcs12 -legacy -in "%PFX%" -clcerts -nokeys -out "%SAIDA%\cert.pem" || goto erro
"%OPENSSL%" pkcs12 -legacy -in "%PFX%" -nocerts -nodes -out "%SAIDA%\key.pem" || goto erro
"%OPENSSL%" base64 -A -in "%SAIDA%\cert.pem" -out "%SAIDA%\PIX_SICOOB_CERT_B64.txt" || goto erro
"%OPENSSL%" base64 -A -in "%SAIDA%\key.pem" -out "%SAIDA%\PIX_SICOOB_KEY_B64.txt" || goto erro
del "%SAIDA%\cert.pem" "%SAIDA%\key.pem"
echo.
echo  PRONTO. Na pasta pix-sicoob da Area de Trabalho tem dois arquivos:
echo    PIX_SICOOB_CERT_B64.txt  e  PIX_SICOOB_KEY_B64.txt
echo  Abra cada um, Ctrl+A, Ctrl+C e cole na variavel de mesmo nome na Vercel.
echo  Depois APAGUE a pasta pix-sicoob (o KEY e a chave privada do certificado).
echo.
start notepad "%SAIDA%\PIX_SICOOB_CERT_B64.txt"
start notepad "%SAIDA%\PIX_SICOOB_KEY_B64.txt"
pause
exit /b 0
:erro
echo.
echo  Deu erro (senha errada ou arquivo invalido). Rode de novo.
pause
exit /b 1
