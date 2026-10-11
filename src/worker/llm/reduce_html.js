// llm/reduce_html.js — C-09 y C-12: descargar la oferta server-side con cap
// 500 KB y reducir el HTML a texto. Dos mitades con responsabilidades claras:
//   reducirHtml(html)      → lógica de strings PURA (medible en el árbol pelado).
//   descargarTexto({...})  → la descarga, fina: usa el fetchImpl inyectado
//                            (nunca pega al endpoint por sí sola) y aplica el
//                            cap de 500 KB del contrato.
// Imports: SOLO módulos puros del proyecto (lib/schema.js no importa nada) —
// la suite corre en un árbol pelado sin node_modules (ADR-004/ADR-006).

import { CAP_BYTES } from '../lib/schema.js';

function entidades(texto) {
  return String(texto)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&mdash;', '—')
    .replaceAll('&ndash;', '–');
}

export function reducirHtml(html) {
  const texto = entidades(String(html ?? ''));
  // Los bloques invisibles van fuera ANTES de quitar etiquetas, para no
  // arrastrar su contenido al texto visible.
  const sinInvisibles = texto
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  // Bloques visibles que separan: nuevo renglón.
  const conSaltos = sinInvisibles
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/tr|\/div)\s*(\/)?\s*>/gi, '\n');
  // Todas las etiquetas restantes, fuera.
  const sinEtiquetas = conSaltos.replace(/<[^>]+>/g, ' ');
  return sinEtiquetas
    .split('\n')
    .map((linea) => linea.replace(/[ \t]+/g, ' ').trim())
    .filter((linea) => linea.length > 0)
    .join('\n');
}

const BYTES = new TextEncoder();

export async function descargarTexto({ url, fetchImpl, capBytes = CAP_BYTES }) {
  try {
    const resp = await fetchImpl(url);
    // C-12: un endpoint que no contesta bien — status 404, 500 o un cuerpo
    // que no puede leerse — cuenta como URL no descargable.
    if (!resp?.ok || (resp?.status ?? 200) >= 400) {
      return {
        ok: false,
        motivo: `la descarga respondió con status ${resp?.status ?? 'desconocido'}`,
        error: `el servidor de «${url}» respondió con status ${resp?.status ?? 'desconocido'}`,
      };
    }
    const crudo = await resp.text();
    if (BYTES.encode(crudo).length > capBytes) {
      return {
        ok: false,
        motivo: 'demasiado grande',
        error: `el contenido de «${url}» pasa el techo de ${(capBytes / 1000).toFixed(0)} KB (${BYTES.encode(crudo).length} bytes)`,
      };
    }
    return { ok: true, texto: reducirHtml(crudo), bytes: BYTES.encode(crudo).length };
  } catch {
    return {
      ok: false,
      motivo: 'caída de red',
      error: `no se pudo descargar «${url}»: la red no respondió`,
    };
  }
}

// Extra exportada para C-13 por si el cableado quiere el techo explícito.
export const CAP_KB = Math.round(CAP_BYTES / 1000);
