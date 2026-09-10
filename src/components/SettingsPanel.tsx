import type { ProviderId } from '../lib/providers/types';
import { APP_MODES, type AppMode, type Settings } from '../lib/settings';
import type { TranslatorStatus } from '../lib/translator';
import { RefineProviderConfig } from './RefineProviderConfig';

interface SettingsPanelProps {
  settings: Settings;
  translatorStatus: TranslatorStatus;
  translatorProgress: number | null;
  onModeChange: (mode: AppMode) => void;
  onProviderChange: (id: ProviderId) => void;
  onApiKeyChange: (id: ProviderId, key: string) => void;
  onModelChange: (id: ProviderId, model: string) => void;
  onPrepareTranslator: () => void;
}

const MODE_LABEL: Record<AppMode, string> = {
  transcribe: '전사',
  translate: '번역',
  refine: 'AI 교정 (고급)',
};

const MODE_DESC: Record<AppMode, string> = {
  transcribe: '음성을 텍스트로만 옮깁니다. API 키가 필요 없습니다.',
  translate:
    '전사 + 한국어 번역. 브라우저 내장 번역(무료, 오프라인)을 씁니다. API 키가 필요 없습니다.',
  refine:
    '전사 + AI 문장 교정(filler 제거·문법 정리) + AI 번역. 선택한 제공자의 API 키가 필요합니다.',
};

function TranslatorStatusRow({
  status,
  progress,
  onPrepare,
}: {
  status: TranslatorStatus;
  progress: number | null;
  onPrepare: () => void;
}) {
  if (status === 'checking') {
    return <p className="text-sm text-slate-400">브라우저 번역 지원 확인 중…</p>;
  }
  if (status === 'unsupported') {
    return (
      <p className="text-sm text-amber-700">
        이 브라우저는 내장 번역을 지원하지 않습니다. Chrome 138 이상(데스크톱)을 쓰거나 "AI 교정
        (고급)" 모드를 선택하세요.
      </p>
    );
  }
  if (status === 'unavailable') {
    return (
      <p className="text-sm text-amber-700">
        이 기기에서 en→ko 번역 모델을 쓸 수 없습니다. "AI 교정 (고급)" 모드를 선택하세요.
      </p>
    );
  }
  if (status === 'available') {
    return <p className="text-sm text-green-600">✓ 번역 모델 준비됨</p>;
  }
  // downloadable / downloading
  const pct = progress !== null ? Math.round(progress * 100) : null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-slate-600">
        {pct !== null && pct < 100
          ? `번역 모델 다운로드 중… ${pct}%`
          : '첫 사용 시 번역 모델(수십 MB)을 한 번 내려받습니다.'}
      </span>
      {progress === null && (
        <button
          type="button"
          onClick={onPrepare}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          지금 준비
        </button>
      )}
    </div>
  );
}

/** Mode picker + (in refine mode) the provider/key config. */
export function SettingsPanel({
  settings,
  translatorStatus,
  translatorProgress,
  onModeChange,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  onPrepareTranslator,
}: SettingsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">모드</p>
        <div className="flex flex-wrap gap-2">
          {APP_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onModeChange(mode)}
              className={
                'rounded-full border px-3 py-1 text-sm transition-colors ' +
                (mode === settings.mode
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50')
              }
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{MODE_DESC[settings.mode]}</p>

        {settings.mode === 'translate' && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <TranslatorStatusRow
              status={translatorStatus}
              progress={translatorProgress}
              onPrepare={onPrepareTranslator}
            />
          </div>
        )}
      </div>

      {settings.mode === 'refine' && (
        <RefineProviderConfig
          settings={settings}
          onProviderChange={onProviderChange}
          onApiKeyChange={onApiKeyChange}
          onModelChange={onModelChange}
        />
      )}
    </div>
  );
}
