import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/appearance.css';
import './ui/preferences.css';
import './ui/motion.css';
import './ui/studio-layout.css';
import './ui/studio-theme.css';

class AppBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="recovery">
        <h1>Вернёмся к занятиям</h1>
        <p>Не удалось показать этот экран. Сохранённые занятия останутся на месте.</p>
        <button onClick={() => location.reload()}>Открыть заново</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);

import './ui/interface-cleanup.css';
