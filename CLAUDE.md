# LectureCaption

영어 강의 음성을 실시간으로 전사하고, 선택한 **모드**에 따라 한국어 번역 / AI 교정까지
해서 원문과 함께 보여주는 단일 사용자용 웹앱. 로그인·서버·저장 없음(새로고침 시 초기화).

> 이 파일은 Claude Code가 세션 시작 시 자동으로 읽는다. 기능/구조를 바꿀 때마다 함께 갱신할 것.

## 아키텍처 한눈에

**순수 정적 SPA. 백엔드 없음.**

```
마이크 → useSpeechRecognition (Web Speech API) → onFinalSentence(문장)
                                                     ↓
                              useTranscript ── settings.mode 로 분기
        ┌────────────────────────┼───────────────────────────────┐
   transcribe                translate                          refine
   문장 = 세그먼트 즉시 done   문장 = 세그먼트 → 브라우저 번역     문장을 버퍼에 모음
                            (lib/translator.ts, 온디바이스)     → 5문장/6초/30초/중지 시
                                                                한 문단으로 flush → 세그먼트 1개
                                                                → 순차 처리(문단 큐)
                                                                   lib/refine.ts refineParagraph()
                                                                   + 회전 메모리(glossary/notes/recent)
                                                                   → PROVIDERS[id].loadChat() 동적 import
                                                                   → 제공자 API 직접 호출(BYOK)
```

- transcribe / translate = **API 키 불필요**. refine 에서만 사용자 LLM 키 필요(localStorage에만 저장, 제공자로만 전송).
- **세그먼트** = 화면 표시 단위. transcribe/translate에선 문장, refine에선 문단.

## 모드 (기능 5)

`Settings.mode: 'transcribe' | 'translate' | 'refine'` (기본 `translate`). `SettingsPanel` 상단에서 선택.

| 모드 | 하는 일 | 키 |
|------|---------|-----|
| transcribe | 음성 → 텍스트만 | 불필요 |
| translate | 전사 + 한국어 번역 (Chrome 138+ 내장 `Translator`, 온디바이스·무료·오프라인) | 불필요 |
| refine (고급) | 전사 + **문단 단위** AI 교정 + AI 번역 + 강의 맥락 기억 | 제공자 키 필요 |

## refine 모드: 문단 배칭 + 회전 메모리 (기능 6)

발화 문장을 하나씩 보내지 않고 **큰 문단 단위로 1회 호출**. 각 호출이 강의 메모리를 함께 갱신·반환.

- **버퍼 → flush** (`useTranscript`): 확정 문장을 `bufferRef`에 모아 **~10문장짜리 문단**으로 flush.
  조건: **10문장** / **8초 침묵**(단, 8문장 이상일 때만) / **90초 최대** / "중지"(App `finalize()`).
  flush 시 문장들을 이어 한 문단 세그먼트를 만들어 문단 큐에 넣음.
- **회전 메모리** — 요청 = `system + GLOSSARY + NOTES + RECENT(직전 2문단) + NEW(새 원문 문단)`.
  응답 JSON = `{ corrected, translated, glossary, notes }`.
  - `glossary`: "term = 한국어" 목록. **append-only** — 클라이언트(`glossaryRef`)가 모델 반환값을
    파싱해 **기존 항목은 유지하고 새 항목만 추가**(용어 번역이 절대 바뀌거나 사라지지 않음, 최대 60개).
  - `notes`: 주제/서브주제/화자 톤 (≤150단어, 매 턴 자유롭게 갱신). `notesRef`.
  - 안 바뀌면 모델이 `"="` 반환 → 출력 토큰 절약.
- **문단 큐는 순차 처리** (병렬 불가) — 각 호출이 이전 호출의 메모리에 의존.
- **토큰 최소화**: 큰 배칭으로 호출 수·system 오버헤드 대폭↓, 전체 전사본 대신 glossary+notes+직전 2문단만
  재전송, `max_tokens`는 입력 비례(≈1.6×chars, 1024~6144).
- 프롬프트 캐싱은 프롬프트가 최소 캐시 크기(1024~2048토큰) 미만이라 효과 없음 → 안 씀.

## 현재 구현된 기능

- **[기능 1] 실시간 전사** — Web Speech API. interim 회색(최근 500자), final → `onFinalSentence`.
  - 장시간 안정성: 세션 재활용(30문장/50초, 강제 90초), `onend` 무한 백오프 재시작, 15초 무이벤트 워치독.
    반복 실패 시 "재연결 중…".
- **[기능 1-a] 입력 파형** — canvas waveform. `AnalyserNode` + rAF. 녹음 중 아니면 회색 평선.
- **[기능 2/3] AI 교정 + 한국어 번역** — refine 모드, 위 "문단 배칭" 참고. 실패 시 transient만 자동 1회
  재시도, 나머지 즉시 실패 → `status:'error'` + 사유 + "재시도". App에 "모두 재시도"도 있음.
