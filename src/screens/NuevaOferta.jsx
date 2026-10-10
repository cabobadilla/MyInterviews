import { useState } from 'react';

export default function NuevaOferta() {
  const [rawText, setRawText] = useState('');
  return (
    <section id="nueva-oferta" className="pantalla">
      <h1>Nueva oferta</h1>
      <p className="desc">Pegá el texto de la oferta para cargarla (extracción: T-03).</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="campo">
          <label htmlFor="nueva-oferta-texto">Texto de la oferta</label>
          <textarea
            id="nueva-oferta-texto"
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </div>
        <button id="nueva-oferta-guardar" className="boton" type="submit">Guardar oferta</button>
      </form>
    </section>
  );
}
