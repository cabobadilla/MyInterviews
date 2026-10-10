import { useState } from 'react';
import Login from './screens/Login.jsx';
import Pipeline from './screens/Pipeline.jsx';
import NuevaOferta from './screens/NuevaOferta.jsx';
import DetalleOferta from './screens/DetalleOferta.jsx';

const VISTAS = [
  { id: 'login', etiqueta: 'Iniciar sesión', Componente: Login },
  { id: 'pipeline', etiqueta: 'Pipeline', Componente: Pipeline },
  { id: 'nueva-oferta', etiqueta: 'Nueva oferta', Componente: NuevaOferta },
  { id: 'detalle-oferta', etiqueta: 'Detalle de oferta', Componente: DetalleOferta },
];

export default function App() {
  const [vista, setVista] = useState('login');
  const Activa = (VISTAS.find((v) => v.id === vista) || VISTAS[0]).Componente;
  return (
    <>
      <aside className="sidebar">
        <div className="marca">MyInterviews</div>
        <nav>
          {VISTAS.map(({ id, etiqueta }) => (
            <a key={id} href="#" id={`nav-${id}`} className={vista === id ? 'activo' : ''} onClick={(e) => { e.preventDefault(); setVista(id); }}>
              {etiqueta}
            </a>
          ))}
        </nav>
      </aside>
      <div className="contenido">
        <Activa />
      </div>
    </>
  );
}
