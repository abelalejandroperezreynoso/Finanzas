"""Robotito del asistente: dibuja en pixeles (64x80) cada capa del personaje y las
guarda como PNG dentro de dashboard.html (constante ROBOT_PNG).

Uso (desde la raíz del repo):
    python3 herramientas/robotito.py            # actualiza ROBOT_PNG en dashboard.html
    python3 herramientas/robotito.py --vista robotito.html   # además, una página para ver las poses

Cómo está hecho:
- Todo se dibuja con figuras simples (esfera, cilindro, cápsula, disco) sombreadas con una
  luz desde arriba a la izquierda y un tramado de 4x4; al final se le pone contorno.
- Coordenadas en pixeles del personaje: x de 0 a 63, y de 0 a 79 (y crece hacia abajo).
  En la app se ve a doble tamaño: 1 pixel del personaje = 2 px de CSS.
- Cada capa se dibuja sola para animarla en CSS (.robotito en dashboard.html). Las partes
  ocultas (cuello largo, piernas que suben detrás del cuerpo) sólo se ven al estirarse.
- Colores: METAL (acero, de oscuro a claro), HULE (piezas negras), ORO (líneas doradas),
  CINTA (cinturón) y los de luces, lentes y pantalla.
- Para un estado nuevo de la cara: agrégalo en ojos() y en CARAS; luego úsalo en
  personajeAsistenteHtml() y sube CACHE_NAME en sw.js.

Requiere Pillow (pip install pillow).
"""
import sys, math, io, base64, re, argparse

W, H = 64, 80
CX = 32
METAL = ['#2a2724', '#423e39', '#5c5750', '#78726a', '#958f85', '#b1aba0', '#cbc6bb', '#e6e2d8', '#f7f4ec']
HULE = ['#161514', '#22211f', '#302e2b', '#43403b', '#5a5650']
ORO = ['#8a6224', '#c08a38', '#e2ad55', '#f6d58c']
CINTA = ['#2d2c25', '#3d3b32', '#4f4c40', '#64604f', '#7a7561']
VIDRIO = '#121418'
ROJO = ['#6e1d17', '#c23a2e', '#ff6a55', '#ffc4b8']
VERDE = ['#1b5a2a', '#36a052', '#6fe08a', '#d4ffd8']
TEAL = ['#123f45', '#1f7480', '#3fb8c4', '#a6f0f2']
NARANJA = ['#6e2f1c', '#a8432a', '#d97757', '#f0a080', '#ffd3b8']
K = '#1d1b19'
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
L = (-0.55, -0.5, 0.67)
_n = math.sqrt(sum(c * c for c in L)); L = tuple(c / _n for c in L)


class G:
    def __init__(s): s.c = [[None] * W for _ in range(H)]
    def set(s, x, y, col):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H: s.c[y][x] = col
    def get(s, x, y):
        x, y = int(x), int(y)
        return s.c[y][x] if 0 <= x < W and 0 <= y < H else None


def tono(i, x, y, ramp=METAL, amb=0.16, brillo=True):
    v = amb * 0.6 + (1 - amb) * 0.95 * max(0, i) ** 1.3
    if brillo and i > 0.95: v += 0.18
    t = v * (len(ramp) - 1) + (BAYER[y % 4][x % 4] / 16 - 0.5) * 0.5
    return ramp[max(0, min(len(ramp) - 1, round(t)))]


def luz(nx, ny, nz): return nx * L[0] + ny * L[1] + nz * L[2]


def esfera(g, cx, cy, rx, ry, ramp=METAL, y0=-99, y1=999, borde=True, amb=0.16):
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(W):
            dx = (x + 0.5 - cx) / rx; dy = (y + 0.5 - cy) / ry; d = dx * dx + dy * dy
            if d <= 1:
                col = tono(luz(dx, dy, math.sqrt(1 - d)), x, y, ramp, amb)
                if borde and d > 0.86: col = ramp[1]
                g.set(x, y, col)


def cilindro(g, cx, r, y0, y1, ramp=METAL, borde=True, amb=0.16):
    for y in range(y0, y1 + 1):
        for x in range(W):
            dx = (x + 0.5 - cx) / r
            if abs(dx) <= 1:
                col = tono(luz(dx, 0, math.sqrt(1 - dx * dx)), x, y, ramp, amb)
                if borde and abs(dx) > 0.9: col = ramp[1]
                g.set(x, y, col)


