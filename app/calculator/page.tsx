import type { Metadata, Viewport } from 'next';
import FunctionCalculator from '@/components/FunctionCalculator';

export const metadata: Metadata = {
  title: '関数電卓 | FUNCTION LAB',
  description: '高校数学の四則演算、三角関数、指数・対数、微分積分、極限、方程式、関数グラフ、統計に対応する関数電卓。',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#07111e',
};

export default function CalculatorPage() {
  return <FunctionCalculator />;
}
