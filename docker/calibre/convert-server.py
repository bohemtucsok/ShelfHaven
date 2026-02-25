"""
Calibre ebook conversion HTTP server.
Accepts ebook files and converts them to EPUB using calibre's ebook-convert CLI.
"""

import io
import os
import json
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from http.server import HTTPServer, BaseHTTPRequestHandler


def sanitize_filename(name: str) -> str:
    """Remove path traversal and keep only safe characters."""
    name = os.path.basename(name)
    name = re.sub(r'[^a-zA-Z0-9._-]', '_', name)
    name = name.lstrip('.')
    return name or 'input'


# --- Cleanup patterns ---

# Standalone page number paragraphs: <p ...><span ...>NUMBER</span></p>
PAGE_NUM_P = re.compile(
    r'<p[^>]*>\s*(?:<[^>]*>\s*)*(\d{1,4})\s*(?:<[^>]*>\s*)*</p>',
    re.IGNORECASE
)

# Page number headings: <h2 id="page_NNN" ...><span ...>NUMBER</span></h2>
PAGE_NUM_H2 = re.compile(
    r'<h2[^>]*>\s*(?:<[^>]*>\s*)*(\d{1,4})\s*(?:<[^>]*>\s*)*</h2>',
    re.IGNORECASE
)

# Separator paragraphs: <p ...>×</p> or similar single special chars
SEPARATOR_P = re.compile(
    r'<p[^>]*>\s*[^\w\s<]{1}\s*</p>',
    re.IGNORECASE
)

# --- Chapter detection for file splitting ---

# Matches the start of a chapter heading paragraph containing bold "N. FEJEZET" etc.
# Requires <b> tag to distinguish actual chapter headings from ToC links (<a> tags)
# Pattern: <p ...> <span ...> <b ...> N. FEJEZET
CHAPTER_HEADING_FULL = re.compile(
    r'<p\b[^>]*>(?:\s*<(?!b\b)[^>]*>)*<b\b[^>]*>\s*\d{1,2}\.\s*(?:FEJEZET|CHAPTER|CHAPITRE|KAPITEL|CAPITOLO)\b',
    re.IGNORECASE
)

# --- Trailing heading detection (for relocation) ---

# Full chapter heading paragraph: <p...>...<b...>N. FEJEZET</b>...</p>
TRAILING_HEADING_P = re.compile(
    r'<p[^>]*>\s*(?:<(?!b\b|/)[^>]*>\s*)*<b[^>]*>\s*\d{1,2}\.\s*(?:FEJEZET|CHAPTER|CHAPITRE|KAPITEL|CAPITOLO)\s*</b>(?:\s*</[^>]*>)*\s*</p>',
    re.IGNORECASE | re.DOTALL
)

# Break paragraph (scenebreak or softbreak) before a chapter heading
BREAK_P = re.compile(
    r'<p[^>]*class="(?:scenebreak|softbreak)"[^>]*>[^<]*</p>',
    re.IGNORECASE
)

# Scene break before chapter: <p class="scenebreak">***</p>
SCENE_BREAK = re.compile(
    r'<p[^>]*class="scenebreak"[^>]*>.*?</p>\s*',
    re.IGNORECASE | re.DOTALL
)

# Max 2 concurrent conversions
SEMAPHORE = threading.Semaphore(2)
CONVERSION_TIMEOUT = 300  # 5 minutes


def log(msg: str):
    """Print with immediate flush for Docker log visibility."""
    print(f"[calibre] {msg}", flush=True)


def clean_html(text: str) -> str:
    """Remove page numbers and separators from HTML content."""
    text = PAGE_NUM_P.sub('', text)
    text = PAGE_NUM_H2.sub('', text)
    text = SEPARATOR_P.sub('', text)
    return text


