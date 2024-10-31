import CDP, { type Client } from 'chrome-remote-interface'
import { Subject, Observable, merge } from 'rxjs'
import { filter, debounceTime } from 'rxjs/operators'

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

export type ObservableXHR = Observable<XhrResponse | typeof loadingFinishedSymbol>;

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

async function setupNetworkMonitoring(client: Client) {
  const pendingRequests = new Map<string, PendingRequest>();
  const { Network } = client;

  const xhrSubject = new Subject<XhrResponse>()
  const pendingAllLoadSubject = new Subject<typeof loadingFinishedSymbol>();

  await Network.enable();

  Network.requestWillBeSent(({ requestId, request, type }) => {
    if (type === 'XHR') {
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
          pendingAllLoadSubject.next(loadingFinishedSymbol)
        }
      }
    }
  });

  Network.loadingFailed(({ requestId, errorText }) => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      console.warn(`XHR request failed for ${pending.url}:`, errorText);
      pendingRequests.delete(requestId);
      console.log('b', Array.from(pendingRequests.entries()))
      if (pendingRequests.size === 0) {
        pendingAllLoadSubject.next(loadingFinishedSymbol)
      }
    }
  });

  return merge(
    xhrSubject,
    pendingAllLoadSubject.pipe(
      debounceTime(5000),
    ),
  )
}

export async function openPage({ url, port = 9222 }: PageOptions): Promise<PageManager> {
  try {
    const client = await CDP({ port });
    const { Page } = client;
    await Page.enable();
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

export function matchedUrl(strOrRegex: string | RegExp) {
  return filter((i): i is XhrResponse => {
    if (i === loadingFinishedSymbol) {
      return false
    }
    if (strOrRegex instanceof RegExp) {
      return strOrRegex.test((i as XhrResponse).url)
    }
    return (i as XhrResponse).url.includes(strOrRegex)
  })
}
