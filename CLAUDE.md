# LectureCaption

영어 강의 음성을 실시간으로 전사하고, 문장 단위로 AI 교정 → 한국어 번역해서
원문과 함께 보여주는 단일 사용자용 웹앱. 로그인·저장 없음(새로고침 시 초기화).

> 이 파일은 Claude Code가 세션 시작 시 자동으로 읽는다. 기능/구조를 바꿀 때마다 함께 갱신할 것.

## 현재 구현된 기능

- **[기능 1] 실시간 전사** — 마이크 입력을 Web Speech API로 전사.
  - interim(중간) 결과는 회색으로 실시간 표시.
  - final(확정) 결과가 나오면 검은색으로 고정되고 `finalizedSentences`에 누적.
    이 시점이 "문장 끝" = 이후 AI 교정/번역의 진입점.
  - 시작/중지, 자동 재시작(침묵 후), 마이크 권한 거부/미지원 브라우저/네트워크 오류 처리.
- **[기능 1-a] 입력 파형 시각화** — 마이크 입력을 canvas에 실시간 waveform으로 표시.
  - 항상 화면에 보임. 녹음 중이 아니면 납작한 회색 선, 녹음 중이면 파란색 파형이 움직임.
  - Web Audio API `AnalyserNode`의 시간영역 데이터를 컴포넌트 자체 rAF 루프로 그림.

## 미구현 (다음 단계)

- **[기능 2]** 확정 문장을 백엔드 프록시(`/api/refine`)로 보내 AI 교정.
- **[기능 3]** 교정문을 한국어로 번역해 원문 아래에 표시.
- 문장 큐: 확정 문장 → 큐 → 비동기 교정/번역, 화면 표시는 항상 발화 순서 유지.
- 로딩 표시("교정 중…"), API 호출 실패 재시도.

## 폴더 / 파일 구조

```
index.html                     Vite 진입 HTML
vite.config.ts                 Vite + React 플러그인
tailwind.config.js             Tailwind content 경로
postcss.config.js              Tailwind + autoprefixer
tsconfig.json                  TS 설정 하나로 통합 (src + vite.config.ts, strict, no-any)
src/
  main.tsx                     React 부트스트랩 (StrictMode)
  App.tsx                      조립 루트. 훅 ↔ 컴포넌트 배선만 담당
  index.css                    Tailwind directives
  types/
    speech.d.ts                Web Speech API 타입 보강 (lib.dom에 없음)
    index.ts                   Sentence, SpeechError 등 도메인 타입
  hooks/
    useSpeechRecognition.ts    Web Speech API 래핑. 모든 인식 로직은 여기에만
    useMicWaveform.ts          파형용 별도 mic 스트림 + Web Audio 그래프. AnalyserNode 제공
  components/
    RecorderControls.tsx       시작/중지 버튼, 듣는 중 표시, 에러 배너
    Waveform.tsx               canvas 실시간 파형 (표시 전용, 자체 rAF 루프)
    LiveTranscript.tsx         확정 문장 + 현재 interim(회색) 표시 (표시 전용)
```

향후 추가 예정: `api/refine.ts`(Vercel Serverless Function), `src/lib/api.ts`(백엔드 호출).

## 주요 설계 결정과 이유

- **STT = 브라우저 Web Speech API** — 별도 서버/유료 API 없이 무료로 실시간 인식.
  대가로 Chromium 계열에서만 안정적이고 정확도 한계가 있음(아래 제약 참고).
- **인식 로직 ↔ 렌더링 분리** — 브라우저 API 접근은 `useSpeechRecognition` 훅에만.
  컴포넌트는 props로 받은 상태를 그리기만 함. 교체·테스트가 쉬워짐.
- **`wantListeningRef`로 사용자 의도 추적** — Web Speech API는 짧은 침묵에도 스스로
  `onend`를 발생시킴. 사용자가 "중지"를 누른 게 아니면 `onend`에서 자동 재시작해
  강의 중 긴 침묵에도 세션이 끊기지 않게 함.
- **Web Speech API 타입 직접 선언** — `@types` 패키지 추가 대신 `src/types/speech.d.ts`에
  실제 사용하는 멤버만 최소 선언 (의존성 최소화).
- **파형용 mic 스트림을 별도로 오픈** — Web Speech API는 마이크를 내부에서 잡고 오디오
  레벨을 노출하지 않음. 그래서 `useMicWaveform`이 `getUserMedia` 스트림을 따로 열어
  Web Audio `AnalyserNode`로 파형만 뽑음. Chromium은 동시 캡처 허용, 권한은 공유라
  추가 팝업 없음. 스트림은 `active`(녹음 중)일 때만 보유.
- **파형은 React state가 아닌 canvas + rAF로 그림** — 60fps로 setState 하면 리렌더
  폭주. `Waveform` 컴포넌트가 `AnalyserNode`에서 직접 샘플을 읽어 canvas에 그림.
- **AI 교정/번역은 백엔드 프록시 경유(예정)** — LLM API 키를 프론트에 노출하지 않기 위함.

## 알려진 제약사항

- Web Speech API는 **Chrome / Edge 등 Chromium 계열에서만** 안정적. Safari/Firefox 미지원 또는 불안정.
- **인터넷 연결 필수** (Web Speech API가 구글 서버로 오디오를 보냄).
- 전문 용어·고유명사 인식 오류 가능성. 화자/마이크 품질에 정확도가 크게 좌우됨.
- 문장 경계가 완벽하지 않음 — final 결과 하나가 여러 문장을 담거나 한 문장을 쪼갤 수 있음.
- 브라우저 탭이 백그라운드로 가면 인식이 중단될 수 있음.
- 파형: 첫 사용 시 브라우저에 따라 마이크 권한 팝업이 STT용과 별개로 한 번 더 뜰 수 있음.

## TODO / 나중에 고려할 것

- 정확도가 부족하면 Whisper 등 유료 STT로 교체 고려.
- 필요해지면 세션 저장/이력(내보내기) 기능 추가.
- 문장 경계 보정 로직(구두점·길이 기반) 검토.
- LLM 제공자: 현재 계획은 Anthropic Claude (문장 단위라 haiku 급이면 충분).

## 컨벤션

- 컴포넌트 PascalCase / 함수·변수 camelCase / 훅 `use*`.
- `any` 금지, 모든 함수·API 응답 타입 명시. 주석은 "왜"만.
- Conventional Commits (`feat:`, `fix:`, `refactor:` …).
- 파일 300줄 초과 시 분리.
- 새 의존성은 사전 승인 필요.

## 실행

```
npm install
npm run dev        # 개발 서버
npm run build      # 타입체크 + 프로덕션 빌드
npm run typecheck  # 타입체크만
```
