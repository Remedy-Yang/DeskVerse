param(
  [Parameter(Mandatory=$true)]
  [string]$BackendPath
)
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'backend'
$dest = (Resolve-Path -LiteralPath $BackendPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $dest 'app.py'))) {
    throw "目标不是 DeskVerse 后端文件夹（未找到 app.py）：$dest"
}
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = Join-Path $dest ('_webstudio_backup_' + $stamp)
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item -LiteralPath (Join-Path $dest 'app.py') -Destination (Join-Path $backup 'app.py') -Force
$webDest = Join-Path $dest 'web'
New-Item -ItemType Directory -Force -Path $webDest | Out-Null
foreach ($f in @('index.html', 'style.css', 'app.js')) {
  $existing = Join-Path $webDest $f
  if (Test-Path -LiteralPath $existing) {
    Copy-Item -LiteralPath $existing -Destination (Join-Path $backup $f) -Force
  }
}
Copy-Item -LiteralPath (Join-Path $src 'app.py') -Destination (Join-Path $dest 'app.py') -Force
foreach ($f in @('index.html','style.css','app.js')) {
  Copy-Item -LiteralPath (Join-Path (Join-Path $src 'web') $f) -Destination (Join-Path $webDest $f) -Force
}
Write-Host ''
Write-Host 'DeskVerse 网页工作台已更新。' -ForegroundColor Green
Write-Host "目标后端：$dest"
Write-Host "旧文件备份：$backup"
Write-Host '未更改 data/、assets/、images/、.venv/、Unity 工程或 Rodin 密钥。'
Write-Host '请重启原来的 FastAPI 进程，并用 Ctrl+F5 刷新网页。'
