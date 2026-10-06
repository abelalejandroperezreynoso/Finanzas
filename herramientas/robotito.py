"""Robotito del asistente, al estilo plano de Claude: un naranja, una sombra lisa a la
izquierda, ojos negros cuadrados y patitas de un pixel. Dibuja cada capa y las guarda
como PNG dentro de dashboard.html (constante ROBOT_PNG).

Uso (desde la raíz del repo):
    python3 herramientas/robotito.py            # actualiza ROBOT_PNG en dashboard.html
    python3 herramientas/robotito.py --vista robotito.html --solo-vista   # sólo vista previa

Cómo está hecho:
- El personaje es una cuadrícula de 10x10 celdas (mapas de texto abajo). Cada celda son
  2x2 pixeles del PNG, para poder dibujar medias celdas (ojos al parpadear o al mirar
  arriba). En la app cada celda mide 10 px de CSS.
- Letras de los mapas: C naranja, S sombra, G gris (perilla), N cuello (oculto bajo la
  cabeza; se ve al estirarse), '.' vacío.
- Cada capa se dibuja sola para animarla en CSS (.robotito en dashboard.html). Las patas
  y el cuello tienen una celda de más escondida detrás del cuerpo y de la cabeza.
- Para cambiar el dibujo edita los mapas o los colores y vuelve a correr el archivo;
  luego sube CACHE_NAME en sw.js.

Requiere Pillow (pip install pillow).
"""
import sys, io, base64, re, argparse

CELDAS = 10            # el personaje mide 10x10 celdas
PX = 2                 # pixeles del PNG por celda
COLORES = {
    'C': '#ec9472',    # naranja claro
    'S': '#cf7757',    # sombra
    'N': '#cf7757',    # cuello
    'G': '#9b988f',    # perilla
    'D': '#141413',    # ojos
    'A': '#f7c46c',    # perilla encendida mientras piensa
    'R': '#e5484d',    # perilla de alarma (saldo en cero, negativo o muy bajo)
    'B': '#8ec5ea',    # gotita de sudor
}

CABEZA = [
    '....GG....',
    '..SCCCCC..',
    '.SCCCCCCC.',
    '.SCCCCCCC.',
    '.CCCCCCCC.',
]
CUERPO = [
    '..........',
    '..........',
    '..........',
    '..........',
    '...NNNN...',
    '..SCCCCC..',
    '..SCCCCC..',
    '..SCCCCC..',
]
BRAZOS = {6: 'CC......CC'}
BRAZOS_ARRIBA = {3: 'C........C', 4: 'C........C', 5: 'C........C', 6: 'CC......CC'}
PIE_IZQ = {7: '...C......', 8: '...C......', 9: '...C......'}
PIE_DER = {7: '......C...', 8: '......C...', 9: '......C...'}
OJOS = (3, 6)          # columnas de los ojos, en la fila 3


def lienzo():
    return [[None] * (CELDAS * PX) for _ in range(CELDAS * PX)]


def celda(img, x, y, color, x0=0, y0=0, w=PX, h=PX):
    for j in range(h):
        for i in range(w):
            img[y * PX + y0 + j][x * PX + x0 + i] = color


def pintar(img, mapa):
    filas = mapa.items() if isinstance(mapa, dict) else enumerate(mapa)
    for y, fila in filas:
        for x, c in enumerate(fila):
            if c in COLORES: celda(img, x, y, COLORES[c])


def cabeza(estado):
    img = lienzo()
    pintar(img, CABEZA)
    if estado == 'pensando':
        for x in (4, 5): celda(img, x, 0, COLORES['A'])
    if estado == 'alarma':            # sólo la perilla en rojo, encima de la cara de alerta
        img = lienzo()
        for x in (4, 5): celda(img, x, 0, COLORES['R'])
        return img
    if estado == 'alerta':            # cejas de preocupación (más altas hacia el centro) y sudor
        d = COLORES['D']
        for x0, y0 in ((6, 4), (7, 3), (12, 3), (13, 4)): img[y0][x0] = d
        for x0, y0 in ((18, 5), (18, 6), (19, 6)): img[y0][x0] = COLORES['B']
    for x in OJOS:
        if estado == 'parpadeo':      # ojos cerrados: media celda abajo
            celda(img, x, 3, COLORES['D'], y0=1, h=1)
        elif estado == 'pensando':    # mira hacia arriba: media celda más alto
            celda(img, x, 2, COLORES['D'], y0=1, h=1); celda(img, x, 3, COLORES['D'], h=1)
        else:
            celda(img, x, 3, COLORES['D'])
    return img


