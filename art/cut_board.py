"""
westboard.png(흰 배경 게시판) → public/img/board.png
흰 배경을 빼고 발밑 자갈은 잘라 내고, 서부 거리 사진에 맞춰 따뜻한 갈색으로 물들인다.
다리는 잘라 내고 판만 쓴다. 판자 안쪽(글이 들어갈 자리)은 잘린 그림 기준으로 app 의 CSS(.tb-in)에 맞춘다.

  python art/cut_board.py   (opencv-python-headless · numpy 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
src = cv2.imread(os.path.join(HERE, 'westboard.png'), cv2.IMREAD_COLOR)
H, W = src.shape[:2]
src = src[:493]                                        # 다리 · 매단 간판 · 자갈은 버리고 판만 쓴다 (틀 아래 끝 y≈495)
dist = np.linalg.norm(255.0 - src.astype(np.float32), axis=2)
near = (dist < 40).astype(np.uint8)
ff = np.zeros((src.shape[0] + 2, W + 2), np.uint8)
for x in range(0, W, 6):
    for y in (0, src.shape[0] - 1):
        if near[y, x] == 1:
            cv2.floodFill(near, ff, (x, y), 2)
for y in range(0, src.shape[0], 6):
    for x in (0, W - 1):
        if near[y, x] == 1:
            cv2.floodFill(near, ff, (x, y), 2)
bg = near == 2
# 틀과 등불 사이처럼 가장자리와 안 이어진 틈도 흰 배경 — 거의 흰 곳은 모두 뺀다
bg |= dist < 32
alpha = np.ascontiguousarray(np.where(bg, 0, 1).astype(np.float32))   # 배경이 옅은 회색이라 거리로 알파를 주면 반투명하게 남는다
alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (0, 0), 0.9)
# 오른쪽 아래 생성 표시(✦) 자리는 어차피 배경 — 알파로 지워진다
# 따뜻한 갈색으로: 채도를 조금 올리고 붉은 갈색 쪽으로 옮긴다
f = src.astype(np.float32)
grey = f.mean(axis=2, keepdims=True)
f = grey + (f - grey) * 1.25
f = f * np.array([0.78, 0.9, 1.08]) + np.array([-4, 2, 10])       # BGR
f = np.clip(f * 0.95, 0, 255)
rgba = np.dstack([f.astype(np.uint8), (alpha * 255).astype(np.uint8)])
ys, xs = np.where(alpha > 0.05)
t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
cv2.imwrite(os.path.join(OUT, 'board.png'), rgba[t:b, l:r])
print('board.png', r - l, 'x', b - t, 'offset', (int(l), int(t)))
