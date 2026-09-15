"""
westernduel.png 를 층으로 나눈다.
  public/img/fore1.png   — 앞에 선 판초 뒷모습
  public/img/weed.png    — 회전초
  public/img/plate.jpg   — 사람과 회전초를 지운 배경

  python art/cut_scene.py   (opencv-python-headless · numpy · pillow 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
os.makedirs(OUT, exist_ok=True)
src = cv2.imread(os.path.join(HERE, 'westernduel.png'), cv2.IMREAD_COLOR)
H, W = src.shape[:2]
DBG = os.environ.get('DBG')


def grab(rect, iters=6, fg_poly=None, bg_poly=None):
    mask = np.zeros((H, W), np.uint8)
    x0, y0, x1, y1 = rect
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    if fg_poly is not None:
        cv2.fillPoly(mask, [np.array(fg_poly, np.int32)], cv2.GC_FGD)
    if bg_poly is not None:
        for poly in bg_poly:
            cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_BGD)
    bgm = np.zeros((1, 65), np.float64)
    fgm = np.zeros((1, 65), np.float64)
    cv2.grabCut(src, mask, None, bgm, fgm, iters, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        fg = (lab == big).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return fg


def save_cut(fg, name, soft=1.2):
    alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (0, 0), soft)
    ys, xs = np.where(alpha > 8)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = cv2.cvtColor(src, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    cv2.imwrite(os.path.join(OUT, name), rgba[t:b, l:r])
    print(name, 'at', (int(l), int(t)), 'size', (int(r - l), int(b - t)))
    return (int(l), int(t), int(r - l), int(b - t))


# 판초 — 화면 왼쪽 아래까지 이어진다. 머리 옆 하늘은 확실한 배경으로 찍어 준다.
fore = grab(
    (55, 0, 612, H),
    fg_poly=[(250, 150), (420, 150), (520, 420), (500, 700), (120, 700), (160, 420)],
    bg_poly=[
        [(196, 142), (276, 142), (280, 214), (262, 228), (196, 262)],
        [(446, 142), (520, 142), (520, 226), (464, 236), (440, 214)],
        [(412, 186), (446, 176), (458, 236), (430, 242)],
        [(270, 150), (284, 150), (292, 200), (278, 222), (262, 222)],
    ],
)
# 오른쪽 판초 끝자락(밝은 주름)이 빠지지 않게
flap = np.zeros((H, W), np.uint8)
cv2.fillPoly(flap, [np.array([(452, 246), (522, 320), (574, 428), (592, 476), (566, 486), (470, 300)], np.int32)], 1)
fore = np.clip(fore + flap, 0, 1).astype(np.uint8)
fore_box = None  # 앞사람은 이제 따로 받은 뒷모습(cut_back.py)을 쓴다

# 회전초
weed = grab((640, 430, 780, 560), iters=8, fg_poly=[(690, 470), (740, 470), (745, 525), (690, 525)])
save_cut(weed, 'weed.png', soft=0.8)

# 멀리 선 사람 (지우기만) — 작고 윤곽이 단순해서 손으로 잡은 다각형이 더 확실하다
far = np.zeros((H, W), np.uint8)
cv2.fillPoly(far, [np.array([(920, 236), (992, 236), (996, 280), (1012, 300), (1014, 420), (1010, 524),
                             (888, 524), (896, 420), (898, 300), (916, 280)], np.int32)], 1)
cv2.ellipse(far, (862, 515), (140, 17), 0, 0, 360, 1, -1)


def fill_rows(img, mask, dx, grow=15):
    """가는 물체 지우기. 밑색은 둘레에서 안쪽으로 번져 들어오게(인페인트) 깔고,
    dx 옆 조각의 결(흙 갈라짐)만 얹는다."""
    m = cv2.dilate(mask.astype(np.uint8), np.ones((grow, grow), np.uint8))
    f = img.astype(np.float32)
    # 작게 줄여 인페인트하면 넓게 매끄럽다
    sm = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    msm = cv2.dilate(cv2.resize(m, (sm.shape[1], sm.shape[0]), interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
    base = cv2.inpaint(sm, msm, 6, cv2.INPAINT_TELEA)
    base = cv2.resize(base, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    base = cv2.GaussianBlur(base, (0, 0), 3)
    donor = np.roll(f, -dx, axis=1)
    detail = donor - cv2.GaussianBlur(donor, (0, 0), 12)
    fill = base + detail
    soft = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 5) * 1.6, 0, 1)[..., None]
    return np.clip(f * (1 - soft) + fill * soft, 0, 255).astype(np.uint8)


def fill_left(img, mask, dx):
    """화면 끝에 닿은 큰 자리(판초). 오른쪽에서 옮겨 오되, 줄마다 경계 밝기 차이를 빼서 이음매를 없앤다."""
    m = cv2.dilate(mask.astype(np.uint8), np.ones((31, 31), np.uint8))
    f = img.astype(np.float32)
    donor = np.roll(f, -dx, axis=1)
    diff = np.zeros((img.shape[0], 3), np.float32)
    for y in range(img.shape[0]):
        xs = np.where(m[y])[0]
        if not len(xs):
            continue
        x1 = min(xs.max() + 1, img.shape[1] - 8)
        diff[y] = f[y, x1:x1 + 8].mean(axis=0) - donor[y, x1:x1 + 8].mean(axis=0)
    diff = cv2.GaussianBlur(diff[:, None, :], (0, 0), sigmaX=0.1, sigmaY=6)[:, 0, :]
    fill = donor + diff[:, None, :]
    soft = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 6) * 1.4, 0, 1)[..., None]
    return np.clip(f * (1 - soft) + fill * soft, 0, 255).astype(np.uint8)


plate = src.copy()
man = far.copy()
plate = fill_rows(plate, man, 330)
m = weed.copy()
cv2.ellipse(m, (700, 548), (75, 13), 0, 0, 360, 1, -1)
plate = fill_rows(plate, m, 280)
plate = fill_left(plate, fore, 600)
hole = np.clip(fore + weed + far, 0, 1)

cv2.imwrite(os.path.join(OUT, 'plate.jpg'), plate, [cv2.IMWRITE_JPEG_QUALITY, 88])
if DBG:
    dbg = src.copy()
    dbg[hole > 0] = (dbg[hole > 0] * 0.4 + np.array([0, 0, 255]) * 0.6).astype(np.uint8)
    cv2.imwrite(os.path.join(DBG, 'mask.jpg'), dbg)

# ── 시작 화면 · 쓰러지는 장면 배경 ──
# 낮은 카메라: 오른쪽 하늘·메사 쪽을 크게, 초점 밖으로 흐리게, 역광으로 따뜻하게
low = plate[0:420, 640:1400].astype(np.float32)
low = cv2.resize(low, (1280, 708), interpolation=cv2.INTER_CUBIC)
low = cv2.GaussianBlur(low, (0, 0), 9)
low *= np.array([0.86, 0.95, 1.08])        # BGR — 노을빛
yy, xx = np.mgrid[0:708, 0:1280]
glow = np.exp(-(((xx - 820) / 520.0) ** 2 + ((yy - 380) / 300.0) ** 2))[..., None]
low = low * (0.7 + 0.45 * glow) + 40 * glow
vig = 1 - 0.55 * (((xx - 640) / 900.0) ** 2 + ((yy - 354) / 600.0) ** 2)
low = low * vig[..., None]
cv2.imwrite(os.path.join(OUT, 'low.jpg'), np.clip(low, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 84])
