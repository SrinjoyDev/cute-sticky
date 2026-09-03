import type { Color } from './types';

export const COLORS: { id: Color; hex: string; name: string }[] = [
  { id: 'butter', hex: '#FFE9A8', name: 'Butter' },
  { id: 'peach', hex: '#FFD3C2', name: 'Peach' },
  { id: 'mint', hex: '#CFEFDD', name: 'Mint' },
  { id: 'sky', hex: '#CDE6FA', name: 'Sky' },
  { id: 'lilac', hex: '#E3D7F7', name: 'Lilac' },
  { id: 'rose', hex: '#FBD5E3', name: 'Rose' },
];

export function colorHex(id: string): string {
  return (COLORS.find((c) => c.id === id) ?? COLORS[0]).hex;
}
