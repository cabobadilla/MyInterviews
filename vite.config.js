import path from 'node:path';
import { cpSync, rmSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FIXTURES = [
  'tests/fixtures/login.html',
  'tests/fixtures/pipeline.html',
  'tests/fixtures/nueva-oferta.html',
  'tests/fixtures/detalle-oferta.html',
];

// Vite conserva la ruta relativa de los inputs: public/fixtures/tests/fixtures/*.html.
// Las aplanamos a public/fixtures/*.html — sus referencias './assets/…' quedan
// válidas porque ambos comparten el archivo html y la carpeta de assets padre.
function aplanarFixtures() {
  return {
    name: 'aplanar-fixtures',
    closeBundle() {
      const anidado = path.resolve('public/fixtures/tests/fixtures');
      let movido = false;
      try {
        for (const f of FIXTURES) {
          cpSync(path.join(anidado, path.basename(f)), path.resolve('public/fixtures', path.basename(f)));
          movido = true;
        }
      } catch {
        return; // segunda pasada no emitida o salida ya limpia
      }
      if (movido) {
        rmSync(path.resolve('public/fixtures/tests'), { recursive: true, force: true });
        rmSync(path.resolve('public/fixtures/index.html'), { force: true });
      }
    },
  };
}

// Pasada 1 (default): la SPA completa → public/.
// Pasada 2 (mode=fixtures): los cuatro fixtures → public/fixtures/, con base
// relativa porque tests/helpers/browser.mjs sirve el html desde su propio
// directorio: los assets se resuelven como ./assets/... bajo public/fixtures/.
export default defineConfig(({ mode }) => {
  const esFixtures = mode === 'fixtures';
  return {
    base: './',
    plugins: [react(), ...(esFixtures ? [aplanarFixtures()] : [])],
    build: {
      outDir: esFixtures ? 'public/fixtures' : 'public',
      emptyOutDir: !esFixtures,
      rollupOptions: {
        input: esFixtures
          ? FIXTURES.map((f) => path.resolve(f))
          : [path.resolve('index.html')],
      },
    },
  };
});
