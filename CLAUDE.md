# LectureCaption

영어 강의를 전사하고, **AI가 이해하기 쉬운 한국어 학습 노트로 정리**해 주는 단일 사용자용 웹앱.
컨셉은 "실시간 자막"이 아니라 **LLM 강의 보조**. 로그인·서버·저장 없음(새로고침 시 초기화).

> 이 파일은 Claude Code가 세션 시작 시 자동으로 읽는다. 기능/구조를 바꿀 때마다 함께 갱신할 것.

## 아키텍처 한눈에

**순수 정적 SPA. 백엔드 없음.**

```
마이크 → useSpeechRecognition (Web Speech API) → onFinalSentence(문장)
                                                     ↓
                              useTranscript ── settings.mode 로 분기
        ┌────────────────────────┼───────────────────────────────┐
   transcribe                translate                          refine (고급)
   문장 = 세그먼트 즉시 done   문장 = 세그먼트 → 브라우저 번역     문장을 버퍼에 모음
                            (lib/translator.ts, 온디바이스)     → ~20문장마다 한 덩어리 flush
                                                                → 세그먼트 1개, 순차 처리
                                                                   lib/refine.ts refineParagraph()
                                                                   + 회전 메모리(glossary/outline/recentNotes)
                                                                   → PROVIDERS[id].loadChat() 동적 import
                                                                   → 제공자 API 직접 호출(BYOK)
```

- transcribe / translate = **API 키 불필요**. refine 에서만 사용자 LLM 키 필요(localStorage에만, 제공자로만 전송).
- **세그먼트** = 화면 표시 단위. transcribe/translate에선 문장, refine에선 ~20문장 덩어리.

## 모드 (기능 5)

`Settings.mode: 'transcribe' | 'translate' | 'refine'` (기본 `translate`). `SettingsPanel` 상단에서 선택.

| 모드 | 하는 일 | 키 |
|------|---------|-----|
| transcribe | 음성 → 텍스트만 | 불필요 |
| translate | 전사 + 문장별 한국어 번역 (Chrome 138+ 내장 `Translator`, 온디바이스·무료·오프라인) | 불필요 |
| **refine (고급)** | 전사 오류 교정 + **개조식 한국어 학습 노트 재구성** + 어려운 용어·개념 설명 | 제공자 키 필요 |

## refine 모드: AI 강의 노트 (기능 6)

번역이 아니라 **발화 내용 기반으로 새로 설명하듯** 재작성한다.

- **버퍼 → flush** (`useTranscript`): 확정 문장을 `bufferRef`에 모아 **~20문장 덩어리**로 flush.
  조건: **20문장** / **8초 침묵**(단, 15문장 이상일 때만) / **3분(180초) 최대** / "중지"(App `finalize()`).
  버퍼에 쌓이는 동안 `LiveTranscript`가 실시간 read-along 전사로 보여줌("전사 N문장 · 노트 대기 중").
- **프롬프트** (`providers/prompt.ts` `PARAGRAPH_SYSTEM_PROMPT`): 전사에 오인식 단어가 많으니
  그대로 옮기지 말고 (1) 문맥·GLOSSARY·도메인 지식으로 실제 의도를 파악해 오류 교정,
  (2) **이해하기 쉬운 한국어 설명글(문단 prose)**로 재구성 — 개조식 아님, 자연스러운 문단·흐름·인과,
  (3) 강의가 다룬 범위 안에서. 없는 내용 지어내지 말 것.
- **요청** = `system + GLOSSARY + OUTLINE + RECENT(직전 덩어리 노트) + NEW(새 원문 덩어리)`.
  **응답 JSON** = `{ notes, concepts, glossary, outline }`.
  - `notes`: 문단글(prose) 한국어 설명 (핵심 산출물). **개조식 아님.**
  - `concepts`: **개조식** 어려운 용어·개념 설명 ("- 용어: 1~2문장", 없으면 "").
  - `glossary`: "term = 한국어" 목록. **append-only** — 클라이언트(`glossaryRef`)가 파싱해
    기존 항목 유지 + 새 항목만 추가(최대 80). 안 바뀌면 모델이 `"="`.
  - `outline`: 강의 전체 개요 누적 (≤200단어, 개조식). `outlineRef`. 안 바뀌면 `"="`.
- **덩어리 큐는 순차 처리** — 각 호출이 이전 호출의 메모리에 의존.
- **토큰**: `max_tokens`는 입력 비례(≈2×chars, 1536~8192). 타임아웃 90초.
- 화면(`SegmentRow`, refine): 원문은 "원문 보기 ▼" 토글로 접힘(오류 많고 참고용) → 📝 노트(파란 박스)
  → 💡 용어·개념. `translated`/`corrected`는 refine 모드에서 안 씀.

## 현재 구현된 기능

