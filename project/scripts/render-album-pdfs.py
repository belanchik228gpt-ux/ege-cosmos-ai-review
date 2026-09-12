"""Rasterize every real Electron PDF page; produce contact sheets for visual review."""
import json
from pathlib import Path
import pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[1]
evidence = root / 'docs' / 'verification'
report = json.loads((evidence / 'document-album-render-checks.json').read_text(encoding='utf-8'))
images = []
for item in report['results']:
    file = root / item['file']
    doc = pdfium.PdfDocument(str(file))
    texts = [page.extract_text() for page in PdfReader(file).pages]
    assert len(doc) == len(item['measurements']), (file, len(doc))
    assert f'Конец документа: {item["topicId"]}.' in '\n'.join(texts), file
    for i in range(1, 25):
        assert f'Строка {i}.' in '\n'.join(texts), (file, i)
    item['pdfPages'] = len(doc)
    item['all24SentinelLinesPresent'] = True
    for index in range(len(doc)):
        image = doc[index].render(scale=1.35).to_pil().convert('RGB')
        scale = '-large' if item.get('scale') == 'large' else ''
        target = evidence / f'album-{item["topicId"]}-{item["style"]}{scale}-{index+1}.png'
        image.save(target)
        images.append((target.name, image))
for group in range((len(images) + 5) // 6):
    contact = Image.new('RGB', (1700, 1850), '#ded5e9')
    draw = ImageDraw.Draw(contact)
    for local, (name, image) in enumerate(images[group*6:group*6+6]):
        thumb = ImageOps.contain(image, (830, 580))
        x, y = 15+(local%2)*850, 35+(local//2)*615
        draw.text((x, y-22), name, fill='black')
        contact.paste(thumb, (x, y))
    contact.save(evidence / f'album-contact-{group+1}.png')
(evidence / 'document-album-render-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'pdfs':len(report['results']),'pagesRasterized':len(images),'contactSheets':(len(images)+5)//6}))
