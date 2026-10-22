"""Baja la clasificación GICS (sector y subindustria) de las empresas del S&P 500, 400 y 600
desde Wikipedia y escribe el SQL que la guarda en la tabla gics_indices. Son datos públicos;
no se lee nada de la base."""
import csv
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

PAGINAS = {
    'S&P 500': 'List of S&P 500 companies',
    'S&P 400': 'List of S&P 400 companies',
    'S&P 600': 'List of S&P 600 companies',
}
AGENTE = 'FinanzasApp/1.0 (https://github.com/abelalejandroperezreynoso/finanzas)'


class Tablas(HTMLParser):
    """Junta cada <table> como lista de renglones de texto."""

    def __init__(self):
        super().__init__()
        self.tablas, self.pila = [], []
        self.renglon, self.celda = None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.pila.append([])
        elif tag == 'tr' and self.pila:
            self.renglon = []
        elif tag in ('td', 'th') and self.renglon is not None:
            self.celda = []

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.celda is not None and self.renglon is not None:
            self.renglon.append(' '.join(''.join(self.celda).split()))
            self.celda = None
        elif tag == 'tr' and self.renglon is not None and self.pila:
            self.pila[-1].append(self.renglon)
            self.renglon = None
        elif tag == 'table' and self.pila:
            self.tablas.append(self.pila.pop())

    def handle_data(self, data):
        if self.celda is not None:
            self.celda.append(data)


def leer(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': AGENTE}), timeout=60) as r:
        return r.read().decode('utf-8')


def bajar(pagina):
    """El HTML de la página. Wikipedia a veces contesta 429 a los servidores compartidos: se
    prueban sus dos puertas y se reintenta con espera creciente."""
    titulo = urllib.parse.quote(pagina.replace(' ', '_'), safe='')
    rest = f'https://en.wikipedia.org/api/rest_v1/page/html/{titulo}'
    api = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode(
        {'action': 'parse', 'page': pagina, 'prop': 'text', 'format': 'json', 'formatversion': '2'})
    for intento in range(6):
        try:
            if intento % 2 == 0:
                return leer(rest)
            return json.loads(leer(api))['parse']['text']
        except Exception as e:
            print(f'Reintento {pagina}: {e}', file=sys.stderr)
            time.sleep(5 * 2 ** intento)
    return None


def respaldo_sp500():
    """Copia en CSV de la misma tabla del S&P 500, mantenida en GitHub."""
    texto = leer('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv')
    for fila in csv.DictReader(io.StringIO(texto)):
        if fila.get('Symbol') and fila.get('GICS Sector') and fila.get('GICS Sub-Industry'):
            yield fila['Symbol'].strip().upper(), fila['GICS Sector'].strip(), fila['GICS Sub-Industry'].strip()


def empresas(html):
    p = Tablas()
    p.feed(html)
    for tabla in p.tablas:
        if not tabla:
            continue
        cab = [c.lower() for c in tabla[0]]
        col = lambda *nombres: next((i for i, c in enumerate(cab) if any(n in c for n in nombres)), None)
        i_ticker, i_sector, i_sub = col('symbol', 'ticker'), col('gics sector'), col('sub-industry')
        if None in (i_ticker, i_sector, i_sub):
            continue
        for fila in tabla[1:]:
            if len(fila) <= max(i_ticker, i_sector, i_sub):
                continue
            ticker = fila[i_ticker].strip().upper()
            if ticker and fila[i_sector] and fila[i_sub]:
                yield ticker, fila[i_sector].strip(), fila[i_sub].strip()
        return


def texto_sql(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    filas, indices = {}, []
    for indice, pagina in PAGINAS.items():
        html = bajar(pagina)
        lista = list(empresas(html)) if html else []
        if len(lista) < 300 and indice == 'S&P 500':
            lista = list(respaldo_sp500())
        print(f'{indice}: {len(lista)} empresas', file=sys.stderr)
        # Si un índice no se pudo leer bien, se deja como estaba en la base
        if len(lista) < 300:
            print(f'{indice}: se omite esta vez', file=sys.stderr)
            continue
        indices.append(indice)
        for ticker, sector, sub in lista:
            # Wikipedia escribe BRK.B; la app y Finnhub, BRK-B. Se guardan las dos.
            for t in {ticker, ticker.replace('.', '-')}:
                filas.setdefault(t, (sector, sub, indice))
        time.sleep(3)
    if not indices:
        sys.exit('No se pudo leer ningún índice')
    valores = ',\n'.join(f'({texto_sql(t)}, {texto_sql(s)}, {texto_sql(b)}, {texto_sql(i)})'
                         for t, (s, b, i) in sorted(filas.items()))
    lista_indices = ', '.join(texto_sql(i) for i in indices)
    print(f"""BEGIN;
CREATE TEMP TABLE gics_nuevos (ticker text, sector text, subindustria text, indice text) ON COMMIT DROP;
INSERT INTO gics_nuevos VALUES
{valores};
INSERT INTO public.gics_indices (ticker, sector, subindustria, indice, actualizado_en)
SELECT ticker, sector, subindustria, indice, now() FROM gics_nuevos
ON CONFLICT (ticker) DO UPDATE SET sector = EXCLUDED.sector, subindustria = EXCLUDED.subindustria,
    indice = EXCLUDED.indice, actualizado_en = now();
-- Las que salieron de un índice que sí se leyó
DELETE FROM public.gics_indices g
WHERE g.indice IN ({lista_indices}) AND NOT EXISTS (SELECT 1 FROM gics_nuevos n WHERE n.ticker = g.ticker);
COMMIT;""")


if __name__ == '__main__':
    main()
