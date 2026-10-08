"""13-3 아바타 파츠 제작 스크립트 v2 — PIL 플랫 치비 드로잉 (자작, 라이선스 클린).
출력: ~/workspace/poker/app/client/public/avatars/<부위>/
캔버스 512x768, 합성 순서: hair_back -> base -> bottom -> top -> face -> hair_front -> hat -> accessory
"""
from PIL import Image, ImageDraw
import math, os, json

W, H = 512, 768
OUT = (35, 35, 59)
SKIN = (255, 217, 196)
HAIR = (57, 197, 207);      HAIR_D = (36, 158, 176)
SAKURA = (255, 170, 200);   SAKURA_D = (232, 132, 172)
YUKI = (236, 241, 246);     YUKI_D = (198, 210, 222)
GOLD = (255, 200, 80);      GOLD_D = (228, 158, 44)
IRIS = (47, 179, 201);      PUPIL = (30, 42, 58)
BLUSH = (255, 157, 176)
GRAY = (154, 160, 168);     SKIRT = (43, 43, 61)
PINK = (255, 95, 158);      DARK = (43, 43, 61)
DENIM = (70, 110, 170);     DENIM_D = (52, 86, 138)
HOOD = (45, 140, 160);      HOOD_D = (32, 108, 128)
RED = (235, 70, 110)

AVT = os.path.expanduser("~/workspace/poker/app/client/public/avatars")
for c in ["hair", "face", "top", "bottom", "hat", "accessory", "base"]:
    os.makedirs(f"{AVT}/{c}", exist_ok=True)

PARTS = []  # {"id", "category", "name", "rarity", "price", "files"}
def reg(pid, cat, name, rarity, price, files):
    PARTS.append({"id": pid, "category": cat, "name": name,
                  "rarity": rarity, "price": price, "files": files})

def new():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))

def ell(d, bbox, fill, ow=0):
    if ow:
        d.ellipse([bbox[0]-ow, bbox[1]-ow, bbox[2]+ow, bbox[3]+ow], fill=OUT+(255,))
    d.ellipse(bbox, fill=fill+(255,))

def rrect(d, bbox, r, fill, ow=0):
    if ow:
        d.rounded_rectangle([bbox[0]-ow, bbox[1]-ow, bbox[2]+ow, bbox[3]+ow], r+ow, fill=OUT+(255,))
    d.rounded_rectangle(bbox, r, fill=fill+(255,))

def line(d, xy, w, fill, ow=0):
    if ow:
        d.line(xy, fill=OUT+(255,), width=w+2*ow, joint="curve")
    d.line(xy, fill=fill+(255,), width=w, joint="curve")

def poly(d, pts, fill, ow=0):
    if ow:
        cx = sum(p[0] for p in pts)/len(pts); cy = sum(p[1] for p in pts)/len(pts)
        avg = sum(math.hypot(p[0]-cx, p[1]-cy) for p in pts)/len(pts) or 1
        f = (avg+ow)/avg
        pts2 = [(cx+(p[0]-cx)*f, cy+(p[1]-cy)*f) for p in pts]
        d.polygon(pts2, fill=OUT+(255,))
    d.polygon(pts, fill=fill+(255,))

def bez(p0, p1, p2, n=22):
    return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t**2*p2[0],
             (1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t**2*p2[1])
            for t in [i/(n-1) for i in range(n)]]

def chain(d, pts, r0, r1, fill, ow):
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        r = r0+(r1-r0)*i/(n-1)
        d.ellipse([x-r-ow, y-r-ow, x+r+ow, y+r+ow], fill=OUT+(255,))
    for i, (x, y) in enumerate(pts):
        r = r0+(r1-r0)*i/(n-1)
        d.ellipse([x-r, y-r, x+r, y+r], fill=fill+(255,))

