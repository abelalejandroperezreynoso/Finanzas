"""Robotito del asistente: dibuja en pixeles (48x60) cada capa del personaje y las
guarda como PNG dentro de dashboard.html (constante ROBOT_PNG).

Uso (desde la raíz del repo):
    python3 herramientas/robotito.py            # actualiza ROBOT_PNG en dashboard.html
    python3 herramientas/robotito.py --vista robotito.html   # además, una página para ver las capas

Cómo está hecho:
- Todo se dibuja con figuras simples (esfera, cilindro, tubo, línea) sombreadas con una
  luz desde arriba a la izquierda y un tramado de 4x4; al final se le pone contorno.
- Coordenadas en pixeles del personaje: x de 0 a 47, y de 0 a 59 (y crece hacia abajo).
- Cada capa se dibuja sola para animarla en CSS (.robotito en dashboard.html). Las partes
  ocultas (cuello de resorte largo, piernas que suben detrás del cuerpo) sólo se ven al
  estirarse.
- Colores: RAMP (metal, de oscuro a claro), RUST (óxido), HOLE (huecos), K (contorno).
- Para un estado nuevo de la cara: agrégalo en robot() y en CARAS; luego úsalo en
  personajeAsistenteHtml() y sube CACHE_NAME en sw.js.

Requiere Pillow (pip install pillow).
"""
import sys
import math
W,H=48,60
RAMP=['#3b2e22','#5a4630','#7a6142','#9a7a52','#b8996a','#d2b684','#e8d2a4','#f6ead0']
RUST=['#6e3a22','#8a4a2a','#a8623a','#c27a48']
HOLE='#16110d'; K='#2e231a'
BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]
L=(-0.55,-0.45,0.70); n=math.sqrt(sum(c*c for c in L)); L=tuple(c/n for c in L)
class G:
    def __init__(s): s.c=[[None]*W for _ in range(H)]
    def set(s,x,y,col):
        if 0<=x<W and 0<=y<H: s.c[y][x]=col
    def get(s,x,y): return s.c[y][x] if 0<=x<W and 0<=y<H else None
def tono(i,x,y,ramp=RAMP,amb=0.18,spec=True):
    v=amb*0.6+(1-amb)*0.92*max(0,i)**1.4
    if spec and i>0.95: v+=0.2
    t=v*(len(ramp)-1)+(BAYER[y%4][x%4]/16-0.5)*0.55
    return ramp[max(0,min(len(ramp)-1,round(t)))]
def esfera(g,cx,cy,rx,ry,y0=-99,y1=99,ramp=RAMP,clip=None):
    for y in range(H):
        for x in range(W):
            if not(y0<=y<=y1): continue
            dx=(x+0.5-cx)/rx; dy=(y+0.5-cy)/ry; d=dx*dx+dy*dy
            if d<=1 and (clip is None or clip(x,y)):
                nz=math.sqrt(1-d); i=dx*L[0]+dy*L[1]+nz*L[2]
                g.set(x,y,tono(i,x,y,ramp))
def cilindro(g,cx,r,y0,y1,ramp=RAMP,amb=0.18):
    for y in range(y0,y1+1):
        for x in range(W):
            dx=(x+0.5-cx)/r
            if abs(dx)<=1:
                nz=math.sqrt(1-dx*dx); i=dx*L[0]+nz*L[2]
                g.set(x,y,tono(i,x,y,ramp,amb))
def tuboh(g,x0,x1,cy,r,ramp=RAMP):
    for x in range(x0,x1+1):
        for y in range(H):
            dy=(y+0.5-cy)/r
            if abs(dy)<=1:
                nz=math.sqrt(1-dy*dy); i=dy*L[1]+nz*L[2]+0.1
                g.set(x,y,tono(i,x,y,ramp))
def disco(g,cx,cy,r,col):
    for y in range(H):
        for x in range(W):
            if (x+0.5-cx)**2+(y+0.5-cy)**2<=r*r: g.set(x,y,col)
def linea(g,x0,y0,x1,y1,col,grosor=1):
    pasos=int(max(abs(x1-x0),abs(y1-y0))*2)+1
    for k in range(pasos+1):
        t=k/pasos; x=x0+(x1-x0)*t; y=y0+(y1-y0)*t
        for ox in range(grosor):
            g.set(int(x)+ox,int(y),col)