- **[기능 1] 실시간 전사** — Web Speech API. interim 회색(최근 500자), final → `onFinalSentence`.
  장시간 안정성: **매 (재)시작마다 새 `SpeechRecognition` 객체 생성**(wedge된 세션은 `.start()`로
  못 살림 — 이게 "~50초/9문장 후 전사 멈춤" 버그의 원인이었음). 2.5분마다 새 객체로 재활용,
  `onend`/워치독(12초 무이벤트) 시 새 객체로 무한 백오프 재시작.
- **[기능 1-a] 입력 파형** — canvas waveform. `AnalyserNode` + rAF.
- **[기능 2/3] refine 모드 AI 강의 노트** — 위 "기능 6" 참고. 실패 시 transient만 자동 1회 재시도 →
  `status:'error'` + 사유 + "재시도". App에 "모두 재시도"도 있음.
- **[기능 4] 제공자·API 키 선택 (BYOK)** — `RefineProviderConfig`(접이식): 제공자 선택, 키 발급 안내,
  키 입력(보기/숨기기/지우기, 제공자별 각각), "연결 테스트", 고급 설정 모델명.
- **[기능 5] 모드 선택** / **[기능 6] AI 강의 노트** — 위 참고.

## LLM 제공자 (refine 모드)

모두 브라우저 직접 호출, CORS 확인 완료. 어댑터는 "구조적 JSON chat 1턴" 함수(`ProviderChatFn`).
프롬프트·파싱은 `lib/refine.ts` + `providers/prompt.ts`. 패널 순서: 무료(gemini/groq/mistral) → Claude → openrouter/openai.

| id | 라벨 | 비용 | 기본 모델 | 어댑터 |
|----|------|------|-----------|--------|
| `gemini` | Google Gemini | 무료(**하루 20회** 한도, 매우 낮음) | `gemini-3.6-flash` | `gemini.ts` (`@google/genai` 웹 빌드, `responseSchema`) |
| `groq` | Groq | 무료(한도 넉넉) | `llama-3.3-70b-versatile` | `openai-compat.ts` |
| `mistral` | Mistral | 무료 티어 | `mistral-small-latest` | `openai-compat.ts` |
| `anthropic` | Anthropic Claude | 유료(노트 품질 최상) | `claude-haiku-4-5` | `anthropic.ts` (fetch, forced tool use) |
| `openrouter` | OpenRouter | 크레딧(무료 모델 有) | `openai/gpt-4o-mini` | `openai-compat.ts` |
| `openai` | OpenAI | 유료 | `gpt-4o-mini` | `openai-compat.ts` |

- OpenAI 호환 4종은 어댑터 1개(`makeOpenAiCompatChat({baseUrl,label,extraHeaders?})`).
  `/chat/completions` + `response_format:{type:'json_object'}`. OpenRouter는 `HTTP-Referer`/`X-Title`.
- Gemini: `responseSchema`(모든 키 STRING), `thinkingLevel: MINIMAL`. `gemini-2.5-flash`는 신규 키 404.
- Anthropic: `x-api-key` + `anthropic-version: 2023-06-01` + `anthropic-dangerous-direct-browser-access: true`.
  forced tool(`provide_result`)로 JSON 보장.
- 에러: 어댑터 `ProviderError(kind)` → `refine.ts` `RefineError(reason)` → `process.ts` `ProcessError(retriable)` → 큐.
  (translate는 `TranslatorError` → `ProcessError`.)

## 폴더 / 파일 구조

```
index.html / vite.config.ts (react 플러그인만) / tailwind·postcss·tsconfig
src/
  main.tsx / App.tsx / index.css
  types/
    speech.d.ts / translator.d.ts   브라우저 API 타입 보강 (lib.dom에 없음)
    index.ts                        Segment(original/translated/notes/concepts), SpeechError
  lib/
    settings.ts     Settings(mode/provider/apiKeys/models) + localStorage + resolveActive
    translator.ts   브라우저 내장 번역 (상태 확인, 모델 준비, translateToKorean, TranslatorError)
    process.ts      processSentence(translate) / processParagraph(refine) → ProcessError
    refine.ts       refineParagraph(input) + testConnection(). 프롬프트 조립·타임아웃·에러 매핑
    providers/
      types.ts         ProviderId / ProviderMeta / ProviderEntry / ProviderChatFn / ProviderError
      meta.ts          PROVIDER_META (순수 데이터). SDK import 없음
      prompt.ts        PARAGRAPH_SYSTEM_PROMPT(강의 노트) + buildParagraphUser + parseRefineParagraph
                       + parseGlossary/serializeGlossary
      gemini.ts / anthropic.ts / openai-compat.ts   어댑터. 동적 import
      index.ts         PROVIDERS 레지스트리 (meta + loadChat)
  hooks/
    useSpeechRecognition.ts   Web Speech 래핑. 모든 인식 로직은 여기에만
    useMicWaveform.ts         파형용 별도 mic 스트림 + Web Audio
    useTranscript.ts          Segment[] 소유 + 문장/덩어리 큐 + refine 버퍼·flush·회전 메모리(glossary/outline/recentNotes)
    useSettings.ts            mode/provider/key/model, localStorage 영속
    useBrowserTranslator.ts   내장 번역 상태 + 다운로드 진행률 + prepare()
  components/
    RecorderControls.tsx      시작/중지, 듣는 중 / 재연결 중, 에러 배너
    SettingsPanel.tsx         모드 선택 + (translate) 번역 상태 + (refine) RefineProviderConfig
    RefineProviderConfig.tsx  접이식. 제공자 선택 + 키 안내/입력 + 연결 테스트 + 고급(모델)
    Waveform.tsx              canvas 실시간 파형
    SegmentList.tsx           데이터 기반 렌더. 리스트/행 React.memo. refine은 원문 접기 + 노트/개념 박스
    LiveTranscript.tsx        버퍼(실시간 read-along 전사) + interim(회색) + 빈 상태 안내
```

