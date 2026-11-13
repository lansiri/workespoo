import { expect, test } from "@playwright/test";

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("landing page shows the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WorkEspoo" })).toBeVisible();
});
