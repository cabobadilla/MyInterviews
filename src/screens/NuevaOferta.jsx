import { useState } from 'react';

// Pantalla «Nueva oferta» (T-03): selector URL/texto, estado de la extracción
// y el link de origen. Todo pasa por la API (POST /api/offers/extract): la SPA
// nunca llama a OpenRouter directamente.

export default function NuevaOferta() {
  const [fuente, setFuente] = useState('texto'); // 'texto' | 'url'
  const [url, setUrl] = useState('');
  const [texto, setTexto] = useState('');
  const [extrayendo, setExtrayendo] = useState(false);
  const [resultado, setResultado] = useState(null); // {ok, oferta?, error?}

  async function extraer(e) {
    e.preventDefault();
    setExtrayendo(true);
    setResultado(null);
    try {
      const cuerpo = fuente === 'url' ? { fuente, url: url.trim() } : { fuente, texto };
      const resp = await fetch('/api/offers/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cuerpo),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 201) {
        setResultado({ ok: true, oferta: data.oferta });
      } else {
        setResultado({ ok: false, error: data.error ?? `la extracción falló con status ${resp.status}` });
      }
    } catch {
      setResultado({ ok: false, error: 'no se pudo llamar a la API de extracción' });
    } finally {
      setExtrayendo(false);
    }
  }

  const ESTADO = { pendiente: 'pendiente', exitosa: 'exitosa', parcial: 'incompleta (faltan campos)', fallida: 'fallida' };
  const status = resultado?.oferta?.extraction_status;

  return (
    <section id="nueva-oferta" className="pantalla">
      <h1>Nueva oferta</h1>
      <p className="desc">Pegá el texto de la oferta o su URL: se extrae con el LLM.</p>

      <form onSubmit={extraer}>
        <div className="campo">
          <label>Fuente de la oferta</label>
          <div role="radiogroup" aria-label="Fuente de la oferta">
            <label>
              <input
                type="radio"
                name="fuente"
                value="texto"
                checked={fuente === 'texto'}
                onChange={() => setFuente('texto')}
              />
              texto
            </label>
            <label>
              <input
                type="radio"
                name="fuente"
                value="url"
                checked={fuente === 'url'}
                onChange={() => setFuente('url')}
              />
              url
            </label>
          </div>
        </div>

        {fuente === 'url' ? (
          <div className="campo">
            <label htmlFor="nueva-oferta-url">URL de la oferta</label>
            <input
              id="nueva-oferta-url"
              type="text"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        ) : null}

        <div className="campo">
          <label htmlFor="nueva-oferta-texto">Texto de la oferta</label>
          <textarea
            id="nueva-oferta-texto"
            rows={8}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>

        <button id="nueva-oferta-guardar" className="boton" type="submit" disabled={extrayendo}>
          {extrayendo ? 'Extrayendo…' : 'Cargar oferta'}
        </button>
      </form>

      {extrayendo ? <p className="estado">Extracción en curso…</p> : null}

      {resultado && !resultado.ok ? (
        <p id="nueva-oferta-error" className="error" role="alert">
          {resultado.error}
        </p>
      ) : null}

      {resultado?.ok && resultado.oferta ? (
        <div id="nueva-oferta-resultado">
          <p className="estado">
            Estado de la extracción: <strong>{ESTADO[status] ?? status}</strong>
            {resultado.oferta.campos_faltantes?.length
              ? <span> — faltan: {resultado.oferta.campos_faltantes.join(', ')}</span>
              : null}
          </p>
          <p className="titulo-guardado">{resultado.oferta.titulo ?? 'sin título extraído'}</p>
          {resultado.oferta.source_url ? (
            <p className="origen">
              Origen: <a href={resultado.oferta.source_url} target="_blank" rel="noreferrer">{resultado.oferta.source_url}</a>
            </p>
          ) : null}
          <p className="nota">Completá lo que falte en el detalle de la oferta.</p>
        </div>
      ) : null}
    </section>
  );
}
