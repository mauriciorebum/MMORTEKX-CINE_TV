from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "webos" / "logo-transparent-fixed.gif"
TARGET = ROOT / "webos" / "icon.png"

if not SOURCE.exists():
    raise SystemExit(f"Logo não encontrado: {SOURCE}")

with Image.open(SOURCE) as original:
    original.seek(0)
    logo = original.convert("RGBA")
    logo.thumbnail((66, 66), Image.Resampling.LANCZOS)

canvas = Image.new("RGBA", (80, 80), (8, 6, 13, 255))
x = (80 - logo.width) // 2
y = (80 - logo.height) // 2
canvas.alpha_composite(logo, (x, y))
canvas.convert("RGB").save(TARGET, format="PNG", optimize=True)
print(f"Ícone gerado: {TARGET}")
