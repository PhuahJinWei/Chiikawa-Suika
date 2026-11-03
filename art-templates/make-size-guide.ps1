param([string]$TiersFile, [string]$OutFile, [double]$PhonePxPerUnit = 0.573)
Add-Type -AssemblyName System.Drawing

$src = [System.IO.File]::ReadAllText($TiersFile, [System.Text.Encoding]::UTF8)
$re = [regex]"name:\s*'([^']+)',\s*radius:\s*(\d+),[\s\S]*?look:\s*\{\s*color:\s*'(#[0-9a-fA-F]{6})'"
$tiers = @($re.Matches($src) | ForEach-Object { [pscustomobject]@{ Name = $_.Groups[1].Value; R = [int]$_.Groups[2].Value; Color = $_.Groups[3].Value } })
if ($tiers.Count -eq 0) { throw 'no tiers found' }

$gap = 26; $pad = 40; $scale = 1.0
$width = [int]($pad * 2 + ($tiers | Measure-Object -Property R -Sum).Sum * 2 * $scale + $gap * ($tiers.Count - 1))
$maxR = ($tiers | Measure-Object -Property R -Maximum).Maximum
$base = [int]($pad + 70 + $maxR * 2 * $scale)
$height = $base + 120

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::FromArgb(255, 255, 248, 230))
$ink = [System.Drawing.Color]::FromArgb(255, 110, 76, 76)
$inkBrush = New-Object System.Drawing.SolidBrush($ink)
$soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 160, 127, 124))
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 138, 98, 98), 4)
function F($s, $b) { $st = if ($b) { 'Bold' } else { 'Regular' }; New-Object System.Drawing.Font('Yu Gothic UI', $s, [System.Drawing.FontStyle]$st, 'Pixel') }
$center = New-Object System.Drawing.StringFormat; $center.Alignment = 'Center'

$g.DrawString("Ball sizes (true proportions)  -  number = file name,  ~px = size on a phone screen", (F 26 $true), $inkBrush, $pad, 20)
$g.DrawLine($pen, $pad / 2, $base, $width - $pad / 2, $base)

$x = $pad
$i = 1
foreach ($t in $tiers) {
  $d = $t.R * 2 * $scale
  $fill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($t.Color))
  $g.FillEllipse($fill, $x, $base - $d, $d, $d)
  $g.DrawEllipse($pen, $x + 2, $base - $d + 2, $d - 4, $d - 4)
  $cx = $x + $d / 2
  $file = '{0:D2}.png' -f $i
  $g.DrawString($file, (F 22 $true), $inkBrush, $cx, $base + 10, $center)
  $g.DrawString($t.Name, (F 20 $false), $inkBrush, $cx, $base + 40, $center)
  $px = [math]::Round($t.R * 2 * $PhonePxPerUnit)
  $g.DrawString("~${px}px", (F 18 $false), $soft, $cx, $base + 68, $center)
  $x += $d + $gap
  $i++
}

$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"size guide written: $($tiers.Count) balls"
