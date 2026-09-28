import Link from 'next/link';
import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  return (
    <main className="menu">
      <h1>Agentic Game</h1>
      <p>Браузерный 2D-платформер на Next.js + Phaser. Учебный full-stack каркас.</p>
      <nav className="menu-nav">
        <Link href="/play">Играть</Link>
        <Link href="/leaderboard">Таблица рекордов</Link>
      </nav>
    </main>
  );
}
