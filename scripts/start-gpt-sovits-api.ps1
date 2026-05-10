param(
  [string]$TtsRoot = "E:\visualstudio\tts",
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 9880,
  [string]$GptWeightPath = "GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt",
  [string]$SovitsWeightPath = "SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth",
  [switch]$Restart,
  [switch]$Hidden
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step {
  param([string]$Message)
  Write-Host "[GPT-SoVITS] $Message"
}

function Test-Api {
  param([string]$BaseUrl)
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/docs" -UseBasicParsing -TimeoutSec 10
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Invoke-Control {
  param(
    [string]$Url,
    [string]$Label
  )
  Write-Step $Label
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 120
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$Label failed: HTTP $($response.StatusCode)"
  }
  Write-Step "$Label ok"
}

function Quote-Ps {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

if (-not (Test-Path -LiteralPath $TtsRoot)) {
  throw "GPT-SoVITS directory not found: $TtsRoot"
}

$pythonPath = Join-Path $TtsRoot "runtime\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "GPT-SoVITS runtime python not found: $pythonPath"
}

$apiScript = Join-Path $TtsRoot "api_v2.py"
if (-not (Test-Path -LiteralPath $apiScript)) {
  throw "GPT-SoVITS api_v2.py not found: $apiScript"
}

$baseUrl = "http://localhost:$Port"
$logDir = Join-Path $TtsRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir "tsukuyomi-api-v2.out.log"
$stderrLog = Join-Path $logDir "tsukuyomi-api-v2.err.log"

if ($Restart) {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    Write-Step "stopping existing process on port ${Port}: $processId"
    Stop-Process -Id $processId -Force
  }
  Start-Sleep -Seconds 2
}

if (Test-Api $baseUrl) {
  Write-Step "API already running at $baseUrl"
} else {
  Write-Step "starting API at $baseUrl"
  $runtimePath = Join-Path $TtsRoot "runtime"
  $childCommand = @(
    "`$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Set-Location -LiteralPath $(Quote-Ps $TtsRoot)",
    "`$env:PATH = $(Quote-Ps $runtimePath) + ';' + `$env:PATH",
    "& $(Quote-Ps $pythonPath) -I $(Quote-Ps $apiScript) -a $(Quote-Ps $HostAddress) -p $Port"
  ) -join "; "
  $startOptions = @{
    FilePath = "powershell.exe"
    ArgumentList = @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $childCommand)
    PassThru = $true
  }
  if ($Hidden) {
    $startOptions.WindowStyle = "Hidden"
  }
  $process = Start-Process @startOptions
  Write-Step "process id: $($process.Id)"

  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    if (Test-Api $baseUrl) {
      Write-Step "API is ready"
      break
    }
    Start-Sleep -Seconds 2
  }

  if (-not (Test-Api $baseUrl)) {
    throw "GPT-SoVITS API did not become ready. Check whether python process $($process.Id) is still running."
  }
}

$gptUrl = "$baseUrl/set_gpt_weights?weights_path=$([uri]::EscapeDataString($GptWeightPath))"
$sovitsUrl = "$baseUrl/set_sovits_weights?weights_path=$([uri]::EscapeDataString($SovitsWeightPath))"
Invoke-Control -Url $gptUrl -Label "load GPT weight"
Invoke-Control -Url $sovitsUrl -Label "load SoVITS weight"

Write-Step "ready: $baseUrl"
Write-Step "started from: $apiScript"