def star(d, cx, cy, r, fill, ow=0):
    pts = []
    for i in range(10):
        a = -math.pi/2 + i*math.pi/5
        rr = r if i % 2 == 0 else r*0.42
        pts.append((cx+rr*math.cos(a), cy+rr*math.sin(a)))
    poly(d, pts, fill, ow)

def _heart(d, cx, cy, s, fill):
    d.ellipse([cx-s, cy-s*0.9, cx, cy+s*0.1], fill=fill+(255,))
    d.ellipse([cx, cy-s*0.9, cx+s, cy+s*0.1], fill=fill+(255,))
    d.polygon([(cx-s*0.92, cy), (cx+s*0.92, cy), (cx, cy+s)], fill=fill+(255,))

def heart(d, cx, cy, s, fill, ow=0):
    if ow:
        _heart(d, cx, cy, s+ow, OUT)
    _heart(d, cx, cy, s, fill)

# ================= base =================
im = new(); d = ImageDraw.Draw(im)
line(d, [(228,545),(224,655)], 52, SKIN, ow=7)
line(d, [(284,545),(288,655)], 52, SKIN, ow=7)
rrect(d, (192,648,258,714), 20, DARK, ow=6)
rrect(d, (254,648,320,714), 20, DARK, ow=6)
line(d, [(196,425),(170,535)], 46, SKIN, ow=7)
line(d, [(316,425),(342,535)], 46, SKIN, ow=7)
ell(d, (143,521,197,575), SKIN, ow=6)
ell(d, (315,521,369,575), SKIN, ow=6)
rrect(d, (186,395,326,552), 42, SKIN, ow=7)
rrect(d, (234,348,278,412), 12, SKIN, ow=6)
ell(d, (94,232,128,278), SKIN, ow=5)
ell(d, (384,232,418,278), SKIN, ow=5)
ell(d, (106,90,406,380), SKIN, ow=7)
im.save(f"{AVT}/base/base.png")
reg("base", "base", "베이스 바디", "기본", 0, ["base/base.png"])

# ================= hair =================
def draw_hair(hc, hcd, tag):
    im = new(); d = ImageDraw.Draw(im)
    ell(d, (86, 66, 426, 430), hc, ow=7)
    chain(d, bez((128,180),(80,320),(64,600)), 54, 26, hc, 7)
    chain(d, bez((384,180),(432,320),(448,600)), 54, 26, hc, 7)
    im.save(f"{AVT}/hair/hair_back_{tag}.png")
    im = new(); d = ImageDraw.Draw(im)
    cap = []
    cx, cy, rx, ry = 256, 160, 156, 102
    for deg in range(180, 361, 9):
        a = math.radians(deg)
        cap.append((cx+rx*math.cos(a), cy+ry*math.sin(a)))
    zigzag = [(400,172),(368,168),(360,202),(332,166),(318,208),(290,164),(276,208),
              (248,164),(234,208),(206,164),(192,208),(164,166),(152,202),(144,168),(112,172)]
    poly(d, cap + zigzag, hc, ow=7)
    for x0, x1 in [(170,150),(256,140),(342,150)]:
        line(d, [(x0,92),(x1,150)], 4, hcd)
    chain(d, bez((132,190),(124,300),(118,440)), 36, 20, hc, 6)
    chain(d, bez((380,190),(388,300),(394,440)), 36, 20, hc, 6)
    im.save(f"{AVT}/hair/hair_front_{tag}.png")

draw_hair(HAIR, HAIR_D, "twintail")
reg("hair_twintail", "hair", "기본 트윈테일", "기본", 0,
    ["hair/hair_back_twintail.png", "hair/hair_front_twintail.png"])
draw_hair(SAKURA, SAKURA_D, "sakura")
reg("hair_sakura", "hair", "사쿠라 트윈테일", "레어", 5000,
    ["hair/hair_back_sakura.png", "hair/hair_front_sakura.png"])
draw_hair(YUKI, YUKI_D, "yuki")
reg("hair_yuki", "hair", "유키 트윈테일", "레어", 6000,
    ["hair/hair_back_yuki.png", "hair/hair_front_yuki.png"])
