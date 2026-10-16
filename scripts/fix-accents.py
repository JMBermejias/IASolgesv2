#!/usr/bin/env python3
"""
IASolges.v2 - Corrector ortografico automatico de textos visibles
Sustituye palabras mal escritas (sin ñ ni tildes) SOLO dentro de:
  - cadenas simples y dobles
  - plantillas (la parte literal, fuera de ${...})
  - texto JSX (entre etiquetas), unicamente en ficheros .jsx
Nunca toca identificadores, claves, rutas, canales IPC ni expresiones de codigo.
"""
import io
import os
import re
import sys

MAPA = {
    # --- con Ñ ---
    'senal': 'señal', 'senales': 'señales', 'senalizacion': 'señalización',
    'senalizado': 'señalizado', 'senalizadas': 'señalizadas', 'senalada': 'señalada',
    'pequeno': 'pequeño', 'pequena': 'pequeña', 'pequenos': 'pequeños', 'pequenas': 'pequeñas',
    'diseno': 'diseño', 'disenos': 'diseños',
    'tamano': 'tamaño', 'tamanos': 'tamaños',
    'anio': 'año', 'ano': 'año', 'anos': 'años',
    'anadir': 'añadir', 'anade': 'añade', 'anaden': 'añaden', 'anadido': 'añadido',
    'campana': 'campaña', 'campanas': 'campañas',
    'montano': 'montaña', 'montanas': 'montañas',
    'acompanamiento': 'acompañamiento', 'acompanada': 'acompañada', 'acompanado': 'acompañado',
    'companias': 'compañías', 'comania': 'comanía',
    'ingenieria': 'ingeniería',
    'nino': 'niño', 'ninos': 'niños', 'nina': 'niña',
    'manana': 'mañana',
    # --- con tilde ---
    'analisis': 'análisis',
    'aplicacion': 'aplicación', 'aplicaciones': 'aplicaciones',
    'automatizacion': 'automatización',
    'automatico': 'automático', 'automatica': 'automática',
    'automaticos': 'automáticos', 'automaticas': 'automáticas',
    'automaticamente': 'automáticamente',
    'busqueda': 'búsqueda', 'busquedas': 'búsquedas',
    'cercania': 'cercanía',
    'inversion': 'inversión', 'direccion': 'dirección', 'direcciones': 'direcciones',
    'ubicacion': 'ubicación', 'ubicaciones': 'ubicaciones',
    'localizacion': 'localización', 'localizaciones': 'localizaciones',
    'configuracion': 'configuración',
    'actualizacion': 'actualización', 'actualizaciones': 'actualizaciones',
    'autoactualizacion': 'autoactualización',
    'publicacion': 'publicación', 'publicaciones': 'publicaciones',
    'sincronizacion': 'sincronización',
    'integracion': 'integración', 'integraciones': 'integraciones',
    'validacion': 'validación', 'gestion': 'gestión', 'capacitacion': 'capacitación',
    'formacion': 'formación', 'documentacion': 'documentación',
    'exportacion': 'exportación', 'importacion': 'importación',
    'creacion': 'creación', 'revision': 'revisión', 'sesion': 'sesión', 'sesiones': 'sesiones',
    'conexion': 'conexión', 'conexiones': 'conexiones',
    'produccion': 'producción', 'ejecucion': 'ejecución', 'redaccion': 'redacción',
    'definicion': 'definición', 'ilustracion': 'ilustración',
    'animacion': 'animación', 'animaciones': 'animaciones',
    'imagenes': 'imágenes',
    'analitica': 'analítica', 'logistica': 'logística',
    'practica': 'práctica', 'practicas': 'prácticas', 'practico': 'práctico',
    'tecnico': 'técnico', 'tecnica': 'técnica', 'tecnicos': 'técnicos', 'tecnicas': 'técnicas',
    'practicamente': 'prácticamente', 'tecnicamente': 'técnicamente',
    'basico': 'básico', 'basica': 'básica', 'basicos': 'básicos', 'basicas': 'básicas',
    'generico': 'genérico', 'generica': 'genérica',
    'dinamico': 'dinámico', 'dinamica': 'dinámica',
    'grafico': 'gráfico', 'grafica': 'gráfica', 'graficos': 'gráficos',
    'estatico': 'estático', 'estatica': 'estática',
    'electronico': 'electrónico', 'electronica': 'electrónica',
    'informatico': 'informático', 'informatica': 'informática',
    'economico': 'económico', 'economica': 'económica',
    'logico': 'lógico', 'logica': 'lógica',
    'publico': 'público', 'publica': 'pública', 'publicos': 'públicos',
    'telefono': 'teléfono', 'telefonos': 'teléfonos',
    'movil': 'móvil', 'menu': 'menú',
    'numero': 'número', 'numeros': 'números',
    'maximo': 'máximo', 'minimo': 'mínimo',
    'limite': 'límite', 'limites': 'límites',
    'ultimo': 'último', 'ultima': 'última', 'ultimos': 'últimos',
    'proximo': 'próximo', 'proxima': 'próxima',
    'codigo': 'código', 'codigos': 'códigos',
    'metodo': 'método', 'metodos': 'métodos',
    'categoria': 'categoría', 'categorias': 'categorías',
    'geografica': 'geográfica', 'geografico': 'geográfico',
    'geografia': 'geografía', 'tecnologia': 'tecnología', 'tecnologias': 'tecnologías',
    'energia': 'energía', 'linea': 'línea', 'lineas': 'líneas',
    'pagina': 'página', 'paginas': 'páginas',
    'posicion': 'posición', 'programacion': 'programación',
    'solucion': 'solución', 'soluciones': 'soluciones',
    'informacion': 'información',
    'descripcion': 'descripción', 'descripciones': 'descripción',
    'proteccion': 'protección', 'legislacion': 'legislación',
    'politica': 'política', 'politicas': 'políticas',
    'autonomo': 'autónomo', 'autonoma': 'autónoma', 'autonomos': 'autónomos', 'autonomas': 'autónomas',
    'estetica': 'estética', 'clinica': 'clínica', 'panaderia': 'panadería',
    'cafeteria': 'cafetería', 'hosteleria': 'hostelería', 'peluqueria': 'peluquería',
    'fontaneria': 'fontanería', 'carpinteria': 'carpintería', 'rotulo': 'rótulo',
    'rotulos': 'rótulos', 'vinculo': 'vínculo', 'vinculos': 'vínculos',
    'facturacion': 'facturación', 'domiciliacion': 'domiciliación', 'albaran': 'albarán',
    'simulacion': 'simulación', 'traduccion': 'traducción', 'reproduccion': 'reproducción',
    'composicion': 'composición', 'iluminacion': 'iluminación', 'ventilacion': 'ventilación',
    'calefaccion': 'calefacción', 'instalacion': 'instalación', 'reparacion': 'reparación',
    'fabricacion': 'fabricación', 'confeccion': 'confección',
    'fidelizacion': 'fidelización', 'prospeccion': 'prospección',
}

