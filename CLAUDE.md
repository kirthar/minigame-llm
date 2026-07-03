# CLAUDE.md — Minigame LLM

## Stack

TypeScript + Vite (dev server / build). Tests: Vitest. No framework — pure DOM + Canvas 2D.

```
npm run dev        # dev server
npm test           # vitest run (all tests)
npm run typecheck  # tsc --noEmit
npm run build      # tsc + vite build
```

## Architecture

Three decoupled layers:

1. **Domain / Engine** (`src/domain/`, `src/engine/`) — pure logic, no DOM, fully testable.
2. **Agents** (`src/agents/`) — strategy pattern; each army is an `Agent` implementation. Default: `UtilityAgent`. `HeuristicAgent` kept for tests.
3. **Render / UI** (`src/render/`, `src/ui/`, `src/sim/`) — Canvas 2D renderer, controls bar, event log, army summary panel.

`Simulation` (`src/sim/Simulation.ts`) is the glue: owns the RAF loop, calls `GameEngine.tick()`, forwards results to `CanvasRenderer` and `EventLog`.

## Key files

| File | Purpose |
|------|---------|
| `src/config/game.ts` | Global tunable constants (`budget`, `maxTurns`, `fieldSize`, …) |
| `src/config/units.ts` | Per-unit-type stats (`maxHp`, `attack`, `move`, `armor`, `range`, …) |
| `src/config/ranks.ts` | Stat/cost multipliers per rank and XP thresholds |
| `src/domain/GameState.ts` | Full mutable game state (units, armies, alliances, turn, phase) |
| `src/domain/diplomacy.ts` | Alliance formation/breaking, `isProtected`, `ALLIANCE_PROTECTION_TURNS` |
| `src/engine/GameEngine.ts` | Turn loop: orders → movement → combat → XP → victory check |
| `src/engine/events.ts` | `GameEvent` union type (all possible events emitted each turn) |
| `src/agents/Agent.ts` | `Agent` interface + `BattlefieldView` + `OrderSet` + `DiplomacyIntent` |
| `src/agents/UtilityAgent.ts` | Utility-based AI (profiles, k-means grouping, tactical intentions) |
| `src/render/CanvasRenderer.ts` | Draws units (sprites + fallback shapes), range circle on hover |
| `src/render/spriteLoader.ts` | Loads/recolors SVG sprites per `(type, rank, armyId)` |
| `src/sim/Simulation.ts` | RAF loop, hover hit-test, tooltip, army summary updates |
| `src/ui/Controls.ts` | Play/pause/step/restart + army count, turns, budget, speed inputs |
| `src/ui/EventLog.ts` | Turn-by-turn event panel with per-turn kill grouping |

## Unit types (rock-paper-scissors)

| Type | armor | Special |
|------|-------|---------|
| Archer | 0 | Ranged (range scales with rank); +50% vs Heavy |
| Light infantry | 1 | Fast, cheap; +25% vs Archer |
| Heavy infantry | 4 | Slow, tanky; +50% vs Cavalry |
| Cavalry | 1 | Very fast, charge bonus; +50% vs Archer & Light |

Edit stats in `src/config/units.ts` — no engine changes needed.

## Diplomacy

Alliances form when **both** armies propose (`planDiplomacy`) in the **same turn**. A newly formed alliance is protected for `ALLIANCE_PROTECTION_TURNS = 5` turns: attacks between allied units are silently redirected to other enemies or suppressed; `break` intents emit `alliance-protected` and are ignored. After the window expires, betrayal is possible and emits a `betrayal` event.

## Configurable UI controls

All of these take effect on the next restart (↺ Reiniciar):
- **Jugadores** — number of armies (2–6)
- **Turnos** — max turns before score-based victory (10–200)
- **Presupuesto** — points budget per army (100–5000)
- **Velocidad** — animation speed multiplier (0.25–4×)

## Development branch

`claude/ai-army-battle-game-w0gnfu`
