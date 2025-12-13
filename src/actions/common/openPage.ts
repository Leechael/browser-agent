import CDP, { type Client } from 'chrome-remote-interface'
import { Subject, Observable, merge, firstValueFrom, race, throwError, timer } from 'rxjs'
import { filter, debounceTime, take, map, takeUntil } from 'rxjs/operators'

export interface XhrResponse<T=any> {
  requestId: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: () => Promise<unknown>;
  json: () => Promise<T>;
}

export const loadingInProgressSymbol = Symbol('loading-in-progress')
export const loadingFinishedSymbol = Symbol('loading-finished')
export const pageIdleSymbol = Symbol('page-idle')

export type StreamSignal = typeof loadingFinishedSymbol | typeof pageIdleSymbol
export type ObservableXHR = Observable<XhrResponse | StreamSignal>;

// Custom error for when page loaded but no matching XHR was found
export class PageLoadedWithoutMatchError extends Error {
  constructor(public pattern: string | RegExp) {
    super(`Page loaded but no XHR matched pattern: ${pattern}`)
    this.name = 'PageLoadedWithoutMatchError'
  }
}

export interface PageManager {
  client: CDP.Client;
  xhr$: ObservableXHR;
}

export interface PageOptions {
  url: string;
  port?: number;
}

export interface PendingRequest {
  url: string;
  responseReceived?: boolean;
  loadingFinished?: boolean;
  extraInfoReceived?: boolean;
  response?: any;
  timestamp: number;
}

function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface NetworkMonitoringOptions {
  idleTimeout?: number; // ms to wait before considering page idle (default: 3000)
}

async function setupNetworkMonitoring(
  client: Client,
  options: NetworkMonitoringOptions = {}
) {
  const { idleTimeout = 3000 } = options;
  const pendingRequests = new Map<string, PendingRequest>();
  const { Network, Page } = client;

  const xhrSubject = new Subject<XhrResponse>()
  const signalSubject = new Subject<StreamSignal>();

  // Idle detection state
  let pageLoaded = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleEmitted = false;

  function emitIdleSignal() {
    if (!idleEmitted && pageLoaded) {
      idleEmitted = true;
      signalSubject.next(pageIdleSymbol);
    }
  }

  function resetIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (pageLoaded && !idleEmitted) {
      idleTimer = setTimeout(() => {
        // Page loaded + no new requests for idleTimeout ms → emit idle signal
        if (pendingRequests.size === 0) {
          emitIdleSignal();
        }
      }, idleTimeout);
    }
  }

  await Network.enable();

  // Listen for page load event
  Page.loadEventFired(() => {
    pageLoaded = true;
    // Start idle timer after page load
    resetIdleTimer();
  });

  Network.requestWillBeSent(({ requestId, request, type }) => {
    if (type === 'XHR') {
      // Reset idle timer when new XHR request starts
      resetIdleTimer();
      pendingRequests.set(requestId, {
        url: request.url,
        timestamp: +(new Date),
      });
    }
  });

  Network.responseReceived(({ requestId, response, type, timestamp }) => {
    if (type === 'XHR') {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.responseReceived = true;
        pending.response = response;
        pending.timestamp = timestamp;
      }
    }
  });

  Network.responseReceivedExtraInfo(({ requestId }) => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pending.extraInfoReceived = true;
    }
  });

  Network.loadingFinished(async ({ requestId }) => {
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return
    }

    pending.loadingFinished = true;

    if (pending.responseReceived && pending.extraInfoReceived) {
      try {
        for (let i = 0; i < 3; i++) {
          try {
            await delay(50 * (i + 1));

            const xhrResponse: XhrResponse = {
              requestId,
              url: pending.url,
              status: pending.response!.status,
              headers: pending.response!.headers,
              body: async function () {
                return (await Network.getResponseBody({ requestId })).body
              },
              json: async function () {
                const raw = (await Network.getResponseBody({ requestId })).body
                return JSON.parse(raw)
              },
            };

            xhrSubject.next(xhrResponse);
            break;
          } catch (err) {
          }
        }
      } finally {
        pendingRequests.delete(requestId);
        if (pendingRequests.size === 0) {
          signalSubject.next(loadingFinishedSymbol);
          // Also reset idle timer when all requests finished
          resetIdleTimer();
        }
      }
    }
  });

  Network.loadingFailed(({ requestId, errorText }) => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pendingRequests.delete(requestId);
      if (pendingRequests.size === 0) {
        signalSubject.next(loadingFinishedSymbol);
        // Also reset idle timer when all requests finished
        resetIdleTimer();
      }
    }
  });

  return merge(
    xhrSubject,
    signalSubject.pipe(
      debounceTime(1000), // Reduced from 5000ms for faster idle detection
    ),
  )
}

export async function openPage({ url, port = Number(process.env.CHROME_PORT) || 9222 }: PageOptions): Promise<PageManager> {
  try {
    const targets = await CDP.List()
    if (targets.length === 0) {
      await CDP.New({ url: 'about:blank' })
    }
    let client = await CDP({ port });
    try {
        await Promise.race([
          client.Page.enable(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        ]);
    } catch (error) {
      const resp = await client.Target.getTargetInfo()
      await client.Target.closeTarget({ targetId: resp.targetInfo.targetId })
      const targets = await CDP.List()
      if (targets.length === 0) {
        await CDP.New({ url: 'about:blank' })
      }
      client = await CDP({ port })
      await client.Page.enable()
    }

    const { Page } = client;

    const xhrStream = await setupNetworkMonitoring(client);

    await Page.navigate({ url });
    await Page.loadEventFired();
    
    return {
      client,
      xhr$: xhrStream,
    };

  } catch (err) {
    console.error('Error in getOrCreateXPage:', err);
    throw err;
  }
}

/**
 * @deprecated Use `waitForMatch` instead for better error handling
 */
export function matchedUrl(strOrRegex: string | RegExp) {
  return filter((i): i is XhrResponse => {
    if (i === loadingFinishedSymbol || i === pageIdleSymbol) {
      return false
    }
    if (strOrRegex instanceof RegExp) {
      return strOrRegex.test((i as XhrResponse).url)
    }
    return (i as XhrResponse).url.includes(strOrRegex)
  })
}

/**
 * Wait for a matching XHR request or throw if page becomes idle without match.
 *
 * @param strOrRegex - String or RegExp to match against XHR URLs
 * @param timeoutMs - Maximum time to wait (default: 30000ms)
 * @returns Promise that resolves with matching XhrResponse or rejects with PageLoadedWithoutMatchError
 */
export function waitForMatch(
  xhr$: ObservableXHR,
  strOrRegex: string | RegExp,
  timeoutMs = 30000
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const subscription = xhr$.subscribe({
      next(value) {
        if (resolved) return;

        // Check for idle/finished signals
        if (value === pageIdleSymbol || value === loadingFinishedSymbol) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          subscription.unsubscribe();
          reject(new PageLoadedWithoutMatchError(strOrRegex));
          return;
        }

        // Check if URL matches
        const xhrResponse = value as XhrResponse;
        const matched = strOrRegex instanceof RegExp
          ? strOrRegex.test(xhrResponse.url)
          : xhrResponse.url.includes(strOrRegex);

        if (matched) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          subscription.unsubscribe();
          resolve(xhrResponse);
        }
      },
      error(err) {
        if (resolved) return;
        resolved = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        reject(err);
      },
    });

    // Set timeout
    timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        subscription.unsubscribe();
        reject(new Error(`Timeout waiting for XHR matching: ${strOrRegex}`));
      }
    }, timeoutMs);
  });
}
