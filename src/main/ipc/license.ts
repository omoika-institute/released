import crypto from "node:crypto";
import os from "node:os";
import Store from "electron-store";
import { safeStorage } from "electron";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";

const DEFAULT_LICENSE_API = "https://api.omoika.space";
const LICENSE_API_BASE = (
  process.env.OMOIKA_LICENSE_API_BASE_URL ?? DEFAULT_LICENSE_API
).replace(/\/$/, "");
const PINNED_PUBLIC_KEY = process.env.OMOIKA_LICENSE_PUBLIC_KEY?.trim() ?? "";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
let allowUnpinnedPublicKey = false;

export interface LicenseStatus {
  valid: boolean;
  activated: boolean;
  license_id: string | null;
  plan: string | null;
  email: string | null;
  device_id: string | null;
  updates_until: string | null;
  activated_at: string | null;
  last_validated: string | null;
  error?: string;
}

interface LicensePayload {
  license_id: string;
  user_id: string;
  email: string;
  device_id: string | null;
  plan: string;
  issued_at: string;
  update_expires_at: string;
  update_key: string;
  channels: string[];
  license_version: number;
}

interface SignedLicense {
  payload: LicensePayload;
  signature: string;
  key_id: string;
  public_key?: string;
}

interface LicenseState {
  device_id: string | null;
  encrypted_key: string | null;
  signed_license: SignedLicense | null;
  public_key: string | null;
  activated_at: string | null;
  last_validated: string | null;
}

const licenseStore = new Store<LicenseState>({
  name: "license",
  defaults: {
    device_id: null,
    encrypted_key: null,
    signed_license: null,
    public_key: PINNED_PUBLIC_KEY || null,
    activated_at: null,
    last_validated: null,
  },
});

export function registerLicenseIpc(deps: IpcContext) {
  allowUnpinnedPublicKey = !deps.app.isPackaged;

  bindHandle("license:get-status", async () => getStatus());

  bindHandle(
    "license:activate",
    async (_event, payload: { licenseKey: string; deviceLabel?: string }) => {
      const licenseKey = payload.licenseKey.trim();
      if (!licenseKey) {
        return getStatus("License key is required.");
      }

      const deviceId = getOrCreateDeviceId();
      const response = await fetchLicenseApi("/licenses/activate-key", {
        license_key: licenseKey,
        device_id: deviceId,
        device_label: payload.deviceLabel?.trim() || defaultDeviceLabel(),
      });

      if (!response.ok) {
        const message = await readResponseError(response);
        return getStatus(message);
      }

      const signedLicense = (await response.json()) as SignedLicense;
      const publicKey = resolvePublicKey(signedLicense);
      verifySignedLicense(signedLicense, publicKey, deviceId);

      licenseStore.set("signed_license", signedLicense);
      licenseStore.set("public_key", publicKey);
      licenseStore.set("encrypted_key", encryptLicenseKey(licenseKey));
      licenseStore.set("activated_at", new Date().toISOString());
      licenseStore.set("last_validated", new Date().toISOString());

      return getStatus();
    }
  );

  bindHandle(
    "license:import-signed",
    async (_event, payload: { signedLicense: SignedLicense }) => {
      const deviceId = getOrCreateDeviceId();
      const signedLicense = payload.signedLicense;
      const publicKey = resolvePublicKey(signedLicense);

      verifySignedLicense(signedLicense, publicKey, deviceId);

      licenseStore.set("signed_license", signedLicense);
      licenseStore.set("public_key", publicKey);
      licenseStore.set("encrypted_key", null);
      licenseStore.set("activated_at", new Date().toISOString());
      licenseStore.set("last_validated", new Date().toISOString());

      return getStatus();
    }
  );

  bindHandle("license:revalidate", async () => {
    const licenseKey = decryptLicenseKey();
    const deviceId = getOrCreateDeviceId();
    if (!licenseKey) return getStatus();

    try {
      const response = await fetchLicenseApi("/licenses/activate-key", {
        license_key: licenseKey,
        device_id: deviceId,
        device_label: defaultDeviceLabel(),
      });

      if (!response.ok) {
        return getStatus(await readResponseError(response));
      }

      const signedLicense = (await response.json()) as SignedLicense;
      const publicKey = resolvePublicKey(signedLicense);
      verifySignedLicense(signedLicense, publicKey, deviceId);
      licenseStore.set("signed_license", signedLicense);
      licenseStore.set("public_key", publicKey);
      licenseStore.set("last_validated", new Date().toISOString());

      return getStatus();
    } catch {
      return getStatus();
    }
  });

  bindHandle("license:clear", async () => {
    licenseStore.set("encrypted_key", null);
    licenseStore.set("signed_license", null);
    licenseStore.set("activated_at", null);
    licenseStore.set("last_validated", null);
    return getStatus();
  });
}

