from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "webos" / "logo-transparent-fixed.gif"

if not SOURCE.exists():
    raise SystemExit(f"Logo não encontrado: {SOURCE}")

with Image.open(SOURCE) as original:
    original.seek(0)
    logo = original.convert("RGBA")

def create_icon(size: int, target_name: str) -> None:
    image = logo.copy()
    image.thumbnail((int(size * 0.82), int(size * 0.82)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (8, 6, 13, 255))
    x = (size - image.width) // 2
    y = (size - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    target = ROOT / "webos" / target_name
    canvas.convert("RGB").save(target, format="PNG", optimize=True)
    print(f"Ícone {size}x{size} gerado: {target}")

create_icon(80, "icon.png")
create_icon(130, "large-icon.png")
