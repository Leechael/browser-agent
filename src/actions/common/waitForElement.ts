import { type Client } from 'chrome-remote-interface'

export async function waitForElement(
  client: Client, 
  selector: string, 
  timeout = 5000,
  abortSignal?: AbortSignal
): Promise<void> {
  const { Runtime } = client;
  
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] waitForElement: Starting to wait for selector "${selector}" with ${timeout}ms timeout`);
  
  while (Date.now() - startTime < timeout) {
    // Check if operation was aborted
    if (abortSignal?.aborted) {
      throw new Error(`waitForElement aborted for selector: ${selector}`);
    }
    
    try {
      const { result } = await Runtime.evaluate({
        expression: `document.querySelector('${selector}') !== null`
      });
      
      if (result.value === true) {
        console.log(`[${new Date().toISOString()}] waitForElement: Element found after ${Date.now() - startTime}ms`);
        return;
      }
    } catch (evalError) {
      console.warn(`[${new Date().toISOString()}] waitForElement: Runtime.evaluate failed:`, evalError);
      // Continue trying in case it's a temporary issue
    }
    
    // Use Promise.race to support abort during sleep
    await Promise.race([
      new Promise(resolve => setTimeout(resolve, 100)),
      new Promise((_, reject) => {
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            reject(new Error(`waitForElement aborted during sleep for selector: ${selector}`));
          });
        }
      })
    ]);
  }
  
  console.log(`[${new Date().toISOString()}] waitForElement: Timeout reached after ${timeout}ms`);
  throw new Error(`Element ${selector} not found after ${timeout}ms`);
}