function getStatus(error?: string): LicenseStatus {
  const deviceId = getOrCreateDeviceId();
  const signedLicense = licenseStore.get("signed_license");
  const publicKey = licenseStore.get("public_key") || PINNED_PUBLIC_KEY;

  if (!signedLicense || !publicKey) {
    return {
      valid: false,
      activated: false,
      license_id: null,
      plan: null,
      email: null,
      device_id: deviceId,
      updates_until: null,
      activated_at: null,
      last_validated: licenseStore.get("last_validated"),
      error,
    };
  }

  try {
    verifySignedLicense(signedLicense, publicKey, deviceId);
    return {
      valid: true,
      activated: true,
      license_id: signedLicense.payload.license_id,
      plan: signedLicense.payload.plan,
      email: signedLicense.payload.email,
      device_id: deviceId,
      updates_until: signedLicense.payload.update_expires_at,
      activated_at: licenseStore.get("activated_at"),
      last_validated: licenseStore.get("last_validated"),
      error,
    };
  } catch (err) {
    return {
      valid: false,
      activated: true,
      license_id: signedLicense.payload.license_id,
      plan: signedLicense.payload.plan,
      email: signedLicense.payload.email,
      device_id: deviceId,
      updates_until: signedLicense.payload.update_expires_at,
      activated_at: licenseStore.get("activated_at"),
      last_validated: licenseStore.get("last_validated"),
      error: error ?? (err instanceof Error ? err.message : "Invalid license."),
    };
  }
}

function verifySignedLicense(
  signedLicense: SignedLicense,
  publicKeyB64: string,
  deviceId: string
) {
  if (signedLicense.payload.device_id !== deviceId) {
    throw new Error("License is bound to another device.");
  }

  const payloadBytes = Buffer.from(JSON.stringify(signedLicense.payload));
  const signature = Buffer.from(signedLicense.signature, "base64");
  const publicKey = crypto.createPublicKey({
    key: Buffer.concat([
      ED25519_SPKI_PREFIX,
      Buffer.from(publicKeyB64, "base64"),
    ]),
    format: "der",
    type: "spki",
  });

  const valid = crypto.verify(null, payloadBytes, publicKey, signature);
  if (!valid) {
    throw new Error("License signature verification failed.");
  }
}

function resolvePublicKey(signedLicense: SignedLicense) {
  if (PINNED_PUBLIC_KEY) return PINNED_PUBLIC_KEY;
  if (!allowUnpinnedPublicKey) {
    throw new Error("License public key is not pinned in this build.");
  }

  const publicKey = signedLicense.public_key ?? licenseStore.get("public_key");
  if (!publicKey) {
    throw new Error("License public key is not configured.");
  }
  return publicKey;
}

function getOrCreateDeviceId() {
  const existing = licenseStore.get("device_id");
  if (existing) return existing;

  const deviceId = crypto.randomUUID();
  licenseStore.set("device_id", deviceId);
  return deviceId;
}

function defaultDeviceLabel() {
  return `${os.hostname()} (${process.platform})`;
}

async function fetchLicenseApi(path: string, body: unknown) {
  try {
    return await fetch(`${LICENSE_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "request failed";
    throw new Error(
      `Unable to reach license server at ${LICENSE_API_BASE}. ${detail}`
    );
  }
}

function encryptLicenseKey(licenseKey: string) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(licenseKey).toString("base64");
}

function decryptLicenseKey() {
  const encrypted = licenseStore.get("encrypted_key");
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;

  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return null;
  }
}

async function readResponseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Activation failed with ${response.status}.`;
  } catch {
    return `Activation failed with ${response.status}.`;
  }
}
