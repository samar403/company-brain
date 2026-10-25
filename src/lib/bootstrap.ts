import "server-only";
import { createUser, userCount } from "./auth";
import { loadDemoData } from "./demo";

export const DEMO = {
  enabled: process.env.DEMO_MODE === "true",
  email: "demo@companybrain.dev",
  password: "brain-demo-2026",
};

/** In demo mode, a fresh install gets a demo admin and the Northwind Labs data. */
export function bootstrap() {
  if (DEMO.enabled && userCount() === 0) {
    createUser(DEMO.email, "Demo Admin", DEMO.password, "admin");
    loadDemoData("Demo Admin");
  }
}
