$ErrorActionPreference = "Stop"

$tempPath = ".gitignore.temp"
$gitignorePath = ".gitignore"

if (Test-Path $gitignorePath) {
    Write-Host "Temporarily renaming .gitignore..."
    Move-Item -Path $gitignorePath -Destination $tempPath -Force
}

try {
    Write-Host "Running worker-build..."
    & cargo install worker-build
    & worker-build --release
    if ($LASTEXITCODE -ne 0) {
        throw "worker-build failed with exit code $LASTEXITCODE"
    }
} finally {
    if (Test-Path $tempPath) {
        Write-Host "Restoring .gitignore..."
        Move-Item -Path $tempPath -Destination $gitignorePath -Force
    }
}

Write-Host "Build completed successfully"
