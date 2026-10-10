import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import Login from '../screens/Login.jsx';
import '../styles.css';

const root = document.getElementById('root');
if (root) {
  root.innerHTML = renderToString(<Login />);
  hydrateRoot(root, <Login />);
}
