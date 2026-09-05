# Monta o pacote do agente da balança e gera o instalador (AgenteBalanca-Setup.exe).
# Requisitos: Node instalado + Inno Setup 6 instalado.
# Uso:  powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"
$root    = Split-Path -Parent $MyInvocation.MyCommand.Path      # ...\installer-balanca
$src     = Join-Path (Split-Path -Parent $root) "agente-balanca"
$app     = Join-Path $root "build\app"

Write-Host "==> Limpando staging..." -ForegroundColor Cyan
if (Test-Path (Join-Path $root "build")) { Remove-Item (Join-Path $root "build") -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app | Out-Null

Write-Host "==> Copiando arquivos do agente..." -ForegroundColor Cyan
Copy-Item (Join-Path $src "agente.mjs")   $app
Copy-Item (Join-Path $src "cupom.mjs")    $app
Copy-Item (Join-Path $src "package.json") $app
Copy-Item (Join-Path $src "start.vbs")    $app
Copy-Item (Join-Path $src "bandeja.ps1")  $app
Copy-Item (Join-Path $src "LEIA-ME.txt")  $app

Write-Host "==> Copiando o Node (node.exe)..." -ForegroundColor Cyan
$node = (Get-Command node).Source
Copy-Item $node (Join-Path $app "node.exe")

Write-Host "==> Instalando dependencias (serialport, com binario Windows)..." -ForegroundColor Cyan
Push-Location $app
& npm install --omit=dev --no-audit --no-fund | Out-Host
Pop-Location

# enxuga: binarios da serialport de outras plataformas (so win32-x64 interessa)
$preb = Join-Path $app "node_modules\@serialport\bindings-cpp\prebuilds"
if (Test-Path $preb) { Get-ChildItem $preb -Directory | Where-Object { $_.Name -ne "win32-x64" } | Remove-Item -Recurse -Force }
Get-ChildItem $app -Recurse -Include *.md,*.markdown,*.ts,*.map -File | Remove-Item -Force -ErrorAction SilentlyContinue
# bundles de navegador e arquivos de teste que o agente nao usa (so peso no instalador)
foreach ($f in @("node_modules\pdfkit\js\pdfkit.standalone.js","node_modules\pngjs\browser.js","node_modules\jpeg-exif\test")) {
  $p = Join-Path $app $f; if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

# nao empacotar config/log/pid/fila de teste
foreach ($f in @("config.json","agente.log","agente.pid","bandeja.pid","fila.json","logo.png")) {
  $p = Join-Path $app $f; if (Test-Path $p) { Remove-Item $p -Force }
}

Write-Host "==> Procurando Inno Setup (ISCC)..." -ForegroundColor Cyan
$iscc = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Host "Inno Setup nao encontrado. Instale em https://jrsoftware.org/isdl.php e rode de novo." -ForegroundColor Yellow
  exit 1
}

Write-Host "==> Compilando o instalador..." -ForegroundColor Cyan
& $iscc (Join-Path $root "balanca.iss") | Out-Host

$out = Join-Path $root "Output\AgenteBalanca-Setup.exe"
if (Test-Path $out) {
  Write-Host "`n>>> PRONTO: $out" -ForegroundColor Green
} else {
  Write-Host "Falhou ao gerar o instalador." -ForegroundColor Red
  exit 1
}
