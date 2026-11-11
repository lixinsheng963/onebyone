"""Generate local placeholder art + tabbar icons for the mini program.

These are intentionally abstract "campus atmosphere" images, not stock photos.
Replace them with real campus photos before launch.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "apps" / "miniprogram" / "assets" / "images"
ICON = ROOT / "apps" / "miniprogram" / "assets" / "icons"
IMG.mkdir(parents=True, exist_ok=True)
ICON.mkdir(parents=True, exist_ok=True)

W, H = 1000, 750


def gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (W, H))
    px = image.load()
    for y in range(H):
        t = y / max(1, H - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = color
    return image


def grain(image: Image.Image, amount: int = 10) -> Image.Image:
    noise = Image.effect_noise((W, H), amount).convert("L")
    noise = noise.filter(ImageFilter.GaussianBlur(0.6))
    return Image.blend(image, Image.merge("RGB", (noise, noise, noise)), 0.045)


def vignette(image: Image.Image) -> Image.Image:
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((-W * 0.35, -H * 0.45, W * 1.35, H * 1.45), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(140))
    dark = Image.new("RGB", (W, H), (12, 14, 14))
    return Image.composite(image, dark, mask)


def save(image: Image.Image, name: str) -> None:
    image = vignette(grain(image))
    image.save(IMG / name, quality=88, optimize=True)


def sunset() -> None:
    image = gradient((242, 190, 145), (172, 88, 75))
    d = ImageDraw.Draw(image)
    d.ellipse((620, 110, 790, 280), fill=(255, 227, 169))
    d.rectangle((0, 470, W, H), fill=(64, 56, 55))
    for x, h in [(40, 180), (115, 260), (205, 210), (760, 300), (860, 230), (930, 280)]:
        d.rectangle((x, 470 - h, x + 120, 500), fill=(52, 47, 47))
    for i in range(8):
        y = 300 + i * 35
        d.line((-50, y, W + 50, y - 70), fill=(255, 235, 210, 40), width=2)
    for x, y in [(380, 230), (420, 210), (460, 238), (510, 190)]:
        d.arc((x, y, x + 22, y + 10), 200, 340, fill=(78, 57, 50), width=3)
    save(image, "post-1.jpg")


def food() -> None:
    image = gradient((87, 57, 46), (35, 30, 29))
    d = ImageDraw.Draw(image)
    d.ellipse((190, 310, 820, 670), fill=(238, 221, 190))
    d.ellipse((235, 345, 775, 625), fill=(152, 62, 42))
    d.ellipse((270, 375, 740, 595), fill=(202, 124, 61))
    for i in range(15):
        x = 300 + i * 27
        d.arc((x, 365, x + 150, 595), 190, 350, fill=(242, 205, 132), width=5)
    for x in (340, 440, 560, 660):
        d.ellipse((x, 410, x + 55, 490), fill=(238, 222, 178))
        d.ellipse((x + 8, 425, x + 30, 460), fill=(198, 104, 47))
    for x in (310, 430, 560, 690):
        d.arc((x, 180, x + 90, 330), 110, 250, fill=(245, 230, 210), width=3)
    save(image, "post-2.jpg")


def cat() -> None:
    image = gradient((178, 192, 158), (69, 92, 72))
    d = ImageDraw.Draw(image)
    d.rectangle((0, 590, W, H), fill=(53, 72, 55))
    for _ in range(70):
        x = random.randint(0, W)
        y = random.randint(600, H)
        d.line((x, y, x + random.randint(-8, 8), y - random.randint(12, 35)), fill=(88, 113, 80), width=2)
    d.ellipse((380, 300, 650, 570), fill=(221, 183, 137))
    d.polygon([(390, 330), (420, 210), (500, 300)], fill=(221, 183, 137))
    d.polygon([(580, 300), (640, 210), (655, 340)], fill=(221, 183, 137))
    d.ellipse((445, 380, 485, 420), fill=(49, 57, 45))
    d.ellipse((545, 380, 585, 420), fill=(49, 57, 45))
    d.polygon([(505, 430), (525, 430), (515, 444)], fill=(151, 94, 83))
    d.arc((475, 430, 555, 480), 10, 170, fill=(96, 69, 57), width=3)
    d.arc((320, 390, 430, 540), 250, 70, fill=(221, 183, 137), width=17)
    d.arc((420, 260, 640, 440), 200, 330, fill=(247, 231, 205), width=2)
    save(image, "post-3.jpg")


def rain() -> None:
    image = gradient((115, 139, 153), (52, 72, 80))
    d = ImageDraw.Draw(image)
    d.rectangle((0, 510, W, H), fill=(50, 67, 69))
    d.arc((-100, 530, 650, 980), 180, 350, fill=(197, 213, 211), width=5)
    d.arc((340, 500, 1120, 990), 170, 360, fill=(197, 213, 211), width=5)
    for i in range(80):
        x = random.randint(0, W)
        y = random.randint(0, H)
        d.line((x, y, x - 3, y + 18), fill=(204, 220, 225), width=1)
    for i in range(20):
        x = random.randint(0, W)
        y = random.randint(540, 700)
        d.line((x, y, x + random.randint(10, 60), y), fill=(110, 131, 132), width=2)
    d.ellipse((730, 90, 780, 140), fill=(230, 220, 197))
    save(image, "post-4.jpg")


def stage() -> None:
    image = gradient((31, 27, 48), (10, 12, 20))
    d = ImageDraw.Draw(image)
    d.rectangle((0, 560, W, H), fill=(24, 25, 30))
    d.polygon([(250, 0), (520, 520), (700, 520), (450, 0)], fill=(148, 64, 62))
    d.polygon([(760, 0), (600, 520), (730, 520), (900, 0)], fill=(52, 92, 112))
    d.ellipse((370, 280, 450, 450), fill=(20, 19, 24))
    d.rectangle((390, 430, 440, 560), fill=(20, 19, 24))
    d.ellipse((500, 240, 580, 410), fill=(20, 19, 24))
    d.rectangle((520, 390, 570, 560), fill=(20, 19, 24))
    for x in range(0, W, 80):
        d.line((x, 560, x + 40, H), fill=(42, 45, 53), width=2)
    save(image, "post-5.jpg")


def books() -> None:
    image = gradient((182, 144, 99), (92, 67, 49))
    d = ImageDraw.Draw(image)
    d.rectangle((0, 480, W, H), fill=(73, 53, 41))
    for y, color in [(430, (231, 211, 174)), (470, (212, 174, 124)), (520, (155, 85, 63)), (565, (232, 220, 190))]:
        d.rectangle((90, y, 900, y + 28), fill=color)
        for x in range(100, 890, 24):
            d.line((x, y + 4, x, y + 24), fill=(255, 255, 255, 25), width=1)
    d.rectangle((170, 120, 760, 430), fill=(240, 224, 193))
    d.rectangle((195, 145, 735, 405), outline=(161, 125, 88), width=3)
    for i in range(7):
        d.line((230, 185 + i * 26, 690, 185 + i * 26), fill=(184, 150, 112), width=2)
    d.polygon([(480, 120), (760, 250), (760, 330), (480, 200)], fill=(224, 202, 167))
    d.line((480, 120, 480, 200), fill=(161, 125, 88), width=2)
    save(image, "post-6.jpg")


def morning() -> None:
    image = gradient((227, 207, 169), (133, 159, 130))
    d = ImageDraw.Draw(image)
    d.rectangle((0, 560, W, H), fill=(105, 125, 94))
    d.polygon([(300, 750), (480, 420), (620, 750)], fill=(188, 173, 139))
    for x, y, r in [(100, 300, 100), (850, 260, 120), (720, 380, 70)]:
        d.ellipse((x, y, x + r, y + r), fill=(53, 82, 59))
        d.rectangle((x + r // 2 - 8, y + r // 2, x + r // 2 + 8, 600), fill=(70, 59, 45))
    for i in range(14):
        x = random.randint(0, W)
        y = random.randint(580, 720)
        d.line((x, y, x, y - 30), fill=(78, 103, 69), width=2)
    save(image, "post-7.jpg")


def graduation() -> None:
    image = gradient((126, 162, 164), (37, 70, 78))
    d = ImageDraw.Draw(image)
    d.rectangle((0, 520, W, H), fill=(47, 67, 63))
    d.ellipse((700, 80, 820, 200), fill=(244, 221, 168))
    for x, y, s in [(120, 370, 1.0), (300, 330, 1.2), (540, 390, 0.9), (720, 340, 1.1)]:
        d.polygon([(x - 55 * s, y), (x, y - 55 * s), (x + 55 * s, y), (x, y + 55 * s)], fill=(25, 32, 34))
        d.rectangle((x - 28 * s, y + 40 * s, x + 28 * s, y + 120 * s), fill=(25, 32, 34))
        d.line((x, y, x, y + 30 * s), fill=(202, 174, 111), width=3)
    for i in range(45):
        x = random.randint(40, 960)
        y = random.randint(560, 700)
        d.ellipse((x, y, x + 3, y + 3), fill=(195, 207, 174))
    save(image, "post-8.jpg")


def icon(name: str, draw_fn, color: str, size: int = 81) -> None:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    draw_fn(d, color, size)
    image.save(ICON / name, optimize=True)


def home(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.line([(18, 39), (40, 18), (63, 39)], fill=c, width=4)
    d.line([(23, 37), (23, 64), (58, 64), (58, 37)], fill=c, width=4)
    d.line([(40, 64), (40, 48)], fill=c, width=4)


def plus(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.rounded_rectangle((15, 15, 66, 66), radius=18, outline=c, width=4)
    d.line((40, 26, 40, 55), fill=c, width=4)
    d.line((26, 40, 55, 40), fill=c, width=4)


def person(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.ellipse((30, 15, 51, 36), outline=c, width=4)
    d.arc((18, 40, 63, 80), 180, 360, fill=c, width=4)


def message(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.rounded_rectangle((12, 15, 69, 57), radius=12, outline=c, width=4)
    d.polygon([(28, 56), (28, 70), (42, 57)], fill=c)
    d.line((25, 31, 55, 31), fill=c, width=3)
    d.line((25, 41, 48, 41), fill=c, width=3)


def heart(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.arc((13, 18, 40, 45), 180, 360, fill=c, width=4)
    d.arc((40, 18, 67, 45), 180, 360, fill=c, width=4)
    d.line((14, 31, 40, 61), fill=c, width=4)
    d.line((66, 31, 40, 61), fill=c, width=4)


def star(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    points = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        r = 28 if i % 2 == 0 else 12
        points.append((40 + r * math.cos(angle), 40 + r * math.sin(angle)))
    d.polygon(points, outline=c, width=4)


def comment(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.ellipse((12, 16, 68, 62), outline=c, width=4)
    d.polygon([(25, 55), (18, 70), (37, 61)], fill=c)


def share(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    d.arc((20, 35, 60, 70), 180, 330, fill=c, width=4)
    d.line((40, 52, 40, 15), fill=c, width=4)
    d.line((40, 15, 28, 27), fill=c, width=4)
    d.line((40, 15, 52, 27), fill=c, width=4)


def more(d: ImageDraw.ImageDraw, c: str, s: int) -> None:
    for x in (26, 40, 54):
        d.ellipse((x - 3, 37, x + 3, 43), fill=c)


if __name__ == "__main__":
    random.seed(20261107)
    sunset()
    food()
    cat()
    rain()
    stage()
    books()
    morning()
    graduation()

    for name, fn in {"home": home, "plus": plus, "me": person}.items():
        icon(f"{name}.png", fn, "#4b554f")
        icon(f"{name}-active.png", fn, "#b64a3a")
    icon("message.png", message, "#4b554f", 64)
    icon("heart.png", heart, "#4b554f", 64)
    icon("heart-active.png", heart, "#b64a3a", 64)
    icon("star.png", star, "#4b554f", 64)
    icon("star-active.png", star, "#b7791f", 64)
    icon("comment.png", comment, "#4b554f", 64)
    icon("share.png", share, "#4b554f", 64)
    icon("more.png", more, "#4b554f", 64)
    print("assets generated")
