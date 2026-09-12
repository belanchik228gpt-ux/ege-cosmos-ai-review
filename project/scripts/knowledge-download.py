"""Download the reviewed FIPI PDF snapshot, or verify its pinned local checksums.

python scripts/knowledge-download.py          # reproduce; fail if publisher content changed
python scripts/knowledge-download.py --check  # offline SHA-256 + PDF-header verification
python scripts/knowledge-download.py --accept-updates  # explicitly accept changed file bytes

The review date/status describe a human-reviewed source snapshot. This script does not
promote a draft to final, interpret revised requirements, or import official exam tasks.
Only codifiers, specifications and four preparation documents are retained; ZIPs stay in memory.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import time
import urllib.request
from urllib.parse import urlparse
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'resources' / 'knowledge-sources'
MANIFEST = TARGET / 'manifest.json'
REVIEW_DATE = '2026-09-08'
SUBJECTS = [
    ('math', 'ma', 'Математика'), ('russian', 'ru', 'Русский язык'),
    ('history', 'is', 'История'), ('social', 'ob', 'Обществознание'),
]
NAVIGATORS = [
    ('math', 'Математика · рекомендации для самостоятельной подготовки', 'MR_matematika_ege_2026.pdf'),
    ('russian', 'Русский язык · рекомендации для самостоятельной подготовки', 'MR_rus_yaz_ege_2026.pdf'),
    ('history', 'История России с 1682 до 1825 года · тематический навигатор', '2026/is-3-istorija-rossii-do-1801.pdf'),
    ('social', 'Обществознание · рекомендации для самостоятельной подготовки', 'MR_obcschestvo_ege_2026.pdf'),
]


def fetch(url: str, limit: int = 40 * 1024 * 1024) -> bytes:
    """Per-socket timeout plus a finite overall read deadline and byte cap."""
    deadline = time.monotonic() + 60
    request = urllib.request.Request(url, headers={'User-Agent': 'EGE-Cosmos-Knowledge/0.1'})
    with urllib.request.urlopen(request, timeout=20) as response:
        if urlparse(response.url).hostname != 'doc.fipi.ru':
            raise ValueError(f'Unexpected download destination: {response.url}')
        chunks, total = [], 0
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError(f'Overall download deadline: {url}')
            chunk = response.read(128 * 1024)
            if not chunk:
                return b''.join(chunks)
            total += len(chunk)
            if total > limit:
                raise ValueError(f'Download exceeded byte cap: {url}')
            chunks.append(chunk)


def pdf_digest(data: bytes) -> str:
    if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-4096:]:
        raise ValueError('Downloaded content is not a complete PDF with a PDF header and EOF marker')
    return hashlib.sha256(data).hexdigest()


def record(subject: str, title: str, year: int, kind: str, slug: str,
           url: str, data: bytes, member: str | None = None) -> tuple[dict, bytes]:
    source_id = f'fipi-{subject}-{year}' + ('-project' if year == 2027 else '')
    if kind == 'navigator':
        source_id = f'fipi-{subject}-navigator-2026'
    entry = {
        'id': f'{source_id}-{slug}', 'sourceId': source_id, 'subject': subject,
        'year': year, 'status': 'draft' if year == 2027 else 'final', 'kind': kind,
        'title': f'{title} · {year}' + (' · проект' if year == 2027 else ''),
        'file': f'{year}/{subject}-{slug}.pdf', 'sha256': pdf_digest(data), 'bytes': len(data),
        'originalUrl': url, 'checkedAt': REVIEW_DATE,
    }
    if member:
        entry['archiveMember'] = member
    return entry, data


def archive(job: tuple[int, tuple[str, str, str]]) -> list[tuple[dict, bytes]]:
    year, (subject, code, title) = job
    url = f'https://doc.fipi.ru/ege/demoversii-specifikacii-kodifikatory/{year}/{code}_11_{year}.zip'
    raw = fetch(url)
    if not raw.startswith(b'PK'):
        raise ValueError(f'Not a ZIP archive: {url}')
    result = []
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        for member in bundle.infolist():
            name = member.filename.lower()
            if not name.endswith('.pdf'):
                continue
            if 'кодиф' in name or 'kod' in name:
                kind, slug, label = 'codifier', 'codifier', 'Кодификатор'
            elif 'спец' in name or 'spec' in name:
                kind, slug, label = 'specification', 'specification', 'Спецификация'
                if subject == 'math':
                    if 'проф' in name:
                        slug, label = 'specification-profile', 'Спецификация · профильный уровень'
                    elif 'баз' in name:
                        slug, label = 'specification-basic', 'Спецификация · базовый уровень'
                    else:
                        raise ValueError(f'Unrecognized mathematics level: {member.filename}')
            else:
                continue
            if member.file_size > 20 * 1024 * 1024:
                raise ValueError(f'Archive PDF too large: {member.filename}')
            result.append(record(subject, f'{title} · {label}', year, kind, slug, url,
                                 bundle.read(member), member.filename))
    if len(result) != (3 if subject == 'math' else 2):
        raise ValueError(f'Unexpected codifier/specification set: {subject} {year}')
    return result


def navigator(job: tuple[str, str, str]) -> tuple[dict, bytes]:
    subject, title, path = job
    url = 'https://doc.fipi.ru/navigator-podgotovki/navigator-ege/' + path
    return record(subject, title, 2026, 'navigator', 'navigator', url, fetch(url))


def resolved_file(relative: str) -> Path:
    path = (TARGET / relative).resolve()
    if not path.is_relative_to(TARGET.resolve()) or path.suffix != '.pdf':
        raise ValueError(f'Invalid PDF path: {relative}')
    return path


def verify() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    files = set()
    for entry in manifest['documents']:
        if entry['file'] in files:
            raise ValueError(f'Duplicate PDF path: {entry["file"]}')
        files.add(entry['file'])
        data = resolved_file(entry['file']).read_bytes()
        if pdf_digest(data) != entry['sha256'] or len(data) != entry['bytes']:
            raise ValueError(f'Checksum or size mismatch: {entry["file"]}')
    print(json.dumps({'verified': len(files), 'manifest': str(MANIFEST)}, ensure_ascii=True))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--accept-updates', action='store_true')
    args = parser.parse_args()
    if args.check:
        verify()
        return
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else None
    with ThreadPoolExecutor(max_workers=4) as pool:
        batches = list(pool.map(archive, [(year, subject) for year in (2026, 2027) for subject in SUBJECTS]))
        records = [item for batch in batches for item in batch]
        records.extend(pool.map(navigator, NAVIGATORS))
    records.sort(key=lambda pair: pair[0]['id'])
    if len(records) != 22 or len({entry['file'] for entry, _ in records}) != 22:
        raise ValueError('Expected exactly 22 unique PDF records')
    if previous and not args.accept_updates:
        expected = {item['id']: item['sha256'] for item in previous['documents']}
        actual = {item['id']: item['sha256'] for item, _ in records}
        if expected != actual:
            raise ValueError('Publisher bytes changed; review sources before --accept-updates. Existing files were preserved.')
    TARGET.mkdir(parents=True, exist_ok=True)
    for entry, data in records:
        path = resolved_file(entry['file'])
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.pdf.tmp')
        temporary.write_bytes(data)
        temporary.replace(path)
    manifest = {
        'version': 1, 'checkedAt': REVIEW_DATE,
        'downloadedAt': datetime.now(timezone.utc).isoformat(),
        'description': 'Официальные кодификаторы, спецификации и материалы подготовки. 2027 — проекты на дату проверки. Карточки Cosmos являются отдельными авторскими тренировочными материалами.',
        'documents': [entry for entry, _ in records],
    }
    temporary_manifest = MANIFEST.with_suffix('.json.tmp')
    temporary_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary_manifest.replace(MANIFEST)
    verify()


if __name__ == '__main__':
    main()