draw_hair(GOLD, GOLD_D, "gold")
reg("hair_gold", "hair", "골드 트윈테일", "전설", 12000,
    ["hair/hair_back_gold.png", "hair/hair_front_gold.png"])

# ================= face =================
def face_base(d):
    """왼쪽 눈 + 볼터치 + 눈썹(왼쪽) 공통"""
    ell(d, (154,210,238,314), (255,255,255), ow=6)
    ell(d, (166,222,226,302), IRIS)
    ell(d, (182,242,210,282), PUPIL)
    ell(d, (159,209,185,235), (255,255,255))
    ell(d, (200,274,212,286), (255,255,255))
    line(d, [(158,237),(196,212),(234,237)], 11, OUT)
    line(d, [(160,180),(200,172)], 8, OUT)
    ell(d, (128,308,172,336), BLUSH)
    ell(d, (340,308,384,336), BLUSH)

im = new(); d = ImageDraw.Draw(im); face_base(d)
ell(d, (274,210,358,314), (255,255,255), ow=6)
ell(d, (286,222,346,302), IRIS)
ell(d, (302,242,330,282), PUPIL)
ell(d, (279,209,305,235), (255,255,255))
ell(d, (320,274,332,286), (255,255,255))
line(d, [(278,237),(316,212),(354,237)], 11, OUT)
line(d, [(312,172),(352,180)], 8, OUT)
line(d, [(232,344),(256,358),(280,344)], 7, OUT)
im.save(f"{AVT}/face/face_smile.png")
reg("face_smile", "face", "미소", "기본", 0, ["face/face_smile.png"])

im = new(); d = ImageDraw.Draw(im); face_base(d)
line(d, [(288,244),(316,258),(344,244)], 10, OUT)
line(d, [(316,172),(352,180)], 8, OUT)
ell(d, (234,336,278,368), (150,70,80), ow=5)
im.save(f"{AVT}/face/face_wink.png")
reg("face_wink", "face", "윙크", "일반", 3000, ["face/face_wink.png"])

im = new(); d = ImageDraw.Draw(im)
heart(d, 196, 258, 44, (255,90,140), ow=6)
heart(d, 316, 258, 44, (255,90,140), ow=6)
ell(d, (176,228,196,248), (255,255,255))
ell(d, (296,228,316,248), (255,255,255))
line(d, [(160,180),(200,172)], 8, OUT)
line(d, [(312,172),(352,180)], 8, OUT)
ell(d, (128,308,172,336), BLUSH)
ell(d, (340,308,384,336), BLUSH)
ell(d, (230,332,282,372), (150,70,80), ow=5)
im.save(f"{AVT}/face/face_hearteyes.png")
reg("face_hearteyes", "face", "하트눈", "레어", 5000, ["face/face_hearteyes.png"])

# ================= top =================
def draw_sleeveless(color, trim, tag):
    im = new(); d = ImageDraw.Draw(im)
    poly(d, [(202,402),(310,402),(330,548),(182,548)], color, ow=7)
    poly(d, [(242,408),(270,408),(262,432),(250,432)], trim, ow=5)
    poly(d, [(250,432),(262,432),(268,500),(256,518),(244,500)], trim, ow=5)
    im.save(f"{AVT}/top/top_{tag}.png")

draw_sleeveless(GRAY, HAIR, "sleeveless")
reg("top_sleeveless", "top", "기본 민소매", "기본", 0, ["top/top_sleeveless.png"])
draw_sleeveless(PINK, (255,255,255), "sleeveless_pink")
reg("top_sleeveless_pink", "top", "핑크 민소매", "일반", 2000, ["top/top_sleeveless_pink.png"])

