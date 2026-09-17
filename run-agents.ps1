$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $Root "agents")

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) {
            return
        }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) {
            return
        }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

Import-DotEnv (Join-Path $Root ".env")

if (-not $env:OBSERVABILITY_URL) {
    $env:OBSERVABILITY_URL = "http://127.0.0.1:43147"
}
if (-not $env:AGENTS_PORT) {
    $env:AGENTS_PORT = "43148"
}

$VenvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"
$Uvicorn = Join-Path (Get-Location) ".venv\Scripts\uvicorn.exe"

if (-not (Test-Path -LiteralPath $Uvicorn)) {
    Write-Host "Creating Python virtualenv for LangGraph agents..."
    if (Test-Path -LiteralPath ".venv") {
        Remove-Item -Recurse -Force ".venv"
    }
    python -m venv .venv
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $VenvPython)) {
        throw "python -m venv failed. Install Python 3.11+ and ensure python is on PATH."
    }
}

& $VenvPython -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "LangGraph agents -> http://127.0.0.1:$($env:AGENTS_PORT)"
Write-Host "Registering with observability at $($env:OBSERVABILITY_URL)"
Write-Host "Start the dashboard first with .\run-observability.ps1 if you have not already."
& $Uvicorn app.server:app --host 0.0.0.0 --port $env:AGENTS_PORT
exit $LASTEXITCODE
