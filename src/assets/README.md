# 균열 협곡 그래픽

- 파일: `canyon-basalt.png`
- 제작: 2026-09-23, Codex 내장 `image_gen` 도구
- 용도: 물리 벽과 같은 좌표의 암벽 다각형 안에만 그리는 반복 질감. 레일, 다리, 움직이는 장치와 구슬은 Canvas로 별도 렌더링합니다.
- 구슬: `src/marble-art.ts`의 광택·음영 렌더러를 일반 게임과 LAN 화면에서 공유합니다.

최종 이미지 생성 프롬프트:

> Use case: stylized-concept. Asset type: seamless square rock material texture for a 2D browser pinball game. Generate an edge-to-edge square seamless tile of dark fractured basalt, rugged angular crystalline slate and subtle violet mineral undertones. Orthographic face-on stone texture, consistent diffuse lighting from upper left, small and medium angular cracks, closely packed faceted stone surfaces. Dark charcoal (#12151b), muted blue violet and near-black cracks, with enough subtle surface detail to see against a near-black background. No map layout, no balls, no lanes, no metal, no glowing lines, no text, no UI, no transparent edges, no large central object. This bitmap will be clipped to precise physics-aligned rock polygons in a neon green/violet canyon game; keep all stone details equally distributed so it can repeat unobtrusively.

## 만타가오리 (2026-11-06)

- 파일: `effects/manta-v1/manta.png`, 1774×887 RGBA 투명 PNG.
- 제작: Codex 내장 `image_gen`, `transparent_background=true`. 기존 돌고래는 그림체만 참고했습니다.
- 생성 프롬프트: `effects/manta-v1/prompt.txt`. 원본을 가공하지 않고 프로젝트에 복사했습니다.
- 알파 128 이상 외곽선을 `scripts/trace-manta-hitbox.py`로 추출합니다. 크롭 좌표·SHA-256·허용 오차·정점 수는 같은 폴더의 `inspection.json`에 기록합니다.
- 접촉 판정: `src/manta-hitbox.ts`. 지느러미·꼬리의 오목한 여백을 보존하고 돌고래와 외곽선 판정 코드를 공유합니다.
- 독립 시안: `tests/manta-preview.html`. 실제 경기와 LAN에는 `src/manta.ts`의 지그재그 이동, `src/sea-animals.ts`의 번갈아 출몰 시간표와 함께 연결했습니다. 줄·크기·속도·간격은 동물마다 따로 설정합니다.
