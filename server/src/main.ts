import { buildApp } from "./app.js";
const { app } = await buildApp(process.env.DATABASE_PATH ?? "stackora.sqlite");
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
console.log("STACKORA server listening on port " + (process.env.PORT ?? 3001));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
