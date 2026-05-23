# ilikepdf

브라우저에서 동작하는 프라이버시 우선 PDF 에디터. 파일은 서버로 전송되지 않습니다.

## 기능
- PDF 미리보기 (PDF.js)
- 텍스트 추가 (한글 폰트 임베드)
- 이미지 삽입 (PNG/JPEG)
- 가리기(흰 박스) — 기존 콘텐츠 마스킹
- 페이지 네비게이션, 줌, Undo/Redo
- 편집된 PDF 다운로드 (pdf-lib)

## 스택
- Next.js 15 (App Router) + React 19
- TypeScript, Tailwind CSS
- pdf-lib + @pdf-lib/fontkit (편집/저장)
- pdfjs-dist (렌더링)
- fabric (편집 오버레이)
- zustand (상태/히스토리)

## 시작
```bash
npm install
npm run dev
```

## 구조
```
src/
  app/             # Next.js App Router (랜딩/레이아웃)
  components/      # Editor, PdfCanvas, OverlayCanvas, Toolbar
  lib/             # types, zustand store, PDF export 로직
```

## 알려진 한계
- 기존 PDF 텍스트 자체를 "수정"하지 않음 → 가리기 + 새 텍스트 오버레이 방식 사용
- 한글 폰트는 CDN(Noto Sans KR)에서 로드 — 오프라인 시 영문 폰트로 폴백
- 페이지 회전/병합/분할은 v0.2에서 추가 예정
- 100MB+ 대용량 PDF는 메모리 한계 발생 가능 (Web Worker 도입 예정)

## 로드맵
- [ ] 페이지 회전/삭제/순서변경
- [ ] PDF 병합/분할
- [ ] 전자서명/도장
- [ ] 주석(annotation) 도구
- [ ] 다국어 폰트 자동 임베드
# ILikePDF