def robot(estado,partes=('cuerpo','cabeza')):
    g=G(); cx=24
    glow=estado=='pensando'
    def mano(hx,hy,arriba):
        cilindro(g,hx+1,2.2,hy,hy+2)
        borde=hy if arriba else hy+2
        for x in range(int(hx-1),int(hx+3)): g.set(x,borde,RAMP[1])
        for dx in (-1,1,3):
            if arriba: g.set(int(hx+dx),hy-1,RAMP[3]); g.set(int(hx+dx),hy-2,RAMP[2])
            else: g.set(int(hx+dx),hy+3,RAMP[3]); g.set(int(hx+dx),hy+4,RAMP[2])
    def brazo(s_,e_,h_,arriba):
        (sx,sy),(ex,ey),(hx,hy)=s_,e_,h_
        linea(g,sx,sy,ex,ey,RAMP[3],2); linea(g,ex,ey,hx+0.5,hy+(3 if arriba else 0),RAMP[4],2)
        esfera(g,ex+1,ey+0.5,1.8,1.8); mano(hx,hy,arriba)
    if 'brazos' in partes:
        brazo((15,37),(10,44),(8,50),False); brazo((33,37),(38,44),(40,50),False)
    if 'brazos_arriba' in partes:
        brazo((15,37),(7,34),(2,21),True); brazo((33,37),(40,34),(44,21),True)
    if 'piernas' in partes:
        for (a,b) in ((20,19),(27,28)):
            linea(g,a,46,a,50,RAMP[3],2); linea(g,a,50,b,57,RAMP[3],2); esfera(g,(a+b)/2+1,53.5,1.6,1.6)
    if 'pie_izq' in partes: esfera(g,20,58.5,3.5,2.2,y0=56,y1=59)
    if 'pie_der' in partes: esfera(g,29,58.5,3.5,2.2,y0=56,y1=59)
    if 'cuerpo' in partes:
        # cuello de resorte largo: casi todo queda bajo la cabeza y se ve al estirarse
        cilindro(g,cx,4.5,25,34,amb=0.05)
        for y in range(26,35,2):
            for x in range(20,29): g.set(x,y,RAMP[1])
        # cuerpo
        cilindro(g,cx,8.5,35,49)
        for yr in (38,42,46):
            for x in range(16,33):
                g.set(x,yr,RAMP[1]); 
                if g.get(x,yr+1): g.set(x,yr+1,tono(0.9,x,yr+1) if x<26 else RAMP[4])
        for x,y in ((18,36),(22,36),(26,36),(30,36),(19,44),(24,44),(29,44),(21,48),(27,48)):
            g.set(x,y,RAMP[1]); g.set(x,y-1,RAMP[6]) if g.get(x,y-1) else None
        for x,y,c in ((26,40,1),(27,40,2),(27,41,0),(28,40,3),(19,47,2),(20,47,1),(23,43,3),(30,47,2)): g.set(x,y,RUST[c])
        cilindro(g,cx,7.5,49,50,amb=0.05)
        # hombros
        esfera(g,15.5,36.5,2.6,2.6); esfera(g,32.5,36.5,2.6,2.6)
    if 'cabeza' in partes:
        # cabeza: domo + cilindro
        esfera(g,cx,22,14.5,15,y0=7,y1=22)
        cilindro(g,cx,14.5,22,27)
        # costura con remaches siguiendo la curvatura
        for y in range(8,28):
            dy=max(0,(22-y)/15); w=math.sqrt(max(0,1-dy*dy))
            x=int(cx+5.5*w)
            if g.get(x,y): g.set(x,y,RAMP[1]); g.set(x+1,y,RAMP[6] if y<24 else RAMP[5])
            if y in (11,15,19,23): g.set(x+3,y,RAMP[1]); g.set(x+3,y-1,RAMP[7])
        for x,y,c in ((13,13,2),(14,13,1),(14,14,0),(13,14,2),(33,17,2),(34,18,1),(35,18,2),(29,25,1),(30,25,2),(12,25,3)): g.set(x,y,RUST[c])
        # rayones
        for x,y in ((17,10),(18,9),(19,9)): g.set(x,y,RAMP[7])
        # ala (disco con borde)
        for y in range(27,32):
            for x in range(W):
                dx=(x+0.5-cx)/17.5; dy=(y-28.5)/3.2
                if dx*dx+dy*dy<=1:
                    if y<=28: g.set(x,y,tono(0.95 if dx<0.3 else 0.75,x,y))
                    elif y==29: g.set(x,y,tono(0.6-dx*0.5,x,y))
                    elif y==30: g.set(x,y,tono(0.35-dx*0.4,x,y))
                    else: g.set(x,y,RAMP[1])
        # antena
        cilindro(g,cx,1.2,4,7,amb=0.1)
        cilindro(g,cx,3.2,1,3,ramp=(['#6e2f1c','#a8432a','#d97757','#f0a080','#ffd3b8'] if glow else RAMP))
        for x in range(21,28):
            if g.get(x,1): g.set(x,1,'#ffd3b8' if glow else RAMP[6])
            if glow and g.get(x,2): g.set(x,2,'#f08a5f'); 
            if glow and g.get(x,3): g.set(x,3,'#d96a45')
        g.set(23,2,HOLE); g.set(24,2,HOLE)
        # ojo izquierdo (de frente)
        ex,ey=16.5,20.5
        esfera(g,ex,ey,5,5)
        disco(g,ex,ey,3.6,RAMP[2]); esfera(g,ex,ey,3.6,3.6,ramp=RAMP[1:6]) 
        hy= -1 if estado=='pensando' else (1 if estado in ('preocupado','parpadeo') else 0)
        disco(g,ex,ey+hy,2.3,HOLE)
        g.set(int(ex-1),int(ey+hy-1),'#fffaf0'); 
        # ojo derecho (tubo de lado)
        tuboh(g,30,39,20.5,4.3)
        for y in range(17,25):
            if g.get(29,y): g.set(29,y,RAMP[2])
        for y in range(16,26):
            dy=(y+0.5-20.5)/4.3
            if abs(dy)<=1: g.set(40,y,RAMP[2]); g.set(41,y,RAMP[1])
        for y in range(18+hy,23+hy): g.set(40,y,HOLE); g.set(39,y,HOLE) if 19+hy<=y<=21+hy else None
        for x in range(31,38): g.set(x,18,RAMP[7]) if x%3 else None
        # párpados
        if estado=='parpadeo':
            for y in range(15,26):
                for x in range(11,23):
                    if (x+0.5-ex)**2+(y+0.5-ey)**2<=27.5: g.set(x,y,tono(0.55+(20-y)*0.04,x,y))
            for x in range(12,22): g.set(x,21,RAMP[1]) if (x+0.5-ex)**2<=20 else None
            for x in range(29,42):
                for y in range(16,26):
                    if g.get(x,y): g.set(x,y,tono(0.5+(21-y)*0.04,x,y))
                g.set(x,21,RAMP[1]) if g.get(x,21) else None
        if estado=='preocupado':
            for y in range(15,21):
                for x in range(11,23):
                    if (x+0.5-ex)**2+(y+0.5-ey)**2<=27.5: g.set(x,y,tono(0.55+(20-y)*0.05,x,y))
            for x in range(12,22): g.set(x,20,RAMP[1]) if (x+0.5-ex)**2<=24 else None
            for x in range(30,42):
                for y in range(16,20): 
                    if g.get(x,y) and g.get(x,y)!=HOLE or x>=39: g.set(x,y,tono(0.5,x,y)) if g.get(x,y) else None
                g.set(x,20,RAMP[1]) if g.get(x,20) else None
    # contorno exterior
    out=[[None]*W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if g.get(x,y) is None and any(g.get(x+a,y+b) for a,b in ((1,0),(-1,0),(0,1),(0,-1))): out[y][x]=K
    for y in range(H):
        for x in range(W):
            if out[y][x]: g.set(x,y,out[y][x])
    return g

import io, base64, re, argparse
from PIL import Image

def png(g):
    im = Image.new('RGBA', (W + 2, H + 2), (0, 0, 0, 0))
    for y in range(H):
        for x in range(W):
            c = g.c[y][x]
            if c: im.putpixel((x + 1, y + 1), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return base64.b64encode(b.getvalue()).decode()

# Capas del cuerpo (de atrás hacia adelante) y caras de la cabeza que usa la app
CAPAS = ['piernas', 'pie_izq', 'pie_der', 'brazos', 'brazos_arriba', 'cuerpo']
CARAS = ['normal', 'parpadeo', 'pensando']

def generar():
    out = {k: png(robot('normal', (k,))) for k in CAPAS}
    for e in CARAS: out[e] = png(robot(e, ('cabeza',)))
    return out

def actualizar_dashboard(out, ruta='dashboard.html'):
    s = open(ruta, encoding='utf-8').read()
    m = re.search(r"( *)const ROBOT_PNG = \{\n.*?\n *\};", s, re.S)
    if not m: sys.exit('No encontré const ROBOT_PNG en ' + ruta)
    sangria = m.group(1)
    cuerpo = ',\n'.join(f"{sangria}    {k}: '{v}'" for k, v in out.items())
    s = s[:m.start()] + f"{sangria}const ROBOT_PNG = {{\n{cuerpo}\n{sangria}}};" + s[m.end():]
    open(ruta, 'w', encoding='utf-8').write(s)

def vista(out, ruta):
    capa = lambda k, dy=0: f'<img src="data:image/png;base64,{out[k]}" style="position:absolute;width:200px;top:{dy*4}px;image-rendering:pixelated">'
    poses = [
        ('Normal', ['piernas', 'pie_izq', 'pie_der', 'brazos', 'cuerpo', 'normal'], {}),
        ('Pensando', ['piernas', 'pie_izq', 'pie_der', 'brazos', 'cuerpo', 'pensando'], {}),
        ('Estirado', ['piernas', 'pie_izq', 'pie_der', 'brazos_arriba', 'cuerpo', 'parpadeo'], {'brazos_arriba': -1, 'cuerpo': -1, 'parpadeo': -3}),
    ]
    html = '<html><body style="background:#faf9f5;display:flex;gap:30px;padding:20px;font:18px Georgia">'
    for t, capas, dy in poses:
        html += '<div><div style="position:relative;width:200px;height:260px">' + ''.join(capa(k, dy.get(k, 0)) for k in capas) + f'</div>{t}</div>'
    open(ruta, 'w').write(html + '</body></html>')

if __name__ == '__main__':
    import sys
    ap = argparse.ArgumentParser()
    ap.add_argument('--vista', help='escribe una página HTML para ver las poses')
    ap.add_argument('--dashboard', default='dashboard.html')
    a = ap.parse_args()
    out = generar()
    actualizar_dashboard(out, a.dashboard)
    if a.vista: vista(out, a.vista)
    print('ROBOT_PNG actualizado:', sum(len(v) for v in out.values()), 'caracteres')