im = new(); d = ImageDraw.Draw(im)
ell(d, (200,352,312,430), HOOD_D, ow=6)                       # 후드(뒤)
poly(d, [(174,396),(338,396),(338,558),(174,558)], HOOD, ow=7) # 몸통
rrect(d, (226,488,286,542), 12, HOOD_D, ow=4)                 # 포켓
line(d, [(244,428),(240,470)], 5, (255,255,255))
line(d, [(268,428),(272,470)], 5, (255,255,255))
im.save(f"{AVT}/top/top_hoodie.png")
reg("top_hoodie", "top", "청록 후드", "레어", 5000, ["top/top_hoodie.png"])

# ================= bottom =================
def draw_skirt(color, trim, tag):
    im = new(); d = ImageDraw.Draw(im)
    poly(d, [(198,498),(314,498),(352,628),(160,628)], color, ow=7)
    for x0, x1 in [(230,222),(256,256),(282,290)]:
        line(d, [(x0,532),(x1,618)], 4, (62,62,84) if color == SKIRT else (200,120,150))
    line(d, [(163,618),(349,618)], 8, trim)
    im.save(f"{AVT}/bottom/bottom_{tag}.png")

draw_skirt(SKIRT, HAIR, "skirt")
reg("bottom_skirt", "bottom", "기본 치마", "기본", 0, ["bottom/bottom_skirt.png"])
draw_skirt(PINK, (255,255,255), "skirt_pink")
reg("bottom_skirt_pink", "bottom", "핑크 치마", "일반", 2000, ["bottom/bottom_skirt_pink.png"])

im = new(); d = ImageDraw.Draw(im)
rrect(d, (198,498,314,532), 10, DENIM_D, ow=6)                 # 허리밴드
rrect(d, (202,528,254,662), 16, DENIM, ow=6)                  # 다리
rrect(d, (258,528,310,662), 16, DENIM, ow=6)
rrect(d, (202,632,254,662), 10, (120,160,210))                # 커프스
rrect(d, (258,632,310,662), 10, (120,160,210))
line(d, [(256,534),(256,580)], 4, DENIM_D)
im.save(f"{AVT}/bottom/bottom_jeans.png")
reg("bottom_jeans", "bottom", "청바지", "레어", 4000, ["bottom/bottom_jeans.png"])

# ================= hat =================
new().save(f"{AVT}/hat/hat_none.png")
reg("hat_none", "hat", "없음", "기본", 0, ["hat/hat_none.png"])

im = new(); d = ImageDraw.Draw(im)
d.arc((150,60,362,260), 180, 360, fill=DARK+(255,), width=22)  # 헤드밴드
rrect(d, (104,168,152,252), 20, PINK, ow=6)                   # 이어컵
rrect(d, (114,190,142,230), 10, DARK)
rrect(d, (360,168,408,252), 20, PINK, ow=6)
rrect(d, (370,190,398,230), 10, DARK)
im.save(f"{AVT}/hat/hat_headphones.png")
reg("hat_headphones", "hat", "DJ 헤드폰", "레어", 5000, ["hat/hat_headphones.png"])

im = new(); d = ImageDraw.Draw(im)
poly(d, [(322,86),(270,50),(280,112)], RED, ow=5)             # 리본 왼쪽
poly(d, [(362,86),(414,50),(404,112)], RED, ow=5)             # 리본 오른쪽
poly(d, [(330,100),(318,150),(342,146)], RED, ow=4)           # 리본 꼬리
ell(d, (322,66,362,106), RED, ow=5)                           # 매듭
im.save(f"{AVT}/hat/hat_ribbon.png")
reg("hat_ribbon", "hat", "빨간 리본", "일반", 2500, ["hat/hat_ribbon.png"])

# ================= accessory =================
im = new(); d = ImageDraw.Draw(im)
rrect(d, (92,116,168,196), 14, PINK, ow=6)
rrect(d, (104,150,156,184), 8, DARK)
rrect(d, (344,116,420,196), 14, PINK, ow=6)
rrect(d, (356,150,408,184), 8, DARK)
im.save(f"{AVT}/accessory/acc_headset.png")
reg("acc_headset", "accessory", "스퀘어 헤어 액세서리", "기본", 0, ["accessory/acc_headset.png"])

