/**
 * Prueba rápida en producción: entra, sube un CSV, revisa el resultado y limpia lo que creó.
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... BASE_URL=https://mi-plata-nu.vercel.app node scripts/e2e/humo-produccion.cjs
 *
 * Sin ANTHROPIC_API_KEY en el servidor, el resultado esperado es "La lectura con IA aún no está activada".
 * Con la clave, gasta una lectura real de la API (centavos de dólar).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { E2E_EMAIL, E2E_PASSWORD } = process.env;
if (!E2E_EMAIL || !E2E_PASSWORD) { console.error("Faltan E2E_EMAIL y E2E_PASSWORD"); process.exit(1); }
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept());
  const base = (process.env.BASE_URL || "https://mi-plata-nu.vercel.app").replace(/\/$/, "");
  await p.goto(base + "/login");
  await p.fill("#email", E2E_EMAIL);
  await p.fill("#password", E2E_PASSWORD);
  await p.locator("form button[type=submit]").first().click();
  await p.waitForURL(base + "/");
  await p.goto(base + "/subir");
  await p.getByTestId("file-input").setInputFiles([{ name: "cartola.csv", mimeType: "text/csv",
    buffer: fs.readFileSync(path.join(__dirname, "../../src/lib/documents/__fixtures__/cartola-latin1.csv")) }]);
  await p.waitForFunction(() => { const li = document.querySelector("li[data-status]"); return li && ["listo","error","no_financiero"].includes(li.dataset.status); }, null, { timeout: 120000 });
  console.log("→ subida:", (await p.locator("li[data-status]").innerText()).replace(/\s+/g, " "));
  await p.goto(base + "/revisar");
  console.log("→ historial:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));
  while (await p.locator("button:has(svg[aria-label='Borrar documento'])").count()) {
    const n = await p.locator("a[href*='/archivo']").count();
    await p.locator("button:has(svg[aria-label='Borrar documento'])").first().click();
    await p.waitForFunction((n) => document.querySelectorAll("a[href*='/archivo']").length < n, n);
  }
  for (;;) {
    await p.goto(base + "/movimientos");
    const link = p.locator("a[href^='/movimientos/']").first();
    if (!(await link.count())) break;
    await link.click();
    await p.getByRole("button", { name: /Borrar movimiento/ }).click();
    await p.waitForURL(base + "/movimientos");
  }
  console.log("→ limpieza ✓; errores de página:", errors);
  await b.close();
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
