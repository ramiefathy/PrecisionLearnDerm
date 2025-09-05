import { describe, it, expect } from 'vitest';
import { chunkToString, AgentMessage } from '../components/AgentOutputViewer';

describe('chunkToString', () => {
  it('returns chunk when string', () => {
    expect(chunkToString('hello')).toBe('hello');
  });

  it('returns text property when object has text', () => {
    const msg: AgentMessage = { text: 'world' };
    expect(chunkToString(msg)).toBe('world');
  });

  it('stringifies object without text', () => {
    const msg: AgentMessage = { foo: 'bar' };
    expect(chunkToString(msg)).toBe(JSON.stringify({ foo: 'bar' }));
  });
});