def capsula(g, x0, y0, x1, y1, r, ramp=METAL, borde=True):
    """Tubo redondeado de (x0,y0) a (x1,y1), sombreado como cilindro."""
    vx, vy = x1 - x0, y1 - y0; ll = vx * vx + vy * vy or 1
    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            t = max(0, min(1, ((px - x0) * vx + (py - y0) * vy) / ll))
            dx, dy = (px - x0 - t * vx) / r, (py - y0 - t * vy) / r; d = dx * dx + dy * dy
            if d <= 1:
                col = tono(luz(dx, dy, math.sqrt(1 - d)), x, y, ramp)
                if borde and d > 0.8: col = ramp[1]
                g.set(x, y, col)


def disco(g, cx, cy, r, col):
    for y in range(H):
        for x in range(W):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r: g.set(x, y, col)


def lente(g, cx, cy, r, mira, estado):
    """Ojo de cámara: bisel de metal, aro oscuro, vidrio con reflejos e iris."""
    esfera(g, cx, cy, r, r)
    disco(g, cx, cy, r * 0.8, HULE[1])
    esfera(g, cx, cy, r * 0.8, r * 0.8, ramp=HULE, borde=False)
    if estado == 'parpadeo':
        # obturador cerrado: hojas de metal con una línea al centro
        esfera(g, cx, cy, r * 0.66, r * 0.66, ramp=METAL[1:7], borde=False)
        for x in range(int(cx - r), int(cx + r) + 1):
            if (x + 0.5 - cx) ** 2 <= (r * 0.6) ** 2: g.set(x, cy, METAL[0])
        return
    disco(g, cx, cy, r * 0.62, VIDRIO)
    # iris
    ic = cy + mira
    disco(g, cx, ic, r * 0.36, '#262c36')
    disco(g, cx, ic, r * 0.2, '#07080a')
    # reflejos: arco azul arriba a la izquierda, violeta abajo a la derecha y un brillo
    for y in range(H):
        for x in range(W):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy; d = math.hypot(dx, dy)
            if r * 0.42 < d <= r * 0.6:
                a = math.atan2(dy, dx)
                if -2.7 < a < -1.6: g.set(x, y, '#4f77a6')
                elif 0.3 < a < 1.1: g.set(x, y, '#7a5fb0')
    g.set(cx - r * 0.3, ic - r * 0.3, '#ffffff')
    g.set(cx - r * 0.3 + 1, ic - r * 0.3, '#cfe3ff')
    if estado == 'preocupado':
        # párpado de metal sobre la mitad de arriba
        for y in range(int(cy - r), int(cy)):
            for x in range(W):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= (r * 0.8) ** 2:
                    g.set(x, y, tono(0.6, x, y))
        for x in range(int(cx - r * 0.8), int(cx + r * 0.8) + 1): g.set(x, cy, METAL[1])


def foco(g, cx, cy, r, color, prendido):
    esfera(g, cx, cy, r, r)
    disco(g, cx, cy, r * 0.62, color[1] if prendido else color[0])
    if prendido: disco(g, cx - 0.4, cy - 0.4, r * 0.3, color[3])
    else: g.set(cx - 0.5, cy - 0.5, color[1])


def mano(g, hx, hy, arriba, espejo=False):
    """Mano articulada: palma y tres dedos (abajo, o hacia arriba al estirarse)."""
    s = -1 if arriba else 1
    esfera(g, hx, hy, 3, 2.8)
    for dx, largo in ((-2, 3), (0, 4), (2, 3)):
        capsula(g, hx + dx, hy + s * 2, hx + dx * 1.2, hy + s * (2 + largo), 0.95, borde=False)
    pul = 3.2 if not espejo else -3.2
    capsula(g, hx + pul, hy - s, hx + pul * 1.3, hy + s * 1.5, 0.95, borde=False)


def brazo(g, hombro, codo, muneca, arriba, pantalla, espejo=False):
    (sx, sy), (ex, ey), (wx, wy) = hombro, codo, muneca
    capsula(g, sx, sy, ex, ey, 2.6)
    esfera(g, ex, ey, 2.4, 2.4, ramp=HULE)
    capsula(g, ex, ey + (-1 if arriba else 1), wx, wy, 3.3)
    # línea dorada en el antebrazo
    mx, my = (ex + wx) / 2, (ey + wy) / 2
    for k in range(-2, 3): g.set(mx + k, my - 1 + (k * 0.3 if espejo else -k * 0.3), ORO[2])
    if pantalla:
        px, py = ex + (wx - ex) * 0.62, ey + (wy - ey) * 0.62
        disco(g, px - 1, py, 2.8, HULE[1]); disco(g, px - 1, py, 2.1, TEAL[1])
        g.set(px - 2, py - 1, TEAL[3]); g.set(px - 1, py - 1, TEAL[2]); g.set(px - 1, py, TEAL[2]); g.set(px, py + 1, TEAL[2])
    hy = wy + (-3 if arriba else 3)
    mano(g, wx, hy, arriba, espejo)


