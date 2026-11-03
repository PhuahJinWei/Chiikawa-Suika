# Copies the ball drawings into the game at the size it needs (512x512 by default).
# The drawings here stay at full size; the game only shows a ball up to about 500 px wide, and
# smaller files load faster and use less memory (which matters in in-app browsers like LINE's).
#
#   .\art-templates\export-balls.ps1
#   .\art-templates\export-balls.ps1 -Size 640
param(
  [int]$Size = 512,
  [string]$From = $PSScriptRoot,
  [string]$To = (Join-Path $PSScriptRoot '..\public\balls')
)

Add-Type -AssemblyName System.Drawing

$files = Get-ChildItem -Path $From -Filter '*.png' | Where-Object { $_.Name -match '^\d\d(_shocked)?\.png$' }
foreach ($file in $files) {
  $src = [System.Drawing.Image]::FromFile($file.FullName)
  $dst = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  # TileFlipXY stops the edge pixels from fading into a dark border
  $attrs = New-Object System.Drawing.Imaging.ImageAttributes
  $attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $g.DrawImage($src, $rect, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
  $g.Dispose()
  $src.Dispose()
  $out = Join-Path $To $file.Name
  $dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  Write-Host ("{0}  {1} KB" -f $file.Name, [math]::Round((Get-Item $out).Length / 1KB))
}