def split_chapters_in_epub(epub_data: bytes) -> bytes:
    """Split HTML files at chapter boundaries so each chapter gets its own file.
    This ensures EPUB readers start each chapter on a new page."""
    try:
        input_zip = zipfile.ZipFile(io.BytesIO(epub_data), 'r')
        output_buffer = io.BytesIO()
        output_zip = zipfile.ZipFile(output_buffer, 'w', zipfile.ZIP_DEFLATED)

        # Collect all splits: {original_name: [(new_name, content_bytes), ...]}
        file_splits = {}
        total_new_files = 0

        for item in input_zip.namelist():
            if not item.endswith(('.html', '.xhtml', '.htm')):
                continue
            if 'titlepage' in item.lower():
                continue

            content = input_zip.read(item).decode('utf-8')

            # Find body start
            body_match = re.search(r'<body[^>]*>', content)
            if not body_match:
                continue
            body_start = body_match.end()

            # Find chapter heading positions (skip first ~500 chars of body
            # to avoid splitting at the first chapter which already starts the file)
            chapter_positions = []
            for m in CHAPTER_HEADING_FULL.finditer(content):
                if m.start() > body_start + 500:
                    # Look back for a scene break (***) before this heading
                    preceding = content[max(body_start, m.start() - 200):m.start()]
                    sb = list(SCENE_BREAK.finditer(preceding))
                    if sb:
                        # Split before the scene break
                        split_pos = max(body_start, m.start() - 200) + sb[-1].start()
                    else:
                        split_pos = m.start()
                    chapter_positions.append(split_pos)

            if not chapter_positions:
                continue

            # Filter out split points that would create tiny trailing fragments.
            # If the content from a split point to the end of the file (or next split)
            # is < 1500 chars, skip that split - the heading is just a stub at the
            # end of a Calibre-split file and the actual chapter content is in the next file.
            body_end = len(content)
            filtered_positions = []
            for idx, pos in enumerate(chapter_positions):
                next_pos = chapter_positions[idx + 1] if idx + 1 < len(chapter_positions) else body_end
                chunk_len = next_pos - pos
                if chunk_len < 1500:
                    log(f"  Skipping tiny trailing fragment at pos {pos} ({chunk_len} chars)")
                else:
                    filtered_positions.append(pos)
            chapter_positions = filtered_positions

            if not chapter_positions:
                continue

            # Extract document wrapper
            head_match = re.search(r'(.*?<body[^>]*>)', content, re.DOTALL)
            if not head_match:
                continue
            doc_head = head_match.group(1)
            doc_tail = '\n</body>\n</html>'

            # Split content into chunks
            all_positions = [body_start] + chapter_positions
            splits = []

            for i, start_pos in enumerate(all_positions):
                end_pos = all_positions[i + 1] if i + 1 < len(all_positions) else len(content)
                chunk = content[start_pos:end_pos]
                # Clean trailing </body></html>
                chunk = re.sub(r'\s*</body>\s*</html>\s*$', '', chunk, flags=re.IGNORECASE)

                if i == 0:
                    new_name = item
                else:
                    base, ext = os.path.splitext(item)
                    new_name = f'{base}_pt{i}{ext}'
                    total_new_files += 1

                full_html = doc_head + '\n' + chunk + doc_tail
                splits.append((new_name, full_html.encode('utf-8')))

            if len(splits) > 1:
                file_splits[item] = splits
                log(f"  Split {item} into {len(splits)} parts")

        if not file_splits:
            input_zip.close()
            output_zip.close()
            log("  No files needed splitting")
            return output_buffer.getvalue() if total_new_files > 0 else epub_data

        # Update content.opf
        opf_content = input_zip.read('content.opf').decode('utf-8')
        for original_name, splits in file_splits.items():
            # Find manifest item for original file
            manifest_pattern = re.compile(
                rf'(<item\s+id="([^"]+)"\s+href="{re.escape(original_name)}"[^>]*/>)'
            )
            manifest_match = manifest_pattern.search(opf_content)
            if not manifest_match:
                continue

            original_id = manifest_match.group(2)
            original_item_tag = manifest_match.group(1)

            # Build new manifest items and spine refs
            new_manifest = ''
            new_spine = ''
            for i, (new_name, _) in enumerate(splits):
                if i == 0:
                    continue
                new_id = os.path.splitext(os.path.basename(new_name))[0].replace('-', '_')
                new_manifest += f'\n    <item id="{new_id}" href="{new_name}" media-type="application/xhtml+xml"/>'
                new_spine += f'\n    <itemref idref="{new_id}"/>'

            # Insert new manifest items after original
            opf_content = opf_content.replace(
                original_item_tag,
                original_item_tag + new_manifest
            )

            # Insert new spine refs after original
            spine_ref = f'<itemref idref="{original_id}"/>'
            opf_content = opf_content.replace(
                spine_ref,
                spine_ref + new_spine
            )

        # Update toc.ncx - fix anchor references that moved to new files
        ncx_content = input_zip.read('toc.ncx').decode('utf-8')
        for original_name, splits in file_splits.items():
            for i, (new_name, content_bytes) in enumerate(splits):
                if i == 0:
                    continue
                content_str = content_bytes.decode('utf-8')
                # Find all id attributes in this split
                ids_in_split = re.findall(r'\bid="([^"]+)"', content_str)
                for id_val in ids_in_split:
                    old_ref = f'{original_name}#{id_val}'
                    new_ref = f'{new_name}#{id_val}'
                    ncx_content = ncx_content.replace(old_ref, new_ref)

        # Write the new EPUB
        written = set()
        for item in input_zip.namelist():
            if item in file_splits:
                # Write all split parts
                for new_name, data in file_splits[item]:
                    output_zip.writestr(new_name, data)
                    written.add(new_name)
            elif item == 'content.opf':
                output_zip.writestr(input_zip.getinfo(item), opf_content.encode('utf-8'))
            elif item == 'toc.ncx':
                output_zip.writestr(input_zip.getinfo(item), ncx_content.encode('utf-8'))
            else:
                output_zip.writestr(input_zip.getinfo(item), input_zip.read(item))

        input_zip.close()
        output_zip.close()

        log(f"  Chapter splitting: created {total_new_files} new files")
        return output_buffer.getvalue()

    except Exception as e:
        log(f"Chapter splitting failed: {e}, returning original")
        return epub_data


