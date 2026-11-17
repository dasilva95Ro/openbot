/**
 * The Icon color setting: a select-like trigger that opens the color picker in a popup, with the chat
 * colors as presets and "Default" as the first swatch. Default keeps the theme's icon colors.
 */

import type { AvatarColor } from "@openbot/contracts/ipc";
import { createMemo } from "solid-js";
import { ColorPicker, ColorPickerTrigger } from "../../color-picker";
import { useText } from "../../text";
import { CHAT_COLOR_PRESETS, useChatColorName } from "./ChatColorPicker";
import { ChatColorDot, type ColorPopupPicker, createChatColorPopup } from "./ChatColorSetting";

const IconColorPicker: ColorPopupPicker = (props) => {
  const { t } = useText();
  const presets = createMemo(() =>
    CHAT_COLOR_PRESETS.map((preset) => ({ value: preset.value, label: t(preset.label) })),
  );
  return (
    <ColorPicker
      label={props.label}
      presets={presets()}
      value={props.value}
      onChange={props.onChange}
      clearLabel={t("settings.iconColor.default")}
    />
  );
};

export function IconColorTrigger(props: { value: AvatarColor | null; onChange: (value: AvatarColor | null) => void }) {
  const { t } = useText();
  const colorName = useChatColorName();
  const name = (value: AvatarColor | null) => (value === null ? t("settings.iconColor.default") : colorName(value));
  const popup = createChatColorPopup(
    () => props.value,
    (value) => props.onChange(value),
    IconColorPicker,
  );
  return (
    <div class="settings-modal-select">
      <ColorPickerTrigger label={t("settings.iconColor.title")} expanded={popup.open()} onClick={popup.toggle}>
        <ChatColorDot ref={popup.dot} color={popup.shown()} open={popup.open()} />
        <span class="ui-select-value">{name(popup.shown())}</span>
      </ColorPickerTrigger>
      {popup.popup(t("settings.iconColor.title"))}
    </div>
  );
}
