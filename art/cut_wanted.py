"""
wanted.png(나무 벽에 붙은 수배서) → 대기방 재료.
  public/img/poster.png  — 수배서 한 장 (알파). 사진 칸은 x 530–877, y 190–405 (원본 좌표 − 잘린 위치)
  public/img/wood.jpg    — 수배서를 뺀 나무 벽 (가로로 이어 붙임)

  python art/cut_wanted.py   (opencv-python-headless · numpy 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
src = cv2.imread(os.path.join(HERE, 'wanted.png'), cv2.IMREAD_COLOR)
H, W = src.shape[:2]

# ── 수배서: 밝은 종이 vs 갈색 나무. GrabCut 으로 찢긴 가장자리까지 ──
mask = np.zeros((H, W), np.uint8)
mask[2:H - 2, 412:998] = cv2.GC_PR_FGD
mask[30:730, 450:960] = cv2.GC_FGD
bgm = np.zeros((1, 65)); fgm = np.zeros((1, 65))
cv2.grabCut(src, mask, None, bgm, fgm, 5, cv2.GC_INIT_WITH_MASK)
fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(fg, 8)
fg = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
fg = np.zeros_like(fg); cv2.drawContours(fg, cnts, -1, 1, cv2.FILLED)
alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (0, 0), 0.8)
ys, xs = np.where(alpha > 10)
t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
rgba = cv2.cvtColor(src, cv2.COLOR_BGR2BGRA); rgba[:, :, 3] = alpha
# 사진 칸 안 안내 글씨는 종이색으로 덮는다 (사진이 없을 때 빈 칸으로 보이게)
paper = cv2.GaussianBlur(src[200:400, 540:870], (0, 0), 25)
box = rgba[190:406, 530:878, :3]
dark = (cv2.cvtColor(box, cv2.COLOR_BGR2GRAY) < 120).astype(np.uint8)
dark = cv2.dilate(dark, np.ones((5, 5), np.uint8))
inp = cv2.inpaint(np.ascontiguousarray(box), dark, 5, cv2.INPAINT_TELEA)
rgba[190:406, 530:878, :3] = inp
# 이름 · 별명 점선도 지워 둔다 — 화면이 손글씨로 채운다
line = rgba[500:532, 455:950, :3]
dots = (cv2.cvtColor(line, cv2.COLOR_BGR2GRAY) < 130).astype(np.uint8)
dots = cv2.dilate(dots, np.ones((3, 3), np.uint8))
rgba[500:532, 455:950, :3] = cv2.inpaint(np.ascontiguousarray(line), dots, 4, cv2.INPAINT_TELEA)
cv2.imwrite(os.path.join(OUT, 'poster.png'), rgba[t:b, l:r])
print('poster.png', r - l, 'x', b - t, 'offset', (int(l), int(t)))

# ── 나무 벽: 왼쪽 · 오른쪽 판자를 이어 붙인다 ──
# 오른쪽 아래 생성 표시(✦)는 지운다
wm = np.zeros((H, W), np.uint8)
cv2.circle(wm, (1287, 649), 30, 1, -1)
src = cv2.inpaint(src, wm, 9, cv2.INPAINT_TELEA)
# 왼쪽 · 오른쪽 판자를 번갈아 — 거울로 뒤집으면 옹이가 대칭으로 보여 어색하다
left = src[:, 0:410]
right = src[:, 1000:W]
wall = np.hstack([left, right, left, right])
cv2.imwrite(os.path.join(OUT, 'wood.jpg'), wall, [cv2.IMWRITE_JPEG_QUALITY, 84])
print('wood.jpg', wall.shape[1], 'x', wall.shape[0])

# ── 빈 수배서: 맨 위 WANTED 와 테두리만 남기고 속을 종이로 채운다 ──
# 화면이 사진 · DEAD OR ALIVE · 이름을 그 위에 새로 올린다
post = cv2.imread(os.path.join(OUT, 'poster.png'), cv2.IMREAD_UNCHANGED)
ph, pw = post.shape[:2]
rgb = post[:, :, :3].copy()
X0, X1, Y0, Y1 = 44, pw - 44, 130, ph - 41
region = np.zeros((ph, pw), np.uint8)
region[Y0:Y1, X0:X1] = 1
gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
text = (gray < 150).astype(np.uint8)        # 글자 전부(WANTED 포함)를 빼고 밑색을 구해야 번지지 않는다
text = cv2.dilate(text, np.ones((9, 9), np.uint8))
# 밑색: 줄여서 인페인트 → 넓고 매끄럽게
sm = cv2.resize(rgb, (pw // 4, ph // 4), interpolation=cv2.INTER_AREA)
msm = cv2.dilate(cv2.resize(text, (pw // 4, ph // 4), interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
tone = cv2.inpaint(sm, msm, 5, cv2.INPAINT_TELEA)
tone = cv2.GaussianBlur(cv2.resize(tone, (pw, ph), interpolation=cv2.INTER_CUBIC).astype(np.float32), (0, 0), 6)
# 결: 깨끗한 종이 조각의 고주파를 뒤집어 가며 이어 붙인다
patch = rgb[195:395, 125:455].astype(np.float32)
hp = patch - cv2.GaussianBlur(patch, (0, 0), 8)
tile = np.vstack([np.hstack([hp, hp[:, ::-1]]), np.hstack([hp[::-1], hp[::-1, ::-1]])])
reps = (int(np.ceil(ph / tile.shape[0])) + 1, int(np.ceil(pw / tile.shape[1])) + 1, 1)
grain = np.tile(tile, reps)[:ph, :pw]
fill = np.clip(tone + grain * 0.7, 0, 255)
soft = cv2.GaussianBlur(region.astype(np.float32), (0, 0), 2.5)[..., None]
out = rgb.astype(np.float32) * (1 - soft) + fill * soft
blank = post.copy()
blank[:, :, :3] = np.clip(out, 0, 255).astype(np.uint8)
cv2.imwrite(os.path.join(OUT, 'poster_blank.png'), blank)
print('poster_blank.png', pw, 'x', ph)

# ── 구멍 뚫린 수배서: 사진 칸을 반듯하게 도려내고 먹색 액자 줄을 두른다 (방 만들기 화면) ──
# 구멍 자리(원본 좌표)는 화면(style.css .hole)이 얼굴을 맞출 때 같이 쓴다: x 128 · y 150 · 320 × 240
HX, HY, HW, HH = 128, 150, 320, 240
holed = cv2.imread(os.path.join(OUT, 'poster_blank.png'), cv2.IMREAD_UNCHANGED)
# 액자: 바깥 굵은 줄 + 안쪽 가는 줄 (종이 위에 인쇄된 틀)
ink = (26, 38, 52)                                      # BGR — 바랜 먹색
cv2.rectangle(holed, (HX - 9, HY - 9), (HX + HW + 8, HY + HH + 8), (*ink, 255), 2, cv2.LINE_AA)
cv2.rectangle(holed, (HX - 4, HY - 4), (HX + HW + 3, HY + HH + 3), (*ink, 255), 1, cv2.LINE_AA)
# 구멍은 반듯한 직사각형
holed[HY:HY + HH, HX:HX + HW, 3] = 0
cv2.imwrite(os.path.join(OUT, 'poster_hole.png'), holed)
print('poster_hole.png')
