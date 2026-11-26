"""
Tests for convert-server.py (stdlib unittest only, no extra packages).

Run from the repository root:
    python3 -m unittest discover -s docker/calibre -p 'test_*.py' -v
"""

import importlib.util
import io
import os
import struct
import subprocess
import tempfile
import time
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("convert_server", os.path.join(HERE, "convert-server.py"))
cs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cs)

MB = 1024 * 1024


def pid_alive(pid: int) -> bool:
    """True if the process exists and is not a zombie."""
    try:
        with open(f"/proc/{pid}/stat") as f:
            state = f.read().rsplit(")", 1)[1].split()[0]
        return state != "Z"
    except (FileNotFoundError, ProcessLookupError):
        # The process can vanish between open() and read() of its stat file.
        return False


def wait_dead(pid: int, seconds: float = 5.0) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not pid_alive(pid):
            return True
        time.sleep(0.05)
    return not pid_alive(pid)


def hanging_command(pidfile: str) -> list:
    """A command that starts a background worker (grandchild) and then hangs,
    like ebook-convert does with its worker processes."""
    return ["sh", "-c", f"sleep 300 & echo $! > {pidfile}; sleep 300"]


def read_pid(pidfile: str) -> int:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if os.path.exists(pidfile):
            content = open(pidfile).read().strip()
            if content:
                return int(content)
        time.sleep(0.05)
    raise AssertionError("worker pid was not written")


class RunConversionTimeoutTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.pidfile = os.path.join(self.tmp, "worker.pid")

    def tearDown(self):
        if os.path.exists(self.pidfile):
            try:
                os.kill(int(open(self.pidfile).read().strip()), 9)
            except (ProcessLookupError, ValueError):
                pass
        for name in os.listdir(self.tmp):
            os.remove(os.path.join(self.tmp, name))
        os.rmdir(self.tmp)

    def test_control_plain_subprocess_run_leaves_the_worker_running(self):
        """Demonstrates the old bug: subprocess.run(timeout=...) only kills the
        direct child, the worker keeps running."""
        with self.assertRaises(subprocess.TimeoutExpired):
            subprocess.run(hanging_command(self.pidfile), capture_output=True, text=True, timeout=1)
        worker = read_pid(self.pidfile)
        self.assertTrue(pid_alive(worker), "control: worker should survive plain subprocess.run")

    def test_timeout_kills_the_whole_process_group(self):
        started = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            cs.run_conversion(hanging_command(self.pidfile), timeout=1)
        elapsed = time.monotonic() - started
        worker = read_pid(self.pidfile)

        self.assertTrue(wait_dead(worker), f"worker {worker} is still running after the timeout")
        self.assertLess(elapsed, 15)

    def test_successful_run_returns_output_and_cleans_up_leftover_workers(self):
        cmd = ["sh", "-c", f"sleep 300 & echo $! > {self.pidfile}; echo done; echo warn >&2"]
        result = cs.run_conversion(cmd, timeout=10)
        worker = read_pid(self.pidfile)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "done")
        self.assertEqual(result.stderr.strip(), "warn")
        self.assertTrue(wait_dead(worker), "a worker left behind by a finished run should be killed")

    def test_failed_run_keeps_returncode_and_stderr(self):
        result = cs.run_conversion(["sh", "-c", "echo boom >&2; exit 3"], timeout=10)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr.strip(), "boom")


