import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";
import { isElectron } from "react-device-detect";
import toast from "react-hot-toast";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { readingSettingList } from "../../../constants/settingList";
import ChineseConvert from "../../../utils/reader/chineseConvert";
declare var window: any;

class ReadingSetting extends React.Component<
  SettingInfoProps,
  SettingInfoState
> {
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {
      isTouch: ConfigService.getReaderConfig("isTouch") === "yes",
      isMergeWord: ConfigService.getReaderConfig("isMergeWord") === "yes",
      isPreventTrigger:
        ConfigService.getReaderConfig("isPreventTrigger") === "yes",
      isAutoFullscreen:
        ConfigService.getReaderConfig("isAutoFullscreen") === "yes",
      isPreventAdd: ConfigService.getReaderConfig("isPreventAdd") === "yes",
      isAutoMaximize: ConfigService.getReaderConfig("isAutoMaximize") === "yes",
      isLemmatizeWord:
        ConfigService.getReaderConfig("isLemmatizeWord") === "yes",
      isOpenBook: ConfigService.getReaderConfig("isOpenBook") === "yes",
      isDisablePopup: ConfigService.getReaderConfig("isDisablePopup") === "yes",
      isManualScroll: ConfigService.getReaderConfig("isManualScroll") === "yes",
      isDisableAutoScroll:
        ConfigService.getReaderConfig("isDisableAutoScroll") === "yes",
      isDisableTrashBin:
        ConfigService.getReaderConfig("isDisableTrashBin") === "yes",
      isDeleteShelfBook:
        ConfigService.getReaderConfig("isDeleteShelfBook") === "yes",
      isHideShelfBook:
        ConfigService.getReaderConfig("isHideShelfBook") === "yes",
      isPreventSleep: ConfigService.getReaderConfig("isPreventSleep") === "yes",
      isOpenInMain: ConfigService.getReaderConfig("isOpenInMain") === "yes",
      isPrecacheBook: ConfigService.getReaderConfig("isPrecacheBook") === "yes",
      isOverwriteText:
        ConfigService.getReaderConfig("isOverwriteText") === "yes",
      isOverwriteLink:
        ConfigService.getReaderConfig("isOverwriteLink") === "yes",
      isOverwriteBackground:
        ConfigService.getReaderConfig("isOverwriteBackground") === "yes",
      convertChinese: ConfigService.getReaderConfig("convertChinese") || "none",
    };
  }

  handleRest = (_bool: boolean) => {
    toast.success(this.props.t("Change successful"));
  };

  handleSetting = (stateName: string) => {
    if (stateName === "isLemmatizeWord" && !this.props.isAuthed) {
      toast.error(this.props.t("Please upgrade to Pro to use this feature"));
      this.props.handleSetting(true);
      this.props.handleSettingMode("account");
      return;
    }
    this.setState({ [stateName]: !this.state[stateName] } as any);
    ConfigService.setReaderConfig(
      stateName,
      this.state[stateName] ? "no" : "yes"
    );
    this.handleRest(this.state[stateName]);
  };

  handleResetReaderPosition = () => {
    window
      .require("electron")
      .ipcRenderer.invoke("reset-reader-position", "ping");
    toast.success(this.props.t("Reset successful"));
  };

  handleMergeWord = () => {
    if (this.state.isOpenInMain && !this.state.isMergeWord) {
      toast(this.props.t("Please turn off open books in the main window"));
      return;
    }
    if (this.state.isAutoFullscreen && !this.state.isMergeWord) {
      toast(this.props.t("Please turn off auto open book in full screen"));
      return;
    }
    this.handleSetting("isMergeWord");
    if (ConfigService.getReaderConfig("isMergeWord") === "yes") {
      ConfigService.setReaderConfig("isHideBackground", "yes");
    }
  };

  handleOpenInMain = () => {
    if (this.state.isMergeWord && !this.state.isOpenInMain) {
      toast(this.props.t("Please turn off merge with word first"));
      return;
    }
    this.handleSetting("isOpenInMain");
  };

  renderSwitchOption = (optionList: any[]) => {
    return optionList.map((item) => {
      return (
        <div
          style={item.isElectron ? (isElectron ? {} : { display: "none" }) : {}}
          key={item.propName}
        >
          <div className="setting-dialog-new-title" key={item.title}>
            <span style={{ width: "calc(100% - 100px)" }}>
              <Trans>{item.title}</Trans>
            </span>

            <span
              className="single-control-switch"
              onClick={() => {
                switch (item.propName) {
                  case "isMergeWord":
                    this.handleMergeWord();
                    break;
                  case "isOpenInMain":
                    this.handleOpenInMain();
                    break;
                  default:
                    this.handleSetting(item.propName);
                    break;
                }
              }}
              style={this.state[item.propName] ? {} : { opacity: 0.6 }}
            >
              <span
                className="single-control-button"
                style={
                  this.state[item.propName]
                    ? {
                        transform: "translateX(20px)",
                        transition: "transform 0.5s ease",
                      }
                    : {
                        transform: "translateX(0px)",
                        transition: "transform 0.5s ease",
                      }
                }
              ></span>
            </span>
          </div>
          <p className="setting-option-subtitle">
            <Trans>{item.desc}</Trans>
          </p>
        </div>
      );
    });
  };

  render() {
    return (
      <>
        {this.renderSwitchOption(readingSettingList)}
        <div className="setting-dialog-new-title">
          <Trans>Chinese text conversion</Trans>
          <select
            name=""
            className="lang-setting-dropdown"
            value={this.state.convertChinese || "none"}
            onChange={(event) => {
              const value = event.target.value;
              ConfigService.setReaderConfig("convertChinese", value);
              this.setState({ convertChinese: value });
              ChineseConvert.convertAllIframes(value);
              toast.success(this.props.t("Change successful"));
            }}
          >
            <option value="none" className="lang-setting-option">
              {this.props.t("Disabled")}
            </option>
            <option value="s2t" className="lang-setting-option">
              {this.props.t("Simplified to Traditional")}
            </option>
            <option value="t2s" className="lang-setting-option">
              {this.props.t("Traditional to Simplified")}
            </option>
          </select>
        </div>
        {isElectron && (
          <>
            <div className="setting-dialog-new-title">
              <Trans>Reset reader window's position</Trans>

              <span
                className="change-location-button"
                onClick={() => {
                  this.handleResetReaderPosition();
                }}
              >
                <Trans>Reset</Trans>
              </span>
            </div>
          </>
        )}
      </>
    );
  }
}

export default ReadingSetting;
