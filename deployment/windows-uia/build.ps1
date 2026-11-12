$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot/../.."
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("AnswerOverlay-build-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $runtime = Join-Path $stage 'runtime'
    Invoke-WebRequest 'https://github.com/electron/electron/releases/download/v45.2.3/electron-v45.2.3-win32-x64.zip' -OutFile "$stage/electron.zip"
    Invoke-WebRequest 'https://github.com/electron/electron/releases/download/v45.2.3/SHASUMS256.txt' -OutFile "$stage/checksums.txt"
    $line = Get-Content "$stage/checksums.txt" | Where-Object { $_ -match '\s+\*?electron-v45\.2\.3-win32-x64\.zip$' }
    if (!$line) { throw 'Electron checksum missing' }
    $expected = ($line -split '\s+')[0]
    if ((Get-FileHash "$stage/electron.zip" -Algorithm SHA256).Hash -ne $expected) { throw 'Electron checksum mismatch' }
    Expand-Archive "$stage/electron.zip" $runtime
    Rename-Item "$runtime/electron.exe" 'AnswersLauncher.exe'
    $app = "$runtime/resources/app"
    New-Item -ItemType Directory -Path $app | Out-Null
    Copy-Item "$PSScriptRoot/main.cjs","$PSScriptRoot/preload.cjs","$PSScriptRoot/package.json" $app
    Copy-Item "$PSScriptRoot/../tray.cjs" $app
    dotnet publish "$PSScriptRoot/EdgeReader.csproj" -c Release -r win-x64 --self-contained true -o "$stage/reader"
    if ($LASTEXITCODE -ne 0) { throw 'Reader build failed' }
    Copy-Item "$stage/reader/EdgeReader.exe" $app
    Compress-Archive "$runtime/*" "$stage/payload.zip"
    dotnet publish "$PSScriptRoot/portable/PortableLauncher.csproj" -c Release -r win-x64 --self-contained true "-p:LauncherPayload=$stage/payload.zip" -o "$stage/portable"
    if ($LASTEXITCODE -ne 0) { throw 'Portable build failed' }
    New-Item -ItemType Directory -Force "$root/output" | Out-Null
    Copy-Item "$stage/portable/AnswersLauncher.exe" "$root/output/AnswersLauncher.exe" -Force
    Compress-Archive "$stage/portable/AnswersLauncher.exe" "$root/output/AnswerOverlay-Windows-x64.zip" -Force
} finally {
    Remove-Item $stage -Recurse -Force
}