PATRON_ID = re.compile(r'^[\w\-/:.]+$')
REGEX = re.compile(r'\b(' + '|'.join(sorted((re.escape(k) for k in MAPA), key=len, reverse=True)) + r')\b', re.IGNORECASE)


def es_identificador(texto):
    t = texto.strip()
    if not t:
        return True
    # claves, ids, rutas, eventos, nombres de fichero, clases CSS, variables
    if PATRON_ID.match(t):
        return True
    if re.match(r'^[a-z]+[A-Z]\w*$', t):      # camelCase
        return True
    if re.match(r'^[A-Z][a-z]+$', t):           # palabra simple usada como clave ('analisis')
        return True
    if re.match(r'^[a-z]+$', t):
        return True
    return False


def con_espacios(texto):
    return bool(re.search(r'[a-záéíóúüñ]{3,}', texto, re.IGNORECASE))


def corregir(seg):
    def sub(m):
        palabra = m.group(0)
        fija = MAPA[palabra.lower()]
        if palabra[0].isupper():
            fija = fija[0].upper() + fija[1:]
        return fija
    return REGEX.sub(sub, seg)


def procesar(txt, es_jsx):
    out = []
    i = 0
    n = len(txt)
    cambios = 0
    while i < n:
        c = txt[i]
        if c == '/' and txt[i + 1:i + 2] == '/':
            fin = txt.find('\n', i)
            if fin == -1:
                fin = n
            out.append(txt[i:fin])
            i = fin
            continue
        if c == '/' and txt[i + 1:i + 2] == '*':
            fin = txt.find('*/', i)
            fin = n if fin == -1 else fin + 2
            out.append(txt[i:fin])
            i = fin
            continue
        if c in '\'"':
            j = i + 1
            buf = []
            while j < n:
                if txt[j] == '\\':
                    buf.append(txt[j:j + 2])
                    j += 2
                    continue
                if txt[j] == '\n':
                    break
                if txt[j] == c:
                    break
                buf.append(txt[j])
                j += 1
            contenido = ''.join(buf)
            cerrado = j < n and txt[j] == c
            if cerrado and not es_identificador(contenido):
                nuevo = corregir(contenido)
                if nuevo != contenido:
                    cambios += 1
                out.append(c + nuevo + c)
            else:
                out.append(txt[i:j + 1] if cerrado else txt[i:j])
            i = j + 1 if cerrado else j
            continue
        if c == '`':
            j = i + 1
            buf = []
            while j < n:
                ch = txt[j]
                if ch == '\\':
                    buf.append(txt[j:j + 2])
                    j += 2
                    continue
                if ch == '`':
                    break
                if ch == '$' and txt[j + 1:j + 2] == '{':
                    k = j + 2
                    nivel = 1
                    while k < n:
                        if txt[k] == '{':
                            nivel += 1
                        elif txt[k] == '}':
                            nivel -= 1
                            if nivel == 0:
                                k += 1
                                break
                        elif txt[k] in '\'"`':
                            q = txt[k]
                            k += 1
                            while k < n and txt[k] != q:
                                if txt[k] == '\\':
                                    k += 1
                                k += 1
                        k += 1
                    buf.append('\x00' + txt[j:k] + '\x00')   # la expresion se copia literal
                    j = k
                    continue
                buf.append(ch)
                j += 1
            contenido = ''.join(buf)
            # solo se corrige el texto literal: las expresiones ${...} se dejan intactas
            trozos = contenido.split('\x00')
            nuevo_txt = ''.join(t if (i % 2) else corregir(t) for i, t in enumerate(trozos))
            if nuevo_txt != contenido:
                cambios += 1
            cierra = txt[j:j + 1] if txt[j:j + 1] == '`' else ''
            out.append('`' + nuevo_txt + cierra)
            i = j + 1 if cierra else j
            continue
        if es_jsx and c == '>':
            # texto JSX: hasta <, { o salto de linea
            m = re.match(r'[^\n<{]+', txt[i + 1:])
            if m:
                frag = m.group(0)
                nuevo = corregir(frag)
                if nuevo != frag:
                    cambios += 1
                out.append('>' + nuevo)
                i += 1 + len(frag)
                continue
        out.append(c)
        i += 1
    return ''.join(out), cambios


def main():
    bases = sys.argv[1:] or ['src', 'electron']
    ficheros = []
    for base in bases:
        for raiz, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', 'dist-pkg', '.git')]
            for f in files:
                if f.endswith(('.js', '.jsx')):
                    ficheros.append(os.path.join(raiz, f))
    total = 0
    for f in sorted(ficheros):
        txt = io.open(f, encoding='utf-8').read()
        nuevo, cambios = procesar(txt, f.endswith('.jsx'))
        if cambios:
            io.open(f, 'w', encoding='utf-8').write(nuevo)
            print(f'  {f}: {cambios}')
            total += cambios
    print(f'Total: {cambios if False else total} textos corregidos')


if __name__ == '__main__':
    main()