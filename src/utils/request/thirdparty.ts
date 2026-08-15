import toast from "react-hot-toast";
import {
  ConfigService,
  KookitConfig,
  SyncUtil,
  ThirdpartyRequest,
  TokenService,
} from "../../assets/lib/kookit-extra-browser.min";
import i18n from "../../i18n";
import { handleExitApp } from "./common";
import { getServerRegion } from "../common";
let thirdpartyRequest: ThirdpartyRequest | undefined;
export const getThirdpartyRequest = async () => {
  if (thirdpartyRequest) {
    return thirdpartyRequest;
  }
  thirdpartyRequest = new ThirdpartyRequest(
    TokenService,
    ConfigService,
    getServerRegion()
  );
  return thirdpartyRequest;
};
export const resetThirdpartyRequest = () => {
  thirdpartyRequest = undefined;
};
export const onSyncCallback = async (service: string, authCode: string) => {
  toast.loading(i18n.t("Adding"), { id: "adding-sync-id" });

  let response = await authThirdToken(
    service,
    authCode,
    getServerRegion() === "china" &&
      (service === "microsoft" ||
        service === "microsoft_exp" ||
        service === "dubox" ||
        service === "yiyiwu" ||
        service === "adrive")
      ? KookitConfig.ThirdpartyConfig.cnCallbackUrl
      : KookitConfig.ThirdpartyConfig.callbackUrl
  );
  let result = response.data;
  if (!result || !result.refresh_token) {
    toast.error(i18n.t("Authorization failed"), { id: "adding-sync-id" });
    return;
  }
  let region = "0";
  if (service === "pcloud" && authCode.indexOf("$") > -1) {
    // pCloud uses authCode with region info
    let parts = authCode.split("$");
    region = parts[1];
  }
  // FOR PCLOUD, THE REFRESH TOKEN IS THE ACCESS TOKEN, ACCESS TOKEN NEVER EXPIRES
  let res = await encryptToken(
    service,
    service === "yiyiwu" || service === "dubox"
      ? {
          refresh_token: result.refresh_token,
          access_token: result.access_token || "",
          expires_at:
            new Date().getTime() +
            (service === "yiyiwu" ? 30 * 60 * 1000 : 2592000 * 1000),
          region,
          auth_date: new Date().getTime(),
          service: service,
          version: 1,
        }
      : {
          refresh_token: result.refresh_token,
          region,
          auth_date: new Date().getTime(),
          service: service,
          version: 1,
        }
  );
  if (res.code === 200) {
    ConfigService.setListConfig(service, "dataSourceList");
    toast.success(i18n.t("Binding successful"), { id: "adding-sync-id" });
  }
  if (service === "yiyiwu") {
    toast(
      "115 网盘只推荐 115 会员使用，非会员基本上无法使用，并且由于 115 网盘严格的API限制，请务必启用 Koodo Sync，并且 1 小时内不要导入超过5本书以防止被 115 风控。如果出现了风控，请等待至少半小时再使用。",
      { duration: 10000 }
    );
  }
  return res;
};
export const encryptToken = async (service: string, config: any) => {
  let syncToken = typeof config === "string" ? config : JSON.stringify(config);
  await TokenService.setToken(service + "_token", syncToken);
  return { code: 200, data: { encrypted_token: syncToken } };
};
export const decryptToken = async (service: string) => {
  let encryptedToken = await TokenService.getToken(service + "_token");
  if (!encryptedToken || encryptedToken === "{}") {
    return { code: 400, data: { token: "{}" } };
  }
  return { code: 200, data: { token: encryptedToken } };
};
export const getCloudSyncToken = async (): Promise<{ code: number; data: any }> => {
  return { code: 200, data: {} };
};
export const authThirdToken = async (
  provider: string,
  code: string,
  redirectUri: string
) => {
  if (provider === "microsoft_exp") {
    provider = "microsoft";
  }
  let thirdpartyRequest = await getThirdpartyRequest();
  let response = await thirdpartyRequest.authThirdToken({
    provider: provider,
    redirect_uri: redirectUri,
    code,
  });
  return response;
};
export const refreshThirdToken = async (
  provider: string,
  refresh_token: string
) => {
  if (provider === "microsoft_exp") {
    provider = "microsoft";
  }
  let thirdpartyRequest = await getThirdpartyRequest();
  let response = await thirdpartyRequest.refreshThirdToken({
    provider,
    refresh_token,
  });
  return response;
};
