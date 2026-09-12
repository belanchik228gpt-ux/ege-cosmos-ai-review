"""Author-created printed QA images, not pupil uploads or official exam tasks."""
from PIL import Image, ImageDraw, ImageFont
import pathlib, json
root = pathlib.Path(__file__).resolve().parent.parent / 'docs/verification/vision-runtime'
root.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 42)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 32)
fixtures = [
    ('rectangle', ['Найдите площадь прямоугольника.', 'Длина 7 см, ширина 4 см.'], 'Найдите площадь прямоугольника. Длина 7 см, ширина 4 см.'),
    ('fractions', ['Вычислите: 3/8 + 1/4.', 'Решите уравнение: |x - 2| = 5.'], 'Вычислите: 3/8 + 1/4. Решите уравнение: |x - 2| = 5.'),
    ('russian', ['Расставьте знаки препинания.', 'Когда начался дождь мы вернулись домой.'], 'Расставьте знаки препинания. Когда начался дождь мы вернулись домой.'),
]
for identifier, lines, expected in fixtures:
    picture = Image.new('RGB', (1300, 400), 'white')
    draw = ImageDraw.Draw(picture)
    for index, line in enumerate(lines):
        draw.text((55, 65 + index * 90), line, font=font, fill='#101010')
    picture.save(root / f'{identifier}.png')
(root / 'fixtures.json').write_text(json.dumps({'kind':'author-created QA fixtures, not pupil photographs','fixtures':[{'id':identifier,'file':f'{identifier}.png','expected':expected} for identifier, _, expected in fixtures]},ensure_ascii=False,indent=2),encoding='utf-8')
print(root)