def relocate_trailing_headings(epub_data: bytes) -> bytes:
    """Move chapter headings from end of files to start of next file in spine order.
    Calibre often places the next chapter's heading at the end of the current file,
    causing empty pages in EPUB readers. This moves each heading to where it belongs."""
    try:
        input_zip = zipfile.ZipFile(io.BytesIO(epub_data), 'r')

        # Parse content.opf for spine order
        opf = input_zip.read('content.opf').decode('utf-8')

        # Build manifest: id -> href
        manifest = {}
        for m in re.finditer(r'<item\s+id="([^"]+)"\s+href="([^"]+)"', opf):
            manifest[m.group(1)] = m.group(2)

        # Get spine order
        spine_ids = re.findall(r'<itemref\s+idref="([^"]+)"', opf)
        spine_hrefs = [manifest[sid] for sid in spine_ids if sid in manifest]

        # Read all HTML files in spine order
        file_data = {}
        for href in spine_hrefs:
            if href in input_zip.namelist():
                file_data[href] = input_zip.read(href).decode('utf-8')

        modifications = 0
        files_to_remove = set()

        for i in range(len(spine_hrefs) - 1):
            href = spine_hrefs[i]
            if href not in file_data:
                continue

            content = file_data[href]
            body_end_idx = content.rfind('</body>')
            if body_end_idx < 0:
                continue

            # Search last 1000 chars before </body> for a trailing heading
            search_start = max(0, body_end_idx - 1000)
            search_area = content[search_start:body_end_idx]

            heading_matches = list(TRAILING_HEADING_P.finditer(search_area))
            if not heading_matches:
                continue

            last_heading = heading_matches[-1]

            # Verify only whitespace follows the heading until </body>
            after_heading = search_area[last_heading.end():]
            if after_heading.strip():
                continue

            heading_html = last_heading.group(0)
            cut_start = search_start + last_heading.start()

            # Check for a preceding break paragraph (*** or ×)
            before_heading = search_area[:last_heading.start()]
            break_matches = list(BREAK_P.finditer(before_heading))
            if break_matches:
                last_break = break_matches[-1]
                between = before_heading[last_break.end():]
                if not between.strip():
                    # Include the break in what we move
                    heading_html = last_break.group(0) + '\n' + heading_html
                    cut_start = search_start + last_break.start()

            # Remove trailing heading from current file
            after_body = content[body_end_idx:]  # </body></html>
            new_content = content[:cut_start].rstrip() + '\n' + after_body
            file_data[href] = new_content

            # Check if file body is now essentially empty
            body_match = re.search(r'<body[^>]*>(.*?)</body>', new_content, re.DOTALL)
            if body_match:
                body_text = re.sub(r'<[^>]+>', '', body_match.group(1)).strip()
                if len(body_text) < 10:
                    files_to_remove.add(href)
                    log(f"  Removing empty file: {href}")

            # Prepend heading to next file's body
            next_href = spine_hrefs[i + 1]
            if next_href in file_data:
                next_content = file_data[next_href]
                body_tag = re.search(r'<body[^>]*>', next_content)
                if body_tag:
                    insert_pos = body_tag.end()
                    file_data[next_href] = (
                        next_content[:insert_pos] + '\n' +
                        heading_html + '\n' +
                        next_content[insert_pos:]
                    )

            modifications += 1

        if modifications == 0:
            input_zip.close()
            log("  No trailing headings found")
            return epub_data

        log(f"  Relocated {modifications} chapter headings")

        # Update OPF: remove empty files
        new_opf = opf
        for href in files_to_remove:
            new_opf = re.sub(
                rf'\s*<item\s+[^>]*href="{re.escape(href)}"[^>]*/>', '', new_opf
            )
            for sid, shref in manifest.items():
                if shref == href:
                    new_opf = re.sub(
                        rf'\s*<itemref\s+idref="{re.escape(sid)}"[^>]*/>', '', new_opf
                    )
                    break

        # Update NCX: redirect references from removed files to next file
        ncx_name = None
        for name in input_zip.namelist():
            if name.endswith('.ncx'):
                ncx_name = name
                break

        ncx_content = None
        if ncx_name and files_to_remove:
            ncx_content = input_zip.read(ncx_name).decode('utf-8')
            for href in files_to_remove:
                idx = spine_hrefs.index(href) if href in spine_hrefs else -1
                if idx >= 0 and idx + 1 < len(spine_hrefs):
                    next_href = spine_hrefs[idx + 1]
                    ncx_content = re.sub(
                        rf'src="{re.escape(href)}(?:#[^"]*)?',
                        f'src="{next_href}',
                        ncx_content
                    )

        # Write new EPUB
        output_buffer = io.BytesIO()
        output_zip = zipfile.ZipFile(output_buffer, 'w', zipfile.ZIP_DEFLATED)

        for item in input_zip.namelist():
            if item in files_to_remove:
                continue
            elif item == 'content.opf':
                output_zip.writestr(input_zip.getinfo(item), new_opf.encode('utf-8'))
            elif ncx_content and ncx_name and item == ncx_name:
                output_zip.writestr(input_zip.getinfo(item), ncx_content.encode('utf-8'))
            elif item in file_data:
                output_zip.writestr(input_zip.getinfo(item), file_data[item].encode('utf-8'))
            else:
                output_zip.writestr(input_zip.getinfo(item), input_zip.read(item))

        input_zip.close()
        output_zip.close()

        if files_to_remove:
            log(f"  Removed {len(files_to_remove)} empty files from EPUB")

        return output_buffer.getvalue()

    except Exception as e:
        log(f"Heading relocation failed: {e}, returning original")
        return epub_data