def make_epub(entries: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("content.opf", '<package><manifest><item id="c1" href="ch1.xhtml"/></manifest>'
                                  '<spine><itemref idref="c1"/></spine></package>')
        z.writestr("toc.ncx", "<ncx/>")
        for name, data in entries.items():
            z.writestr(name, data)
    return buf.getvalue()


def forge_declared_size(data: bytes, name: str, size: int) -> bytes:
    """Overwrite the declared uncompressed size of `name` (central dir + local header)."""
    buf = bytearray(data)
    target = name.encode()
    patched = 0
    for sig, size_off, name_off, len_off in ((b"PK\x01\x02", 24, 46, 28), (b"PK\x03\x04", 22, 30, 26)):
        i = buf.find(sig)
        while i != -1:
            n = struct.unpack_from("<H", buf, i + len_off)[0]
            if bytes(buf[i + name_off:i + name_off + n]) == target:
                struct.pack_into("<I", buf, i + size_off, size)
                patched += 1
            i = buf.find(sig, i + 1)
    assert patched == 2, patched
    return bytes(buf)


CHAPTER = "<html><body><p class=\"x\"><span>12</span></p><p>Szöveg</p></body></html>"


class PostProcessZipLimitTest(unittest.TestCase):
    def setUp(self):
        self.saved = (cs.ZIP_MAX_ENTRIES, cs.ZIP_MAX_TOTAL_BYTES, cs.ZIP_MAX_ENTRY_BYTES)

    def tearDown(self):
        cs.ZIP_MAX_ENTRIES, cs.ZIP_MAX_TOTAL_BYTES, cs.ZIP_MAX_ENTRY_BYTES = self.saved

    def test_defaults(self):
        self.assertEqual(self.saved, (10000, 256 * MB, 64 * MB))

    def test_valid_small_epub_is_still_post_processed(self):
        original = make_epub({"ch1.xhtml": CHAPTER})
        result = cs.post_process_epub(original)

        self.assertNotEqual(result, original)
        with zipfile.ZipFile(io.BytesIO(result)) as z:
            ch1 = z.read("ch1.xhtml").decode()
        self.assertNotIn("<span>12</span>", ch1)  # page number removed by clean_html
        self.assertIn("Szöveg", ch1)

    def test_too_many_entries_returns_original(self):
        cs.ZIP_MAX_ENTRIES = 5
        original = make_epub({f"img{i}.png": b"x" for i in range(10)} | {"ch1.xhtml": CHAPTER})
        self.assertIs(cs.post_process_epub(original), original)

    def test_entry_over_the_per_file_limit_returns_original(self):
        cs.ZIP_MAX_ENTRY_BYTES = 1 * MB
        original = make_epub({"ch1.xhtml": CHAPTER, "big.xhtml": "a" * (2 * MB)})
        self.assertIs(cs.post_process_epub(original), original)

    def test_total_over_the_limit_returns_original(self):
        cs.ZIP_MAX_TOTAL_BYTES = 3 * MB
        original = make_epub({f"ch{i}.xhtml": "a" * MB for i in range(1, 5)})
        self.assertIs(cs.post_process_epub(original), original)

    def test_entry_lying_about_its_size_is_never_inflated_and_returns_original(self):
        original = forge_declared_size(make_epub({"ch1.xhtml": b"\0" * (50 * MB)}), "ch1.xhtml", 1000)
        started = time.monotonic()
        result = cs.post_process_epub(original)

        self.assertIs(result, original)
        # zipfile stops at the declared 1000 bytes (CRC error) instead of inflating 50 MB
        self.assertLess(time.monotonic() - started, 2)

    def test_each_step_rejects_oversized_input_and_returns_its_input(self):
        cs.ZIP_MAX_ENTRY_BYTES = 1 * MB
        original = make_epub({"ch1.xhtml": CHAPTER, "big.xhtml": "a" * (2 * MB)})
        for step in (cs.split_chapters_in_epub, cs.relocate_trailing_headings, cs.center_chapter_headings):
            with self.subTest(step=step.__name__):
                self.assertIs(step(original), original)

    def test_open_limited_zip_reports_the_reason(self):
        cs.ZIP_MAX_ENTRIES = 2
        with self.assertRaisesRegex(cs.ZipLimitExceeded, r"too many entries \(4 > 2\)"):
            cs.open_limited_zip(make_epub({"ch1.xhtml": CHAPTER}))


SYNTHETIC_TRACEBACK = """Traceback (most recent call last):
  File "/opt/app/bin/tool", line 10, in <module>
    main()
  File "/opt/app/lib/pkg/reflow.py", line 42, in find_parts
    return items[0]
IndexError: list index out of range
"""


class SummarizeErrorTest(unittest.TestCase):
    def test_keeps_only_the_last_line(self):
        self.assertEqual(cs.summarize_error(SYNTHETIC_TRACEBACK), "IndexError: list index out of range")

    def test_strips_paths_and_truncates(self):
        out = cs.summarize_error("OSError: cannot open /tmp/abc/input.pdf " + "x" * 300)
        self.assertNotIn("/tmp/abc", out)
        self.assertIn("<path>", out)
        self.assertLessEqual(len(out), 160)

    def test_empty_input(self):
        self.assertEqual(cs.summarize_error(""), "Unknown error")


if __name__ == "__main__":
    unittest.main()
