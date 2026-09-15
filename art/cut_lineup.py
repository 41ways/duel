"""
westduelists.png 에서 총잡이 넷을 오려 낸다.
  public/img/gun{1..4}.png       — 전신 (멀리 서 있는 모습)
  public/img/gun{1..4}_bust.png  — 가슴 위 (선수 소개)

흰 배경이라 가장자리에서 흰색을 채워 배경을 잡고, GrabCut 으로 발밑 그림자와 경계를 다듬는다.
  python art/cut_lineup.py   (opencv-python-headless · numpy · pillow 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
os.makedirs(OUT, exist_ok=True)

src = cv2.imread(os.path.join(HERE, 'westduelists.png'), cv2.IMREAD_COLOR)
H, W = src.shape[:2]

# 사람마다 x 범위(넉넉히)와 가슴선 y
PEOPLE = [
    dict(x0=130, x1=400, chest=300),
    dict(x0=420, x1=700, chest=300),
    dict(x0=700, x1=960, chest=300),
    dict(x0=1010, x1=1260, chest=300),
]


def cut(p, i):
    x0, x1 = p['x0'], p['x1']
    crop = src[:, x0:x1].copy()
    h, w = crop.shape[:2]
    dist = np.linalg.norm(255.0 - crop.astype(np.float32), axis=2)

    # 가장자리와 이어진 거의 흰 곳 = 확실한 배경
    near = (dist < 22).astype(np.uint8)
    ff = np.zeros((h + 2, w + 2), np.uint8)
    flood = near.copy()
    for y in range(h):
        for x in (0, w - 1):
            if flood[y, x] == 1:
                cv2.floodFill(flood, ff, (x, y), 2)
    for x in range(w):
        for y in (0, h - 1):
            if flood[y, x] == 1:
                cv2.floodFill(flood, ff, (x, y), 2)
    bg = flood == 2

    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    mask[bg] = cv2.GC_BGD
    # 흰 배경과 조금 다른 옅은 회색(그림자)은 아마 배경
    mask[(~bg) & (dist < 45)] = cv2.GC_PR_BGD
    # 확실히 짙은 곳은 사람
    mask[dist > 140] = cv2.GC_FGD
    bgm = np.zeros((1, 65), np.float64)
    fgm = np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, mask, None, bgm, fgm, 4, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)

    # 떨어진 조각 버리기 — 가장 큰 덩어리만
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        fg = (lab == big).astype(np.uint8)
    # 안쪽 구멍(흰 셔츠 등) 메우기
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    solid = np.zeros_like(fg)
    cv2.drawContours(solid, cnts, -1, 1, thickness=cv2.FILLED)
    # 팔과 몸 사이 틈은 실제 배경 — 가장자리에서 이어지지 않은 흰 곳 중 아주 흰 곳은 비운다
    holes = (solid == 1) & (fg == 0) & (dist < 12)
    solid[holes] = 0
    fg = solid

    # 경계 부드럽게
    alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (0, 0), 0.9)
    alpha = np.clip((alpha.astype(np.float32) - 40) * (255 / 175), 0, 255).astype(np.uint8)

    ys, xs = np.where(alpha > 8)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 4
    top, left = max(0, top - pad), max(0, left - pad)
    bot, right = min(h - 1, bot + pad), min(w - 1, right + pad)
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    # 가장자리 흰 번짐 줄이기 — 반투명 경계는 색을 조금 어둡게
    edge = (alpha > 0) & (alpha < 250)
    rgba[edge, :3] = (rgba[edge, :3].astype(np.float32) * 0.82).astype(np.uint8)
    rgba[:, :, 3] = alpha
    full = rgba[top:bot + 1, left:right + 1]
    cv2.imwrite(os.path.join(OUT, f'gun{i}.png'), full)

    chest = p['chest'] - top
    bust = full[:max(40, chest + 40)]
    cv2.imwrite(os.path.join(OUT, f'gun{i}_bust.png'), bust)
    print(f'gun{i}: {full.shape[1]}x{full.shape[0]}  bust {bust.shape[1]}x{bust.shape[0]}')


for i, p in enumerate(PEOPLE, 1):
    cut(p, i)
