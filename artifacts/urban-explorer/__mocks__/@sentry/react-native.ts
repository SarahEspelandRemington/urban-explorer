import type { ErrorEvent } from "@sentry/react-native";

type InitOptions = {
  beforeSend?: (event: ErrorEvent) => ErrorEvent | null;
  [key: string]: unknown;
};

let _capturedInitOptions: InitOptions | null = null;

export const init = jest.fn((options: InitOptions) => {
  _capturedInitOptions = options;
});

export const wrap = jest.fn(<T>(component: T): T => component);
export const captureException = jest.fn();
export const captureMessage = jest.fn();

export function getCapturedInitOptions(): InitOptions | null {
  return _capturedInitOptions;
}

export const addBreadcrumb = jest.fn();
export const getCurrentScope = jest.fn(() => ({ setContext: jest.fn() }));
export const metrics = {
  increment: jest.fn(),
};

export function resetMock(): void {
  _capturedInitOptions = null;
  init.mockClear();
  wrap.mockClear();
  captureException.mockClear();
  captureMessage.mockClear();
  addBreadcrumb.mockClear();
  getCurrentScope.mockClear();
  metrics.increment.mockClear();
}
