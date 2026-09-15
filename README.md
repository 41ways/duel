# 결투

지금! 이 뜨면 먼저 쏘는 사람이 이기는 서부 총잡이 반응속도 게임. 최대 네 명(1v1v1v1).

https://duel.41ways.workers.dev/

- 시작 화면: 어둠 속 총 두 발에 "결투"가 비치고, 칼이 화면을 베고, 칼끼리 부딪히며 DUEL · 게임 시작
- 방식 고르기: 왼쪽 StandOff(총잡이) · 오른쪽 一騎討(사무라이 1:1). 올리면 그쪽이 넓어지고, 고르면 화면을 덮으며 넘어간다
- 방 만들기 → 대기방은 나무 벽에 수배서. 들어오면 사진 붙은 수배서가 박힌다
- 결투 시작: 회전초가 화면을 닦고 번개로 갈라진 선수 소개, 다시 회전초 → 결투장
- 신호 전에 쏘면 오발. 0.1초보다 빠르면 부정출발
- 총성 → 암전 → 역광 속에서 무릎 꿇고 쓰러지는 뒷모습 → 먼지 너머 실루엣에서 드러나는 승자와 이름
- 조작은 마우스(터치) 하나. 봇이랑 연습, 한 기기 둘이(화면 왼쪽/오른쪽)

## 구조

- `public/duel.js` 판 규칙과 진행. 서버와 브라우저(연습·한 기기)가 같이 쓴다
- `public/west.js` 캔버스 연출. 그림은 `public/img/` 이미지를 자르고 옮기기만 한다
- `game.js` 방 관리, `worker.js` Cloudflare Durable Object, `server.js` 로컬 Node 서버(8850)
- 반응 시간은 각자 화면이 신호를 받은 순간부터 재서 보내므로 핑 차이로 손해 보지 않는다

## 이미지

`art/` 원본에서 뽑는다 (opencv-python-headless · numpy · pillow 필요).

```
python art/cut_lineup.py   # westernduelists.png → gun1~4 전신 · 가슴 위
python art/cut_scene.py    # westernduel.png → 배경판 · 회전초 · 낮은 카메라 배경
python art/cut_back.py     # 뒷모습 · 무릎 · 쓰러짐 → 앞사람 · 총 드는 팔 · 쓰러지는 장면, 멀리 선 사람 색 맞추기
python art/cut_wanted.py   # wanted.png → 수배서 한 장 · 나무 벽
python art/cut_modes.py    # standoff* · showdown* → 방식 고르기 화면 배경과 인물
```

## 개발

```
npm install
node server.js             # http://localhost:8850
npm test                   # 규칙
node test/smoke.js         # 떠 있는 서버에 붙어 한 판
npx wrangler deploy        # 배포 (푸시만으로는 안 바뀐다)
```

사무라이 일기토(1:1, 속공 · 강공 · 방어 가위바위보)는 `public/samurai.js`. 이어받을 내용은 [HANDOFF.md](HANDOFF.md).
