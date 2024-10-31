import { type Client } from 'chrome-remote-interface'
import { getRandomDelay, HUMAN_DELAY } from './getRandomDelay'

export async function clickElement(client: Client, selector: string): Promise<void> {
  const { Runtime, Input } = client;
  
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const element = document.querySelector('${selector}');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      })()
    `,
    returnByValue: true
  });
  
  if (!result.value) {
    throw new Error(`Element ${selector} not found`);
  }
  
  const position = result.value;
  
  await Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: position.x,
    y: position.y,
    button: 'left',
    clickCount: 1
  });
  
  await new Promise(resolve => 
    setTimeout(resolve, getRandomDelay(HUMAN_DELAY.CLICK.MIN, HUMAN_DELAY.CLICK.MAX))
  );
  
  await Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: position.x,
    y: position.y,
    button: 'left',
    clickCount: 1
  });
}
