import { type Client } from 'chrome-remote-interface'
import { getRandomDelay, HUMAN_DELAY } from './getRandomDelay'

export async function typeHumanLike(client: Client, text: string): Promise<void> {
  const { Input } = client;
  const words = text.split(' ');
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    for (const char of word) {
      await new Promise(resolve => 
        setTimeout(resolve, getRandomDelay(HUMAN_DELAY.KEYPRESS.MIN, HUMAN_DELAY.KEYPRESS.MAX))
      );
      
      await Input.dispatchKeyEvent({
        type: 'keyDown',
        text: char
      });
      
      await Input.dispatchKeyEvent({
        type: 'keyUp',
        text: char
      });
    }
    
    if (i < words.length - 1) {
      await new Promise(resolve => 
        setTimeout(resolve, getRandomDelay(HUMAN_DELAY.BETWEEN_WORDS.MIN, HUMAN_DELAY.BETWEEN_WORDS.MAX))
      );
      
      await Input.dispatchKeyEvent({
        type: 'keyDown',
        text: ' '
      });
      
      await Input.dispatchKeyEvent({
        type: 'keyUp',
        text: ' '
      });
    }
  }
}


