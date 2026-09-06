# Requires: adb on PATH, debug APK built
param(
  [string]$Serial = "",
  [string]$Apk = "$PSScriptRoot\..\android\app\build\outputs\apk\debug\app-debug.apk"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Apk)) {
  Write-Host "APK not found: $Apk"
  Write-Host "Build first: cd android; .\gradlew.bat :app:assembleDebug"
  exit 1
}

$adbArgs = @()
if ($Serial) { $adbArgs += @("-s", $Serial) }

Write-Host "Installing $Apk ..."
& adb @adbArgs install -r $Apk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Launching com.privateagent/.MainActivity ..."
& adb @adbArgs shell am start -n com.privateagent/.MainActivity
Write-Host "Done. Complete docs/DEVICE_PROVISIONING.md checklist (a11y + Vivo whitelist)."
