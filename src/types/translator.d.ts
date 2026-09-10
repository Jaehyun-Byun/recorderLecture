/**
 * Browser built-in Translator API (Chrome 138+, desktop). Not yet in lib.dom,
 * so this declares the minimal surface the app uses.
 * https://developer.mozilla.org/en-US/docs/Web/API/Translator
 */

type TranslatorAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

interface TranslatorDownloadProgressEvent extends Event {
  /** 0..1 fraction downloaded. */
  readonly loaded: number;
}

interface TranslatorCreateMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: TranslatorDownloadProgressEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

interface TranslatorCreateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  monitor?: (monitor: TranslatorCreateMonitor) => void;
  signal?: AbortSignal;
}

interface TranslatorInstance {
  translate(input: string): Promise<string>;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  destroy(): void;
}

interface TranslatorStatic {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslatorAvailability>;
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>;
}

declare var Translator: TranslatorStatic | undefined;
