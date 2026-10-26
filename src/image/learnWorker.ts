// Learn from my choices, off the page: how often every method is right on the examples (each left out in turn, or ten
// parts of them), and the method chosen. The page then fits that one method on all the examples (one fit: quick).
import { chooseMethod, type LearnChoice, type LearnMethod } from './learn.ts';

export type LearnRequest = { seq: number; X: number[][]; y: number[]; method: LearnMethod | 'auto' };
export type LearnReply = { seq: number; choice: LearnChoice | null };

self.onmessage = (e: MessageEvent<LearnRequest>) => {
  const { seq, X, y, method } = e.data;
  self.postMessage({ seq, choice: chooseMethod(X, y, method) } satisfies LearnReply);
};