- **[기능 4] 제공자·API 키 선택 (BYOK)** — refine 모드에서 `RefineProviderConfig`: 제공자 선택,
  제공자별 키 발급 단계별 안내 + 링크, 키 입력(보기/숨기기/지우기, 제공자별 각각 기억), "연결 테스트",
  고급 설정 모델명 직접 지정.
- **[기능 5] 모드 선택** / **[기능 6] 문단 배칭 + 컨텍스트** — 위 참고.
- `SegmentList` 표시는 데이터 기반: 원문만 / 원문+번역 / 원문(작게)+교정문+번역.

## LLM 제공자 (refine 모드)

모두 브라우저 직접 호출, CORS 확인 완료. 어댑터는 "구조적 JSON chat 1턴" 함수(`ProviderChatFn`).
프롬프트·파싱은 전부 `lib/refine.ts` + `providers/prompt.ts`가 담당.

패널 표시 순서: 무료(gemini, groq, mistral) → Claude → 나머지 유료(openrouter, openai).

| id | 라벨 | 비용 | 기본 모델 | 어댑터 |
|----|------|------|-----------|--------|
| `gemini` | Google Gemini | 무료(한도 낮음, 예: 하루 20회) | `gemini-3.6-flash` | `gemini.ts` (`@google/genai` 웹 빌드, `responseSchema`) |
| `groq` | Groq | 무료(한도 넉넉) | `llama-3.3-70b-versatile` | `openai-compat.ts` |
| `mistral` | Mistral | 무료 티어 | `mistral-small-latest` | `openai-compat.ts` |
| `anthropic` | Anthropic Claude | 유료(번역 품질 최상) | `claude-haiku-4-5` | `anthropic.ts` (fetch, forced tool use) |
| `openrouter` | OpenRouter | 크레딧(무료 모델 有) | `openai/gpt-4o-mini` | `openai-compat.ts` |
| `openai` | OpenAI | 유료 | `gpt-4o-mini` | `openai-compat.ts` |

- OpenAI 호환 4종은 어댑터 1개(`makeOpenAiCompatChat({baseUrl,label,extraHeaders?})`).
  `/chat/completions` + `response_format:{type:'json_object'}`. OpenRouter는 `HTTP-Referer`/`X-Title` 첨부.
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
    index.ts                        Segment, SpeechError
  lib/
    settings.ts     Settings(mode/provider/apiKeys/models) + localStorage + resolveActive
    translator.ts   브라우저 내장 번역 (상태 확인, 모델 준비, translateToKorean, TranslatorError)
    process.ts      processSentence(translate) / processParagraph(refine) → ProcessError
    refine.ts       refineParagraph(input) + testConnection(). 프롬프트 조립·타임아웃·에러 매핑
    providers/
      types.ts         ProviderId / ProviderMeta / ProviderEntry / ProviderChatFn / ProviderError
      meta.ts          PROVIDER_META (순수 데이터: 라벨·안내·기본모델). SDK import 없음
      prompt.ts        PARAGRAPH_SYSTEM_PROMPT + buildParagraphUser + parseRefineParagraph
      gemini.ts        geminiChat — @google/genai. 동적 import
      anthropic.ts     anthropicChat — fetch. 동적 import
      openai-compat.ts makeOpenAiCompatChat + openai/groq/openrouter/mistral. 동적 import
      index.ts         PROVIDERS 레지스트리 (meta + loadChat)
  hooks/
    useSpeechRecognition.ts   Web Speech 래핑. 모든 인식 로직은 여기에만
    useMicWaveform.ts         파형용 별도 mic 스트림 + Web Audio
    useTranscript.ts          Segment[] 소유 + 문장/문단 큐 + refine 버퍼·flush·회전 메모리(glossary 병합)
    useSettings.ts            mode/provider/key/model, localStorage 영속
    useBrowserTranslator.ts   내장 번역 상태 + 다운로드 진행률 + prepare()
  components/
    RecorderControls.tsx      시작/중지, 듣는 중 / 재연결 중, 에러 배너
    SettingsPanel.tsx         모드 선택 + (translate) 번역 상태 + (refine) RefineProviderConfig
    RefineProviderConfig.tsx  접이식. 제공자 선택 + 키 안내/입력 + 연결 테스트 + 고급(모델). 키 없으면 기본 열림
    Waveform.tsx              canvas 실시간 파형
    SegmentList.tsx           데이터 기반 렌더. 리스트/행 React.memo
    LiveTranscript.tsx        버퍼("모으는 중 N문장") + interim(회색) + 빈 상태 안내
