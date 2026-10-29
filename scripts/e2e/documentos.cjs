/**
 * Prueba de punta a punta de la Fase 2 (subir → revisar → aceptar → aprender → borrar).
 * Es idempotente: al empezar borra, desde la app, los documentos y movimientos de la cuenta de prueba.
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... BASE_URL=http://localhost:3000 node scripts/e2e/documentos.cjs
 *
 * En local, levanta la app con AI_EXTRACTOR=fake para no gastar en la API de Claude
 * (el lector simulado devuelve 3 movimientos fijos). Ver docs/PRUEBAS.md.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const path = require("path");
const FX = path.join(__dirname, "../../src/lib/documents/__fixtures__/");
const S = process.env.SCREENSHOTS_DIR || require("os").tmpdir();
const { E2E_EMAIL, E2E_PASSWORD } = process.env;
if (!E2E_EMAIL || !E2E_PASSWORD) { console.error("Faltan E2E_EMAIL y E2E_PASSWORD"); process.exit(1); }
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const log = (...a) => console.log("→", ...a);

  await p.goto(base + "/login");
  await p.fill("#email", E2E_EMAIL);
  await p.fill("#password", E2E_PASSWORD);
  await p.locator("form button[type=submit]").first().click();
  await p.waitForURL(base + "/");

  p.on("dialog", (d) => d.accept());
  const deleteAllDocs = async () => {
    await p.goto(base + "/revisar");
    while (await p.getByRole("button", { name: "Descartar este documento" }).count()) {
      const n = await p.getByRole("button", { name: "Descartar este documento" }).count();
      await p.getByRole("button", { name: "Descartar este documento" }).first().click();
      await p.waitForFunction((n) => [...document.querySelectorAll("button")].filter((b) => b.textContent === "Descartar este documento").length < n, n);
    }
    while (await p.locator("button:has(svg[aria-label='Borrar documento'])").count()) {
      const n = await p.locator("a[href*='/archivo']").count();
      await p.locator("button:has(svg[aria-label='Borrar documento'])").first().click();
      await p.waitForFunction((n) => document.querySelectorAll("a[href*='/archivo']").length < n, n);
    }
  };
  await deleteAllDocs();
  // Borra los movimientos de corridas anteriores (desde la app)
  for (;;) {
    await p.goto(base + "/movimientos");
    const link = p.locator("a[href^='/movimientos/']").first();
    if (!(await link.count())) break;
    await link.click();
    await p.getByRole("button", { name: /Borrar movimiento/ }).click();
    await p.waitForURL(base + "/movimientos");
  }
  await p.goto(base + "/cuentas");
  if (!(await p.getByText("Visa", { exact: true }).count())) {
    await p.selectOption("#type", "credito");
    await p.fill("#name", "Visa");
    await p.getByRole("button", { name: "Crear cuenta" }).click();
    await p.getByText('Cuenta "Visa" creada').waitFor();
  }

  // Gasto manual que luego aparecerá en la "cartola" → debe detectarse como duplicado
  await p.goto(base + "/agregar");
  log("acceso a subir en Agregar:", await p.getByText("Subir boleta, cartola o Excel").isVisible());
  await p.fill("#quick", "lider express 25990");
  await p.selectOption("#account_id", { label: "Visa" });
  await p.getByRole("button", { name: "Guardar gasto" }).click();
  await p.getByText("Gasto guardado").waitFor();

  await p.goto(base + "/subir");
  await p.getByTestId("file-input").setInputFiles([
    { name: "cartola.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(FX + "cartola.xlsx") },
    { name: "selfie.png", mimeType: "image/png", buffer: fs.readFileSync(path.join(__dirname, "../../public/icons/icon-192.png")) },
    { name: "fotos.zip", mimeType: "application/zip", buffer: Buffer.from("PK....") },
  ]);
  await p.waitForFunction(() => document.querySelectorAll("li[data-status]").length === 3 &&
    [...document.querySelectorAll("li[data-status]")].every((li) => ["listo","error","no_financiero"].includes(li.dataset.status)), null, { timeout: 90000 });
  for (const li of await p.locator("li[data-status]").all()) log("subida:", (await li.innerText()).replace(/\s+/g, " "));
  await p.screenshot({ path: S + "/f2-subir.png", fullPage: true });

  await p.getByRole("link", { name: /Revisar y agregar/ }).click();
  await p.waitForURL(base + "/revisar");
  log("cuenta sugerida:", await p.locator("select[name=account_id]").evaluate((s) => s.options[s.selectedIndex].text));
  log("duplicado avisado:", await p.getByText(/Posible duplicado/).isVisible());
  log("marcados:", await p.locator("input[name=include]:checked").count(), "de", await p.locator("input[name=include]").count());
  // Corrige la categoría de Netflix a Gustos (para que la app aprenda)
  const netflix = p.locator("li", { has: p.locator("input[value=Netflix]") });
  await netflix.locator("select[aria-label=Categoría]").selectOption({ label: "🎁 Gustos" });
  await p.screenshot({ path: S + "/f2-revisar.png", fullPage: true });
  await p.getByRole("button", { name: /Agregar 2 movimientos/ }).click();
  await p.waitForURL(/agregados=2/); await p.getByText(/2 movimientos agregados/).waitFor();
  log("aceptados ✓");

  await p.goto(base + "/movimientos");
  log("movimientos:", (await p.locator("main").innerText()).replace(/\s+/g, " ").match(/Entradas.*/)[0].slice(0, 260));

  // Segunda subida: Netflix debe venir ya como Gustos (regla aprendida > sugerencia IA)
  await p.goto(base + "/subir");
  await p.getByTestId("file-input").setInputFiles([{ name: "cartola-latin1.csv", mimeType: "text/csv", buffer: fs.readFileSync(FX + "cartola-latin1.csv") }]);
  await p.locator("li[data-status=listo]").waitFor({ timeout: 90000 });
  await p.goto(base + "/revisar");
  const netflix2 = p.locator("li", { has: p.locator("input[value=Netflix]") });
  log("Netflix 2ª vez categoría:", await netflix2.locator("select[aria-label=Categoría]").evaluate((s) => s.options[s.selectedIndex].text));
  log("Lider ahora duplicado de lo aceptado:", await p.getByText(/Posible duplicado/).count());
  await p.getByRole("button", { name: "Descartar este documento" }).click();
  await p.getByText("Nada por revisar").waitFor();
  log("descartado ✓");

  const fileLink = await p.locator("a[href*='/archivo']").first().getAttribute("href");
  const r = await p.request.get(base + fileLink, { maxRedirects: 0 });
  log("archivo original:", r.status(), (r.headers()["location"] || "").includes("/storage/v1/object/sign/documentos/") ? "enlace firmado ✓" : r.headers()["location"]);
  log("historial:", (await p.locator("section").last().innerText()).replace(/\s+/g, " ").slice(0, 300));

  await deleteAllDocs();
  log("documentos y archivos borrados ✓", await p.locator("a[href*='/archivo']").count());

  await p.goto(base + "/");
  log("inicio sin pendientes:", !(await p.getByText(/por revisar/).isVisible()));
  console.log("errores de página:", errors);
  await b.close();
})().catch(async (e) => { console.error("FALLO:", e.message); process.exit(1); });
