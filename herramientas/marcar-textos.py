"""
Marca en las páginas los textos y fotos que el panel puede editar.

A cada texto le pone data-cms="clave" y a cada foto data-cms-img="clave". El
panel guarda los cambios con esa clave y el servidor los aplica al servir la
página. Lo que se repite en todas las páginas (cabecera, pie, ventanas de
consulta, cierre "Todo empieza con una conversación") lleva una clave común
("g-..."), así se corrige una vez y cambia en toda la web.

Se puede volver a correr cuando se agregue una página: las marcas que ya
existen se respetan y solo se numeran las nuevas.

    python3 herramientas/marcar-textos.py
"""
import re
from html.parser import HTMLParser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAGINAS = ['index', 'proyectos', 'familias', 'somos', 'contacto', 'terminos',
           'politica-privacidad', 'libro-reclamaciones', 'alameda-real', 'las-gaviotas-de-reque']
# En estas el contenido principal lo arma el panel de proyectos.
PAGINAS_PROYECTO = {'alameda-real', 'las-gaviotas-de-reque'}

ETIQUETAS_TEXTO = {'h1', 'h2', 'h3', 'h4', 'p', 'figcaption', 'li', 'dt', 'dd'}
VACIAS = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'area', 'col', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline'}
# Dentro de un texto editable solo puede haber esto (sin atributos).
INTERNAS_OK = re.compile(r'</?(br|strong|em|b|i|span)\s*/?>', re.I)

def clases(attrs):
    return set((dict(attrs).get('class') or '').split())

def bloque_global(tag, attrs):
    c, a = clases(attrs), dict(attrs)
    if tag == 'header' and 'site-header' in c: return 'cabecera'
    if 'topline' in c: return 'franja'
    if tag == 'footer' and 'site-footer' in c: return 'pie'
    if tag == 'dialog' and a.get('id') == 'contact-dialog': return 'consulta'
    if tag == 'dialog' and a.get('id') == 'finder-dialog': return 'buscador'
    if tag == 'section' and 'cta-section' in c: return 'cierre'
    return None

def excluida(tag, attrs, pagina):
    c, a = clases(attrs), dict(attrs)
    if tag in ('script', 'style', 'form', 'select', 'svg', 'template'): return True
    if c & {'project-cards', 'gallery-widget', 'wa-chat', 'site-loader', 'visually-hidden', 'project-card'}: return True
    if 'data-finder-choices' in a or 'data-finder-result' in a: return True
    if tag == 'dialog' and a.get('id') == 'photo-dialog': return True
    if tag == 'main' and pagina in PAGINAS_PROYECTO: return True
    return False

class Marcador(HTMLParser):
    def __init__(self, html, pagina):
        super().__init__(convert_charrefs=False)
        self.html, self.pagina = html, pagina
        self.lineas = [0]
        for m in re.finditer('\n', html): self.lineas.append(m.end())
        self.pila = []          # (tag, attrs, inicio, fin_apertura, bloque, excluido)
        self.textos = []        # (fin_apertura_sin_>, inicio_cierre, bloque, tag, attrs)
        self.imagenes = []

    def pos(self):
        l, c = self.getpos()
        return self.lineas[l - 1] + c

    def contexto(self):
        bloque = next((b[4] for b in reversed(self.pila) if b[4]), None)
        fuera = any(b[5] for b in self.pila)
        return bloque, fuera

    def handle_starttag(self, tag, attrs):
        inicio = self.pos()
        texto = self.get_starttag_text()
        fin = inicio + len(texto)
        bloque_padre, fuera = self.contexto()
        if tag == 'img':
            a = dict(attrs)
            if not fuera and 'data-cms-img' not in a and 'brand-symbol' not in clases(attrs) \
               and not any(b[0] in ('header', 'footer') for b in self.pila) \
               and any(b[0] == 'main' for b in self.pila):
                self.imagenes.append((fin - (2 if texto.endswith('/>') else 1), bloque_padre))
            return
        if tag in VACIAS: return
        bloque = bloque_global(tag, attrs)
        self.pila.append((tag, attrs, inicio, fin, bloque, excluida(tag, attrs, self.pagina)))

    def handle_endtag(self, tag):
        if tag in VACIAS: return
        while self.pila:
            t, attrs, inicio, fin, bloque, excl = self.pila.pop()
            if t == tag: break
        else:
            return
        bloque_padre, fuera = self.contexto()
        if excl or fuera: return
        c = clases(attrs)
        padre = self.pila[-1] if self.pila else None
        candidato = t in ETIQUETAS_TEXTO or (t == 'span' and c & {'eyebrow', 'topline-message'}) \
            or (t in ('strong', 'span') and padre and padre[0] == 'div' and len(self.pila) > 1
                and 'about-numbers' in clases(self.pila[-2][1]))
        if not candidato or 'data-cms' in dict(attrs) or 'data-cms-cuenta' in dict(attrs): return
        interior = self.html[fin:self.pos()]
        sin = INTERNAS_OK.sub('', interior)
        if '<' in sin or not sin.strip(): return
        # Si su padre también será editable, no se marca el hijo (p. ej. <li><span>).
        self.textos.append((fin - 1, bloque or bloque_padre, t, attrs, interior))

def marcar(pagina, existentes):
    ruta = RAIZ / f'{pagina}.html'
    html = ruta.read_text()
    m = Marcador(html, pagina)
    m.feed(html)
    inserciones = []
    cuenta = {}
    def clave(bloque, tipo):
        base = f'g-{bloque}' if bloque else pagina
        base = f'{tipo}{base}'
        cuenta[base] = cuenta.get(base, 0) + 1
        return f'{base}-{cuenta[base]}'
    for fin, bloque, t, attrs, interior in m.textos:
        if t == 'strong' and interior.strip() in ('02',) and pagina == 'somos':
            inserciones.append((fin, ' data-cms-cuenta="proyectos"'))
            continue
        inserciones.append((fin, f' data-cms="{clave(bloque, "")}"'))
    for fin, bloque in m.imagenes:
        inserciones.append((fin, f' data-cms-img="{clave(bloque, "img-")}"'))
    for fin, attr in sorted(inserciones, reverse=True):
        html = html[:fin] + attr + html[fin:]
    ruta.write_text(html)
    return len(m.textos), len(m.imagenes)

if __name__ == '__main__':
    for p in PAGINAS:
        if 'data-cms=' in (RAIZ / f'{p}.html').read_text():
            print(p, 'ya marcada'); continue
        print(p, *marcar(p, set()))
