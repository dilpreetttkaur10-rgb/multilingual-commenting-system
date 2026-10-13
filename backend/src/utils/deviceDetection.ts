
import { UAParser } from "ua-parser-js";

export interface DeviceDetails {
  browser: string;
  browserVersion: string;
  operatingSystem: string;
  operatingSystemVersion: string;
  deviceType: "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";
  deviceModel: string | null;
}

export const detectDevice = (userAgent?: string): DeviceDetails => {
  const normalizedUserAgent = userAgent?.trim() || "";

  console.log("Received User-Agent:", normalizedUserAgent || "(missing)");

  if (!normalizedUserAgent) {
    return {
      browser: "Unknown",
      browserVersion: "Unknown",
      operatingSystem: "Unknown",
      operatingSystemVersion: "Unknown",
      deviceType: "UNKNOWN",
      deviceModel: null,
    };
  }

  const result = new UAParser(normalizedUserAgent).getResult();

  let deviceType: DeviceDetails["deviceType"] = "DESKTOP";

  if (result.device.type === "mobile") {
    deviceType = "MOBILE";
  } else if (result.device.type === "tablet") {
    deviceType = "TABLET";
  } else if (result.device.type) {
    deviceType = "UNKNOWN";
  }

  return {
    browser: result.browser.name || "Unknown",
    browserVersion: result.browser.version || "Unknown",
    operatingSystem: result.os.name || "Unknown",
    operatingSystemVersion: result.os.version || "Unknown",
    deviceType,
    deviceModel: result.device.model || null,
  };
};
