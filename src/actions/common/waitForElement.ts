import { type Client } from 'chrome-remote-interface'

export async function waitForElement(client: Client, selector: string, timeout = 5000): Promise<void> {
  const { Runtime } = client;
  
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const { result } = await Runtime.evaluate({
      expression: `document.querySelector('${selector}') !== null`
    });
    
    if (result.value === true) {
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Element ${selector} not found after ${timeout}ms`);
}

