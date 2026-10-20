"""CP949(통합형 한글, EUC-KR 확장) 변환표를 assets/cp949.bin 으로 만든다.

    python tool/make_cp949.py

2바이트 코드 하나(앞 0x81~0xFE × 뒤 0x41~0xFE)마다 UTF-16LE 2바이트를 순서대로 쓴다.
매핑이 없는 칸은 0이다. 인덱스 = (앞 - 0x81) * 190 + (뒤 - 0x41).
앱의 디코더(lib/src/reader/text_decoder.dart)가 이 표로 CP949 텍스트 파일을 읽는다.
"""
import os
import struct

out = bytearray()
for lead in range(0x81, 0xFF):
    for trail in range(0x41, 0xFF):
        try:
            ch = bytes([lead, trail]).decode('cp949')
            code = ord(ch) if len(ch) == 1 and ord(ch) < 0x10000 else 0
        except UnicodeDecodeError:
            code = 0
        out += struct.pack('<H', code)

path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'cp949.bin')
open(path, 'wb').write(out)
print(len(out), 'bytes,', sum(1 for i in range(0, len(out), 2) if out[i] or out[i + 1]), 'mappings')
