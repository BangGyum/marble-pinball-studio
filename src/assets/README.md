# 균열 협곡 그래픽

- 파일: `canyon-basalt.png`
- 제작: 2026-09-23, Codex 내장 `image_gen` 도구
- 용도: 물리 벽과 같은 좌표의 암벽 다각형 안에만 그리는 반복 질감. 레일, 다리, 움직이는 장치와 구슬은 Canvas로 별도 렌더링합니다.
- 구슬: `src/marble-art.ts`의 광택·음영 렌더러를 일반 게임과 LAN 화면에서 공유합니다.

최종 이미지 생성 프롬프트:

> Use case: stylized-concept. Asset type: seamless square rock material texture for a 2D browser pinball game. Generate an edge-to-edge square seamless tile of dark fractured basalt, rugged angular crystalline slate and subtle violet mineral undertones. Orthographic face-on stone texture, consistent diffuse lighting from upper left, small and medium angular cracks, closely packed faceted stone surfaces. Dark charcoal (#12151b), muted blue violet and near-black cracks, with enough subtle surface detail to see against a near-black background. No map layout, no balls, no lanes, no metal, no glowing lines, no text, no UI, no transparent edges, no large central object. This bitmap will be clipped to precise physics-aligned rock polygons in a neon green/violet canyon game; keep all stone details equally distributed so it can repeat unobtrusively.
