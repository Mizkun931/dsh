# Generates the DeepSeek Harness desktop app icon set from the blue whale
# mark: white rounded-tile background, black whale. Outputs assets/icon.png
# (512px, runtime window icon) and build/icon.ico (16..256px PNG-compressed,
# electron-builder Windows package icon).
# Usage: pwsh -File scripts/generate-icon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$appDir = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $appDir 'assets'
$buildDir = Join-Path $appDir 'build'
$sourcePng = Join-Path $assetsDir 'deepseek-icon-blue.png'
$outPng = Join-Path $assetsDir 'icon.png'
$outIco = Join-Path $buildDir 'icon.ico'
$icoSizes = 16, 32, 48, 64, 128, 256
# Corner radius as a fraction of the tile size (Windows 11 Fluent style).
$cornerRatio = 0.225

if (-not (Test-Path $sourcePng)) {
  throw "Source whale mark not found: $sourcePng"
}
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

# 1) White background + black whale, alpha-blended for smooth edges.
$src = [System.Drawing.Bitmap]::FromFile($sourcePng)
$flat = New-Object System.Drawing.Bitmap($src.Width, $src.Height)
try {
  for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
      $p = $src.GetPixel($x, $y)
      $a = [single]$p.A / 255.0
      $c = [byte](255.0 * (1.0 - $a))
      $flat.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c, $c, $c))
    }
  }
} finally {
  $src.Dispose()
}

function New-RoundedRectPath([single]$size, [single]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2.0
  $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
  $path.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
  $path.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-ScaledBitmap([System.Drawing.Bitmap]$bitmap, [int]$size, [single]$paddingRatio, [single]$cornerRatio) {
  $result = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  # Rounded white tile with transparent corners; the whale mark is drawn on top.
  $background = New-RoundedRectPath $size ($size * $cornerRatio)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $graphics.FillPath($white, $background)
  $white.Dispose()
  $background.Dispose()
  $scale = [single]$size / [single][Math]::Max($bitmap.Width, $bitmap.Height) * (1.0 - $paddingRatio)
  $w = [single]$bitmap.Width * $scale
  $h = [single]$bitmap.Height * $scale
  $left = ([single]$size - $w) / 2.0
  $top = ([single]$size - $h) / 2.0
  $graphics.DrawImage($bitmap, $left, $top, $w, $h)
  $graphics.Dispose()
  return $result
}

function Get-PngBytes([System.Drawing.Bitmap]$bitmap) {
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  # Comma keeps the byte[] a single object; without it PowerShell flattens
  # the array into individual bytes and BinaryWriter.Write truncates the ICO.
  return ,$stream.ToArray()
}

# 2) Runtime window icon (512px).
$icon512 = New-ScaledBitmap $flat 512 0.06 $cornerRatio
$icon512.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)

# 3) Multi-size ICO with PNG-compressed entries.
$entries = @()
foreach ($size in $icoSizes) {
  $scaled = New-ScaledBitmap $flat $size 0.06 $cornerRatio
  $entries += [pscustomobject]@{ Size = $size; Bytes = [byte[]](Get-PngBytes $scaled) }
  $scaled.Dispose()
}
$flat.Dispose()

$headerSize = 6
$entrySize = 16
$offset = $headerSize + $entrySize * $entries.Count
$ico = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($ico)
$writer.Write([uint16]0)  # reserved
$writer.Write([uint16]1)  # type: icon
$writer.Write([uint16]$entries.Count)
foreach ($entry in $entries) {
  $dim = if ($entry.Size -ge 256) { [byte]0 } else { [byte]$entry.Size }
  $writer.Write([byte]$dim)          # width
  $writer.Write([byte]$dim)          # height
  $writer.Write([byte]0)             # color count
  $writer.Write([byte]0)             # reserved
  $writer.Write([uint16]1)           # color planes
  $writer.Write([uint16]32)          # bits per pixel
  $writer.Write([uint32]$entry.Bytes.Length)
  $writer.Write([uint32]$offset)
  $offset += $entry.Bytes.Length
}
foreach ($entry in $entries) {
  $writer.Write($entry.Bytes)
}
$writer.Flush()
[System.IO.File]::WriteAllBytes($outIco, $ico.ToArray())
$writer.Dispose()
$ico.Dispose()

Write-Host "Generated: $outPng"
Write-Host "Generated: $outIco ($($entries.Count) sizes: $($icoSizes -join ', '))"
