/**
 * The bar under the list while chats are picked for a bulk delete: how many are picked, Cancel and
 * Delete. Delete asks once for all of them. Escape drops the selection while no dialog is open.
 */

import { Button, ConfirmDialog, dialogOpen } from "@openbot/ui";
import { onSettled, Show } from "solid-js";
import { useText } from "../../text";
import { useSidebarScope } from "./sidebar-scope";

export function SidebarSelectionBar() {
  const {
    bulkDeleteConfirming,
    bulkDeleteError,
    bulkDeleting,
    clearSelection,
    closeBulkDelete,
    confirmBulkDelete,
    openBulkDelete,
    selectedAgentCount,
    selectedChannelCount,
    selectedCount,
    selectingChats,
  } = useSidebarScope();
  const { t } = useText();

  onSettled(() => {
    const dropOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !selectingChats() || dialogOpen()) return;
      clearSelection();
    };
    document.addEventListener("keydown", dropOnEscape);
    return () => document.removeEventListener("keydown", dropOnEscape);
  });

  const description = () =>
    [
      selectedAgentCount() > 0 ? t("sidebar.select.agentsDescription", { count: selectedAgentCount() }) : null,
      selectedChannelCount() > 0 ? t("sidebar.select.channelsDescription", { count: selectedChannelCount() }) : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" ");

  return (
    <>
      <Show when={selectingChats()}>
        <section class="sidebar-selection-bar" aria-label={t("sidebar.select.bar")}>
          <span class="sidebar-selection-count" aria-live="polite">
            {t("sidebar.select.count", { count: selectedCount() })}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={openBulkDelete}>
            {t("common.delete")}
          </Button>
        </section>
      </Show>
      <ConfirmDialog
        open={bulkDeleteConfirming()}
        onCancel={closeBulkDelete}
        onConfirm={confirmBulkDelete}
        pending={bulkDeleting()}
        error={bulkDeleteError()}
        title={t("sidebar.select.deleteTitle", { count: selectedCount() })}
        description={description()}
        confirmLabel={t("common.delete")}
        pendingLabel={t("sidebar.delete.pending")}
        initialFocus="cancel"
      />
    </>
  );
}