## 주요 설계 결정과 이유

- **refine = 번역이 아니라 "강의 설명 생성"** — 전사에 오인식·오류가 많아 그대로 옮기면 매끄럽지 못함.
  발화 내용을 파악해 새로 설명하듯 **이해하기 쉬운 한국어 문단글**로 재작성. 어려운 용어만 따로 개조식.
  타겟은 한국 학생.
- **~20문장 덩어리** — 문장 하나씩 보내면 맥락 없고 토큰 낭비 + Gemini 무료 한도(하루 20회) 순삭.
  20문장(5→12→6→10→20으로 조정)으로 크게 묶어 강의 1시간이 ~30호출.
- **강의 메모리를 응답에 함께 받기** — 별도 요약 호출 없이. glossary append-only 병합(용어 고정),
  outline 매 턴 갱신, RECENT로 직전 덩어리 노트 전달.
- **덩어리 큐 순차 처리** — 각 호출이 직전 메모리에 의존.
- **원문은 접기** — refine 모드에선 오류 많은 원문이 주가 아니라 노트가 주. "원문 보기" 토글.
- **3개 모드** — transcribe/translate는 브라우저 기능만(키 불필요). 기본 translate.
- **백엔드 제거, BYOK** — 각자 자기 키, 순수 정적 배포.
- **어댑터는 "구조적 JSON chat" 1함수** — 프롬프트/파싱은 `refine.ts` 소유. 제공자 추가 쉬움.
- **어댑터 동적 import** — `@google/genai` 웹 빌드 ~69KB gz를 초기 번들(~58KB gz)에서 제외.
- **`SegmentList` React.memo** — interim 초당 갱신이 리스트 전체 리렌더로 STT 콜백 유실되던 문제.
- **STT 장시간 안정성** — 위 "기능 1" 참고. 핵심: 재시작 = 항상 새 객체.

## 알려진 제약사항

- Web Speech API·내장 번역 모두 **Chrome / Edge 데스크톱**에서만. 모바일·Safari·Firefox 불가.
- 내장 번역: Chrome 138+, 첫 사용 시 모델(수십 MB) 1회 다운로드.
- **Gemini 무료 한도 = 하루 20회** (`gemini-3.6-flash`). 강의 1시간 ≈ 30덩어리라 부족.
  긴 강의엔 Groq(무료·한도 넉넉) 또는 유료 권장.
- refine 모드 결과는 **최대 3~4분 지연** (20문장 모으기 + 노트 생성). 실시간 자막 아님(컨셉상 의도된 것).
- 노트는 생성형이라 **가끔 없는 내용을 덧붙이거나 강조가 어긋날 수** 있음. 원문 대조 가능.
- refine 재시도는 현재 glossary/outline로 재처리 — 그 사이 메모리가 진행됐으면 약간 어긋날 수 있음.
- 모드 전환 시 이전 세그먼트는 그대로. 전환 시점의 refine 버퍼는 flush됨.
- API 키는 localStorage 평문. 공용 PC는 "지우기".
- `json_object` 미지원 모델(OpenRouter에서 임의 선택 시)은 실패 가능.
- Gemini 무료 티어는 입력이 학습에 쓰일 수 있음. Claude·OpenAI(유료)는 아님.

## TODO / 나중에 고려할 것

- 더 정확한 STT (Groq/OpenAI Whisper) 옵션 — 조사 완료, `/audio/transcriptions` CORS OK. `MediaRecorder` 구간 분할 필요.
- 모드 전환 시 이전 세그먼트도 새 모드로 재처리.
- 강의 종료 후 전체 노트 하나로 합쳐 내보내기(md).
- 제공자 추가: OpenAI 호환이면 `meta.ts` + `openai-compat.ts` export + `index.ts` 1줄 + `ProviderId`.

## 컨벤션

- 컴포넌트 PascalCase / 함수·변수 camelCase / 훅 `use*`. `any` 금지, 타입 명시. 주석은 "왜"만.
- Conventional Commits. 파일 300줄 초과 시 분리. 새 의존성은 사전 승인.

## 실행

```
npm install
npm run dev / npm run build / npm run typecheck
```

모드·API 키는 앱 화면에서 설정. 배포는 정적 빌드(`dist/`)만, 환경변수 불필요.
