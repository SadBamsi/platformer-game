import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import { SettingsHydrator } from '@/store/SettingsHydrator';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agentic Game',
  description: 'Браузерный 2D-платформер — учебный full-stack проект',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="ru">
      <body>
        <SettingsHydrator />
        {children}
      </body>
    </html>
  );
}
