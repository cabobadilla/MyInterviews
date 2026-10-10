import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import DetalleOferta from '../screens/DetalleOferta.jsx';
import '../styles.css';

const root = document.getElementById('root');
if (root) {
  root.innerHTML = renderToString(<DetalleOferta />);
  hydrateRoot(root, <DetalleOferta />);
}
