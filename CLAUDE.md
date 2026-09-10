# LectureCaption

영어 강의 음성을 실시간으로 전사하고, 선택한 **모드**에 따라 한국어 번역 / AI 교정까지
해서 원문과 함께 보여주는 단일 사용자용 웹앱. 로그인·서버·저장 없음(새로고침 시 초기화).

> 이 파일은 Claude Code가 세션 시작 시 자동으로 읽는다. 기능/구조를 바꿀 때마다 함께 갱신할 것.

## 아키텍처 한눈에

**순수 정적 SPA. 백엔드 없음.**

```
마이크 → useSpeechRecognition (Web Speech API) → onFinalSentence
                                                     ↓
                              useSentenceQueue (Sentence[] 소유, 순차 큐)
                                                     ↓
                              lib/process.ts  ── settings.mode 로 분기
                    ┌───────────────────┼─────────────────────┐
              transcribe            translate                refine
              (아무것도 안 함)   lib/translator.ts        lib/refine.ts →
                              (브라우저 내장 번역)     PROVIDERS[id].loadRefine() (동적 import)
                                                     lib/providers/*  → 제공자 API 직접 호출(BYOK)
```

- **transcribe / translate 모드는 API 키가 전혀 필요 없다.**
- refine 모드에서만 사용자가 자기 LLM 키를 입력. 키는 그 브라우저 localStorage에만 저장되고
  선택한 제공자 서버로만 전송된다(우리 서버는 관여 안 함).

## 모드 (기능 5)

`Settings.mode: 'transcribe' | 'translate' | 'refine'` (기본 `translate`). `SettingsPanel` 상단에서 선택.

| 모드 | 하는 일 | 키 |
|------|---------|-----|
| **transcribe** | 음성 → 텍스트만 | 불필요 |
| **translate** | 전사 + 한국어 번역 (브라우저 내장 `Translator` API, 온디바이스·무료·오프라인) | 불필요 |
| **refine** (고급) | 전사 + AI 문장 교정 + AI 번역 (LLM 1회 호출로 `{corrected, translated}`) | 제공자 키 필요 |

## 현재 구현된 기능

- **[기능 1] 실시간 전사** — 마이크 입력을 Web Speech API로 전사.
  - interim(중간) 결과는 회색으로 실시간 표시(최근 500자로 제한).
  - final(확정) 결과가 나오면 `onFinalSentence` 콜백으로 큐에 넘김. 이 시점이 "문장 끝".
  - 시작/중지, 마이크 권한 거부/미지원 브라우저/네트워크 오류 처리.
  - **장시간 안정성**: 세션을 문장 경계에서 재활용(30문장/50초, 강제 90초), `onend` 재시작을
    백오프로 무한 재시도(절대 포기 안 함), 15초 무이벤트 시 워치독이 강제 재시작.
    재시작이 반복 실패하면 "재연결 중…" 표시.
- **[기능 1-a] 입력 파형 시각화** — 마이크 입력을 canvas에 실시간 waveform으로.
  - 항상 보임. 녹음 중 아니면 회색 평선, 녹음 중이면 파란 파형. `AnalyserNode` + rAF 루프.
- **[기능 2/3] AI 교정 + 한국어 번역** (refine 모드) — 확정 문장을 선택 제공자로 보내
  `{corrected, translated}`를 한 번에 받음. 큐는 **한 번에 하나씩** 순차 처리(화면 순서 = 발화 순서).
  - 실패 시 transient(network/timeout/unknown)만 자동 1회 재시도, 나머지는 즉시 실패 →
    `status:'error'` + 사유 + "재시도". App에 "모두 재시도"(retryAll)도 있음.
- **[기능 4] 제공자·API 키 선택 (BYOK)** — refine 모드에서 `RefineProviderConfig`:
  - 제공자 선택, 제공자별 키 발급 단계별 안내 + 링크, 키 입력(보기/숨기기/지우기, 제공자별
    각각 기억), "연결 테스트" 버튼, 고급 설정에서 모델명 직접 지정.
- **[기능 5] 모드 선택** — 위 "모드" 표 참고. `SentenceList` 표시는 데이터 기반(있는 것만 렌더):
  원문만 / 원문+번역 / 원문(작게)+교정문+번역.

## LLM 제공자 (refine 모드)

모두 브라우저에서 직접 호출. CORS 확인 완료. 어댑터는 `src/lib/providers/`.

