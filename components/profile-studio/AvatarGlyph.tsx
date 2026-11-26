'use client';

import React from 'react';
import {
  Flower2, Moon, Star, Orbit, Cat, Fish, Bird, Butterfly,
  Sun, Headphones, BookOpen, Gamepad2, Clover, Cloud, Diamond, Leaf,
} from 'lucide-react';

const GLYPHS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  '🌸': Flower2,
  '🌙': Moon,
  '⭐': Star,
  '🪐': Orbit,
  '🐈': Cat,
  '🦊': Bird,
  '🐬': Fish,
  '🐧': Bird,
  '🦋': Butterfly,
  '🌻': Sun,
  '🎧': Headphones,
  '📚': BookOpen,
  '🎮': Gamepad2,
  '🍀': Clover,
  '☁️': Cloud,
  '💎': Diamond,
};

const TONES: Record<string, string> = {
  '🌸': 'text-pink-300', '🌙': 'text-indigo-200', '⭐': 'text-amber-300',
  '🪐': 'text-violet-300', '🐈': 'text-slate-200', '🦊': 'text-orange-300',
  '🐬': 'text-cyan-300', '🐧': 'text-sky-200', '🦋': 'text-violet-300',
  '🌻': 'text-yellow-300', '🎧': 'text-fuchsia-300', '📚': 'text-emerald-300',
  '🎮': 'text-indigo-300', '🍀': 'text-green-300', '☁️': 'text-slate-200',
  '💎': 'text-cyan-200',
};

export function AvatarGlyph({ value, size = 32 }: { value: string; size?: number }) {
  const Icon = GLYPHS[value] || Star;
  return <Icon size={size} strokeWidth={2.1} className={TONES[value] || 'text-cyan-300'} aria-hidden="true" />;
}
