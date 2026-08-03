import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { OverlayApp } from './OverlayApp';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const isOverlay = params.get('overlay') === '1';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <OverlayApp /> : <App />}</React.StrictMode>,
);
