Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile(".\public\ticket_template.png")
$bmp = new-object System.Drawing.Bitmap($img)
$y = 1500; $startX = -1; $endX = -1;
for ($x = 0; $x -lt $bmp.Width; $x++) {
  $c = $bmp.GetPixel($x, $y)
  if ($c.R -gt 250 -and $c.G -gt 250 -and $c.B -gt 250) {
    if ($startX -eq -1) { $startX = $x }
    $endX = $x
  }
}
Write-Output "Row  white bounds: Start=$startX End=$endX"
$img.Dispose(); $bmp.Dispose()