def center_chapter_headings(epub_data: bytes) -> bytes:
    """Add text-align:center to chapter heading h2 elements and scenebreaks via CSS."""
    try:
        input_zip = zipfile.ZipFile(io.BytesIO(epub_data), 'r')
        output_buffer = io.BytesIO()
        output_zip = zipfile.ZipFile(output_buffer, 'w', zipfile.ZIP_DEFLATED)

        # Collect all h2 class names that appear right after a FEJEZET heading
        h2_classes = set()
        heading_re = re.compile(
            r'FEJEZET\s*</b>.*?<h2\s+class="([^"]+)"',
            re.IGNORECASE | re.DOTALL
        )
        for item in input_zip.namelist():
            if not item.endswith(('.html', '.xhtml', '.htm')):
                continue
            content = input_zip.read(item).decode('utf-8', errors='replace')
            for m in heading_re.finditer(content):
                h2_classes.add(m.group(1))

        if not h2_classes:
            input_zip.close()
            output_zip.close()
            log("  No chapter title h2 classes found")
            return epub_data

        log(f"  Centering h2 classes: {h2_classes}")

        # Build CSS rules to append
        css_additions = '\n/* Chapter heading centering */\n'
        css_additions += '.scenebreak { text-align: center; }\n'
        css_additions += '.softbreak { text-align: center; }\n'
        for cls in h2_classes:
            css_additions += f'.{cls} {{ text-align: center; }}\n'

        css_patched = False
        for item in input_zip.namelist():
            data = input_zip.read(item)

            if item.endswith('.css') and not css_patched:
                text = data.decode('utf-8')
                text += css_additions
                data = text.encode('utf-8')
                css_patched = True
                log(f"  Patched {item} with centering rules")

            output_zip.writestr(input_zip.getinfo(item), data)

        input_zip.close()
        output_zip.close()

        return output_buffer.getvalue()

    except Exception as e:
        log(f"Chapter centering failed: {e}, returning original")
        return epub_data


