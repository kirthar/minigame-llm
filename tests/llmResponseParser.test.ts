import { describe, expect, it } from "vitest";
import {
  parseArmyBlueprint,
  parseDiplomacyIntents,
  parseOrderSet,
} from "../src/agents/llm/responseParser.ts";
import { OrderType } from "../src/orders/orders.ts";

describe("parseArmyBlueprint", () => {
  it("parsea un array JSON válido dentro de un bloque de código con prosa alrededor", () => {
    const raw =
      'Aquí tienes mi ejército:\n```json\n[{"type":"ARCHER","rank":1},{"type":"HEAVY","rank":2}]\n```\n¡Buena suerte!';
    expect(parseArmyBlueprint(raw)).toEqual([
      { type: "ARCHER", rank: 1 },
      { type: "HEAVY", rank: 2 },
    ]);
  });

  it("descarta entradas inválidas (tipo desconocido, rango fuera de 1-5) pero conserva las válidas", () => {
    const raw =
      '```json\n[{"type":"ARCHER","rank":1},{"type":"NOPE","rank":1},{"type":"LIGHT","rank":9}]\n```';
    expect(parseArmyBlueprint(raw)).toEqual([{ type: "ARCHER", rank: 1 }]);
  });

  it("devuelve un array vacío si el JSON global no es parseable", () => {
    expect(parseArmyBlueprint("esto no es json")).toEqual([]);
  });
});

describe("parseOrderSet", () => {
  it("parsea global/byType/byUnit", () => {
    const raw =
      '```json\n{"global":{"kind":"ATTACK"},"byType":{"ARCHER":{"kind":"HOLD"}},"byUnit":{"u1":{"kind":"MOVE","to":{"x":1,"y":2}}}}\n```';
    const os = parseOrderSet(raw);
    expect(os.global).toEqual({ kind: OrderType.Attack });
    expect(os.byType?.ARCHER).toEqual({ kind: OrderType.Hold });
    expect(os.byUnit?.u1).toEqual({ kind: OrderType.Move, to: { x: 1, y: 2 } });
  });

  it("descarta una orden Move inválida (sin 'to')", () => {
    const raw = '```json\n{"global":{"kind":"MOVE"}}\n```';
    expect(parseOrderSet(raw).global).toBeUndefined();
  });

  it("descarta un kind desconocido", () => {
    const raw = '```json\n{"global":{"kind":"TELEPORT"}}\n```';
    expect(parseOrderSet(raw).global).toBeUndefined();
  });

  it("cae a Hold si el JSON global no es parseable", () => {
    expect(parseOrderSet("basura")).toEqual({ global: { kind: OrderType.Hold } });
  });
});

describe("parseDiplomacyIntents", () => {
  it("parsea intenciones propose/break", () => {
    const raw = '```json\n[{"kind":"propose","withArmyId":1},{"kind":"break","withArmyId":2}]\n```';
    expect(parseDiplomacyIntents(raw)).toEqual([
      { kind: "propose", withArmyId: 1 },
      { kind: "break", withArmyId: 2 },
    ]);
  });

  it("devuelve un array vacío si el JSON global no es parseable", () => {
    expect(parseDiplomacyIntents("no")).toEqual([]);
  });
});
