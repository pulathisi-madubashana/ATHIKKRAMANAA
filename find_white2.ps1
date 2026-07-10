Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile(".\public\ticket_template.png")
$bmp = new-object System.Drawing.Bitmap($img)
$x = 1000; $startWhite = -1; $endWhite = -1;
for ($y = 0; $y -lt $bmp.Height; $y++) {
  $c = $bmp.GetPixel($x, $y)
  if ($c.R -gt 250 -and $c.G -gt 250 -and $c.B -gt 250) {
    if ($startWhite -eq -1) { $startWhite = $y }
    $endWhite = $y
  }
}
Write-Output "Center column white bounds: Start=$startWhite End=$endWhite"
$img.Dispose(); $bmp.Dispose()
