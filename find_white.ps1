Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile(".\public\ticket_template.png")
$bmp = new-object System.Drawing.Bitmap($img)
$minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0;
for ($y = 0; $y -lt $bmp.Height; $y++) {
  for ($x = 0; $x -lt $bmp.Width; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.R -gt 250 -and $c.G -gt 250 -and $c.B -gt 250) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output "Bounds: minX=$minX maxX=$maxX minY=$minY maxY=$maxY"
Write-Output "Width=($maxX - $minX) Height=($maxY - $minY)"
$img.Dispose()
$bmp.Dispose()