```

## 주요 설계 결정과 이유

- **refine는 문단 단위(~10문장)** — 문장 하나씩 보내면 (1) 맥락이 없어 어색하고 (2) system 프롬프트
  오버헤드가 매 호출 반복돼 토큰 낭비 (3) Gemini 무료 한도(하루 20회)를 순식간에 소진.
  ~10문장짜리 문단으로 묶음(5→12→6→10으로 조정된 값).
- **강의 메모리를 응답에 함께 받기** — 별도 요약 호출 없이 유지. glossary는 append-only로
  클라이언트가 병합(용어 번역 고정), notes는 매 턴 갱신. RECENT로 직전 2문단 전달.
- **문단 큐 순차 처리** — 각 호출이 직전 호출의 메모리에 의존하므로 병렬 불가.
- **flush 트리거** — 10문장 / 8초 침묵(≥8문장) / 90초 최대 / 중지. 침묵 경계가 자연스럽고
  최대나이가 안전망. 짧은 침묵으로 작은 문단이 생기지 않게 최소 8문장 가드.
- **3개 모드로 "키 없이도"** — transcribe/translate는 브라우저 기능만. translate는 Chrome 내장
  `Translator`(온디바이스). 기본 translate — 키 없이 원문+한국어가 첫인상.
- **백엔드 제거, 브라우저 직접 호출(BYOK)** — 각자 자기 키라 노출 위험이 그 사용자에 국한. 순수 정적 배포.
- **어댑터는 "구조적 JSON chat" 1개 함수** — 프롬프트/파싱은 `refine.ts`가 소유. 제공자 추가가 쉬움.
  OpenAI 호환은 baseUrl만 다른 팩토리 하나.
- **어댑터 동적 import** — `@google/genai` 웹 빌드 ~69KB gz를 초기 번들(~57KB gz)에서 제외.
  translate 모드 사용자는 제공자 청크를 아예 안 받음.
- **STT 장시간 안정성 / `SegmentList` React.memo** — 이전 세션들에서 다룬 이유 그대로(세션 재활용,
  무한 재시작, 워치독; interim 초당 갱신이 리스트 전체 리렌더로 STT 콜백 유실되던 문제).
- **`Segment` (구 `Sentence`)** — refine에서 문단을 담게 되어 이름을 맞춤.

## 알려진 제약사항

- Web Speech API·내장 번역 모두 **Chrome / Edge 데스크톱**에서만. 모바일·Safari·Firefox 불가.
- 내장 번역: Chrome 138+, 첫 사용 시 모델(수십 MB) 1회 다운로드.
- **Gemini 무료 한도가 매우 낮음** — 예: `gemini-3.6-flash` free tier 하루 20회. 문단 모드로도
  긴 강의는 부족. 긴 강의엔 Groq(무료·한도 넉넉) 또는 유료 권장.
- 문단 flush 대기 때문에 refine 모드는 결과가 **최대 ~90초 지연**돼 나옴(~10문장 모을 때까지 대기,
  실시간성↓ ↔ 품질·토큰 효율↑ 트레이드오프).
- 문단 재시도(retry)는 현재 glossary/notes로 재처리 — 그 사이 메모리가 진행됐으면 약간 어긋날 수 있음.
- 모드 전환 시 이전 세그먼트는 그대로. 전환 시점의 refine 버퍼는 flush됨.
- API 키는 localStorage 평문. 공용 PC는 "지우기".
- Groq(Llama)·일부 무료 모델은 한국어 번역 품질 낮음. `json_object` 미지원 모델은 실패 가능.
- Gemini 무료 티어는 입력이 학습에 쓰일 수 있음. Claude·OpenAI(유료)는 아님.

## TODO / 나중에 고려할 것

- 모드 전환 시 이전 세그먼트도 새 모드로 재처리하는 버튼.
- refine 재시도 시 세그먼트별 컨텍스트 스냅샷.
- 문단 경계를 침묵 길이(interim 정지 시간)로 더 똑똑하게.
- 제공자 추가: OpenAI 호환이면 `meta.ts` + `openai-compat.ts` export + `index.ts` 1줄 + `ProviderId` 확장.
  그 외는 새 어댑터. CORS 되는 후보: xAI, Together, Perplexity, Cohere.
- 필요 시 세션 저장/이력(내보내기).

## 컨벤션

- 컴포넌트 PascalCase / 함수·변수 camelCase / 훅 `use*`. `any` 금지, 타입 명시. 주석은 "왜"만.
- Conventional Commits. 파일 300줄 초과 시 분리. 새 의존성은 사전 승인.

## 실행

```
npm install
npm run dev / npm run build / npm run typecheck
```

모드·API 키는 앱 화면에서 설정. 배포는 정적 빌드(`dist/`)만, 환경변수 불필요.
