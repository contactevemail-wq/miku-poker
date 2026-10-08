"""13-3 아바타 스펙 시트용 가이드 이미지 생성 (마스터 작화용).
출력: ~/workspace/poker/avatar-spec/guide_*.png
"""
from PIL import Image, ImageDraw, ImageFont
import os

DST = os.path.dirname(os.path.abspath(__file__))
F = lambda s: ImageFont.truetype("NotoSansCJK-Regular.ttc", s)
FB = lambda s: ImageFont.truetype("NotoSansCJK-Bold.ttc", s) if os.path.exists("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc") else ImageFont.truetype("NotoSansCJK-Regular.ttc", s)

OUT = (35, 35, 59)
RED = (235, 70, 110)
BG = (24, 24, 38)

def dashed_h(d, y, x0, x1, fill, w=3, dash=12, gap=8):
    x = x0
    while x < x1:
        d.line([(x, y), (min(x+dash, x1), y)], fill=fill, width=w)
        x += dash + gap

def dashed_v(d, x, y0, y1, fill, w=3, dash=12, gap=8):
    y = y0
    while y < y1:
        d.line([(x, y), (x, min(y+dash, y1))], fill=fill, width=w)
        y += dash + gap

def dashed_rect(d, bbox, fill, w=3):
    x0, y0, x1, y1 = bbox
    dashed_h(d, y0, x0, x1, fill, w); dashed_h(d, y1, x0, x1, fill, w)
    dashed_v(d, x0, y0, y1, fill, w); dashed_v(d, x1, y0, y1, fill, w)

# ============ 1. guide_anchors.png : 베이스 바디 + 기준선 ============
base = Image.open(os.path.expanduser("~/workspace/poker/app/client/public/avatars/base/base.png")).convert("RGBA")
W, H = 512, 768
img = Image.new("RGBA", (W + 340, H), (255, 255, 255, 255))
img.alpha_composite(base, (0, 0))
d = ImageDraw.Draw(img)
guides = [
    (90,  "머리 꼭대기 y=90"),
    (160, "헤어캡 중심 y=160"),
    (262, "눈 높이 y=262"),
    (380, "턱선 y=380"),
    (410, "어깨선 y=410"),
    (520, "허리 y=520"),
    (628, "치마 밑단 y=628"),
]
for y, label in guides:
    dashed_h(d, y, 20, W - 20, RED + (255,), w=2)
    d.ellipse([8, y-6, 20, y+6], fill=RED + (255,))
    d.text((W + 14, y), label, font=F(20), fill=(40, 40, 60, 255), anchor="lm")
dashed_v(d, 256, 20, H - 20, (70, 130, 200, 255), w=2)
d.text((W + 14, 40), "중심선 x=256", font=F(20), fill=(40, 40, 60, 255), anchor="lm")
d.text((W + 14, 700), "※ face 파츠의 눈 중심은\n   반드시 y=262에!", font=F(20), fill=RED + (255,), anchor="lm")
img.convert("RGB").save(f"{DST}/guide_anchors.png")

# ============ 2. guide_layers.png : 레이어 순서도 ============
layers = [
    ("8. accessory (악세사리)", "맨 앞 — 안경·헤어핀 등", (255, 210, 120)),
    ("7. hat (모자)", "헤드폰·리본 (없음 포함)", (200, 170, 240)),
    ("6. hair_front (앞머리)", "앞머리 + 옆머리", (120, 220, 230)),
    ("5. face (얼굴)", "눈·눈썹·입·볼터치", (255, 180, 190)),
    ("4. top (상의)", "민소매·후드 등", (170, 200, 230)),
    ("3. bottom (하의)", "치마·바지", (150, 170, 210)),
    ("2. base (베이스 바디)", "얼굴형·팔·다리", (255, 220, 200)),
    ("1. hair_back (뒷머리)", "맨 뒤 — 백헤어+트윈테일", (120, 220, 230)),
]
LW, LH = 1000, 860
img = Image.new("RGB", (LW, LH), (255, 255, 255))
d = ImageDraw.Draw(img)
d.text((40, 24), "아바타 레이어 순서 (합성 순서: 아래 → 위)", font=F(30), fill=(30, 30, 50))
y = 90
for title, desc, color in layers:
    d.rounded_rectangle([60, y, 760, y+72], 14, fill=color, outline=OUT, width=4)
    d.text((90, y+36), title, font=F(24), fill=(30, 30, 50), anchor="lm")
    d.text((560, y+36), desc, font=F(20), fill=(80, 80, 100), anchor="lm")
    y += 88
