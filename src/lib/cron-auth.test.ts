import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { OAuth2Client, LoginTicket } from "google-auth-library";
import { assertCloudSchedulerToken } from "./cron-auth";

describe("assertCloudSchedulerToken", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_OIDC_AUDIENCE", "https://app.example.com/api/cron/charges-mark-overdue");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejeita requisição sem header Authorization", async () => {
    const req = new Request("https://app.example.com/api/cron/charges-mark-overdue", { method: "POST" });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
  });

  it("rejeita token malformado sem bater na rede do Google", async () => {
    const verifyIdToken = vi
      .spyOn(OAuth2Client.prototype, "verifyIdToken")
      .mockRejectedValue(new Error("invalid token signature"));
    const req = new Request("https://app.example.com/api/cron/charges-mark-overdue", {
      method: "POST",
      headers: { authorization: "Bearer token-inválido" },
    });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
  });

  it.each([["https://accounts.google.com"], ["accounts.google.com"]])(
    "aceita token OIDC válido com iss no formato %s",
    async (iss) => {
      const ticket = {
        getPayload: () => ({
          iss,
          sub: "cloud-scheduler-sa",
          aud: "https://app.example.com/api/cron/charges-mark-overdue",
          iat: 0,
          exp: 9999999999,
        }),
      } as LoginTicket;
      vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockImplementation(
        (async () => ticket) as unknown as OAuth2Client["verifyIdToken"],
      );
      const req = new Request("https://app.example.com/api/cron/charges-mark-overdue", {
        method: "POST",
        headers: { authorization: "Bearer token-válido" },
      });
      await expect(assertCloudSchedulerToken(req)).resolves.toBeUndefined();
    },
  );

  it("rejeita token OIDC válido com iss fora do allowlist (regressão do bug original)", async () => {
    const ticket = {
      getPayload: () => ({
        iss: "https://evil.example.com",
        sub: "attacker",
        aud: "https://app.example.com/api/cron/charges-mark-overdue",
        iat: 0,
        exp: 9999999999,
      }),
    } as LoginTicket;
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockImplementation(
      (async () => ticket) as unknown as OAuth2Client["verifyIdToken"],
    );
    const req = new Request("https://app.example.com/api/cron/charges-mark-overdue", {
      method: "POST",
      headers: { authorization: "Bearer token-com-iss-inválido" },
    });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
  });

  it("em desenvolvimento, aceita o bearer token fixo CRON_SECRET (mesmo mecanismo do assertCronRequest)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRON_SECRET", "dev-cron-secret");
    const req = new Request("https://app.example.com/api/cron/charges-mark-overdue", {
      method: "POST",
      headers: { authorization: "Bearer dev-cron-secret" },
    });
    await expect(assertCloudSchedulerToken(req)).resolves.toBeUndefined();
  });
});
