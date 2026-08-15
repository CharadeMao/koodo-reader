import {
  browserName,
  browserVersion,
  isElectron,
  osName,
  osVersion,
} from "react-device-detect";
import {
  ConfigService,
  KookitConfig,
  TokenService,
  UserRequest,
} from "../../assets/lib/kookit-extra-browser.min";
import packageJson from "../../../package.json";
import toast from "react-hot-toast";
import i18n from "../../i18n";
import { handleExitApp } from "./common";
import { getServerRegion, vexComfirmAsync } from "../common";
declare var window: any;
let userRequest: UserRequest | undefined;

const checkCloudUrlViaElectron = async (
  url: string
): Promise<string | null> => {
  try {
    const { ipcRenderer } = window.require("electron");
    const result = await ipcRenderer.invoke("check-cloud-url", { url });
    if (result.ok) return null;
    const reasonMap: Record<string, string> = {
      dns_failed: i18n.t(
        "DNS resolution failed, please check your network or DNS settings"
      ),
      connection_refused: i18n.t(
        "Connection refused, the server may be down or blocked by a firewall"
      ),
      connection_reset: i18n.t(
        "Connection was reset, possibly due to a firewall or proxy"
      ),
      timeout: i18n.t(
        "Connection timed out, please check your network connection"
      ),
      ssl_error: i18n.t(
        "SSL certificate error, please check your system time and certificates"
      ),
      invalid_url: i18n.t("Invalid server URL"),
    };
    const readable = reasonMap[result.reason] || result.reason;
    return `${readable} (${result.code || result.reason}: ${result.detail})`;
  } catch (e) {
    return null;
  }
};

export const getDeviceName = async (): Promise<string> => {
  if (isElectron) {
    try {
      const { ipcRenderer } = window.require("electron");
      const name = await ipcRenderer.invoke("get-device-name");
      return name?.trim() || "Desktop";
    } catch (e) {
      return "Desktop";
    }
  }
  return detectBrowser();
};

export const getCloudflareAuthUrl = (): string => {
  const DEFAULT_CF_AUTH_URL =
    "https://bookrayder-auth-worker.charade-mao.workers.dev";
  return (
    ConfigService.getItem("cloudflareAuthUrl") ||
    localStorage.getItem("cloudflareAuthUrl") ||
    DEFAULT_CF_AUTH_URL
  ).replace(/\/+$/, "");
};

export const fetchSharedStorageConfig = async (): Promise<any | null> => {
  try {
    const cfUrl = getCloudflareAuthUrl();
    const token = await TokenService.getToken("access_token");
    if (!token) return null;

    const res = await fetch(`${cfUrl}/api/shared/storage`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.configured && data.config) {
      const { defaultSyncOption, dataSourceList, driveConfigs } = data.config;
      if (defaultSyncOption) {
        ConfigService.setItem("defaultSyncOption", defaultSyncOption);
      }
      if (Array.isArray(dataSourceList)) {
        for (let ds of dataSourceList) {
          ConfigService.setListConfig(ds, "dataSourceList");
        }
      }
      if (driveConfigs && typeof driveConfigs === "object") {
        for (let key of Object.keys(driveConfigs)) {
          ConfigService.setItem(key, driveConfigs[key]);
        }
      }
      return data.config;
    }
    return null;
  } catch (e) {
    console.error("fetchSharedStorageConfig error:", e);
    return null;
  }
};

