#!/usr/bin/env python3
"""Genera los iconos PNG de IASolges.v2 en todos los tamanos habituales de hicolor."""
import os
from PIL import Image, ImageDraw

SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
OUT = os.path.join(os.path.dirname(__file__), '..', 'build', 'icons')
SCALE = 4  # supermuestreo para bordes suaves


def rounded_rect_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(size):
    s = size * SCALE
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Fondo con degradado diagonal azul -> cian
    grad = Image.new('RGB', (s, s))
    gp = grad.load()
    c1 = (29, 78, 216)     # #1d4ed8
    c2 = (14, 165, 233)    # #0ea5e9
    for y in range(s):
        for x in range(0, s, 4):
            t = (x + y) / (2 * (s - 1))
            col = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
            for k in range(4):
                if x + k < s:
                    gp[x + k, y] = col
    img.paste(grad, (0, 0))

    mask = rounded_rect_mask(s, int(s * 0.22))
    img.putalpha(mask)

    w = max(2, int(s * 0.055))  # grosor de linea proporcional
    cx, cy = s // 2, int(s * 0.42)
    r = int(s * 0.19)

    # Anillo de la "IA"
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=w)
    # Nucleo
    rr = int(s * 0.062)
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 255, 255, 255))

    # Hombro / base del robot
    d.arc([cx - int(s * 0.27), cy + int(s * 0.10), cx + int(s * 0.27), cy + int(s * 0.46)],
          start=200, end=340, fill=(255, 255, 255, 255), width=w)

    # Linea inferior (base / barra de estado)
    y0 = int(s * 0.80)
    d.line([int(s * 0.26), y0, int(s * 0.74), y0], fill=(255, 255, 255, 255), width=w)

    img = img.resize((size, size), Image.LANCZOS)
    return img


def main():
    out = os.path.abspath(OUT)
    os.makedirs(out, exist_ok=True)
    for size in SIZES:
        img = make_icon(size)
        folder = os.path.join(out, f'{size}x{size}', 'apps')
        os.makedirs(folder, exist_ok=True)
        img.save(os.path.join(folder, 'iasolges-v2.png'))
        if size == 512:
            img.save(os.path.join(out, '512x512.png'))
    # icono maestro
    make_icon(1024).save(os.path.join(out, 'icon.png'))
    print(f'Iconos generados en {out}')


if __name__ == '__main__':
    main()