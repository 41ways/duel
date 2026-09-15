"""
모드 고르기 화면 재료.
  public/img/mode_west_bg.jpg · mode_west_man.png      — standoffbackground + standoffduel
  public/img/mode_samurai_bg.jpg · mode_samurai_man.png — showdownbackground + showdownsamurai

  python art/cut_modes.py   (opencv-python-headless · numpy 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
DBG = os.environ.get('DBG')


def unmark(img, x, y, r=30):
    """오른쪽 아래 생성 표시(✦) 지우기"""
    m = np.zeros(img.shape[:2], np.uint8)
    cv2.circle(m, (x, y), r, 1, -1)
    return cv2.inpaint(img, m, 9, cv2.INPAINT_TELEA)


def cutout(img, rect, sure_fg, sure_bg=(), iters=8, gaps=()):
    h, w = img.shape[:2]
    corner = np.median(np.vstack([img[:20, :20].reshape(-1, 3), img[:20, -20:].reshape(-1, 3)]), axis=0)
    dist = np.linalg.norm(img.astype(np.float32) - corner, axis=2)
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    x0, y0, x1, y1 = rect
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    mask[(mask == cv2.GC_PR_FGD) & (dist < 14)] = cv2.GC_PR_BGD
    # 밝고 색이 옅은 곳(스튜디오 배경 그라데이션)은 아마 배경
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    pale = (hsv[:, :, 2] > 165) & (hsv[:, :, 1] < 38)
    mask[(mask == cv2.GC_PR_FGD) & pale] = cv2.GC_PR_BGD
    for poly in sure_fg:
        cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_FGD)
    for poly in sure_bg:
        cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_BGD)
    bgm = np.zeros((1, 65)); fgm = np.zeros((1, 65))
    cv2.grabCut(img, mask, None, bgm, fgm, iters, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
    # 틈(다리 사이 · 목 옆)에 남은 옅은 배경은 색으로 한 번 더 뺀다
    for (ax, ay, bx, by) in gaps:
        sub = hsv[ay:by, ax:bx]
        pale_gap = (sub[:, :, 2] > 140) & (sub[:, :, 1] < 50)
        fg[ay:by, ax:bx][pale_gap] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg, 8)
    fg = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (0, 0), 1.0)
    ys, xs = np.where(alpha > 8)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    return rgba[t:b, l:r]


def save_check(rgba, name):
    if not DBG:
        return
    a = rgba[:, :, 3:] / 255.0
    bg = np.zeros_like(rgba[:, :, :3]); bg[:] = (40, 140, 220)
    cv2.imwrite(os.path.join(DBG, name), (rgba[:, :, :3] * a + bg * (1 - a)).astype(np.uint8))


def far_bg(bg, sigma, grade_bgr, dark):
    """배경을 멀리 — 초점 밖으로 흐리고, 공기 색을 입히고, 조금 어둡게"""
    f = cv2.GaussianBlur(bg.astype(np.float32), (0, 0), sigma)
    f = f * (1 - 0.28) + np.array(grade_bgr, np.float32) * 0.28
    return np.clip(f * dark, 0, 255).astype(np.uint8)


def match_color(rgba, ref, amount):
    """인물 색을 배경 조명에 맞춘다 — LAB 평균 · 분산을 amount 만큼 따라간다(알파 있는 곳만)"""
    rgb = rgba[:, :, :3]
    a = rgba[:, :, 3] > 128
    src = cv2.cvtColor(rgb, cv2.COLOR_BGR2LAB).astype(np.float32)
    dst = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB).astype(np.float32)
    out = src.copy()
    for c in range(3):
        sm, ss = src[:, :, c][a].mean(), src[:, :, c][a].std() + 1e-3
        dm, ds = dst[:, :, c].mean(), dst[:, :, c].std() + 1e-3
        k = amount if c else amount * 0.5          # 밝기는 반만
        moved = (src[:, :, c] - sm) * (ss + (ds - ss) * k * 0.5) / ss + sm + (dm - sm) * k
        out[:, :, c] = moved
    res = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    return np.dstack([res, rgba[:, :, 3]])


# ── 서부 ──
bg = cv2.imread(os.path.join(HERE, 'standoffbackground.png'), cv2.IMREAD_COLOR)
bg = unmark(bg, 1287, 648)
west_bg = bg
cv2.imwrite(os.path.join(OUT, 'mode_west_bg.jpg'), far_bg(bg, 3.2, (120, 170, 210), 0.86), [cv2.IMWRITE_JPEG_QUALITY, 82])
man = cv2.imread(os.path.join(HERE, 'standoffduel.png'), cv2.IMREAD_COLOR)
west = cutout(man, (520, 10, 880, 760), sure_bg=[[(520, 60), (600, 60), (600, 250), (520, 300)], [(880, 60), (800, 60), (820, 200), (880, 260)], [(690, 565), (735, 565), (742, 700), (682, 700)]],
              sure_fg=[[(690, 150), (730, 150), (740, 300), (720, 480), (690, 480), (670, 300)]],
              gaps=[(640, 470, 790, 705), (630, 80, 690, 160), (740, 80, 790, 160)])
west = match_color(west, west_bg, 0.35)
cv2.imwrite(os.path.join(OUT, 'mode_west_man.png'), west)
save_check(west, 'mode_west_chk.png')
print('west man', west.shape[1], 'x', west.shape[0])

# ── 사무라이 ──
bg = cv2.imread(os.path.join(HERE, 'showdownbackground.png'), cv2.IMREAD_COLOR)
bg = unmark(bg, 1245, 648)
sam_bg = bg
cv2.imwrite(os.path.join(OUT, 'mode_samurai_bg.jpg'), far_bg(bg, 3.2, (200, 170, 150), 0.9), [cv2.IMWRITE_JPEG_QUALITY, 82])
sam = cv2.imread(os.path.join(HERE, 'showdownsamurai.png'), cv2.IMREAD_COLOR)
samu = cutout(sam, (480, 15, 945, 740),
              sure_fg=[[(680, 60), (740, 60), (760, 400), (720, 600), (680, 600), (650, 400)]],
              sure_bg=[[(400, 736), (1000, 736), (1000, 768), (400, 768)],
                       [(420, 690), (535, 690), (535, 740), (420, 740)],
                       [(615, 700), (795, 700), (795, 740), (615, 740)],
                       [(875, 690), (1000, 690), (1000, 740), (875, 740)],
                       [(672, 468), (748, 468), (760, 592), (662, 592)]])
samu = match_color(samu, sam_bg, 0.45)
cv2.imwrite(os.path.join(OUT, 'mode_samurai_man.png'), samu)
save_check(samu, 'mode_samurai_chk.png')
print('samurai man', samu.shape[1], 'x', samu.shape[0])