im = new(); d = ImageDraw.Draw(im)
d.rounded_rectangle((150,232,240,302), 30, outline=OUT+(255,), width=8)
d.rounded_rectangle((272,232,362,302), 30, outline=OUT+(255,), width=8)
line(d, [(240,258),(272,258)], 8, OUT)
line(d, [(150,250),(118,240)], 7, OUT)
line(d, [(362,250),(394,240)], 7, OUT)
im.save(f"{AVT}/accessory/acc_glasses.png")
reg("acc_glasses", "accessory", "동글이 안경", "일반", 2000, ["accessory/acc_glasses.png"])

im = new(); d = ImageDraw.Draw(im)
star(d, 372, 200, 34, (255,210,90), ow=6)
star(d, 322, 148, 18, (255,150,200), ow=4)
im.save(f"{AVT}/accessory/acc_starpin.png")
reg("acc_starpin", "accessory", "별 헤어핀", "일반", 1500, ["accessory/acc_starpin.png"])

# ================= manifest =================
manifest = {
    "version": "2.0.0",
    "license": "13-3 자작 (PIL 드로잉). 라이선스 클린.",
    "avatar_spec": {
        "canvas": [W, H],
        "format": "PNG (투명 배경)",
        "layer_order": ["hair_back", "base", "bottom", "top", "face", "hair_front", "hat", "accessory"],
        "note": "hair 카테고리는 앞/뒤 2개 PNG. layer_order 순서대로 alpha composite."
    },
    "categories": {
        "hair": "헤어", "face": "얼굴(표정)", "top": "상의",
        "bottom": "하의", "hat": "모자", "accessory": "악세사리", "base": "베이스 바디"
    },
    "rarity": {
        "기본": {"price": 0, "desc": "가입 시 기본 지급"},
        "일반": {"price_range": [1500, 3000], "desc": "가볍게 모을 수 있는 파츠"},
        "레어": {"price_range": [4000, 6000], "desc": "제법 모아야 살 수 있는 파츠"},
        "전설": {"price_range": [12000, 12000], "desc": "끝판왕 파츠"}
    },
    "parts": PARTS,
    "default_loadout": {
        "hair": "hair_twintail", "face": "face_smile", "top": "top_sleeveless",
        "bottom": "bottom_skirt", "hat": "hat_none", "accessory": "acc_headset"
    }
}
with open(f"{AVT}/parts.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

# ================= preview composites =================
def composite(loadout, out):
    comp = Image.new("RGBA", (W, H), (30, 30, 46, 255))
    by_id = {p["id"]: p for p in PARTS}
    seq = []
    hair = by_id[loadout["hair"]]["files"]
    seq.append(next(f for f in hair if "back" in f))          # hair_back (맨 뒤)
    for cat in ["base", "bottom", "top", "face"]:
        seq.extend(by_id[loadout[cat]]["files"])
    seq.append(next(f for f in hair if "front" in f))         # hair_front (얼굴 위)
    for cat in ["hat", "accessory"]:
        seq.extend(by_id[loadout[cat]]["files"])
    for f in seq:
        comp.alpha_composite(Image.open(f"{AVT}/{f}"))
    comp.save(f"{AVT}/{out}")

composite({"base": "base", "hair": "hair_twintail", "face": "face_smile", "top": "top_sleeveless",
           "bottom": "bottom_skirt", "hat": "hat_none", "accessory": "acc_headset"},
          "preview_default.png")
composite({"base": "base", "hair": "hair_gold", "face": "face_hearteyes", "top": "top_hoodie",
           "bottom": "bottom_jeans", "hat": "hat_headphones", "accessory": "acc_starpin"},
          "preview_premium.png")
print(f"parts: {len(PARTS)}종, previews ok")
