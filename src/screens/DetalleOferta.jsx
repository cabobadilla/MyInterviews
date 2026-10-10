const OFERTA_FIJA = {
  titulo: 'Frontend Engineer (React)',
  empresa: 'Acme Corp',
  seniority: 'Senior',
  modalidad: 'Remoto',
  salario: 'USD 5.000 - 6.000 mensual',
  ubicacion: 'Remoto (LATAM)',
};

export default function DetalleOferta({ oferta = OFERTA_FIJA }) {
  return (
    <section id="detalle-oferta" className="pantalla">
      <h1>Detalle de oferta</h1>
      <p className="desc">Datos extraídos de la oferta (extracción: T-03).</p>
      <div className="detalle-campos">
        <div className="campo">
          <label>Título</label>
          <div className="campo-valor" data-campo="titulo">{oferta.titulo ?? ''}</div>
        </div>
        <div className="campo">
          <label>Empresa</label>
          <div className="campo-valor" data-campo="empresa">{oferta.empresa ?? ''}</div>
        </div>
        <div className="campo">
          <label>Seniority</label>
          <div className="campo-valor" data-campo="seniority">{oferta.seniority ?? ''}</div>
        </div>
        <div className="campo">
          <label>Modalidad</label>
          <div className="campo-valor" data-campo="modalidad">{oferta.modalidad ?? ''}</div>
        </div>
        <div className="campo">
          <label>Salario</label>
          <div className="campo-valor" data-campo="salario">{oferta.salario ?? ''}</div>
        </div>
        <div className="campo">
          <label>Ubicación</label>
          <div className="campo-valor" data-campo="ubicacion">{oferta.ubicacion ?? ''}</div>
        </div>
      </div>
    </section>
  );
}
