# atualizar.ps1 — Puxa o trabalho mais recente do GitHub
# Uso:  .\atualizar.ps1

Write-Host "==> Buscando as ultimas alteracoes do GitHub..." -ForegroundColor Cyan
git pull --no-edit
if ($?) { Write-Host "OK! Voce esta com a versao mais recente." -ForegroundColor Green }
else    { Write-Host "!! Erro ao atualizar. Verifique as mensagens acima." -ForegroundColor Red }
