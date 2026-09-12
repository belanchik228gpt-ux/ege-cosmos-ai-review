"""Render actual app-exported PDFs for human visual review; never alter them."""
import json
import pathlib
import sys
import hashlib
import pypdfium2 as pdfium
from pypdf import PdfReader

manifest = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
exports = json.loads(manifest.read_text(encoding="utf-8-sig"))
records = []
for item in exports:
    if item.get("format") != "pdf":
        continue
    source = pathlib.Path(item["path"])
    pdf = pdfium.PdfDocument(str(source))
    pages = []
    for index in range(len(pdf)):
        page = pdf[index]
        bitmap = page.render(scale=1.3)
        image = bitmap.to_pil()
        target = output / f"page-{index+1:02}.png"
        image.save(target)
        pages.append({"page": index + 1, "image": str(target), "width": image.width, "height": image.height})
        bitmap.close()
        page.close()
    pdf.close()
    reader = PdfReader(str(source))
    extracted = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    content = "\n".join(line.rstrip() for line in extracted.splitlines()).rstrip() + "\n"
    (output / "extracted.txt").write_text(content, encoding="utf-8")
    records.append({"source": str(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "pages": pages, "characters": len(content), "visualReview": "Pending human inspection of every rendered page"})
(output / "render.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(records, ensure_ascii=False, indent=2))
