# salvar.ps1 — Envia seu trabalho para o GitHub
# Uso:  .\salvar.ps1  "mensagem opcional"

$msg = if ($args.Count -gt 0) { $args -join " " } else { "atualizacao $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

Write-Host "==> Sincronizando com o GitHub antes de salvar..." -ForegroundColor Cyan
git pull --no-edit
if (-not $?) { Write-Host "!! Erro ao puxar. Resolva antes de continuar." -ForegroundColor Red; exit 1 }

Write-Host "==> Adicionando alteracoes..." -ForegroundColor Cyan
git add -A

# Se nao houver nada para commitar, avisa e sai
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "Nada novo para salvar. Tudo ja esta sincronizado." -ForegroundColor Yellow
    exit 0
}

Write-Host "==> Commitando: $msg" -ForegroundColor Cyan
git commit -m "$msg"

Write-Host "==> Enviando para o GitHub..." -ForegroundColor Cyan
git push
if ($?) { Write-Host "OK! Trabalho salvo no GitHub." -ForegroundColor Green }
else    { Write-Host "!! Erro ao enviar." -ForegroundColor Red }
