import pathlib
import subprocess
import tempfile
import unittest
import zipfile
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


class BuildTests(unittest.TestCase):
    def build(self, output, *args):
        return subprocess.run([sys.executable, str(ROOT / 'tools/build.py'), '--output', str(output), *args],
                              capture_output=True, text=True)

    def test_reproducible_archives_match_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = pathlib.Path(tmp) / 'first', pathlib.Path(tmp) / 'second'
            self.assertEqual(self.build(first).returncode, 0)
            self.assertEqual(self.build(second).returncode, 0)
            self.assertEqual(self.build(first, '--check').returncode, 0)
            for path in first.iterdir():
                self.assertEqual(path.read_bytes(), (second / path.name).read_bytes())
            xpi = first / 'argus-one-0.1.1.xpi'
            with zipfile.ZipFile(xpi) as bundle:
                self.assertEqual(len(bundle.namelist()), 8)
                for name in bundle.namelist():
                    source = ROOT / name if name == 'LICENSE' else ROOT / 'src/argus-one' / name
                    self.assertEqual(bundle.read(name), source.read_bytes())

    def test_existing_different_artifact_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp)
            self.assertEqual(self.build(output).returncode, 0)
            path = output / 'argus-one-0.1.1.xpi'
            path.write_bytes(b'preserve different prior artifact')
            result = self.build(output)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(path.read_bytes(), b'preserve different prior artifact')

    def test_source_and_historical_archive_directories_are_rejected(self):
        for output in (ROOT, ROOT / 'src/argus-one', ROOT / 'src/argus-one/dist'):
            result = self.build(output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('historical root archive', result.stderr)

    def test_symlink_artifact_is_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp)
            target = output / 'original'
            target.write_bytes(b'preserve original')
            (output / 'argus-one-0.1.1.xpi').symlink_to(target)
            self.assertNotEqual(self.build(output).returncode, 0)
            self.assertEqual(target.read_bytes(), b'preserve original')


if __name__ == '__main__':
    unittest.main()
