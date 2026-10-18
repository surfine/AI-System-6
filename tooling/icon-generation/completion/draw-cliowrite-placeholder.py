# Temporary line-art masters for clioWrite (placeholder until hand-generated Image Gen masters arrive).
import sys
from PIL import Image, ImageDraw
S=1254; SS=2  # supersample
def draw(paper, ink, ruler, bars, pen, nib, out, alpha=255, stroke=64):
    W=S*SS; im=Image.new('RGBA',(W,W),(0,0,0,0)); d=ImageDraw.Draw(im)
    k=lambda v:int(v*SS); sw=k(stroke)
    L,T,R,B=k(250),k(110),k(960),k(1150); fold=k(170)
    page=[(L,T),(R-fold,T),(R,T+fold),(R,B),(L,B)]
    d.polygon(page,fill=paper+(alpha,)); d.line(page+[page[0]],fill=ink+(255,),width=sw,joint='curve')
    d.line([(R-fold,T),(R-fold,T+fold),(R,T+fold)],fill=ink+(255,),width=sw,joint='curve')
    # ruler strip with indent triangles
    rt,rb=k(250),k(330); d.line([(L+k(70),rb),(R-k(90),rb)],fill=ink+(255,),width=k(34))
    for x in (L+k(150),R-k(170)):
        d.polygon([(x-k(40),rb+k(4)),(x+k(40),rb+k(4)),(x,rb+k(70))],fill=ink+(255,))
    # bold text bars
    y=k(500)
    for w in (540,540,320):
        d.rounded_rectangle([L+k(90),y,L+k(90)+k(w),y+k(70)],radius=k(14),fill=bars+(255,)); y+=k(190)
    # fountain pen, diagonal into lower right
    import math
    ang=math.radians(-45); cx,cy=k(930),k(960)
    def pt(u,v): return (cx+u*math.cos(ang)-v*math.sin(ang), cy+u*math.sin(ang)+v*math.cos(ang))
    body=[pt(k(-60),k(-70)),pt(k(380),k(-70)),pt(k(380),k(70)),pt(k(-60),k(70))]
    d.polygon(body,fill=pen+(255,)); d.line(body+[body[0]],fill=ink+(255,),width=k(36),joint='curve')
    tip=[pt(k(-60),k(-70)),pt(k(-260),k(0)),pt(k(-60),k(70))]
    d.polygon(tip,fill=nib+(255,)); d.line(tip+[tip[0]],fill=ink+(255,),width=k(36),joint='curve')
    d.line([pt(k(-90),0),pt(k(-200),0)],fill=ink+(255,),width=k(22))
    im.resize((S,S),Image.LANCZOS).save(out)
base=sys.argv[1]
P=lambda e,n='clioWrite': f'{base}/{e}/{n}.png'
draw((255,255,255),(0,0,0),(255,255,255),(0,0,0),(0,0,0),(255,255,255),P('classic'),stroke=72)
draw((246,242,232),(40,40,48),(214,214,214),(70,70,82),(40,90,70),(205,205,210),P('platinum'))
draw((252,248,236),(30,40,60),(140,190,240),(60,70,90),(20,95,70),(215,220,228),P('aqua'))
draw((250,248,242),(35,40,50),(170,200,235),(70,75,90),(25,85,65),(210,212,220),P('snow-leopard'))
draw((255,255,255),(60,70,85),(120,180,250),(95,105,120),(40,140,110),(225,228,235),P('yosemite'),stroke=48)
draw((255,253,248),(55,60,72),(110,165,245),(90,95,110),(30,120,95),(220,224,232),P('big-sur'),stroke=52)
draw((236,236,236),(0,0,0),(170,170,170),(60,60,60),(85,85,85),(200,200,200),P('nextstep'))
draw((255,255,255),(40,70,120),(150,200,255),(70,100,150),(30,110,160),(225,235,248),P('liquid-glass'),stroke=50)
draw((70,74,82),(230,232,238),(105,120,150),(205,210,220),(120,150,200),(150,155,165),P('liquid-glass','clioWrite-dark'),stroke=50)
draw((245,247,250),(120,125,135),(225,230,238),(150,155,165),(190,195,205),(235,238,242),P('liquid-glass','clioWrite-clear'),alpha=170,stroke=44)
print('ok')