| id | 라벨 | 비용 | 기본 모델 | 어댑터 |
|----|------|------|-----------|--------|
| `gemini` | Google Gemini | 무료 | `gemini-3.6-flash` | `gemini.ts` (`@google/genai` 웹 빌드) |
| `groq` | Groq | 무료 | `llama-3.3-70b-versatile` | `openai-compat.ts` |
| `mistral` | Mistral | 무료 티어 | `mistral-small-latest` | `openai-compat.ts` |
| `openrouter` | OpenRouter | 크레딧(무료 모델 有) | `openai/gpt-4o-mini` | `openai-compat.ts` |
| `openai` | OpenAI | 유료 | `gpt-4o-mini` | `openai-compat.ts` |
| `anthropic` | Anthropic Claude | 유료(번역 품질 최상) | `claude-haiku-4-5` | `anthropic.ts` (fetch) |

- **OpenAI 호환 4종(openai/groq/openrouter/mistral)은 어댑터 하나** (`openai-compat.ts`의
  `makeOpenAiCompatRefine({ baseUrl, label, extraHeaders? })`). `/chat/completions` +
  `response_format: {type:'json_object'}` + system/user 메시지. OpenRouter는 `HTTP-Referer`/`X-Title` 첨부.
- **Gemini**: `responseSchema`로 JSON 강제, `thinkingLevel: MINIMAL`(LOW면 가끔 30초 스파이크).
  `gemini-2.5-flash`는 신규 키에 404 → Gemini 3.x 필요.
- **Anthropic**: `x-api-key` + `anthropic-version: 2023-06-01` +
  `anthropic-dangerous-direct-browser-access: true`. forced tool use로 JSON 보장.
- 에러: 어댑터가 `ProviderError(kind)` → `refine.ts`가 `RefineError(reason)` → `process.ts`가
  `ProcessError(retriable)` → 큐. (translate 모드는 `TranslatorError` → `ProcessError`.)
- 제공자별 키 발급 안내 텍스트·기본 모델은 `providers/meta.ts` (SDK import 없는 순수 데이터).

## 폴더 / 파일 구조

```
index.html / vite.config.ts (react 플러그인만) / tailwind.config.js / postcss.config.js / tsconfig.json
src/
  main.tsx / App.tsx / index.css
  types/
    speech.d.ts        Web Speech API 타입 보강
    translator.d.ts    브라우저 Translator API 타입 (lib.dom에 없음)
    index.ts           Sentence, SpeechError
  lib/
    settings.ts        Settings(mode/provider/apiKeys/models) + localStorage + resolveActive
    process.ts         processSentence(text, settings) — 모드 분기. ProcessError.
    refine.ts          refineSentence(text, settings) + testConnection() — refine 모드 LLM 호출
    translator.ts      브라우저 내장 번역 래핑 (상태 확인, 모델 준비, translateToKorean)
    providers/
      types.ts         ProviderId / ProviderMeta / ProviderEntry / ProviderError / RefineResult
      meta.ts          PROVIDER_META (순수 데이터). SDK import 없음
      prompt.ts        공용 SYSTEM_PROMPT + parseRefineResult (```json 펜스/서문 허용)
      gemini.ts        geminiRefine — @google/genai. 동적 import
      anthropic.ts     anthropicRefine — fetch. 동적 import
      openai-compat.ts makeOpenAiCompatRefine + openai/groq/openrouter/mistral. 동적 import
      index.ts         PROVIDERS 레지스트리 (meta + loadRefine), PROVIDER_LIST
  hooks/
    useSpeechRecognition.ts   Web Speech 래핑. 모든 인식 로직은 여기에만
    useMicWaveform.ts         파형용 별도 mic 스트림 + Web Audio
    useSentenceQueue.ts       Sentence[] 소유 + 큐. transcribe는 즉시 done. settings는 ref 참조
    useSettings.ts            mode/provider/key/model, localStorage 영속
    useBrowserTranslator.ts   내장 번역 상태 + 다운로드 진행률 + prepare()
  components/
    RecorderControls.tsx      시작/중지, 듣는 중 / 재연결 중, 에러 배너
    SettingsPanel.tsx         모드 선택 + (translate) 번역 상태 + (refine) RefineProviderConfig
    RefineProviderConfig.tsx  제공자 선택 + 키 안내/입력 + 연결 테스트 + 고급(모델)
    Waveform.tsx              canvas 실시간 파형
    SentenceList.tsx          데이터 기반 렌더. 리스트/행 React.memo
    LiveTranscript.tsx        현재 interim(회색) + 빈 상태 안내
