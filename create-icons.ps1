# Script tạo icon PNG từ SVG bằng .NET
# Chạy 1 lần để tạo icon cho extension

Add-Type -AssemblyName System.Drawing

$svgData = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#0d0d14"/>
  <rect width="128" height="128" rx="24" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6c63ff"/>
      <stop offset="100%" stop-color="#00e5a0"/>
    </linearGradient>
  </defs>
  <polygon points="48,32 96,64 48,96" fill="white"/>
</svg>
'@

function Create-Icon {
    param([int]$size, [string]$outPath)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Background gradient
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new($size, $size),
        [System.Drawing.Color]::FromArgb(108, 99, 255),
        [System.Drawing.Color]::FromArgb(0, 229, 160)
    )

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $corner = [int]($size * 0.18)
    $path.AddRoundedRectangle([System.Drawing.Rectangle]::new(0, 0, $size-1, $size-1), $corner)

    $g.FillPath($brush, $path)

    # Play triangle
    $white = [System.Drawing.Brushes]::White
    $margin = [int]($size * 0.28)
    $pts = @(
        [System.Drawing.PointF]::new($margin, $margin),
        [System.Drawing.PointF]::new($size - $margin + 4, $size / 2),
        [System.Drawing.PointF]::new($margin, $size - $margin)
    )
    $g.FillPolygon($white, $pts)

    $g.Dispose()
    $brush.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "Created: $outPath ($size x $size)"
}

# Thêm method RoundedRectangle vào GraphicsPath
Add-Type @'
using System.Drawing;
using System.Drawing.Drawing2D;
public static class GfxExtensions {
    public static void AddRoundedRectangle(this GraphicsPath path, Rectangle bounds, int radius) {
        int d = radius * 2;
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
    }
}
'@ -ReferencedAssemblies 'System.Drawing'

$iconDir = "$PSScriptRoot\icons"
New-Item -ItemType Directory -Force $iconDir | Out-Null

Create-Icon -size 16  -outPath "$iconDir\icon16.png"
Create-Icon -size 32  -outPath "$iconDir\icon32.png"
Create-Icon -size 48  -outPath "$iconDir\icon48.png"
Create-Icon -size 128 -outPath "$iconDir\icon128.png"

Write-Host "`n✓ Đã tạo xong 4 icon trong $iconDir"
