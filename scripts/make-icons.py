#!/usr/bin/env python3
"""
Rigenera logo e icone della webapp dai sorgenti in `media/`.

Le sorgenti arrivano da un generatore di immagini. Due insidie note:

1. Un badge **"Made with AI"** in alto a destra (banda separata dal soggetto).
2. Nel favicon il testo **"MD2DW" è un foro trasparente** dentro il cerchio:
   va riempito di bianco, altrimenti l'icona mostra un buco.

Produce in `public/`:
  logo.png, logo@2x.png            wordmark per l'header (trasparente)
  icon-{512,192,180,96,48,32}.png  icone PWA / apple-touch
  favicon.ico                      .ico multisize
  icon-512-maskable.png            sfondo pieno (safe zone Android)

Uso:
    python3 scripts/make-icons.py

Richiede Pillow e numpy (`pip install pillow numpy`).
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("Servono Pillow e numpy: pip install pillow numpy")

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
OUT = ROOT / "public"

LOGO_SRC = MEDIA / "M2D.png"
ICON_SRC = MEDIA / "m2d favicon.png"

# Fascia del badge "Made with AI" (in alto) da ignorare nel logo.
BADGE_MAX_Y = 60

MASKABLE_BG = (22, 21, 27, 255)


def content_box(mask: np.ndarray, pad: int = 0) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    if len(ys) == 0:
        raise ValueError("nessun contenuto trovato nell'immagine")
    return (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        int(xs.max()) + 1 + pad,
        int(ys.max()) + 1 + pad,
    )


def build_logo() -> None:
    """Ritaglia il wordmark (senza il badge) e produce logo.png.

    L'immagine è mostrata a ~120px di larghezza nell'header: la tengo a 400px
    (oltre 3× su schermi retinati) per non appesantire la pagina.
    """
    im = Image.open(LOGO_SRC).convert("RGBA")
    alpha = np.asarray(im)[:, :, 3]
    mask = alpha > 16
    mask[:BADGE_MAX_Y, :] = False  # via la fascia del badge
    im = im.crop(content_box(mask))

    max_width = 400
    if im.width > max_width:
        im = im.resize((max_width, round(im.height * max_width / im.width)), Image.LANCZOS)

    im.save(OUT / "logo.png", optimize=True)
    print(f"logo.png {im.size}")


def build_icon() -> Image.Image:
    """Ritaglia il cerchio, riempie le lettere forate e produce tutte le icone."""
    im = Image.open(ICON_SRC).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    alpha = arr[:, :, 3]
    height, width = alpha.shape

    # 1. Sagoma del cerchio: bbox del contenuto, poi un disco pieno.
    ys, xs = np.where(alpha > 10)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    radius = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2

    # 2. Le lettere sono la zona trasparente DENTRO il cerchio. Uso un disco
    #    leggermente ristretto: così non catturo l'antialias del bordo esterno
    #    (che altrimenti diventerebbe una frangia bianca).
    inner_disc = Image.new("L", (width, height), 0)
    ImageDraw.Draw(inner_disc).ellipse(
        [cx - radius * 0.94, cy - radius * 0.94, cx + radius * 0.94, cy + radius * 0.94], fill=255
    )
    inside = np.asarray(inner_disc).astype(np.float32) / 255.0
    letters = (inside > 0.5) & (alpha < 20)

    # 3. Colore: parto dall'originale, riempio le lettere di bianco. L'alpha
    #    resta quello della sorgente (bordo già antialiased) e diventa 255 solo
    #    sotto le lettere.
    rgb = arr[:, :, :3].copy()
    final_alpha = alpha.copy()
    if letters.any():
        mean_color = rgb[alpha > 200].reshape(-1, 3).mean(axis=0)
        rgb[letters] = mean_color
        rgb[letters] = [255, 255, 255]
        final_alpha[letters] = 255

    icon = Image.fromarray(np.dstack([rgb, final_alpha]).astype(np.uint8), "RGBA")
    icon = icon.crop(content_box(final_alpha > 10, pad=2))

    # 3. Quadrato (proporzioni non perfette nella sorgente).
    side = max(icon.size)
    if icon.size != (side, side):
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2), icon)
        icon = square

    for size in (512, 192, 180, 96, 48, 32):
        resized = icon.resize((size, size), Image.LANCZOS)
        # Le icone sono gradienti semplici: 256 colori bastano e riducono molto
        # il peso (300K -> ~35K sulla 512) senza differenze visibili.
        resized.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
            OUT / f"icon-{size}.png", optimize=True
        )

    icon.resize((256, 256), Image.LANCZOS).save(
        OUT / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # 4. maskable: sfondo pieno, contenuto nell'80% centrale (safe zone Android).
    canvas_side, inner = 512, int(512 * 0.80)
    canvas = Image.new("RGBA", (canvas_side, canvas_side), MASKABLE_BG)
    resized = icon.resize((inner, inner), Image.LANCZOS)
    canvas.paste(resized, ((canvas_side - inner) // 2, (canvas_side - inner) // 2), resized)
    canvas.convert("RGB").quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
        OUT / "icon-512-maskable.png", optimize=True
    )

    print(f"icona {icon.size} -> icon-*.png, favicon.ico, icon-512-maskable.png (lettere riempite: {int(letters.sum())} px)")
    return icon


def main() -> None:
    if not LOGO_SRC.exists() or not ICON_SRC.exists():
        sys.exit(f"Servono {LOGO_SRC} e {ICON_SRC}")
    OUT.mkdir(exist_ok=True)
    build_logo()
    build_icon()


if __name__ == "__main__":
    main()
