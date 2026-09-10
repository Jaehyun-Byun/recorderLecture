import { useState } from 'react';
import { PROVIDER_META, PROVIDER_META_LIST } from '../lib/providers/meta';
import type { ProviderId } from '../lib/providers/types';
import { testConnection } from '../lib/refine';
import type { Settings } from '../lib/settings';

interface RefineProviderConfigProps {
  settings: Settings;
  onProviderChange: (id: ProviderId) => void;
  onApiKeyChange: (id: ProviderId, key: string) => void;
  onModelChange: (id: ProviderId, model: string) => void;
}

type TestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok' }
  | { state: 'fail'; message: string };

/** Provider picker + step-by-step key instructions + key input + connection test. */
export function RefineProviderConfig({
  settings,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
}: RefineProviderConfigProps) {
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [test, setTest] = useState<TestState>({ state: 'idle' });

  const def = PROVIDER_META[settings.provider];
  const key = settings.apiKeys[settings.provider] ?? '';
  const model = settings.models[settings.provider] ?? '';

  const runTest = async () => {
    setTest({ state: 'testing' });
    const result = await testConnection(settings);
    setTest(result.ok ? { state: 'ok' } : { state: 'fail', message: result.message });
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <p className="text-sm font-semibold text-slate-900">AI 교정 설정</p>

      <div className="flex flex-wrap gap-2">
        {PROVIDER_META_LIST.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onProviderChange(p.id);
              setTest({ state: 'idle' });
            }}
            className={
              'rounded-full border px-3 py-1 text-sm transition-colors ' +
              (p.id === settings.provider
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50')
            }
          >
            {p.label}
            <span
              className={
                'ml-1.5 text-xs ' +
                (p.cost === 'free' ? 'text-green-600' : 'text-slate-400')
              }
            >
              {p.cost === 'free' ? '무료' : '유료'}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-700">
          {def.label} — {def.costNote}
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          {def.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <a
          href={def.apiKeyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block break-all text-blue-600 underline"
        >
          {def.apiKeyUrl} 열기 ↗
        </a>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">API 키</label>
        <div className="flex flex-wrap gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => {
              onApiKeyChange(settings.provider, e.target.value);
              setTest({ state: 'idle' });
            }}
            placeholder={def.keyHint}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            {showKey ? '숨기기' : '보기'}
          </button>
          {key && (
            <button
              type="button"
              onClick={() => {
                onApiKeyChange(settings.provider, '');
                setTest({ state: 'idle' });
              }}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            >
              지우기
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          키는 이 브라우저에만 저장되고 {def.label} 서버로만 전송됩니다. 이 사이트의 서버는 키를
          받지도 저장하지도 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runTest}
          disabled={!key || test.state === 'testing'}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {test.state === 'testing' ? '테스트 중…' : '연결 테스트'}
        </button>
        {test.state === 'ok' && (
          <span className="text-sm text-green-600">✓ 정상 작동합니다</span>
        )}
        {test.state === 'fail' && (
          <span className="text-sm text-amber-700">✗ {test.message}</span>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          고급 설정 {showAdvanced ? '▲' : '▼'}
        </button>
        {showAdvanced && (
          <div className="mt-2 space-y-1">
            <label className="block text-sm text-slate-600">모델</label>
            <input
              type="text"
              value={model}
              onChange={(e) => onModelChange(settings.provider, e.target.value)}
              placeholder={def.defaultModel}
              spellCheck={false}
              className="block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400">
              비워두면 기본값 <code>{def.defaultModel}</code> 사용
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
