# minigame-llm · v0.0.1

Mini juego de batallas de ejércitos pensado para ser jugado por **agentes de IA**.
Varios ejércitos (2–6, hasta ~60-90 unidades cada uno), cada uno controlado por un
agente, se enfrentan por turnos en un campo continuo 2D renderizado en un `<canvas>`.

El agente por defecto es `UtilityAgent`: un perfil numérico persistente (sin
doctrinas con nombre) que deriva turno a turno y produce retiradas, flanqueos,
emboscadas, alianzas formales y traiciones. Toda la lógica de decisión está
aislada tras la interfaz `Agent` (**patrón estrategia**): se puede sustituir por
cualquier otra implementación —incluida una respaldada por un LLM— sin tocar el
motor ni el render.

## Documentación

- [`docs/GAME_RULES.md`](docs/GAME_RULES.md) — reglas completas: fases, orden
  exacto de resolución de un turno, fórmulas de daño/captura/XP, diplomacia,
  condiciones de victoria y todas las tablas de valores actuales.
- [`docs/AGENT_CONTRACTS.md`](docs/AGENT_CONTRACTS.md) — cada interfaz TypeScript
  que un `Agent` implementa o recibe (`BattlefieldView`, `OrderSet`, `Order` y sus
  5 variantes, `DiplomacyIntent`, `GameEvent`...), con ejemplos.
- [`docs/AGENT_PROMPT.md`](docs/AGENT_PROMPT.md) — prompt de sistema y esquema
  JSON de entrada/salida para un futuro agente respaldado por un LLM (ver
  `src/agents/llm/`).

## Reglas (resumen — ver `docs/GAME_RULES.md` para el detalle y los valores exactos)

- **Preparación**: cada jugador forma su ejército con un presupuesto de puntos
  (`GAME_CONFIG.budget`). Hay 4 tipos de tropa (arquero, infantería ligera,
  infantería pesada, caballería), cada una con sus atributos y bonus por tipo
  (piedra-papel-tijera). Las unidades pueden tener **rango 1–5**: más rango =
  mejores stats y mayor coste.
- **Batalla**: hasta 30 turnos. Cada turno se resuelve en fases simultáneas:
  diplomacia → órdenes → movimiento → combate (**daño simultáneo**) → resolución
  → chequeo de victoria.
- **Órdenes**: atacar, desplazarse, defender a un aliado, capturar o mantener.
- **Diplomacia**: proponer/romper alianzas; atacar a un aliado rompe el pacto y
  cuenta como traición pública (reputación visible para todos).
- **Muerte y experiencia**: si una unidad llega a 0 de vida desaparece; quien la
  remata gana XP y puede **subir de rango**.
- **Captura**: `P(éxito) = clamp(0.5 + 0.25·(rango_atacante − rango_defensor), 0, 1)`.
  Con +2 rangos de ventaja es segura. Si tiene éxito, la unidad **cambia de bando**.
- **Victoria**: gana quien elimine al resto; si a los 30 turnos quedan varios,
  gana el de mayor valor de ejército restante (Σ coste × hp_actual/hp_max).
- **Posiciones iniciales**: siempre equidistantes (repartidas en círculo) para no
  dar ventaja inicial.

## Representación visual

- Cada unidad se dibuja con un **sprite ilustrado flat-vector** propio de su
  tipo (arquero, infantería ligera, infantería pesada, caballería), mirando a
  la derecha por defecto y **volteado horizontalmente** cuando se mueve hacia
  la izquierda. Tienen una animación simple por estado (reposo, movimiento,
  ataque) calculada en el render a partir de la orden ejecutada ese turno.
- **Color de ejército** = un único elemento de acento recoloreado en tiempo de
  carga (`src/render/spriteLoader.ts`). **Insignia de rango** = círculo con el
  número, dibujado aparte para que sea correcto en cualquier rango aunque hoy
  sólo exista arte de rango 1 (rangos 2–5 reutilizan ese mismo dibujo hasta
  que se ilustren variantes propias). Barra de HP sobre cada unidad.
- Si el sprite de una unidad aún no ha terminado de decodificar ese frame, se
  usa como respaldo la figura geométrica original (forma = tipo, color =
  ejército).

## Arquitectura

Tres capas desacopladas:

- `src/domain` + `src/engine`: **motor puro** sin DOM, testeable. `GameEngine`
  orquesta preparación, fases de turno y victoria. RNG inyectable/semillable
  (`engine/rng.ts`) para partidas deterministas.
- `src/agents`: **estrategias**. `Agent` (interfaz, ver `docs/AGENT_CONTRACTS.md`)
  + `UtilityAgent` (por defecto) + `HeuristicAgent` (doctrinas fijas, usado en
  tests) + `src/agents/llm/` (contratos y mock para un futuro agente LLM, ver
  `docs/AGENT_PROMPT.md`). `agents/index.ts` es el registro nombre → fábrica.
- `src/render` + `src/ui` + `src/sim`: canvas, controles (play/pausa/paso,
  velocidad), log de eventos y bucle de animación.

La configuración (stats, costes, rangos, presupuesto, nº de turnos…) vive en
`src/config/` y se puede ajustar sin tocar la lógica.

## Uso

```bash
npm install
npm run dev        # servidor de desarrollo
npm run build      # typecheck + build de producción
npm test           # tests (Vitest)
```

## Cómo enchufar otro agente

Implementa la interfaz `Agent` (`src/agents/Agent.ts`, documentada en
`docs/AGENT_CONTRACTS.md`) —`buildArmy` y `planTurn` obligatorios,
`onBattleStart`/`planDiplomacy` opcionales— y regístralo en `AGENT_REGISTRY`
(`src/agents/index.ts`). El motor y el render no necesitan ningún cambio.
`src/agents/llm/MockLlmAgent.ts` (registrado como `"llm-mock"`) es un ejemplo
completo que pasa por la misma tubería de prompt/JSON/parseo que usaría un
agente respaldado por un LLM real, sin depender de ninguna API.
