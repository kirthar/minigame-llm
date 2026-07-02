import "./style.css";
import { Simulation } from "./sim/Simulation.ts";

const canvas = document.getElementById("battlefield") as HTMLCanvasElement | null;
const controls = document.getElementById("controls");
const log = document.getElementById("event-log");
const status = document.getElementById("status");

if (!canvas || !controls || !log || !status) {
  throw new Error("Faltan elementos del DOM requeridos por la simulación");
}

new Simulation(canvas, controls, log, status);