def post_process_epub(epub_data: bytes) -> bytes:
    """Full post-processing pipeline: clean up + split + relocate + style."""
    try:
        # Step 1: Clean page numbers and separators
        input_zip = zipfile.ZipFile(io.BytesIO(epub_data), 'r')
        output_buffer = io.BytesIO()
        output_zip = zipfile.ZipFile(output_buffer, 'w', zipfile.ZIP_DEFLATED)
        total_removed = 0

        for item in input_zip.namelist():
            data = input_zip.read(item)

            if item.endswith(('.xhtml', '.html', '.htm', '.xml')) and not item.endswith('content.opf'):
                try:
                    text = data.decode('utf-8')
                    original_len = len(text)
                    text = clean_html(text)
                    removed = original_len - len(text)
                    if removed > 0:
                        total_removed += removed
                    data = text.encode('utf-8')
                except (UnicodeDecodeError, Exception):
                    pass

            output_zip.writestr(input_zip.getinfo(item), data)

        input_zip.close()
        output_zip.close()
        log(f"  Cleanup: removed {total_removed} chars")

        cleaned_epub = output_buffer.getvalue()

        # Step 2: Split files at chapter boundaries
        log("  Splitting chapters into separate files...")
        split_epub = split_chapters_in_epub(cleaned_epub)

        # Step 3: Move trailing chapter headings to start of next file
        log("  Relocating trailing chapter headings...")
        relocated_epub = relocate_trailing_headings(split_epub)

        # Step 4: Center chapter headings and titles
        log("  Centering chapter headings...")
        final_epub = center_chapter_headings(relocated_epub)

        return final_epub

    except Exception as e:
        log(f"Post-processing failed: {e}, returning original")
        return epub_data


class ConvertHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        log(args[0])

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != "/convert":
            self.send_response(404)
            self.end_headers()
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._error(400, "Content-Type must be multipart/form-data")
            return

        boundary = content_type.split("boundary=")[-1].strip()
        content_length = int(self.headers.get("Content-Length", 0))

        if content_length == 0:
            self._error(400, "Empty request body")
            return

        if content_length > 200 * 1024 * 1024:
            self._error(413, "File too large (max 200MB)")
            return

        body = self.rfile.read(content_length)

        file_data, filename = self._parse_multipart(body, boundary)
        if file_data is None:
            self._error(400, "No file found in request")
            return

        acquired = SEMAPHORE.acquire(timeout=60)
        if not acquired:
            self._error(503, "Server busy, too many concurrent conversions")
            return

        try:
            result = self._convert(file_data, filename)
            if result["success"]:
                self.send_response(200)
                self.send_header("Content-Type", "application/epub+zip")
                self.send_header("Content-Length", str(len(result["data"])))
                self.end_headers()
                self.wfile.write(result["data"])
            else:
                self._error(500, result["error"])
        finally:
            SEMAPHORE.release()

    def _convert(self, file_data: bytes, filename: str) -> dict:
        filename = sanitize_filename(filename)
        tmpdir = tempfile.mkdtemp()
        try:
            ext = os.path.splitext(filename)[1].lower()
            if not ext:
                ext = ".pdf"

            input_path = os.path.join(tmpdir, f"input{ext}")
            output_path = os.path.join(tmpdir, "output.epub")

            with open(input_path, "wb") as f:
                f.write(file_data)

            cmd = ["ebook-convert", input_path, output_path]

            if ext == ".pdf":
                cmd.extend([
                    "--enable-heuristics",
                    "--unwrap-factor", "0.45",
                    "--smarten-punctuation",
                    "--insert-blank-line",
                    "--input-encoding", "utf-8",
                ])
            elif ext in (".mobi", ".azw3", ".fb2"):
                cmd.extend([
                    "--smarten-punctuation",
                    "--insert-blank-line",
                ])

            log(f"Converting {filename} ({len(file_data)} bytes, format: {ext})...")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=CONVERSION_TIMEOUT,
            )

            if result.returncode != 0:
                error_msg = result.stderr.strip() or result.stdout.strip() or "Unknown error"
                log(f"Conversion failed: {error_msg}")
                return {"success": False, "error": error_msg}

            if not os.path.exists(output_path):
                return {"success": False, "error": "Output file not created"}

            with open(output_path, "rb") as f:
                epub_data = f.read()

            log(f"Calibre output: {len(epub_data)} bytes")

            # Post-process non-EPUB conversions (cleanup, split, relocate, center)
            if ext in (".pdf", ".mobi", ".azw3", ".fb2"):
                log("Starting post-processing...")
                epub_data = post_process_epub(epub_data)

            log(f"Conversion successful: {len(epub_data)} bytes (final)")
            return {"success": True, "data": epub_data}

        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Conversion timed out (5 min limit)"}
        except Exception as e:
            log(f"Conversion error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def _parse_multipart(self, body: bytes, boundary: str) -> tuple:
        """Simple multipart parser to extract file data and filename."""
        boundary_bytes = f"--{boundary}".encode()
        parts = body.split(boundary_bytes)

        for part in parts:
            if b"Content-Disposition" not in part:
                continue
            if b'name="file"' not in part:
                continue

            filename = "input.pdf"
            header_end = part.find(b"\r\n\r\n")
            if header_end == -1:
                continue

            header = part[:header_end].decode("utf-8", errors="replace")
            if 'filename="' in header:
                fn_start = header.index('filename="') + 10
                fn_end = header.index('"', fn_start)
                filename = header[fn_start:fn_end]

            file_data = part[header_end + 4:]
            if file_data.endswith(b"\r\n"):
                file_data = file_data[:-2]
            if file_data.endswith(b"--\r\n"):
                file_data = file_data[:-4]

            return file_data, filename

        return None, None

    def _error(self, code: int, message: str):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    server = HTTPServer(("0.0.0.0", port), ConvertHandler)
    log(f"Conversion server running on port {port}")
    server.serve_forever()
