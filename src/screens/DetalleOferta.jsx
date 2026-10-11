// Pantalla «Detalle de oferta» (T-04): campos editables, resalte de los
// campos faltantes, raw_text plegable y link de origen.
//
// El resalte NO es un estilo en línea: los campos que aparecen en
// campos_faltantes de la oferta se marcan con la clase CSS `campo-faltante`
// (definida en styles.css), que el test consulta. Sin oferta cargada la
// pantalla muestra la ficha demo (misma forma que el fixture de la SPA), y
// con un id carga el detalle real por GET /api/offers/:id y guarda la
// edición por PUT — que no vuelve a llamar al LLM.
import { useEffect, useState } from 'react';

const OFERTA_FIJA = {
  titulo: 'Frontend Engineer (React)',
  empresa: 'Acme Corp',
  seniority: 'Senior',
  modalidad: 'Remoto',
  salario: 'USD 5.000 - 6.000 mensual',
  ubicacion: 'Remoto (LATAM)',
};

const CAMPOS_TEXTO = [
  ['titulo', 'Título'],
  ['empresa', 'Empresa'],
  ['seniority', 'Seniority'],
  ['modalidad', 'Modalidad'],
  ['ubicacion', 'Ubicación'],
];

function textoDeSalario(salario) {
  if (salario == null) return '';
  if (typeof salario === 'string') return salario;
  if (typeof salario === 'object' && typeof salario.texto === 'string') return salario.texto;
  return '';
}

export default function DetalleOferta({ id = null } = {}) {
  const [datos, setDatos] = useState(null);
  const [idBuscado, setIdBuscado] = useState(id);
  const [y, setY] = useState(id != null ? String(id) : '');
  const [edicion, setEdicion] = useState({});
  const [errorTela, setErrorTela] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Sin id que cargar la pantalla queda en la ficha demo (fixture de la SPA);
  // con id, trae el detalle real: raw_text y source_url tal como se guardaron.
  useEffect(() => {
    if (idBuscado == null) {
      setDatos(null);
      setEdicion({});
      return;
    }
    let vale = true;
    (async () => {
      setErrorTela('');
      try {
        const r = await fetch(`/api/offers/${idBuscado}`);
        let cuerpo = {};
        try { cuerpo = await r.json(); } catch { cuerpo = {}; }
        if (!vale) return;
        if (!r.ok) {
          setDatos(null);
          setErrorTela(cuerpo?.error ?? `no se pudo cargar la oferta ${idBuscado}`);
          return;
        }
        setDatos(cuerpo.oferta ?? null);
      } catch {
        if (vale) setErrorTela('no se pudo consultar el detalle de la oferta');
      }
    })();
    return () => { vale = false; };
  }, [idBuscado]);

  const mostrar = datos ?? OFERTA_FIJA;
  const esEditable = !!(datos && typeof datos.id === 'number');
  const faltantes = Array.isArray(datos?.campos_faltantes) ? datos.campos_faltantes : [];

  const valorDe = (campo) => {
    if (edicion[campo] !== undefined) return edicion[campo];
    const v = mostrar[campo];
    return v == null ? '' : String(v);
  };
  const valorSalario = () => (edicion.salario !== undefined ? edicion.salario : textoDeSalario(mostrar.salario));

  const abrir = (e) => {
    e.preventDefault();
    const n = Number(y.trim());
    setIdBuscado(Number.isInteger(n) && n >= 1 ? n : null);
    if (!(Number.isInteger(n) && n >= 1)) setErrorTela('meté el id numérico de la oferta a revisar');
  };

  const guardar = async () => {
    if (!esEditable || guardando) return;
    const cuerpo = {};
    for (const [campo] of CAMPOS_TEXTO) {
      const v = valorDe(campo).trim();
      if (v) cuerpo[campo] = v;
    }
    const s = valorSalario().trim();
    if (s) cuerpo.salario = s;
    setGuardando(true);
    setAviso('');
    try {
      const r = await fetch(`/api/offers/${datos.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      let resp = {};
      try { resp = await r.json(); } catch { resp = {}; }
      if (!r.ok) {
        setAviso(resp?.error ?? 'no se pudo guardar la edición');
        return;
      }
      setDatos(resp.oferta ?? datos);
      setEdicion({});
      setAviso('edición guardada: la extracción no se vuelve a correr');
    } catch {
      setAviso('no se pudo guardar la edición');
    } finally {
      setGuardando(false);
    }
  };

  const claseDe = (campo) => `campo-valor${faltantes.includes(campo) ? ' campo-faltante' : ''}`;

  return (
    <section id="detalle-oferta" className="pantalla">
      <h1>Detalle de oferta</h1>
      <p className="desc">Revisá y corregí a mano lo que la extracción dejó incompleto.</p>

      {!id && (
        <form id="detalle-busqueda" className="detalle-busqueda" onSubmit={abrir}>
          <label htmlFor="detalle-id">Id de la oferta</label>
          <input
            id="detalle-id"
            value={y}
            onChange={(e) => setY(e.target.value)}
            placeholder="por ejemplo: 1"
          />
          <button type="submit" className="boton">Abrir detalle</button>
        </form>
      )}

      {errorTela && <p className="detalle-error">{errorTela}</p>}

      {datos && (
        <p className="detalle-estado">
          extracción:{' '}
          <span className={`estado estado-${datos.extraction_status ?? 'pendiente'}`}>
            {datos.extraction_status ?? 'pendiente'}
          </span>
          {datos.extraction_error ? <span className="detalle-error"> · {datos.extraction_error}</span> : null}
        </p>
      )}

      <div className="detalle-campos">
        {CAMPOS_TEXTO.map(([campo, etiqueta]) => (
          <div className="campo" key={campo}>
            <label htmlFor={`campo-${campo}`}>{etiqueta}</label>
            <div className={claseDe(campo)} data-campo={campo}>{valorDe(campo)}</div>
            {esEditable && (
              <input
                id={`campo-${campo}`}
                className="campo-entrada"
                data-editar={campo}
                value={valorDe(campo)}
                onChange={(e) => setEdicion({ ...edicion, [campo]: e.target.value })}
              />
            )}
          </div>
        ))}
        <div className="campo">
          <label htmlFor="campo-salario">Salario</label>
          <div className={claseDe('salario')} data-campo="salario">{valorSalario()}</div>
          {esEditable && (
            <input
              id="campo-salario"
              className="campo-entrada"
              data-editar="salario"
              value={valorSalario()}
              onChange={(e) => setEdicion({ ...edicion, salario: e.target.value })}
            />
          )}
        </div>
      </div>

      {esEditable && (
        <div className="detalle-acciones">
          <button type="button" className="boton" id="guardar-edicion" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar correcciones'}
          </button>
          {aviso && <p className="detalle-aviso">{aviso}</p>}
        </div>
      )}

      {datos && (
        <>
          <details className="detalle-raw">
            <summary>Texto original (raw_text), tal como se guardó</summary>
            <pre id="detalle-raw-texto">{datos.raw_text ?? ''}</pre>
          </details>
          <p className="detalle-origen">
            {datos.source_url
              ? <>Origen: <a id="link-origen" href={datos.source_url} target="_blank" rel="noreferrer">{datos.source_url}</a></>
              : 'Sin link de origen: esta oferta se cargó pegando el texto.'}
          </p>
        </>
      )}
    </section>
  );
}
