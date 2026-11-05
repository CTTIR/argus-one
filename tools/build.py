"""Build reproducible 0.1.1+ artifacts without overwriting historical releases."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'argus-one'
FILES = ['README.md', 'argus.js', 'bootstrap.js', 'icon.png', 'icon@2x.png',
         'locale/en-US/argus-one.ftl', 'manifest.json']


def archive(prefix=''):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name in sorted([*FILES, 'LICENSE']):
            path = ROOT / name if name == 'LICENSE' else SOURCE / name
            if path.is_symlink() or not path.is_file():
                raise ValueError(f'Missing or unsafe source file: {path}')
            info = zipfile.ZipInfo(prefix + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, path.read_bytes())
    return stream.getvalue()


def write_new(path, body):
    """Publish a complete file without replacing an existing destination."""
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.build-', delete=False) as output:
        staged = Path(output.name)
        try:
            output.write(body)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            staged.unlink(missing_ok=True)
            raise
    try:
        os.link(staged, path)
    finally:
        staged.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--check', action='store_true', help='Verify existing artifacts without writing')
    args = parser.parse_args()
    destination = args.output.resolve()
    if destination == ROOT or destination == SOURCE or SOURCE in destination.parents:
        raise ValueError('Build outside the plugin source and historical root archive directory')
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    version = manifest['version']
    if not version or any(ch not in '0123456789.' for ch in version):
        raise ValueError('Unsafe version string')
    expected = {f'argus-one-{version}.xpi': archive(), f'argus-one-{version}-source.zip': archive('argus-one/')}
    if not args.check:
        args.output.mkdir(parents=True, exist_ok=True)
    receipt = {}
    for name, body in expected.items():
        path = args.output / name
        if path.is_symlink():
            raise ValueError(f'Artifact destination must not be a symlink: {path}')
        if path.exists():
            if path.read_bytes() != body:
                raise ValueError(f'Artifact differs; preserve it and select a new --output directory: {path}')
        elif args.check:
            raise ValueError(f'Artifact missing: {path}')
        else:
            write_new(path, body)
        receipt[name] = hashlib.sha256(body).hexdigest()
        print(f'{receipt[name]}  {path}')
    if not args.check:
        receipt_path = args.output / f'argus-one-{version}-sha256.json'
        if receipt_path.is_symlink():
            raise ValueError(f'Checksum receipt must not be a symlink: {receipt_path}')
        data = json.dumps(receipt, indent=2) + '\n'
        if receipt_path.exists() and receipt_path.read_text() != data:
            raise ValueError(f'Existing checksum receipt differs: {receipt_path}')
        if not receipt_path.exists():
            write_new(receipt_path, data.encode('utf-8'))


if __name__ == '__main__':
    main()
