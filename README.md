# minigame-llm · v0.0.1

Mini juego de batallas de ejércitos pensado para ser jugado por **agentes de IA**.
Varios ejércitos, cada uno controlado por un agente, se enfrentan por turnos en un
campo continuo 2D renderizado en un `<canvas>`.

La v0.0.1 usa una **IA estática** (heurística) para todos los jugadores, pero toda
la lógica de decisión está aislada tras la interfaz `Agent` (**patrón estrategia**):
se puede sustituir por un agente remoto/LLM sin tocar el motor ni el render.

## Reglas

- **Preparación**: cada jugador forma su ejército con **100 puntos**. Hay 4 tipos
  de tropa (arquero, infantería ligera, infantería pesada, caballería), cada una
  con sus atributos y bonus por tipo (piedra-papel-tijera). Las unidades pueden
  tener **rango 1–5**: más rango = mejores stats y mayor coste.
- **Batalla**: hasta **30 turnos**. En cada turno todos los agentes dan órdenes de
  forma simultánea (por unidad, por tipo o a todas). El turno se resuelve **por
  fases**: primero todos se mueven, luego se resuelve el combate con **daño
  simultáneo**.
- **Órdenes**: atacar, desplazarse, defender a un aliado, capturar o mantener.
- **Muerte y experiencia**: si una unidad llega a 0 de vida desaparece; quien la
  remata gana XP y puede **subir de rango**.
- **Captura**: `P(éxito) = clamp(0.5 + 0.25·(rango_atacante − rango_defensor), 0, 1)`.
  Con +2 rangos de ventaja es segura. Si tiene éxito, la unidad **cambia de bando**.
- **Victoria**: gana quien elimine al resto; si a los 30 turnos quedan varios,
  gana el de mayor valor de ejército restante (Σ coste × hp_actual/hp_max).
- **Posiciones iniciales**: siempre equidistantes (repartidas en círculo) para no
  dar ventaja inicial. 2–6 ejércitos configurables.

## Representación visual

- **Forma** = tipo: triángulo (arquero), círculo (ligera), cuadrado (pesada),
  rombo (caballería).
- **Color** = ejército. **Grosor del borde** = rango. Barra de HP sobre cada unidad.
- (Más adelante se sustituirán por sprites con animaciones.)

## Arquitectura

Tres capas desacopladas:

- `src/domain` + `src/engine`: **motor puro** sin DOM, testeable. `GameEngine`
  orquesta preparación, fases de turno y victoria. RNG inyectable/semillable
  (`engine/rng.ts`) para partidas deterministas.
- `src/agents`: **estrategias**. `Agent` (interfaz) + `HeuristicAgent` (IA estática).
  `agents/index.ts` es el registro nombre → fábrica.
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

## Cómo enchufar otro agente (futuro)

Implementa la interfaz `Agent` (`src/agents/Agent.ts`) —`buildArmy` y `planTurn`,
opcionalmente `onBattleStart`— y regístralo en `AGENT_REGISTRY`. El motor y el
render no necesitan ningún cambio.
