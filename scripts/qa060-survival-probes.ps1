<#
.SYNOPSIS
  QA060 survival probes for the Vivo desk companion (non-destructive).

.PARAMETER Serial
  adb serial (default: NR4DLF4HEIIVPNW4)
#>
param(
  [string]$Serial = "NR4DLF4HEIIVPNW4"
)

$ErrorActionPreference = "Continue"
function Step($title) {
  Write-Host ""
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

Step "devices"
adb devices

Step "package"
adb -s $Serial shell pm path com.privateagent

Step "version"
adb -s $Serial shell dumpsys package com.privateagent | Select-String "versionName|versionCode|minSdk|targetSdk" | Select-Object -First 10

Step "accessibility enabled services"
adb -s $Serial shell settings get secure enabled_accessibility_services

Step "docked pref"
adb -s $Serial shell "run-as com.privateagent cat shared_prefs/pa_companion.xml"

Step "companion FGS / notification"
adb -s $Serial shell "dumpsys activity services | grep -A12 CompanionForeground"
adb -s $Serial shell dumpsys notification --noredact | Select-String "com.privateagent|42001|companion_runtime" | Select-Object -First 12

Step "deviceidle whitelist (expect empty for this package)"
adb -s $Serial shell dumpsys deviceidle whitelist | Select-String "privateagent"

Step "screen off (3s) then wake"
adb -s $Serial shell input keyevent 26
Start-Sleep -Seconds 3
adb -s $Serial shell dumpsys power | Select-String "mWakefulness=|Display Power" | Select-Object -First 4
adb -s $Serial shell input keyevent 26

Step "force-stop (expect services gone; relaunch separately)"
adb -s $Serial shell am force-stop com.privateagent
Start-Sleep -Seconds 3
adb -s $Serial shell "dumpsys activity services com.privateagent"

Step "relaunch activity"
adb -s $Serial shell am start -n com.privateagent/.MainActivity
Start-Sleep -Seconds 3
adb -s $Serial shell dumpsys notification --noredact | Select-String "42001|companion_runtime" | Select-Object -First 6

Write-Host ""
Write-Host "Done. Overnight + reboot + FCM E2E are manual — see docs/QA060_FUNTOUCH_SURVIVAL.md" -ForegroundColor Yellow
