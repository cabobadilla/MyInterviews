// llm/gateway.js — pasarela a OpenRouter (contrato T-03, spec §4).
// NO importa nada en el árbol pelado: el fetch se INYECTA (fetchImpl), la
// credencial y el modelo salen de env (OPENROUTER_API_KEY y
// LLM_MODEL_EXTRACCION — variable, nunca constante). Timeout 60 s y
// exactamente 1 reintento (ADR-006: reintentos en bucle, fuera).

export const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
export const TIMEOUT_MS = 60_000;

export async function llamarLlm({ env, mensajes, fetchImpl, timeoutMs = TIMEOUT_MS }) {
  const apiKey = env?.OPENROUTER_API_KEY;
  const modelo = env?.LLM_MODEL_EXTRACCION;
  if (!apiKey || !modelo) {
    return {
      ok: false,
      error: 'falta la credencial o el modelo en el entorno: se esperan OPENROUTER_API_KEY y LLM_MODEL_EXTRACCION',
    };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'el gateway no tiene canal de red disponible en esta corrida' };
  }

  const cuerpo = JSON.stringify({ model: modelo, messages: mensajes });
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  // Exactamente un reintento: como mucho dos llamadas.
  let ultimoError = null;
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const resp = await Promise.race([
        fetchImpl(URL_OPENROUTER, { method: 'POST', headers, body: cuerpo }),
        new Promise((_, rechazar) => {
          const id = setTimeout(() => rechazar(new Error('la pasarela no contestó dentro del plazo del gateway')), timeoutMs);
          if (id.unref) id.unref();
        }),
      ]);
      if (!resp?.ok || (resp?.status ?? 200) >= 400) {
        ultimoError = `la pasarela rechazó la llamada con status ${resp?.status ?? 'desconocido'}`;
        continue;
      }
      const data = await resp.json();
      const texto = data?.choices?.[0]?.message?.content;
      if (typeof texto !== 'string' || texto.length === 0) {
        ultimoError = 'la pasarela respondió sin el texto del modelo (sin choices[0].message.content)';
        continue;
      }
      return { ok: true, texto, status: resp.status ?? 200 };
    } catch (err) {
      ultimoError = 'la llamada a la pasarela se cortó antes de responder (red caida o timeout del gateway)';
    }
  }
  return { ok: false, error: ultimoError ?? 'la pasarela falló sin detalle' };
}
