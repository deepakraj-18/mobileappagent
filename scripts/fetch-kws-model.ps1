# Fetch / refresh bundled sherpa-onnx KWS assets (BD003).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $root "tools\kws-tmp"
$assets = Join-Path $root "android\app\src\main\assets\kws"
New-Item -ItemType Directory -Force -Path $tmp, $assets | Out-Null

$url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2"
$archive = Join-Path $tmp "kws.tar.bz2"
if (-not (Test-Path $archive)) {
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
}

Push-Location $tmp
try {
  if (-not (Test-Path "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01")) {
    tar -xjf kws.tar.bz2
  }
} finally {
  Pop-Location
}

$src = Join-Path $tmp "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
Copy-Item "$src\encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx" $assets -Force
Copy-Item "$src\decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx" $assets -Force
Copy-Item "$src\joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx" $assets -Force
Copy-Item "$src\tokens.txt" $assets -Force

$kwPath = Join-Path $assets "keywords.txt"
if (-not (Test-Path $kwPath)) {
  $kw = "▁HE Y ▁GE N IE`n▁HE Y ▁S I RI`n▁HE LL O ▁WORLD`n"
  [System.IO.File]::WriteAllText($kwPath, $kw, [System.Text.UTF8Encoding]::new($false))
}

Write-Host "KWS assets ready in $assets"
Get-ChildItem $assets | Format-Table Name, Length
