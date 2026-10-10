import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import Pipeline from '../screens/Pipeline.jsx';
import '../styles.css';

const root = document.getElementById('root');
if (root) {
  root.innerHTML = renderToString(<Pipeline />);
  hydrateRoot(root, <Pipeline />);
}
