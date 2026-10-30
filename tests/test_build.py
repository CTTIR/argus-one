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
                self.assertEqual(len(bundle.namelist()), 7)
                for name in bundle.namelist():
                    self.assertEqual(bundle.read(name), (ROOT / 'src/argus-one' / name).read_bytes())

    def test_existing_different_artifact_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp)
            self.assertEqual(self.build(output).returncode, 0)
            path = output / 'argus-one-0.1.1.xpi'
            path.write_bytes(b'preserve different prior artifact')
            result = self.build(output)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(path.read_bytes(), b'preserve different prior artifact')


if __name__ == '__main__':
    unittest.main()
