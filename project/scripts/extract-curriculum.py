"""Extract the local official FIPI codifiers, retaining PDF page provenance.

Read-only with respect to the downloaded source PDFs. Run with the bundled
Python runtime (pypdf and pdfplumber). Derived inspection files go to tmp/pdfs.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys
from statistics import median

from pypdf import PdfReader
import pdfplumber

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'resources' / 'knowledge-sources'
INSPECT = ROOT / 'tmp' / 'pdfs' / 'curriculum'
CONTENT_PAGES = {'math': [11, 12], 'russian': [5, 6, 7], 'history': [11, 14, 15, 16], 'social': [11, 12, 13, 14, 15, 16]}


def inspect_sources():
    manifest = json.loads((SOURCES / 'manifest.json').read_text(encoding='utf-8-sig'))
    INSPECT.mkdir(parents=True, exist_ok=True)
    reports = []
    for source in manifest['documents']:
        if source['kind'] != 'codifier':
            continue
        path = SOURCES / source['file']
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != source['sha256']:
            raise ValueError(f"Source checksum differs: {source['id']}")
        reader = PdfReader(path)
        pages = [page.extract_text() or '' for page in reader.pages]
        draft_stamp = 'ПРОЕКТ' in pages[0].upper()
        if source['year'] == 2027 and not draft_stamp:
            raise ValueError(f'Expected draft title page: {source["id"]}')
        target = INSPECT / f"{source['subject']}-{source['year']}.txt"
        target.write_text('\n\n'.join(f'=== PDF PAGE {i+1} ===\n{text}' for i, text in enumerate(pages)), encoding='utf-8')
        reports.append({'id': source['id'], 'year': source['year'], 'publicationStatus': source['status'], 'firstPageHasDraftStamp': draft_stamp, 'pages': len(pages), 'sha256': digest, 'text': str(target.relative_to(ROOT))})
    (INSPECT / 'sources.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(reports, ensure_ascii=False, indent=2))


def inspect_tables():
    for subject, pages in CONTENT_PAGES.items():
        output = []
        with pdfplumber.open(SOURCES / '2026' / f'{subject}-codifier.pdf') as pdf:
            for page_number in pages:
                page = pdf.pages[page_number - 1]
                for table in page.find_tables():
                    rows = table.extract(x_tolerance=2, y_tolerance=3)
                    details = []
                    for cells in table.rows:
                        cell = cells.cells[1] if len(cells.cells) > 1 else None
                        if not cell:
                            details.append(None)
                            continue
                        crop = page.crop(cell)
                        sizes = [char['size'] for char in crop.chars if char['text'].strip()]
                        typical = median(sizes) if sizes else 0
                        visible = [char for char in crop.chars if char['text'].strip() and char['size'] >= typical * 0.75]
                        def keep_character(char):
                            if char.get('object_type') != 'char':
                                return True
                            if char['size'] < typical * 0.75:
                                return False
                            if char.get('height', char['size']) < char['size'] * 0.70:
                                return False
                            # Some FIPI PDF text layers place a stray blank over a word.
                            # Remove only geometrically overlapping blanks, not real spaces.
                            if not char['text'].strip():
                                middle_x = (char['x0'] + char['x1']) / 2
                                middle_y = (char['top'] + char['bottom']) / 2
                                return not any(c['x0'] < middle_x < c['x1'] and c['top'] < middle_y < c['bottom'] for c in visible)
                            return True
                        filtered = crop.filter(keep_character)
                        words = filtered.extract_words(extra_attrs=['fontname'], x_tolerance=2, y_tolerance=3)
                        groups, active, previous_y = [], [], None
                        for word in words:
                            if 'Italic' in word['fontname']:
                                if active and previous_y is not None and abs(word['top'] - previous_y) > 3:
                                    active.append('\n')
                                active.append(word['text'])
                                previous_y = word['top']
                            elif active:
                                groups.append(' '.join(active).replace(' \n ', '\n'))
                                active, previous_y = [], None
                        if active:
                            groups.append(' '.join(active).replace(' \n ', '\n'))
                        letters = [char for char in filtered.chars if char['text'].strip()]
                        details.append({'text': filtered.extract_text(x_tolerance=2, y_tolerance=3) or '', 'italicFragments': groups, 'entirelyItalic': bool(letters) and all('Italic' in char['fontname'] for char in letters)})
                    output.append({'page': page_number, 'bbox': table.bbox, 'width': page.width, 'height': page.height, 'rows': rows, 'details': details})
                    print(subject, 'PDF page', page_number, 'table rows', len(rows))
        (INSPECT / f'{subject}-tables.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')


COMPOUND_PREFIXES = {
    'социально', 'общественно', 'территориально', 'финансово', 'государственно',
    'культурно', 'научно', 'военно', 'профессионально', 'духовно', 'политико',
    'информационно', 'нормативно', 'официально', 'неофициально', 'естественно',
    'социо', 'социально-политико', 'художественно', 'гражданско', 'уголовно',
    'гражданско-процессуально', 'причинно', 'логико', 'количественно',
    'конкретно', 'национально', 'международно', 'экономико', 'морально',
    'технико', 'санитарно', 'семейно', 'административно', 'конституционно',
    'товарно', 'религиозно', 'повторительно', 'ценностно', 'сословно', 'вопросно', 'дробно',
}


def normalize_title(text):
    def dehyphenate(match):
        left, right = match.group(1), match.group(2)
        preserve = left.lower() in COMPOUND_PREFIXES
        return left + ('-' if preserve else '') + right
    text = re.sub(r'([А-Яа-яЁё]+)\s*-\s*\n\s*([а-яё]+)', dehyphenate, text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'\s+([.,;:])', r'\1', text)
    return text


def extract_rows():
    raw = {}
    reports = {}
    for subject in ['math', 'russian', 'history', 'social']:
        tables = json.loads((INSPECT / f'{subject}-tables.json').read_text(encoding='utf-8'))
        reader = PdfReader(SOURCES / '2026' / f'{subject}-codifier.pdf')
        rows = []
        continuation = []
        for table in sorted(tables, key=lambda t: (t['page'], t['bbox'][0], t['bbox'][1])):
            if len(table['rows']) < 2:
                continue
            header = table['rows'][0]
            if header[0] != 'Код' or not header[1] or not normalize_title(header[1]).startswith('Проверяемый элемент'):
                continue
            printed = [int(v) for v in re.findall(r'(\d+)\s*/\s*\d+', reader.pages[table['page'] - 1].extract_text())]
            side = 0 if table['bbox'][0] < table['width'] / 2 else 1
            printed_page = printed[min(side, len(printed)-1)] if printed else None
            for row_number, row in enumerate(table['rows'][1:], 1):
                code = re.sub(r'\s+', '', row[0] or '')
                detail = table.get('details', [None] * len(table['rows']))[row_number]
                title = detail['text'] if detail else (row[1] or '')
                if code == '1–6':
                    continuation.append({'page': table['page'], 'printedPage': printed_page, 'code': code, 'text': normalize_title(title), 'kind': 'appendix-cross-reference'})
                    continue
                if not code and title:
                    if not rows:
                        raise ValueError('Unattached continued row')
                    rows[-1]['rawTitle'] += '\n' + title
                    rows[-1]['title'] = normalize_title(rows[-1]['rawTitle'])
                    rows[-1].setdefault('continuedOn', []).append(printed_page)
                    if detail:
                        rows[-1]['italicFragments'].extend(normalize_title(t) for t in detail['italicFragments'])
                    continue
                if not re.fullmatch(r'\d+(?:\.\d+)*', code):
                    raise ValueError(f'Unexpected code {subject} {row}')
                levels = (row[2] or '') if len(row) >= 3 else ''
                marker = (row[3] or '') if len(row) >= 4 else ''
                rows.append({'code': code, 'title': normalize_title(title), 'rawTitle': title, 'page': table['page'], 'printedPage': printed_page, 'levels': levels, 'marker': marker, 'italicFragments': [normalize_title(t) for t in detail['italicFragments']] if detail else [], 'entirelyItalic': detail['entirelyItalic'] if detail else False})
        rows.sort(key=lambda row: [int(n) for n in row['code'].split('.')])
        if len({row['code'] for row in rows}) != len(rows):
            raise ValueError(f'Duplicate codes: {subject}')
        raw[subject] = rows
        reports[subject] = {'rows': len(rows), 'codes': [row['code'] for row in rows], 'crossReferences': continuation}
    (INSPECT / 'extracted-rows.json').write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding='utf-8')
    (INSPECT / 'row-counts.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({subject: {'count': len(rows), 'last': rows[-1]['code'], 'minusMarkers': [r['code'] for r in rows if '–' in r['marker'] or '−' in r['marker']]} for subject, rows in raw.items()}, ensure_ascii=False, indent=2))


# Author-assigned learning navigation. These are NOT official grade schedules
# and do not assert that one scene covers every subclause of a source position.
LESSON_LINKS = {
    'math': {'1.2': ['math-fraction', 'math-multiply', 'math-percent'], '1.7': ['math-absolute'], '7.1': ['math-rectangle', 'math-triangle', 'math-median']},
    'russian': {'3.6.1': ['russian-syntax'], '3.8.7': ['russian-commas'], '3.7.7': ['russian-ne-ni']},
    'history': {'1.4': ['history-baptism'], '4.6': ['history-reform']},
    'social': {'2.5': ['social-demand'], '3.1': ['social-groups']},
}
KEYWORDS = {
    'math': {'1.2': ['дроби', 'проценты', 'умножение дробей'], '1.7': ['модуль числа', 'абсолютная величина', 'округление'], '2.1': ['линейные уравнения', 'квадратные уравнения'], '7.1': ['прямоугольник', 'треугольник', 'площадь', 'медиана', 'высота', 'биссектриса', 'окружность']},
    'russian': {'3.2.2': ['аллитерация', 'ассонанс'], '3.3.1': ['синонимы', 'антонимы', 'жаргонизмы', 'профессионализмы', 'архаизмы', 'историзмы', 'неологизмы'], '3.3.2': ['литота'], '3.6.1': ['синтаксис', 'члены предложения'], '3.7.2': ['чередующиеся гласные', 'орфограммы'], '3.7.7': ['не', 'ни', 'частицы'], '3.8.7': ['запятые', 'сложное предложение', 'придаточное']},
    'history': {'1.4': ['Крещение Руси', '988', 'Владимир'], '4.6': ['1861', 'Александр II', 'отмена крепостного права']},
    'social': {'2.5': ['спрос', 'предложение', 'равновесная цена'], '3.1': ['социальные группы', 'стратификация', 'мобильность']},
}
MATH_GRADES = {
    '1.1': [5, 6], '1.2': [5, 6, 7], '1.3': [8, 9, 10], '1.4': [7, 8, 10, 11],
    '1.5': [9, 10], '1.6': [10, 11], '1.7': [8, 9, 10], '1.8': [7, 8, 9, 10, 11], '1.9': [10, 11],
    '2.1': [7, 8, 9], '2.2': [9, 10, 11], '2.5': [8, 9, 10, 11], '2.9': [7, 8, 9, 10, 11],
    '3.1': [7, 8, 9, 10, 11], '3.2': [8, 9, 10, 11], '3.3': [8, 9, 10], '3.7': [9, 10], '3.8': [9, 10, 11],
    '5.1': [5, 6, 7, 8, 9, 10, 11], '5.2': [5, 6, 7, 8, 9, 10, 11],
    '6.1': [7, 8, 9, 10, 11], '6.2': [7, 8, 9, 10, 11], '6.3': [7, 8, 9, 10, 11],
    '7.1': [7, 8, 9], '7.5': [8, 9, 10, 11],
}


def approximate_grades(subject, code):
    if subject == 'math':
        return MATH_GRADES.get(code, [10, 11])
    if subject == 'russian':
        if code.startswith('3.2'):
            return [5, 6, 10, 11]
        if code.startswith(('3.3', '3.4', '3.5', '3.7')):
            return [5, 6, 7, 10, 11]
        if code.startswith('3.6'):
            return [8, 9, 10, 11]
        if code.startswith('3.8'):
            return [5, 8, 9, 10, 11]
        return list(range(7 if code.startswith('2') else 5, 12))
    if subject == 'social':
        return [10] if code.split('.')[0] in ['1', '2'] else [11]
    top = int(code.split('.')[0])
    if top in [1, 2, 3, 4]:
        return [top + 5]
    if top == 5:
        leaf = int(code.split('.')[1]) if '.' in code else 20
        return [5] if leaf <= 4 else [6] if leaf <= 9 else [7] if leaf <= 12 else [8] if leaf <= 15 else [9] if leaf <= 19 else [7, 8, 9]
    return [10] if top in [7, 8, 11] else [11]


def emit_catalog(check=False):
    raw = json.loads((INSPECT / 'extracted-rows.json').read_text(encoding='utf-8'))
    manifest = json.loads((SOURCES / 'manifest.json').read_text(encoding='utf-8-sig'))
    output = ROOT / 'src' / 'domain' / 'curriculum-data'
    output.mkdir(parents=True, exist_ok=True)
    metadata = {'editionYear': 2026, 'editionStatus': 'final', 'checkedAt': '2026-09-08', 'publisherUrl': 'https://fipi.ru/ege/demoversii-specifikacii-kodifikatory', 'scope': 'section-2-content-table-and-history-appendix-1', 'subjects': {}, 'draftsIncluded': False}
    expected = {'math': 48, 'russian': 76, 'history': 100, 'social': 80}
    for subject, rows in raw.items():
        if len(rows) != expected[subject]:
            raise ValueError(f'Count differs from visually checked source ranges: {subject}')
        source = next(d for d in manifest['documents'] if d['id'] == f'fipi-{subject}-2026-codifier')
        if hashlib.sha256((SOURCES / source['file']).read_bytes()).hexdigest() != source['sha256']:
            raise ValueError(f'Source changed: {source["id"]}')
        codes = {row['code'] for row in rows}
        by_code = {row['code']: row for row in rows}
        sections = {code for code in codes if any(c.startswith(code + '.') for c in codes)}
        nodes = []
        for row in rows:
            code = row['code']
            is_section = code in sections
            excluded = subject == 'math' and code in {'1.9', '2.11', '3.6', '5.1'}
            node = {'id': f'ege-{subject}-' + code.replace('.', '-'), 'subject': subject, 'code': code,
                'title': row['title'], 'section': by_code[code.split('.')[0]]['title'],
                'sourceId': source['sourceId'], 'sourceDocumentId': source['id'], 'page': row['page'], 'printedPage': row['printedPage'],
                'editionYear': 2026, 'editionStatus': 'final',
                'schoolGrades': approximate_grades(subject, code), 'gradeBasis': 'approximate',
                'gradeNote': 'Ориентировочная привязка Cosmos. Кодификатор задаёт содержание экзамена, а не календарь конкретного класса; повторение возможно позднее.',
                'keywords': KEYWORDS.get(subject, {}).get(code, []),
                'assessmentStatus': 'section' if is_section else 'not-assessed-in-edition' if excluded else 'assessed',
                'programLevels': [level for token, level in [('БУ', 'basic'), ('УУ', 'advanced')] if token in row['levels']]}
            if '.' in code:
                parent = code.rsplit('.', 1)[0]
                if parent not in codes:
                    raise ValueError(f'Unresolved parent: {subject}/{code}')
                node['parentId'] = f'ege-{subject}-' + parent.replace('.', '-')
            if is_section:
                node['schoolGrades'] = sorted({grade for child in rows if child['code'].startswith(code + '.') and child['code'] not in sections for grade in approximate_grades(subject, child['code'])})
            if excluded:
                node['assessmentNote'] = 'Не проверяется на ЕГЭ 2026: знак «−» в таблице 3 и сноска 2 к кодификатору математики. Доступно как дополнительная школьная тема.'
            if subject == 'social':
                fragments = [s.strip(' .;') for s in row['italicFragments'] if re.search(r'[А-Яа-яЁё]', s)]
                if fragments:
                    node['notAssessedFragments'] = fragments
                    node['assessmentNote'] = 'Позиция входит в содержание ЕГЭ 2026, кроме перечисленных курсивных фрагментов: сноска 8, печатная с. 14. Знаки в последнем столбце показывают наличие материала в прошлые годы, а не исключение всей позиции.'
            if subject == 'math' and is_section:
                node['examLevels'] = ['basic', 'profile']
                node['examLevelNote'] = 'Подтверждены только коды разделов в обобщённых планах спецификаций 2026. Эта отметка НЕ означает, что каждый дочерний элемент проверяется на обоих уровнях. База: печатные с. 10–12; профиль: печатные с. 14–18.'
            links = LESSON_LINKS.get(subject, {}).get(code)
            if links:
                node['lessonTopicId'] = links[0]
                node['lessonTopicIds'] = links
            nodes.append(node)
        metadata['subjects'][subject] = {'nodes': len(nodes), 'sections': len(sections), 'leaves': len(nodes) - len(sections),
            'assessedLeaves': sum(n['assessmentStatus'] == 'assessed' for n in nodes),
            'notAssessedLeaves': sum(n['assessmentStatus'] == 'not-assessed-in-edition' for n in nodes),
            'partiallyExcludedLeaves': sum(bool(n.get('notAssessedFragments')) for n in nodes),
            'sourceDocumentId': source['id'], 'sourceId': source['sourceId'], 'sha256': source['sha256'],
            'physicalPages': sorted({row['page'] for row in rows}), 'printedPages': sorted({row['printedPage'] for row in rows})}
        serialized = json.dumps(nodes, ensure_ascii=False, indent=2) + '\n'
        path = output / f'{subject}-2026.json'
        if check:
            if path.read_text(encoding='utf-8') != serialized:
                raise ValueError(f'Generated data differs: {path}')
        else:
            path.write_text(serialized, encoding='utf-8')
    metadata['totalNodes'] = sum(s['nodes'] for s in metadata['subjects'].values())
    serialized = json.dumps(metadata, ensure_ascii=False, indent=2) + '\n'
    path = output / 'metadata.json'
    if check:
        if path.read_text(encoding='utf-8') != serialized:
            raise ValueError('Generated metadata differs')
    else:
        path.write_text(serialized, encoding='utf-8')
    print('Verified generated catalogue:', metadata['totalNodes'], 'nodes')


def render_sources():
    INSPECT.mkdir(parents=True, exist_ok=True)
    for subject, pages in CONTENT_PAGES.items():
        for page in pages:
            target = INSPECT / f'{subject}-page{page}'
            subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-scale-to', '1700', '-png', '-singlefile', str(SOURCES / '2026' / f'{subject}-codifier.pdf'), str(target)], check=True, timeout=30)
    for page in [5, 6]:
        subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-scale-to', '1700', '-png', '-singlefile', str(SOURCES / '2026' / 'math-specification-basic.pdf'), str(INSPECT / f'math-basic-page{page}')], check=True, timeout=30)
    print('Rendered all content pages and the basic exam appendix for visual review')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--tables', action='store_true')
    parser.add_argument('--rows', action='store_true')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    if args.render:
        render_sources()
    elif args.write or args.check:
        inspect_sources()
        inspect_tables()
        extract_rows()
        emit_catalog(check=args.check)
    elif args.rows:
        extract_rows()
    elif args.tables:
        inspect_tables()
    else:
        inspect_sources()
