param([string]$In, [string]$Out, [int]$X, [int]$Y, [int]$W, [int]$H, [double]$Scale = 2.0)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile($In)
if ($W -le 0) { $W = $src.Width - $X }
if ($H -le 0) { $H = $src.Height - $Y }
$rect = New-Object System.Drawing.Rectangle $X, $Y, $W, $H
$crop = $src.Clone($rect, $src.PixelFormat)
$ow = [int]($W * $Scale); $oh = [int]($H * $Scale)
$dst = New-Object System.Drawing.Bitmap $ow, $oh
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($crop, 0, 0, $ow, $oh)
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
"saved $Out ($ow x $oh) from $($src.Width)x$($src.Height)"
