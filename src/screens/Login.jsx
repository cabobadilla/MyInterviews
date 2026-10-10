export default function Login() {
  return (
    <section id="login" className="pantalla">
      <h1>Iniciar sesión</h1>
      <p className="desc">Acceso único de usuario (autenticación real: T-02).</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="campo">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="email" />
        </div>
        <div className="campo">
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" type="password" autoComplete="current-password" />
        </div>
        <button id="login-boton" className="boton" type="submit">Entrar</button>
      </form>
    </section>
  );
}
