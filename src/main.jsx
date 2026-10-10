import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  root.innerHTML = renderToString(<App />);
  hydrateRoot(root, <App />);
}