export const saveSharedStorageConfig = async (config: {
  defaultSyncOption: string;
  dataSourceList: string[];
  driveConfigs: Record<string, any>;
}): Promise<{ success: boolean; message?: string }> => {
  try {
    const cfUrl = getCloudflareAuthUrl();
    const token = await TokenService.getToken("access_token");
    if (!token) {
      return { success: false, message: "Please login first" };
    }

    const res = await fetch(`${cfUrl}/api/shared/storage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ config }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      toast.success(i18n.t("Family shared storage updated successfully!"));
      return { success: true };
    } else {
      const errMsg = data.error || "Failed to save shared storage";
      toast.error(errMsg);
      return { success: false, message: errMsg };
    }
  } catch (e: any) {
    toast.error(e.message || "Network error");
    return { success: false, message: e.message };
  }
};

export const loginRegister = async (service: string, code: string) => {
  const cfAuthUrl = getCloudflareAuthUrl();

  // If password service with Cloudflare Worker auth endpoint configured or requested
  if (service === "password" && cfAuthUrl) {
    try {
      const sepIdx = code.indexOf("#");
      const email = (sepIdx !== -1 ? code.substring(0, sepIdx) : code).trim();
      const password = sepIdx !== -1 ? code.substring(sepIdx + 1) : "";

      const res = await fetch(`${cfAuthUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        await TokenService.setToken("is_authed", "yes");
        await TokenService.setToken("access_token", data.token);
        await TokenService.setToken("refresh_token", data.token);
        if (data.user) {
          localStorage.setItem("user_info", JSON.stringify(data.user));
        }
        // Auto fetch and apply shared storage configuration on login
        setTimeout(() => {
          fetchSharedStorageConfig();
        }, 300);
        return { code: 200, data: { access_token: data.token, refresh_token: data.token } };
      } else {
        return { code: 401, msg: data.error || "Invalid email or password" };
      }
    } catch (e: any) {
      return { code: 500, msg: e.message || "Failed to connect to Cloudflare Auth Worker" };
    }
  }

  let deviceName = await getDeviceName();
  let userRequest = await getUserRequest();
  let response = await userRequest.loginRegister({
    code,
    provider: service,
    scope: KookitConfig.LoginAuthRequest[service] ? KookitConfig.LoginAuthRequest[service].extraParams.scope : "",
    redirect_uri:
      getServerRegion() === "china" && service === "microsoft"
        ? KookitConfig.ThirdpartyConfig.cnCallbackUrl
        : KookitConfig.ThirdpartyConfig.callbackUrl,
    device_name: deviceName,
    device_type: isElectron ? "Desktop" : "Browser",
    device_os: getOSName(),
    locale: navigator.language,
    os_version: getOsVersionNumber(),
    device_uuid: await TokenService.getFingerprint(),
    app_version: packageJson.version,
  });
  if (response.code === 200) {
    await TokenService.setToken("is_authed", "yes");
    await TokenService.setToken("access_token", response.data.access_token);
    await TokenService.setToken("refresh_token", response.data.refresh_token);
    ConfigService.setItem("serverRegion", getServerRegion());
  }
  if (response.code === 503) {
    if (isElectron) {
      const cloudUrl =
        getServerRegion() === "china"
          ? KookitConfig.CloudConfig.cloudCNUrl
          : KookitConfig.CloudConfig.cloudUrl;
      const diagnosis = await checkCloudUrlViaElectron(cloudUrl);
      if (diagnosis) {
        console.error("Cloud service check failed:", diagnosis);
        toast.error(i18n.t("Service unavailable") + ": " + diagnosis);
      }
    }
  }
  if (response.code === 20010) {
    vexComfirmAsync(
      i18n.t(
        "You have reached the device limit for your account. Please install the latest mobile version of Koodo Reader to remove unused device by visiting Settings - Account - Device Management. "
      )
    );
  }
  return response;
};
export const getTempToken = async () => {
  const token =
    (await TokenService.getToken("access_token")) || "self-hosted-token";
  return {
    code: 200,
    data: {
      access_token: token,
      refresh_token: token,
    },
  };
};
export const fetchUserInfo = async () => {
  const cfAuthUrl = getCloudflareAuthUrl();
  if (cfAuthUrl) {
    try {
      const userInfoStr = localStorage.getItem("user_info");
      const user = userInfoStr ? JSON.parse(userInfoStr) : null;
      return {
        code: 200,
        data: {
          email: user?.email || "",
          display_name: user?.displayName || user?.display_name || "Reader",
          role: user?.role || "user",
          is_enable_koodo_sync: "no",
          valid_until: 4102444800, // Year 2100 (Lifetime Pro)
          token_valid_until: 4102444800,
        },
      };
    } catch (e) {
      return { code: 200, data: { email: "", role: "user", valid_until: 4102444800 } };
    }
  }
  let userRequest = await getUserRequest();
  let response = await userRequest.getUserInfo();
  if (response.code === 401 || response.code === 10002) {
    handleExitApp();
  }
  return response;
};
export const updateUserConfig = async (config: any) => {
  const cfAuthUrl = getCloudflareAuthUrl();
  if (cfAuthUrl) {
    return { code: 200 };
  }
  let userRequest = await getUserRequest();
  let response = await userRequest.updateUserConfig(config);
  if (response.code === 200) {
  } else if (response.code === 401) {
    handleExitApp();
  } else {
    toast.error(i18n.t("Setup failed, error code") + ": " + response.msg);
  }
};
export const getUserRequest = async () => {
  if (userRequest) {
    return userRequest;
  }
  userRequest = new UserRequest(TokenService, ConfigService, getServerRegion());
  return userRequest;
};
export const resetUserRequest = () => {
  userRequest = undefined;
};
export const getOSName = () => {
  return isElectron ? osName : browserName;
};
export const detectBrowser = () => {
  var userAgent = navigator.userAgent;
  if (userAgent.indexOf("Edg") > -1) {
    return "Microsoft Edge";
  } else if (userAgent.indexOf("Chrome") > -1) {
    return "Chrome";
  } else if (userAgent.indexOf("Firefox") > -1) {
    return "Firefox";
  } else if (userAgent.indexOf("Safari") > -1) {
    return "Safari";
  } else if (userAgent.indexOf("Opera") > -1) {
    return "Opera";
  } else if (
    userAgent.indexOf("Trident") > -1 ||
    userAgent.indexOf("MSIE") > -1
  ) {
    return "Internet Explorer";
  }

  return "Unknown";
};
export const getOsVersionNumber = (): string => {
  return isElectron ? osVersion : browserVersion;
};
