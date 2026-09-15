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
# 왼쪽 판자를 거울로 번갈아 이어 붙이면 경계에서 결이 이어진다
left = src[:, 0:410]
wall = np.hstack([left, left[:, ::-1], left, left[:, ::-1]])
cv2.imwrite(os.path.join(OUT, 'wood.jpg'), wall, [cv2.IMWRITE_JPEG_QUALITY, 84])
print('wood.jpg', wall.shape[1], 'x', wall.shape[0])
