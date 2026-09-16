#!/usr/bin/env node
import { assertSupportedNode } from "./runtime.mjs";
import { loadConfig } from "./config.mjs";

try {
  assertSupportedNode();
  loadConfig(process.argv[2] || "./config.json");
  process.exit(0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

