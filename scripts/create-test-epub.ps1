$baseDir = Join-Path $env:TEMP "test-epub-win"
New-Item -ItemType Directory -Force -Path $baseDir | Out-Null
New-Item -ItemType Directory -Force -Path "$baseDir\book\META-INF" | Out-Null
New-Item -ItemType Directory -Force -Path "$baseDir\book\OEBPS" | Out-Null

Set-Content -Path "$baseDir\book\mimetype" -Value 'application/epub+zip' -NoNewline

$containerXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"@
Set-Content -Path "$baseDir\book\META-INF\container.xml" -Value $containerXml -Encoding UTF8

$contentOpf = @"
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Teszt Konyv</dc:title>
    <dc:creator>Teszt Szerzo</dc:creator>
    <dc:identifier id="bookid">urn:uuid:12345-test</dc:identifier>
    <dc:language>hu</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>
"@
Set-Content -Path "$baseDir\book\OEBPS\content.opf" -Value $contentOpf -Encoding UTF8

$chapter1 = @"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="hu">
<head><title>Elso Fejezet</title></head>
<body>
  <h1>Elso Fejezet</h1>
  <p>Ez egy teszt e-konyv az ShelfHaven platformhoz.</p>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
  <p>Masodik bekezdes a teszteleshez. A konyvtar platform jol mukodik!</p>
</body>
</html>
"@
Set-Content -Path "$baseDir\book\OEBPS\chapter1.xhtml" -Value $chapter1 -Encoding UTF8

$navXhtml = @"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="hu">
<head><title>Tartalomjegyzek</title></head>
<body>
  <nav epub:type="toc">
    <h1>Tartalomjegyzek</h1>
    <ol>
      <li><a href="chapter1.xhtml">Elso Fejezet</a></li>
    </ol>
  </nav>
</body>
</html>
"@
Set-Content -Path "$baseDir\book\OEBPS\nav.xhtml" -Value $navXhtml -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$outFile = "$baseDir\Teszt_Szerzo-Teszt_Konyv.epub"
if (Test-Path $outFile) { Remove-Item $outFile }

$zip = [System.IO.Compression.ZipFile]::Open($outFile, 'Create')

# mimetype - must be first, no compression
$entry = $zip.CreateEntry('mimetype', [System.IO.Compression.CompressionLevel]::NoCompression)
$writer = New-Object System.IO.StreamWriter($entry.Open())
$writer.Write('application/epub+zip')
$writer.Close()

# META-INF/container.xml
$entry = $zip.CreateEntry('META-INF/container.xml')
$bytes = [IO.File]::ReadAllBytes("$baseDir\book\META-INF\container.xml")
$stream = $entry.Open()
$stream.Write($bytes, 0, $bytes.Length)
$stream.Close()

# OEBPS files
foreach ($file in Get-ChildItem -Path "$baseDir\book\OEBPS" -File) {
    $entry = $zip.CreateEntry("OEBPS/$($file.Name)")
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    $stream = $entry.Open()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
}

$zip.Dispose()

Write-Host "EPUB created: $outFile"
Write-Host "Size: $((Get-Item $outFile).Length) bytes"
