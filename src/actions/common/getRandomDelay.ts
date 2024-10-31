export const HUMAN_DELAY = {
  CLICK: { MIN: 100, MAX: 300 },
  KEYPRESS: { MIN: 50, MAX: 150 },
  BETWEEN_WORDS: { MIN: 200, MAX: 400 }
};

export const getRandomDelay = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};
