"""발도술 자세(samuraifight.png) 누끼 — 흰 배경과 발밑 마루 · 그림자를 지우고 사람만 남긴다.

    python3 art/cut_samurai.py   →   public/img/sam_iai.png

원본은 왼쪽을 본다. 게임에서 오른쪽을 봐야 하면 그릴 때 좌우로 뒤집는다.
"""
import cv2
import numpy as np
from pathlib import Path

SRC = Path(__file__).parent / 'samuraifight.png'
OUT = Path(__file__).parent.parent / 'public' / 'img' / 'sam_iai.png'
OUT_HAND = Path(__file__).parent.parent / 'public' / 'img' / 'sam_iai_hand.png'

# 칼을 뽑을 때 앞으로 나가는 손 — 누끼 그림에서 손 · 자루 · 코등이만 떼어 낸다(정규 좌표)
HAND = (0.045, 0.325, 0.325, 0.565)   # 왼쪽, 위, 오른쪽, 아래
HAND_FEATHER = 10                      # 가장자리를 흐려 실루엣에 자연스럽게 얹힌다

# 발밑을 자르는 선 — 이 그림 한 장에 맞춰 잰 값이다(원본 1408×768)
FLOOR_Y = 640                       # 이 아래로는 마루 · 그림자, 발만 예외
FOOT_FRONT = (574, 684, 691)        # 앞발(왼쪽): x 범위와 밑창 높이
FOOT_BACK = (1062, 1152, 688, 722)  # 뒷발(오른쪽): 밑창이 비스듬해 앞뒤 높이를 따로 준다
FOOT_DARK = 150                     # 발 언저리에서 사람으로 칠 밝기 — 그늘진 살갗(50~90)과 마루 띠(170~)가 갈린다


def main():
    img = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 흰 배경과 가르기 — 사람 · 마루가 한 덩어리로 잡힌다
    n, lab, stats, _ = cv2.connectedComponentsWithStats((grey < 215).astype(np.uint8), 8)
    person = lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))

    # 마루와 그림자 떼기 — 바닥 선 위쪽, 그리고 두 발자리의 어두운 곳만 남긴다
    Y, X = np.mgrid[0:h, 0:w]
    ax0, ax1, ay = FOOT_FRONT
    bx0, bx1, by0, by1 = FOOT_BACK
    sole = by0 + (X - bx0) * (by1 - by0) / (bx1 - bx0)   # 뒷발 밑창은 비스듬한 선
    feet = (((X > ax0) & (X < ax1) & (Y < ay)) | ((X > bx0) & (X < bx1) & (Y < sole))) & (grey < FOOT_DARK)
    person = cv2.morphologyEx((person & ((Y < FLOOR_Y) | feet)).astype(np.uint8),
                              cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    n, lab, stats, _ = cv2.connectedComponentsWithStats(person, 8)
    person = np.where(lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])), 255, 0).astype(np.uint8)
    person = cv2.morphologyEx(person, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))   # 발가락 사이 좁쌀 구멍 메우기

    # 가장자리 한 겹 부드럽게 — 흰 테 없이
    alpha = cv2.GaussianBlur(person, (0, 0), 1.1)
    alpha = np.clip((alpha.astype(np.int16) - 60) * 2, 0, 255).astype(np.uint8)

    out = np.dstack([img, alpha])
    ys, xs = np.where(alpha > 6)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT), out)
    print(OUT, out.shape)

    # 손 · 자루 조각 — 잘린 자리가 티 나지 않게 가장자리를 흐린다
    oh, ow = out.shape[:2]
    x0, y0, x1, y1 = (int(HAND[0] * ow), int(HAND[1] * oh), int(HAND[2] * ow), int(HAND[3] * oh))
    hand = out[y0:y1, x0:x1].copy()
    hh, hw = hand.shape[:2]
    ramp = np.ones((hh, hw), np.float32)
    f = HAND_FEATHER
    for i in range(f):
        v = (i + 1) / (f + 1)
        ramp[i, :] = np.minimum(ramp[i, :], v); ramp[hh - 1 - i, :] = np.minimum(ramp[hh - 1 - i, :], v)
        ramp[:, i] = np.minimum(ramp[:, i], v); ramp[:, hw - 1 - i] = np.minimum(ramp[:, hw - 1 - i], v)
    hand[:, :, 3] = (hand[:, :, 3].astype(np.float32) * ramp).astype(np.uint8)
    cv2.imwrite(str(OUT_HAND), hand)
    print(OUT_HAND, hand.shape, 'at', (x0 / ow, y0 / oh))


if __name__ == '__main__':
    main()
