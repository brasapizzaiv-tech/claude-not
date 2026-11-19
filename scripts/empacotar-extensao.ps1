# Gera public/arquivos/motelli-whatsapp.zip a partir de extensao-whatsapp/,
# que a tela Configuracoes -> Downloads entrega (so pra quem esta logado).
# Rode depois de mexer na extensao (e suba o "version" do manifest.json):
#   powershell -ExecutionPolicy Bypass -File scripts/empacotar-extensao.ps1
$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path $env:TEMP "motelli-whatsapp"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Copy-Item (Join-Path $raiz "extensao-whatsapp") $tmp -Recurse
$dest = Join-Path $raiz "public\arquivos\motelli-whatsapp.zip"
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
Compress-Archive -Path $tmp -DestinationPath $dest -Force
Remove-Item $tmp -Recurse -Force
$kb = [math]::Round((Get-Item $dest).Length / 1KB)
Write-Output "ok: $dest ($kb KB)"