```

## 주요 설계 결정과 이유

- **3개 모드로 "키 없이도 쓸 수 있게"** — transcribe/translate는 브라우저 기능만 씀.
  translate는 Chrome 138+ 내장 `Translator` API(온디바이스). refine에서만 LLM 키 필요.
- **기본 모드 = translate** — 키 없이 원문+한국어가 바로 나오는 게 첫인상으로 가장 유용.
  미지원 브라우저는 SettingsPanel이 안내(전사 모드 or Chrome 업데이트).
- **내장 번역 모델 다운로드는 사용자 제스처 필요** → "시작" 클릭 시 `translator.prepare()` 호출
  (+ 설정에 "지금 준비" 버튼). 첫 1회만 다운로드, 이후 오프라인.
- **백엔드 제거, 브라우저 직접 호출(BYOK)** — 각자 자기 키라 노출 위험이 그 사용자에게 국한.
  서버·서버리스·`.env` 전부 사라져 순수 정적 배포. 모든 제공자 CORS 확인 완료.
- **OpenAI 호환 제공자는 어댑터 1개** — openai/groq/openrouter/mistral이 전부 같은
  `/chat/completions` 형식. baseUrl만 다름. 새 호환 제공자 추가는 meta 1개 + 레지스트리 1줄.
- **제공자 어댑터를 동적 import로 코드 분할** — `@google/genai` 웹 빌드가 ~69KB gz. 초기
  번들(~55KB gz)에 안 넣음. translate 모드 사용자는 제공자 청크를 아예 안 받음.
- **STT 장시간 안정성** — Chrome이 `continuous` 세션 결과를 메모리에 쌓다 이벤트 중단 →
  세션 재활용. `onend` 재시작 무한 재시도(예전엔 2회 실패 후 영구 정지). 워치독으로 조용한 죽음 감지.
- **`SentenceList`/행 `React.memo`** — 문장 수백 개 + interim 초당 갱신 시 리스트 전체 리렌더가
  메인 스레드를 잡아먹어 STT 콜백 유실 → 전사 멈춤. interim은 `sentences` 미변경이라 memo가 건너뜀.
- **문장은 `useSentenceQueue`가 소유**, 큐 워커는 `{id, original}`을 직접 담음(`enqueue`는 리렌더
  전 실행이라 방금 넣은 문장을 조회하면 못 찾음 — 예전 `pending` 멈춤 버그). settings는 ref 참조로
  콜백 identity 안정.
- **큐는 순차 처리** — 화면 순서 유지가 자명. 무료 티어 분당 한도 부담도 적음.

## 알려진 제약사항

- Web Speech API·내장 번역 모두 **Chrome / Edge 데스크톱**에서만 동작. 모바일·Safari·Firefox 불가.
- 내장 번역: Chrome 138+. 첫 사용 시 모델(수십 MB) 1회 다운로드.
- **인터넷 연결 필수**(STT는 항상, refine은 항상, translate는 모델 다운로드 시에만).
- 전문 용어·고유명사 인식 오류 가능성. 문장 경계가 완벽하지 않음.
- 탭 백그라운드 시 인식 중단 가능(워치독이 복귀 시 재시작). 세션 재활용 순간 경계 단어 1개 누락 가능(드묾).
- API 키는 localStorage 평문 저장. 공용 PC에서는 "지우기" 권장.
- Groq(Llama)·일부 무료 모델은 한국어 번역 품질이 낮음. 무료 티어는 분당·일일 한도 있음.
- `response_format: json_object` 미지원 모델(OpenRouter에서 임의 선택 시)은 실패할 수 있음.
- Gemini 무료 티어는 입력이 학습에 쓰일 수 있음. Claude·OpenAI(유료)는 아님.

## TODO / 나중에 고려할 것

- 모드 전환 시 이전 문장도 새 모드로 재처리하는 버튼(지금은 새 문장만 적용).
- 문장 경계 보정 로직(구두점·길이 기반).
- 큐 병렬 처리(동시성 2~3) — 큐 밀림 시. (무료 티어 분당 한도 주의)
- 번역에 직전 1~2문장 문맥 전달(대명사/일관성).
- 제공자 추가: OpenAI 호환이면 `meta.ts` + `openai-compat.ts` export + `index.ts` 1줄 + `ProviderId` 확장.
  그 외(Cohere 등)는 새 어댑터 파일. CORS 되는 후보: xAI, Together, Perplexity, Cohere.
- 필요 시 세션 저장/이력(내보내기).

## 컨벤션

- 컴포넌트 PascalCase / 함수·변수 camelCase / 훅 `use*`.
- `any` 금지, 모든 함수·응답 타입 명시. 주석은 "왜"만.
- Conventional Commits. 파일 300줄 초과 시 분리. 새 의존성은 사전 승인.

## 실행

```
npm install
npm run dev        # 정적 SPA (백엔드 없음)
npm run build      # 타입체크 + 프로덕션 빌드
npm run typecheck
```

- 모드·API 키는 앱 화면에서 설정. 배포는 정적 빌드(`dist/`)만, 환경변수 불필요.