def ojos(g, estado):
    mira = -1 if estado == 'pensando' else (1 if estado == 'preocupado' else 0)
    # ojo izquierdo: lente redonda
    lente(g, 20.5, 27, 5.4, mira, estado)
    # cámara: cuerpo que sale del domo, lucecitas sobre soportes y lente grande
    esfera(g, 50, 27.5, 8, 7)
    for y in range(22, 34): g.set(56, y, METAL[2])
    capsula(g, 40, 21, 39.5, 18, 1, borde=False); capsula(g, 54, 21, 55, 17.5, 1, borde=False)
    foco(g, 39, 17, 2.6, ROJO, estado == 'pensando')
    foco(g, 55.5, 16.5, 2.8, VERDE, True)
    lente(g, 45, 28, 8.2, mira, estado)


def robot(estado, partes):
    g = G()
    if 'brazos' in partes:
        brazo(g, (19, 49), (15, 57), (14, 64), False, True)
        brazo(g, (45, 49), (49, 57), (50, 64), False, False, True)
    if 'brazos_arriba' in partes:
        brazo(g, (19, 49), (9, 46), (5, 37), True, True)
        brazo(g, (45, 49), (55, 46), (59, 37), True, False, True)
    if 'piernas' in partes:
        for x in (26, 38):
            cilindro(g, x, 3, 60, 66, ramp=HULE)
            capsula(g, x, 66, x, 70, 3.6)
            esfera(g, x, 71.5, 3, 2.4, ramp=HULE)
            capsula(g, x, 73, x, 76, 3.4)
            for k in (-1, 0, 1): g.set(x + k, 74, ORO[1] if k else ORO[2])
    for nombre, x in (('pie_izq', 25), ('pie_der', 39)):
        if nombre in partes:
            esfera(g, x, 78.2, 6, 3.2, y0=76, y1=78)
            for k in range(-5, 6): g.set(x + k, 79, HULE[1])
            g.set(x - 3, 77, METAL[7])
    if 'cuerpo' in partes:
        # cuello largo de hule con estrías (casi todo queda bajo la cabeza)
        cilindro(g, CX, 6, 33, 46, ramp=HULE)
        for y in range(34, 47, 2):
            for x in range(27, 38): g.set(x, y, HULE[0])
        # cadera
        esfera(g, CX, 63, 10, 5, ramp=HULE)
        # pecho blindado: más ancho arriba
        for y in range(45, 60):
            r = 12.5 - max(0, y - 52) * 0.35
            for x in range(W):
                dx = (x + 0.5 - CX) / r
                if abs(dx) <= 1:
                    dy = (y - 50) / 14
                    col = tono(luz(dx, dy, math.sqrt(max(0, 1 - dx * dx))), x, y)
                    if abs(dx) > 0.9 or y == 45: col = METAL[1]
                    g.set(x, y, col)
        # líneas doradas: cuello del peto y borde de abajo
        for x in range(21, 44):
            u = (x + 0.5 - CX) / 11
            g.set(x, 47 + round(u * u * 2.5), ORO[2] if x < 36 else ORO[1])
            g.set(x, 55 - round(u * u * 1.5), ORO[2] if x < 36 else ORO[1])
        # placa del pecho con remaches
        for x, y in ((27, 50), (37, 50)): g.set(x, y, METAL[1]); g.set(x, y - 1, METAL[8])
        # cinturón con hebilla
        for y in range(57, 61):
            for x in range(W):
                dx = (x + 0.5 - CX) / 12.5
                if abs(dx) <= 1:
                    col = tono(luz(dx, 0, math.sqrt(1 - dx * dx)), x, y, CINTA)
                    if y in (57, 60): col = CINTA[0]
                    g.set(x, y, col)
        for y in range(56, 62):
            for x in range(30, 35): g.set(x, y, METAL[6] if (y in (56, 61) or x in (30, 34)) else METAL[2])
        for x in range(31, 34): g.set(x, 56, METAL[7])
        # bolsa a la izquierda
        for y in range(57, 65):
            for x in range(18, 24):
                g.set(x, y, tono(0.75 - (x - 18) * 0.08, x, y, CINTA))
        for x in range(18, 24): g.set(x, 59, CINTA[0])
        g.set(20, 61, METAL[6])
        # desarmador rojo y punta de prueba
        for y in range(53, 58): g.set(27, y, ROJO[1] if y > 54 else ROJO[2]); g.set(28, y, ROJO[0] if y > 54 else ROJO[1])
        for y in range(58, 63): g.set(27, y, METAL[5]); g.set(28, y, METAL[3])
        # llave inglesa
        for y in range(55, 62): g.set(39, y, METAL[5]); g.set(40, y, METAL[3])
        for x, y in ((38, 54), (41, 54), (38, 55), (41, 55)): g.set(x, y, METAL[5])
        g.set(39, 54, METAL[6])
        # hombreras con filo dorado
        for sx in (19, 45):
            esfera(g, sx, 48, 5, 4.5)
            for k in range(-3, 4): g.set(sx + k, 45 + abs(k) // 2, ORO[2] if sx < 32 else ORO[1])
    if 'cabeza' in partes:
        prendido = estado == 'pensando'
        # perilla de arriba
        cilindro(g, CX, 2.2, 4, 10)
        cilindro(g, CX, 4.2, 1, 4, ramp=NARANJA if prendido else METAL)
        for x in range(28, 37):
            if g.get(x, 1): g.set(x, 1, NARANJA[4] if prendido else METAL[7])
        # domo y parte recta
        esfera(g, CX, 32, 19.5, 22.5, y0=9, y1=31)
        cilindro(g, CX, 19.5, 32, 36)
        for (x, y) in ((22, 14), (23, 13), (24, 13), (25, 12)): g.set(x, y, METAL[8])
        # costura dorada siguiendo la curva del domo
        for y in range(10, 37):
            dy = max(0, (32 - y) / 22.5); w = math.sqrt(max(0, 1 - dy * dy))
            x = round(CX + 7 * w)
            if g.get(x, y): g.set(x - 1, y, METAL[2]); g.set(x, y, ORO[2] if y < 26 else ORO[1])
        # ala
        for y in range(36, 43):
            for x in range(W):
                dx = (x + 0.5 - CX) / 24
                if abs(dx) <= 1 - max(0, (y - 40)) * 0.03:
                    if y <= 37: col = tono(0.95 if dx < 0.25 else 0.7, x, y)
                    elif y == 38: col = METAL[2]
                    elif y <= 40: col = tono(0.62 - dx * 0.45, x, y)
                    elif y == 41: col = tono(0.3 - dx * 0.3, x, y)
                    else: col = METAL[0]
                    if abs(dx) > 0.96: col = METAL[1]
                    g.set(x, y, col)
        ojos(g, estado)
        # lucecitas en la cabeza junto a la costura
        g.set(37, 34, ROJO[2] if prendido else ROJO[1]); g.set(37, 36, VERDE[2])
    # contorno exterior
    borde = [(x, y) for y in range(H) for x in range(W)
             if g.get(x, y) is None and any(g.get(x + a, y + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in borde: g.set(x, y, K)
    return g


def png(g):
    from PIL import Image
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
    e = 3  # escala de la vista previa
    capa = lambda k, dy=0: f'<img src="data:image/png;base64,{out[k]}" style="position:absolute;width:{(W + 2) * e}px;top:{dy * e}px;image-rendering:pixelated">'
    poses = [
        ('Normal', ['piernas', 'pie_izq', 'pie_der', 'brazos', 'cuerpo', 'normal'], {}),
        ('Pensando', ['piernas', 'pie_izq', 'pie_der', 'brazos', 'cuerpo', 'pensando'], {}),
        ('Parpadeo', ['piernas', 'pie_izq', 'pie_der', 'brazos', 'cuerpo', 'parpadeo'], {}),
        ('Estirado', ['piernas', 'pie_izq', 'pie_der', 'brazos_arriba', 'cuerpo', 'parpadeo'], {'brazos_arriba': -1, 'cuerpo': -1, 'parpadeo': -3}),
    ]
    html = '<html><body style="background:#faf9f5;display:flex;gap:24px;padding:20px;font:18px Georgia">'
    for t, capas, dy in poses:
        html += f'<div><div style="position:relative;width:{(W + 2) * e}px;height:{(H + 2) * e}px">' + ''.join(capa(k, dy.get(k, 0)) for k in capas) + f'</div>{t}</div>'
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
