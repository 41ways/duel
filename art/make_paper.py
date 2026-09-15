"""
UI 질감 만들기 (원본 사진 없이 생성).
  public/img/paper_panel.png — 바랜 수배서 종이. 가장자리가 타고 해진 알파. CSS border-image 로 늘려 쓴다
  public/img/washi.jpg       — 한지 (사무라이)
  public/img/ink_stroke.png  — 마른 붓으로 그은 먹 한 획 (사무라이 단추 · 밑줄)

  python art/make_paper.py   (opencv-python-headless · numpy 필요)
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'img')
rng = np.random.default_rng(1877)


def fractal(h, w, octaves=6, persistence=0.55):
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        s = 2 ** o
        small = rng.random((max(2, h // (128 // min(s, 64))), max(2, w // (128 // min(s, 64))))).astype(np.float32)
        out += cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC) * amp
        total += amp
        amp *= persistence
    return out / total


# ── 수배서 종이 ──
H, W = 1000, 800
n = fractal(H, W)
fine = rng.normal(0, 1, (H, W)).astype(np.float32)
fine = cv2.GaussianBlur(fine, (0, 0), 0.8)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
edge = np.minimum.reduce([xx, yy, W - 1 - xx, H - 1 - yy])
# 해진 가장자리: 거리 + 잡음으로 들쭉날쭉
rough = fractal(H, W, octaves=7, persistence=0.6)
d = edge - 10 - (rough - 0.5) * 34 - fine * 1.5
alpha = np.clip(d / 2.0, 0, 1)
# 색: 가운데 밝은 누런 종이 → 가장자리로 갈수록 타서 짙은 갈색
burn = np.clip(1 - (edge - 8 - (rough - 0.5) * 30) / 90, 0, 1) ** 1.6
base = np.array([140, 196, 226], np.float32)          # BGR  #e2c48c
dark = np.array([40, 70, 110], np.float32)            # BGR  #6e4628
col = base[None, None] * (0.86 + 0.22 * n[..., None]) + fine[..., None] * 5
# 얼룩
for _ in range(14):
    cx, cy = rng.integers(0, W), rng.integers(0, H)
    r = rng.integers(40, 160)
    m = np.zeros((H, W), np.float32)
    cv2.circle(m, (int(cx), int(cy)), int(r), 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), r * 0.45) * rng.uniform(0.05, 0.14)
    col -= m[..., None] * np.array([60, 60, 40])
# 종이 섬유
for _ in range(900):
    x, y = rng.integers(0, W), rng.integers(0, H)
    ang = rng.uniform(0, np.pi)
    L = rng.integers(6, 26)
    x2, y2 = int(x + np.cos(ang) * L), int(y + np.sin(ang) * L)
    c = float(rng.uniform(-18, 12))
    cv2.line(col, (int(x), int(y)), (x2, y2), (c + 150, c + 196, c + 226), 1, cv2.LINE_AA)
col = col * (1 - burn[..., None]) + dark[None, None] * burn[..., None]
# 접힌 자국 두 줄
for fy in (H * 0.34, H * 0.67):
    band = np.exp(-((yy - fy) / 3.0) ** 2)[..., None]
    col = col * (1 - 0.1 * band) + 255 * 0.03 * np.exp(-((yy - fy - 4) / 3.0) ** 2)[..., None]
rgba = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
cv2.imwrite(os.path.join(OUT, 'paper_panel.png'), rgba)
print('paper_panel.png')

# ── 한지 ──
S = 768
n = fractal(S, S, octaves=5)
col = np.array([214, 230, 238], np.float32)[None, None] * (0.95 + 0.07 * n[..., None])
col += cv2.GaussianBlur(rng.normal(0, 1, (S, S)).astype(np.float32), (0, 0), 0.7)[..., None] * 3
for _ in range(1400):
    x, y = rng.uniform(0, S), rng.uniform(0, S)
    pts = [(x, y)]
    ang = rng.uniform(0, 2 * np.pi)
    for _ in range(rng.integers(3, 9)):
        ang += rng.normal(0, 0.5)
        x += np.cos(ang) * 5; y += np.sin(ang) * 5
        pts.append((x, y))
    c = float(rng.uniform(-22, 6))
    cv2.polylines(col, [np.array(pts, np.int32)], False, (c + 214, c + 230, c + 238), 1, cv2.LINE_AA)
cv2.imwrite(os.path.join(OUT, 'washi.jpg'), np.clip(col, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 85])
print('washi.jpg')

# ── 먹 한 획 ──
H2, W2 = 220, 1200
ink = np.zeros((H2, W2), np.float32)
hairs = 140
for i in range(hairs):
    off = (i / hairs - 0.5) * 150
    thick = rng.uniform(1.0, 3.2)
    y0 = H2 / 2 + off * 0.9
    x_start = 40 + abs(off) * rng.uniform(0.2, 0.9) + rng.uniform(0, 30)
    x_end = W2 - 60 - abs(off) ** 1.25 * rng.uniform(0.5, 2.0) - rng.uniform(0, 140)
    xs = np.arange(int(x_start), int(x_end))
    wav = np.sin(xs / rng.uniform(80, 200) + rng.uniform(0, 6)) * rng.uniform(0, 4)
    ys = y0 + wav + (xs - x_start) * rng.uniform(-0.02, 0.02) - np.exp(-(xs - x_start) / 40) * off * 0.35
    # 마른 붓 — 끝으로 갈수록 끊긴다
    dry = rng.random(len(xs)) < np.clip((xs - x_start) / (x_end - x_start) * 0.9 - 0.25, 0, 0.8)
    for x, y, skip in zip(xs, ys, dry):
        if skip:
            continue
        cv2.circle(ink, (int(x), int(y)), int(max(1, thick)), 1.0, -1)
ink = cv2.GaussianBlur(ink, (0, 0), 0.9)
ink = np.clip(ink * 1.3, 0, 1)
stroke = np.dstack([np.full((H2, W2), 18, np.uint8), np.full((H2, W2), 16, np.uint8), np.full((H2, W2), 20, np.uint8), (ink * 255).astype(np.uint8)])
cv2.imwrite(os.path.join(OUT, 'ink_stroke.png'), stroke)
print('ink_stroke.png')