d.line([(860, 750), (860, 130)], fill=RED, width=6)
d.polygon([(860, 100), (838, 140), (882, 140)], fill=RED)
d.text((920, 430), "앞으로\n(나중에\n그려짐)", font=F(22), fill=RED, anchor="mm")
img.save(f"{DST}/guide_layers.png")

# ============ 3. guide_canvas.png : 캔버스 규격 + 세이프존 ============
W, H = 512, 768
img = Image.new("RGB", (W + 360, H), BG)
d = ImageDraw.Draw(img)
d.rectangle([0, 0, W-1, H-1], outline=(255, 255, 255), width=4)
dashed_rect(d, [30, 30, W-30, H-30], RED, w=3)
dashed_h(d, H//2, 0, W, (90, 90, 120), w=2)
dashed_v(d, W//2, 0, H, (90, 90, 120), w=2)
d.text((W+20, 60), "캔버스: 512 × 768 px", font=F(26), fill=(255, 255, 255), anchor="lm")
d.text((W+20, 120), "포맷: PNG, 투명 배경", font=F(22), fill=(200, 200, 220), anchor="lm")
d.text((W+20, 180), "빨간 점선 = 세이프존", font=F(22), fill=(255, 120, 140), anchor="lm")
d.text((W+20, 220), "가장자리 30px 안에는", font=F(22), fill=(200, 200, 220), anchor="lm")
d.text((W+20, 260), "중요한 그림 넣지 않기!", font=F(22), fill=(200, 200, 220), anchor="lm")
d.text((W+20, 340), "파츠는 캔버스 전체 크기로\n그려주세요 (512×768).\n파츠 영역 외는 투명하게!", font=F(22), fill=(200, 200, 220), anchor="lm")
img.save(f"{DST}/guide_canvas.png")

# ============ 4. guide_palette.png : 색상 팔레트 ============
groups = [
    ("기본", [("외곽선", "#23233B"), ("피부", "#FFD9C4")]),
    ("헤어", [("청록", "#39C5CF"), ("청록 다크", "#24A0B0"), ("사쿠라", "#FFAAC8"),
            ("유키", "#ECF1F6"), ("골드", "#FFC850")]),
    ("얼굴", [("홍채", "#2FB3C9"), ("동공", "#1E2A3A"), ("볼터치", "#FF9DB0")]),
    ("의상", [("민소매", "#9AA0A8"), ("치마", "#2B2B3D"), ("데님", "#466EAA"),
            ("후드", "#2D8CA0"), ("핑크", "#FF5F9E"), ("레드", "#EB466E")]),
]
PW, PH = 1100, 640
img = Image.new("RGB", (PW, PH), (255, 255, 255))
d = ImageDraw.Draw(img)
d.text((40, 24), "아바타 추천 팔레트 (통일감용 — 이 색들을 기준으로!)", font=F(30), fill=(30, 30, 50))
y = 100
for gname, colors in groups:
    d.text((40, y), gname, font=F(24), fill=(30, 30, 50))
    x = 180
    for cname, hexv in colors:
        rgb = tuple(int(hexv[i:i+2], 16) for i in (1, 3, 5))
        d.rounded_rectangle([x, y, x+130, y+80], 10, fill=rgb, outline=OUT, width=3)
        d.text((x+65, y+100), cname, font=F(18), fill=(30, 30, 50), anchor="mt")
        d.text((x+65, y+126), hexv, font=F(16), fill=(120, 120, 140), anchor="mt")
        x += 160
    y += 175
img.save(f"{DST}/guide_palette.png")
print("guides ok:", os.listdir(DST))
