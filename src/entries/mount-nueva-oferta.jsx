import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import NuevaOferta from '../screens/NuevaOferta.jsx';
import '../styles.css';

const root = document.getElementById('root');
if (root) {
  root.innerHTML = renderToString(<NuevaOferta />);
  hydrateRoot(root, <NuevaOferta />);
}
