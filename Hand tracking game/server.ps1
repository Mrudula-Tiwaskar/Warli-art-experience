# Lightweight native PowerShell HTTP Server for local development
$port = 8000
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " Mohalla Warli Game server is active!" -ForegroundColor Cyan
    Write-Host " Open your browser to: $prefix" -ForegroundColor Yellow
    Write-Host " Press Ctrl+C in this terminal to stop." -ForegroundColor White
    Write-Host "==========================================================" -ForegroundColor Green
} catch {
    Write-Host "Could not start server on $prefix. Error: $_" -ForegroundColor Red
    exit 1
}

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml; charset=utf-8"
    ".mp4"  = "video/mp4"
    ".wasm" = "application/wasm"
}


$baseDir = $PSScriptRoot

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $urlPath = $request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = "index.html" }

    $localPath = [System.IO.Path]::Combine($baseDir, $urlPath.Replace('/', '\'))

    if ([System.IO.File]::Exists($localPath)) {
        $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
        $contentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
        $response.ContentType = $contentType
        $response.AddHeader("Access-Control-Allow-Origin", "*")

        $bytes = [System.IO.File]::ReadAllBytes($localPath)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
        $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
        $response.ContentLength64 = $notFoundMsg.Length
        $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
    }
    $response.OutputStream.Close()
}
