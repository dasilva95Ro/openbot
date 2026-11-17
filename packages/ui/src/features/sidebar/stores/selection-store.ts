/**
 * The chats picked for a bulk delete. Selection starts from "Select" in a row's menu, from a Ctrl or
 * Cmd click, or from a Shift click, which adds every row between the last picked row and this one.
 * While any chat is picked, a plain click picks or drops a row instead of opening it. Escape, Cancel
 * and a delete end it.
 *
 * Only a chat that the user can delete alone can be picked: an agent when the host allows deletes,
 * and a channel that is not already in Deleted channels when the host deletes channels.
 */

import { createMemo, createSignal } from "solid-js";
import { currentText } from "../../../text";
import type { SidebarProps } from "../sidebar-types";

/** The rows of the list carry this attribute, in the order that they show. */
export const SIDEBAR_SELECT_ATTRIBUTE = "data-select-id";

export function createSidebarSelectionStore(deps: { props: SidebarProps; listElement: () => HTMLElement | undefined }) {
  const { props } = deps;
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  /** The row that a Shift click counts from. */
  let anchor: string | undefined;

  const kindOf = (id: string): "agent" | "channel" | undefined => {
    if (props.agents.some((agent) => agent.id === id)) return "agent";
    if (props.channels?.some((channel) => channel.id === id && !channel.archived)) return "channel";
    return undefined;
  };
  const canSelect = (id: string): boolean => {
    // The compact sidebar shows only faces, with no room for the selection bar.
    if (props.compact) return false;
    const kind = kindOf(id);
    if (kind === "agent") return props.deleteSupported !== false;
    if (kind === "channel") return props.onDeleteChannel !== undefined;
    return false;
  };
  // A chat that left the lists, deleted on another computer for example, drops out of the counts.
  const selectedAgentIds = createMemo(() => [...selected()].filter((id) => kindOf(id) === "agent"));
  const selectedChannelIds = createMemo(() => [...selected()].filter((id) => kindOf(id) === "channel"));
  const count = () => selectedAgentIds().length + selectedChannelIds().length;
  const selecting = () => count() > 0;
  const isSelected = (id: string) => selected().has(id);

  /** The selectable rows in the order that the list shows them. A chat can show in two groups. */
  function rowOrder(): string[] {
    const list = deps.listElement();
    if (!list) return [];
    const ids = [...list.querySelectorAll<HTMLElement>(`[${SIDEBAR_SELECT_ATTRIBUTE}]`)].map(
      (row) => row.getAttribute(SIDEBAR_SELECT_ATTRIBUTE) ?? "",
    );
    return [...new Set(ids)].filter((id) => id !== "" && canSelect(id));
  }

  function toggle(id: string): void {
    if (!canSelect(id)) return;
    anchor = id;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectRange(id: string): void {
    const order = rowOrder();
    const from = anchor === undefined ? -1 : order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from === -1 || to === -1) {
      toggle(id);
      return;
    }
    const [low, high] = from < to ? [from, to] : [to, from];
    setSelected((current) => new Set([...current, ...order.slice(low, high + 1)]));
  }

  /** True when the click picked or dropped the row, so that the row does not open its chat. */
  function handleRowClick(event: MouseEvent, id: string): boolean {
    if (!canSelect(id)) return selecting();
    if (event.shiftKey) {
      if (selecting()) selectRange(id);
      else toggle(id);
      return true;
    }
    if (event.ctrlKey || event.metaKey || selecting()) {
      toggle(id);
      return true;
    }
    return false;
  }

  function clear(): void {
    anchor = undefined;
    setSelected(new Set<string>());
    setConfirming(false);
    setError(null);
  }

  function openConfirm(): void {
    if (!selecting()) return;
    setError(null);
    setConfirming(true);
  }

  function closeConfirm(): void {
    if (deleting()) return;
    setConfirming(false);
    setError(null);
  }

  /**
   * Deletes the picked agents as one group, with one Undo, and then each picked channel. A chat that
   * fails stays picked, and the confirmation stays open and says why.
   */
  async function confirmDelete(): Promise<void> {
    if (deleting()) return;
    const agentIds = selectedAgentIds();
    const channelIds = selectedChannelIds();
    setDeleting(true);
    setError(null);
    const failed: string[] = [];
    let failure: unknown;
    if (agentIds.length > 0) {
      try {
        if (props.onDeleteAgents) await props.onDeleteAgents(agentIds);
        else for (const id of agentIds) await props.onDeleteAgent(id);
      } catch (cause) {
        failure = cause;
        failed.push(...agentIds);
      }
    }
    for (const id of channelIds) {
      try {
        await props.onDeleteChannel?.(id);
      } catch (cause) {
        failure ??= cause;
        failed.push(id);
      }
    }
    setDeleting(false);
    if (failed.length === 0) {
      clear();
      return;
    }
    setSelected(new Set(failed));
    const text = currentText();
    setError(text.errorMessage(failure, text.t("sidebar.delete.failed")));
  }

  return {
    canSelectChat: canSelect,
    chatIsSelected: isSelected,
    clearSelection: clear,
    closeBulkDelete: closeConfirm,
    confirmBulkDelete: confirmDelete,
    bulkDeleteConfirming: confirming,
    bulkDeleteError: error,
    bulkDeleting: deleting,
    handleRowSelectClick: handleRowClick,
    openBulkDelete: openConfirm,
    selectedAgentCount: () => selectedAgentIds().length,
    selectedChannelCount: () => selectedChannelIds().length,
    selectedCount: count,
    selectingChats: selecting,
    toggleChatSelected: toggle,
  };
}
