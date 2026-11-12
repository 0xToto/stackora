const { chromium } = require(
  require.resolve("playwright", {
    paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()],
  }),
);
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.SMOKE_URL || "http://127.0.0.1:8081");
    await page.getByText("Créer un compte", { exact: true }).click();
    const stamp = Date.now();
    await page
      .getByLabel("Pseudo unique")
      .fill("Tester" + stamp.toString().slice(-7));
    await page.getByLabel("Adresse email").fill(`test${stamp}@example.test`);
    await page
      .getByLabel("Mot de passe · 10 caractères minimum")
      .fill("Test-only-password-01");
    await page
      .getByLabel("Adresse du serveur de test")
      .fill("http://127.0.0.1:3001");
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await page.getByText("Créer un tournoi", { exact: true }).waitFor();
    await page.screenshot({
      path: process.env.SMOKE_HOME || "/tmp/stackora-home.png",
    });
    await page.getByText("Créer un tournoi", { exact: true }).click();
    await page.getByLabel("Nom du tournoi").fill("Test mobile");
    await page.getByRole("button", { name: "Créer mon tournoi →" }).click();
    await page.getByLabel("Nombre de bots à ajouter").fill("8");
    await page.getByRole("button", { name: "Compléter avec des bots" }).click();
    await page.getByText("9 / 16 joueurs", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Lancer le tournoi →" }).click();
    await page.getByText("Table 1 · 5 · Vous", { exact: true }).waitFor();
    await page.getByText("Table 2 · 4", { exact: true }).waitFor();
    const action = page
      .getByRole("button", { name: /^(Parole|Suivre [\d\s])/ })
      .first();
    await action.waitFor({ timeout: 20000 });
    await action.click();
    await page
      .getByText("call", { exact: true })
      .first()
      .waitFor({ timeout: 10000 });
    await page.screenshot({
      path: process.env.SMOKE_TABLE || "/tmp/stackora-table.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS browser mobile viewport: register → create → 8 bots → 5+4 → call; no JavaScript errors or horizontal overflow",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
