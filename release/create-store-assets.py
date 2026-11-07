"""Generate original Sabadchin listing graphics; requires Pillow with RTL shaping."""
from pathlib import Path
import math,os
from PIL import Image,ImageDraw,ImageFont,features
assert features.check('raqm'), 'RTL shaping is required for Persian artwork'
output=Path(__file__).parent/'store-assets';output.mkdir(exist_ok=True)
font_path=os.environ.get('CARTWISE_ART_FONT','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
def basket(draw,x,y,size):
    s=size/108
    def points(values):return [(x+a*s,y+b*s) for a,b in values]
    draw.polygon(points([(31,42),(77,42),(72,79),(36,79)]),fill='#e4c38a')
    draw.arc((x+42*s,y+24*s,x+66*s,y+52*s),180,360,fill='#e4c38a',width=max(1,round(5*s)))
    draw.line(points([(42,38),(42,45)]),fill='#e4c38a',width=max(1,round(5*s)))
    draw.line(points([(66,38),(66,45)]),fill='#e4c38a',width=max(1,round(5*s)))
    draw.line(points([(44,60),(51,67),(66,50)]),fill='#164c78',width=max(1,round(4*s)),joint='curve')
def tile(draw,cx,cy,r,color):
    pts=[]
    for n in range(16):
        a=math.pi*n/8;radius=r if n%2==0 else r*.56;pts.append((cx+radius*math.cos(a),cy+radius*math.sin(a)))
    draw.polygon(pts,fill=color)
icon=Image.new('RGB',(512,512),'#164c78');draw=ImageDraw.Draw(icon)
tile(draw,256,256,222,'#177c87');basket(draw,0,0,512);icon.save(output/'icon-512.png')
feature=Image.new('RGB',(1024,500),'#faf2e3');draw=ImageDraw.Draw(feature)
for x in range(30,1030,60):
    for y in (25,475):tile(draw,x,y,16,'#b18445')
draw.rounded_rectangle((52,94,330,406),radius=28,fill='#164c78');basket(draw,42,95,300)
font=lambda n:ImageFont.truetype(font_path,n)
draw.text((960,192),'سبدچین',font=font(82),fill='#164c78',direction='rtl',anchor='ra')
draw.text((960,290),'خرید حساب‌شده، به سلیقه شما',font=font(30),fill='#263952',direction='rtl',anchor='ra')
draw.text((960,355),'ساده  •  مدرن  •  سنتی',font=font(25),fill='#59647a',direction='rtl',anchor='ra')
feature.save(output/'feature-1024x500.png')
print('Created original icon and feature graphic:',output)
