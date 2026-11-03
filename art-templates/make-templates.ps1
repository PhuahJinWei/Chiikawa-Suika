param([string]$OutDir)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$pink = [System.Drawing.Color]::FromArgb(255, 240, 120, 150)
$grey = [System.Drawing.Color]::FromArgb(150, 140, 120, 120)
$faint = [System.Drawing.Color]::FromArgb(70, 140, 120, 120)
$ink = [System.Drawing.Color]::FromArgb(255, 110, 76, 76)

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function Font($size, $bold = $false) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  try { return New-Object System.Drawing.Font('Yu Gothic UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel) }
  catch { return New-Object System.Drawing.Font('Segoe UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel) }
}

# One template. $circle = diameter of the ball's edge in pixels, centred in a $size x $size image.
function Write-Template($path, $size, $circle, $title, $note) {
  $c = New-Canvas $size $size; $bmp = $c[0]; $g = $c[1]
  $mid = $size / 2

  # faint guides: centre lines, eye line, mouth line
  $dash = New-Object System.Drawing.Pen($faint, 3); $dash.DashStyle = 'Dash'
  $g.DrawLine($dash, $mid, 0, $mid, $size)
  $g.DrawLine($dash, 0, $mid, $size, $mid)
  $thin = New-Object System.Drawing.Pen($faint, 2); $thin.DashStyle = 'Dot'
  $r = $circle / 2
  $g.DrawLine($thin, $mid - $r * 0.8, $mid, $mid + $r * 0.8, $mid)
  $g.DrawLine($thin, $mid - $r * 0.5, $mid + $r * 0.22, $mid + $r * 0.5, $mid + $r * 0.22)

  # image edge (only useful when the circle is smaller than the image)
  if ($circle -lt $size) {
    $edge = New-Object System.Drawing.Pen($grey, 3); $edge.DashStyle = 'DashDot'
    $g.DrawRectangle($edge, 2, 2, $size - 5, $size - 5)
  }

  # The outline the game draws on every ball (see OUTLINE_WIDTH in src/render/faces.ts):
  # width 7% of the radius, centred 0.35 of its width inside the edge. You don't draw it.
  $lw = $r * 0.07
  $bandW = $lw * 0.85
  $band = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(110, 138, 98, 98), $bandW)
  $br = $r - $bandW / 2
  $g.DrawEllipse($band, $mid - $br, $mid - $br, $br * 2, $br * 2)

  # where the outline begins: colour your character at least out to here
  $inner = New-Object System.Drawing.Pen($pink, 4); $inner.DashStyle = 'Dash'
  $ir = $r - $bandW
  $g.DrawEllipse($inner, $mid - $ir, $mid - $ir, $ir * 2, $ir * 2)

  # labels sit in the corners, outside the circle
  $brush = New-Object System.Drawing.SolidBrush($ink)
  $g.DrawString($title, (Font 34 $true), $brush, 18, 14)
  $g.DrawString($note, (Font 24), $brush, 18, $size - 46)
  $g.DrawString('guide layer - hide before export', (Font 22), $brush, $size - 360, $size - 44)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Write-Template (Join-Path $OutDir 'ball-template.png') 1024 1024 'ball template 1024x1024' 'brown ring = outline the game adds (no need to draw it)'
"templates written"
