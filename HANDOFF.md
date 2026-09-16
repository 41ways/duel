# 인계 — 사무라이 일기토

서부(StandOff)는 끝난 상태에서, 방식 고르기 오른쪽 一騎討(사무라이 1:1)를 새로 만들었다. 이 문서는 사무라이 쪽 이어받는 사람용.

## 흐름

방식 고르기 → **samhome**(왼쪽 결투장 족자 · 오른쪽 매달린 나무패 방 목록) → **samboard**(대기실: 성문 앞 상대가 나를 보고, 나는 앞에서 등을 보임, 등에 사시모노) → **samversus**(선수 소개, 対 도장) → **samduel**(자세 → 암전 → Y자 선택 → 결과) → 다시 samboard

- 화면 사이 전환은 전부 벚꽃잎 닦기(`kind: 'sakura'`). 선수 소개 → 결투는 옛 장면을 계속 움직이며 닦는다(`wipe.live`)
- 게임 시작 버튼: 칼 + 총 소리. 사무라이 쪽 클릭음은 swing

## 규칙 (`public/duel.js`)

- 신호 없음. 자세(`T.stance` 2.6초) 뒤 5초(`LIMIT.samurai`) 안에 속공 · 강공 · 방어 중 하나
- 강공 > 방어 > 속공 > 강공, 같은 수 무승부. 못 고르고 멈추면 상대가 무엇을 골랐든(방어라도) 진다, 둘 다 멈추면 무승부. 기본 단판
- 봇은 0.7~2.8초 사이에 고르고 난이도 개념 없음
- 결과 보여주는 시간 `T.result.samurai` 9.4초, 둘 다 못 고름 `T.resultNone.samurai` 7.6초
- 규칙을 바꾸면 **서버를 다시 띄워야** 한다(server.js 가 duel.js 를 불러 둔다)

## 코드 위치

- `public/samurai.js` — `West.prototype` 에 덧씌우는 사무라이 연출 전부. `isSam(this)` 이면 사무라이 쪽 함수로 간다
  - 시간표: `CLASH = 1450`, `X = { cross, turn, kneel, clutch, slump, fall, cut, drawReveal }` — 교차 → 돌아봄 → 무릎 → 목 감쌈(death3) → 고꾸라짐 → 누움(death4) → 승자 등 뒤 컷
  - 대기실: `samLobbyLayout` 이 상대 · 나 자리를 정하고, `samBand` 가 머리부터 드러나기/사라지기, `samBanner` 가 사시모노(천은 좌우반전, 글자는 반전 안 함)
  - 영상 연출 코드(`VIDEO = false`)는 회사에서 쓸 수 있게 남겨 두었고 지금은 꺼져 있다. 원본 목록은 `art/영상-목록.md`
- `public/app.js` — 키(`SAM_KEYS`: 한 기기 둘이면 왼쪽 자리 A/W/D · 오른쪽 자리 ←/↑/→, 혼자면 둘 다), `#moves` Y자 선택 입력, 나무패 목록, 사무라이 쪽 소리 순서
- `public/style.css` — `body[data-mode="samurai"]` 아래가 사무라이 테마. `.w-only` / `.s-only` 로 모드별 요소를 가른다
- `public/sound.js` — 녹음 파일(shot · swing · swordout · swordfight · samuraiready · samuraistart), `S.play(name, gain, fallback)`, `S.music()`

## 이미지 · 소리

- `public/img/sam_*.png` 는 원본에서 배경을 따 낸 누끼(대기실 배경, 붉은 사무라이, 뒷모습, 선 자세, 발도술 자세 `sam_iai`, death1~4), `sakura.webp` 벚꽃잎
- 발도술 자세는 `art/cut_samurai.py` 로 딴다(`art/samuraifight.png` → `public/img/sam_iai.png`). 발밑 마루 · 그림자를 자르는 선이 그림 한 장에 맞춰 박혀 있다
- `public/sound/*.mp3`
- 일본어 폰트는 Google Fonts 에서 **쓰는 한자만** 받는다(index.html 의 `text=`). 새 한자를 쓰면 거기에 추가해야 한다

## 마지막 작업에서 바꾼 것

- 방어 vs 멈춤이 무승부이던 것 → 방어가 이긴다
- 한 기기 둘이 키: 오른쪽 자리 J/I/L → 화살표
- 고른 기술이 결과 전까지 안 보이게: Y자 고른 칸 강조 · 내 뒤로 뜨던 기술 한자 뺌(세 칸이 똑같이 흐려지기만)
- 뒤로가기(사무라이): 금테 옻칠 나무패 + 붓글씨 + 붉은 마름모 인
- 대기실 対 도장이 상대 깃발 이름을 가리던 것 → 깃발 천 왼쪽으로 옮김
- 채팅창(사무라이): 높이 30vh → 21vh, 글자 14 → 17px
- 선수 소개 → 결투 전환 때 벚꽃이 지나가는 동안 화면이 멈추던 것 → 계속 그림
- 전환 벚꽃 가운데 분홍 옅게, 휙 소리 부드럽게, 대기실 그림자 자연스럽게, Y자 글자 크게

- 스쳐 벨 때는 `sam_iai`(발도술 자세)로 그리고, 돌아서는 사이(`turnP` 0.5, 옆으로 얇아질 때)에 선 자세로 바꾼다 — 베고 난 뒤엔 선 채로 멈춘다
- 스쳐 베기 `READY`(620ms) 앞은 준비 컷(`drawSamReady`) — 발도술 자세로 마주 서서 손 · 자루(`sam_iai_hand`)가 칼집 입에서 앞으로 나가고 그 사이로 날이 드러난다(`samIaiDraw`). 빛이 날을 훑고 → 칼집 입에서 번뜩. 소리는 `swordout`
  - 칼 선 · 칼집 입 자리는 `AXIS` · `MOUTH` · `GUARD` 상수. `GUARD` 를 `MOUTH` 에 가깝게 할수록 조금만 뽑힌다
- 밤 무대(`samNight`)와 자리 나누기(`samSeatPair`)는 준비 컷 · 교차 장면이 같이 쓴다 — 둘이 어긋나면 컷이 튄다

## 남은 것 · 주의

- 미리보기 창이 가려져 있으면 rAF · CSS 애니메이션이 멈춰 스크린샷이 옛 화면일 수 있다
- 캔버스 `destination-in` 합성에서 높이 0 사각형을 그리면 캔버스가 통째로 지워진다(대기실 인물이 떡하니 나타나던 원인)
- 배포는 `npx wrangler deploy` — 푸시만으로는 사이트가 안 바뀐다

## 개발

```
node server.js       # http://localhost:8850
npm test             # 규칙 16개
node test/smoke.js   # 떠 있는 서버에 붙어 한 판 (7개)
node test/sim.js ws://localhost:8850/ws 6   # 방 6개를 사람처럼 굴려 본다(봇 · 같은 기기 자리 · 끊김 · 다시 붙기)
```
