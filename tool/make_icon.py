"""앱 아이콘(안드로이드)을 홈 화면의 아이콘(Icons.document_scanner_outlined)과 같은 모양으로 만든다.

    python tool/make_icon.py [Flutter SDK 경로]      # Pillow 필요 (pip install pillow)

적응형 아이콘(API 26+)의 전경·테마 아이콘(API 33+) 레이어와, API 24~25용 일반 아이콘을 생성한다.
색은 앱 테마(seed 0xFF2F4B7C)의 primaryContainer / onPrimaryContainer 값이다.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BG = (0xD7, 0xE2, 0xFF)  # #D7E2FF
FG = (0x29, 0x46, 0x77)  # #294677
FLUTTER = sys.argv[1] if len(sys.argv) > 1 else 'D:/tools/flutter'
FONT = f'{FLUTTER}/bin/cache/artifacts/material_fonts/materialicons-regular.otf'
GLYPH = chr(0xEFE1)  # Icons.document_scanner_outlined
RES = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res')


def glyph_layer(size, em_ratio):
    """투명 배경에 글리프만 그린 size×size 이미지. 4배로 그린 뒤 줄여 가장자리를 부드럽게 한다."""
    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    font = ImageFont.truetype(FONT, int(s * em_ratio))
    ImageDraw.Draw(img).text((s / 2, s / 2), GLYPH, font=font, fill=FG + (255,), anchor='mm')
    return img.resize((size, size), Image.LANCZOS)


# 적응형 전경: 108dp 캔버스에서 글리프 em 52dp (홈 화면 아이콘 비율과 같다)
for name, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    glyph_layer(px, 52 / 108).save(f'{RES}/mipmap-{name}/ic_launcher_foreground.png')

# API 24~25용: 48dp 둥근 사각형 + 글리프
for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    s = px * 4
    base = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(base).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.29), fill=BG + (255,))
    base.alpha_composite(glyph_layer(px, 0.5).resize((s, s), Image.LANCZOS))
    base.resize((px, px), Image.LANCZOS).save(f'{RES}/mipmap-{name}/ic_launcher.png')

# mipmap-anydpi-v26/ic_launcher.xml 과 values/ic_launcher_background.xml 은 저장소에 커밋돼 있다.
print('아이콘을 생성했습니다.')