def capa(*mapas):
    img = lienzo()
    for m in mapas: pintar(img, m)
    return img


def png(img):
    from PIL import Image
    n = CELDAS * PX
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    for y in range(n):
        for x in range(n):
            c = img[y][x]
            if c: im.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return base64.b64encode(b.getvalue()).decode()


def generar():
    return {
        'pie_izq': png(capa(PIE_IZQ)),
        'pie_der': png(capa(PIE_DER)),
        'brazos': png(capa(BRAZOS)),
        'brazos_arriba': png(capa(BRAZOS_ARRIBA)),
        'cuerpo': png(capa(CUERPO)),
        'normal': png(cabeza('normal')),
        'parpadeo': png(cabeza('parpadeo')),
        'pensando': png(cabeza('pensando')),
        'alerta': png(cabeza('alerta')),
        'alarma': png(cabeza('alarma')),
    }


def actualizar_dashboard(out, ruta='dashboard.html'):
    s = open(ruta, encoding='utf-8').read()
    m = re.search(r"( *)const ROBOT_PNG = \{\n.*?\n *\};", s, re.S)
    if not m: sys.exit('No encontré const ROBOT_PNG en ' + ruta)
    sangria = m.group(1)
    cuerpo = ',\n'.join(f"{sangria}    {k}: '{v}'" for k, v in out.items())
    s = s[:m.start()] + f"{sangria}const ROBOT_PNG = {{\n{cuerpo}\n{sangria}}};" + s[m.end():]
    open(ruta, 'w', encoding='utf-8').write(s)


def vista(out, ruta):
    t = 200  # tamaño de la vista previa (20 px por celda)
    c = t // CELDAS
    img = lambda k, dy=0: f'<img src="data:image/png;base64,{out[k]}" style="position:absolute;width:{t}px;top:{dy * c}px;image-rendering:pixelated">'
    poses = [
        ('Normal', ['pie_izq', 'pie_der', 'brazos', 'cuerpo', 'normal'], {}),
        ('Pensando', ['pie_izq', 'pie_der', 'brazos', 'cuerpo', 'pensando'], {}),
        ('Parpadeo', ['pie_izq', 'pie_der', 'brazos', 'cuerpo', 'parpadeo'], {}),
        ('Alerta', ['pie_izq', 'pie_der', 'brazos', 'cuerpo', 'alerta', 'alarma'], {}),
        ('Estirado', ['pie_izq', 'pie_der', 'brazos_arriba', 'cuerpo', 'parpadeo'],
         {'brazos_arriba': -0.5, 'cuerpo': -0.5, 'parpadeo': -1}),
    ]
    html = '<html><body style="background:#faf9f5;display:flex;gap:40px;padding:50px 30px 20px;font:18px Georgia">'
    for nombre, capas, dy in poses:
        html += f'<div><div style="position:relative;width:{t}px;height:{t}px">' + ''.join(img(k, dy.get(k, 0)) for k in capas) + f'</div>{nombre}</div>'
    open(ruta, 'w').write(html + '</body></html>')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--vista', help='escribe una página HTML para ver las poses')
    ap.add_argument('--dashboard', default='dashboard.html')
    ap.add_argument('--solo-vista', action='store_true', help='no toca dashboard.html')
    a = ap.parse_args()
    out = generar()
    if not a.solo_vista: actualizar_dashboard(out, a.dashboard)
    if a.vista: vista(out, a.vista)
    print('Capas listas:', sum(len(v) for v in out.values()), 'caracteres en base64')
