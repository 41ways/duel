"""
westernduelistback.png(흰 배경 뒷모습) → 앞사람과 총 드는 팔, 멀리 선 사람 색 맞추기.
  public/img/back.png      — 오른팔(화면 오른쪽) 아래팔을 뺀 몸
  public/img/back_arm.png  — 오른 아래팔 · 손 (팔꿈치가 위 가운데)
  public/img/gunN_far.png  — 멀리 서 있을 때 쓰는 전신 (크기 줄이고 대기 색에 묻힘)

  python art/cut_back.py   (opencv-python-headless · numpy 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
os.makedirs(OUT, exist_ok=True)


def white_matte(img, tight=18, soft=45):
    """흰 배경 → 알파. 가장자리에서 이어진 흰 곳만 배경으로 친다."""
    h, w = img.shape[:2]
    dist = np.linalg.norm(255.0 - img.astype(np.float32), axis=2)
    near = (dist < soft).astype(np.uint8)
    ff = np.zeros((h + 2, w + 2), np.uint8)
    flood = near.copy()
    for x in range(0, w, 4):
        for y in (0, h - 1):
            if flood[y, x] == 1:
                cv2.floodFill(flood, ff, (x, y), 2)
    for y in range(0, h, 4):
        for x in (0, w - 1):
            if flood[y, x] == 1:
                cv2.floodFill(flood, ff, (x, y), 2)
    bg = flood == 2
    # 배경 쪽 경계는 흰 정도에 따라 부드럽게
    a = np.where(bg, np.clip((dist - tight) / (soft - tight), 0, 1), 1.0)
    a = cv2.GaussianBlur(a.astype(np.float32), (0, 0), 0.7)
    # 흰 테두리 번짐 빼기: 반투명 경계 색을 배경(흰색)에서 분리
    rgb = img.astype(np.float32)
    aa = np.clip(a, 0.05, 1)[..., None]
    rgb = np.clip((rgb - 255 * (1 - aa)) / aa, 0, 255)
    out = np.dstack([rgb, a * 255]).astype(np.uint8)
    return out


def trim(rgba, pad=4):
    ys, xs = np.where(rgba[:, :, 3] > 8)
    t, b, l, r = max(0, ys.min() - pad), ys.max() + pad, max(0, xs.min() - pad), xs.max() + pad
    return rgba[t:b + 1, l:r + 1], (l, t)


# ── 뒷모습 ──
src = cv2.imread(os.path.join(HERE, 'westernduelistback.png'), cv2.IMREAD_COLOR)
full = white_matte(src)
# 오른 아래팔 — 판초 끝자락(y≈285) 아래, 권총집 오른쪽(x≥802)
arm_mask = np.zeros(full.shape[:2], np.uint8)
cv2.fillPoly(arm_mask, [np.array([(803, 282), (860, 282), (860, 460), (796, 460), (798, 330)], np.int32)], 1)
arm_mask = cv2.GaussianBlur(arm_mask.astype(np.float32), (0, 0), 1.2)
body = full.copy()
body[:, :, 3] = (body[:, :, 3] * (1 - arm_mask)).astype(np.uint8)
arm = full.copy()
arm[:, :, 3] = (arm[:, :, 3] * arm_mask).astype(np.uint8)

body_t, (bx, by) = trim(body)
cv2.imwrite(os.path.join(OUT, 'back.png'), body_t)
# 팔은 팔꿈치(826,290)가 기준이 되게 고정 크기로 자른다
EX, EY = 826, 290
arm_c = arm[EY - 20:EY + 180, EX - 60:EX + 60]
cv2.imwrite(os.path.join(OUT, 'back_arm.png'), arm_c)
print('back.png', body_t.shape[1], 'x', body_t.shape[0], 'offset', (bx, by), '| elbow in back.png', (EX - bx, EY - by),
      '| arm crop origin', (EX - 60 - bx, EY - 20 - by))

# ── 멀리 선 사람: 사진 속 먼 사람처럼 작고, 대비 낮고, 따뜻한 먼지 빛 ──
for i in range(1, 5):
    im = cv2.imread(os.path.join(OUT, f'gun{i}.png'), cv2.IMREAD_UNCHANGED)
    h, w = im.shape[:2]
    H2 = 330
    im = cv2.resize(im, (round(w * H2 / h), H2), interpolation=cv2.INTER_AREA)
    rgb = im[:, :, :3].astype(np.float32)
    grey = rgb.mean(axis=2, keepdims=True)
    rgb = grey + (rgb - grey) * 0.8                        # 채도 조금 뺌
    rgb = rgb * 0.86 + np.array([168, 186, 205]) * 0.14    # BGR — 먼지 낀 공기
    rgb = cv2.GaussianBlur(rgb, (0, 0), 0.55)
    a = cv2.GaussianBlur(im[:, :, 3].astype(np.float32), (0, 0), 0.6)
    out = np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, f'gun{i}_far.png'), out)
print('far sprites done')
