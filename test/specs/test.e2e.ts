import { browser } from "@wdio/globals";

describe("OMOIKA Electron Testing", () => {
  it("should print application title", async () => {
    await expect(await browser.getTitle()).toBe("OMOIKA");
  });
});
