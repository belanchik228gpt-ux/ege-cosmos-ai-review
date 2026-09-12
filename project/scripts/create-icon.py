from PIL import Image, ImageDraw
from pathlib import Path
import math

# Original code-drawn brand mark, independent of the old application's assets.
n = 1024
im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((20,20,1004,1004), radius=245, fill=(30,22,47), outline=(152,117,200), width=16)
d.ellipse((294,294,730,730), fill=(145,103,205), outline=(222,199,255), width=13)
points=[]
for i in range(361):
 t=math.radians(i);x=400*math.cos(t);y=180*math.sin(t);a=math.radians(-35)
 points.append((512+x*math.cos(a)-y*math.sin(a),512+x*math.sin(a)+y*math.cos(a)))
d.line(points,fill=(213,188,249),width=18,joint='curve')
d.ellipse((741,249,807,315),fill=(242,211,155))
d.ellipse((195,721,247,773),fill=(125,216,228))
Path('build').mkdir(exist_ok=True)
im.save('build/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.resize((256,256)).save('build/icon.png')
