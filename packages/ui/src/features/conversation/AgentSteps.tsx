import type { ConversationMemoryChange } from "@openbot/contracts/ipc";
import { countConversationMemoryChanges } from "@openbot/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { Badge } from "../../badge";
import { Button, IconButton } from "../../button";
import { Dialog } from "../../complex";
import { Brain, ChevronRight, Maximize2, Puzzle, Sparkles, X } from "../../icons";
import { type TextValue, useText } from "../../text";
import { prefersReducedMotion } from "../../utils";
import { ActivityShine } from "./ActivityShine";
import { useDuration } from "./Subagents";
import { type TraceKeyboard, type TraceSpan, TraceWaterfallDialog } from "./TraceWaterfall";

/**
 * One step of an agent's turn: a thought, a progress line of the host, or a memory change that the
 * turn committed. `memory-summary` is the count that a host without the changes sends instead.
 * The text of `progress` and `memory-summary` is the host's English source text. The `error` of a
 * `progress` step is the output of a failed tool step, which the line can open.
 */
export type AgentStep =
  | { id: string; kind: "thinking"; text: string }
  | { id: string; kind: "progress"; text: string; error?: string | undefined }
  | { id: string; kind: "memory"; change: ConversationMemoryChange }
  | { id: string; kind: "memory-summary"; text: string };

/** How tall the list grows before it scrolls. Keep it equal to `max-height` of `.agent-steps-viewport`. */
const STEPS_MAX_HEIGHT = 320;

/** A reader this close to the end of a live list still follows its newest step. */
const FOLLOW_THRESHOLD_PX = 24;

function isScrolledToEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_THRESHOLD_PX;
}

const MEMORY_ACTION_LABEL = {
  saved: "chat.steps.saved",
  updated: "chat.steps.updated",
  forgotten: "chat.steps.forgotten",
  notChanged: "chat.steps.notChanged",
} as const;

/**
 * The steps of a turn, in order. The list scrolls when it is taller than its cap. While the turn
 * runs, `live` marks the newest step and the list follows it, until the reader scrolls up to read an
 * older step. Scrolling back to the end follows again.
 */
export function AgentStepList(props: {
  steps: readonly AgentStep[];
  live: boolean;
  id?: string;
  /** The step to scroll to and light up, such as the one that the user picked in the trace. */
  focus?: { id: string } | null | undefined;
}) {
  const { t } = useText();
  const [contentHeight, setContentHeight] = createSignal(0);
  let content: HTMLOListElement | undefined;
  let viewport: HTMLElement | undefined;
  let following = true;
  const followNewest = () => {
    if (props.live && following && viewport) viewport.scrollTop = viewport.scrollHeight;
  };
  onSettled(() => {
    const element = content;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setContentHeight(element.offsetHeight);
      followNewest();
    });
    observer.observe(element);
    return () => observer.disconnect();
  });
  createEffect(
    () => props.focus,
    (focus) => {
      if (!focus) return;
      const step = content?.querySelector(`[data-step-id="${CSS.escape(focus.id)}"]`);
      step?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
  );
  const capped = () => contentHeight() > STEPS_MAX_HEIGHT;
  return (
    <section
      ref={viewport}
      id={props.id}
      class="agent-steps-viewport"
      aria-label={t("chat.steps.list")}
      data-capped={capped() ? "" : undefined}
      data-scrolls={capped() ? "" : undefined}
      // A list that scrolls needs a keyboard stop of its own.
      tabindex={capped() ? 0 : undefined}
      onScroll={() => {
        if (viewport) following = isScrolledToEnd(viewport);
      }}
    >
      <ol ref={content} class="agent-steps-list">
        <For each={props.steps} keyed={(step) => step.id}>
          {(step, index) => (
            <li
              class="agent-step"
              data-kind={step().kind}
              data-step-id={step().id}
              data-focused={props.focus?.id === step().id ? "" : undefined}
            >
              <StepIcon kind={step().kind} />
              <StepBody step={step()} newest={props.live && index() === props.steps.length - 1} />
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}

function StepBody(props: { step: AgentStep; newest: boolean }) {
  const text = useText();
  // Each change to the list makes new step objects. The failed line stays mounted while its step has
  // an error, so an open error does not close when the next step arrives.
  const failure = () => (props.step.kind === "progress" && props.step.error ? props.step : undefined);
  return (
    <Show when={failure()} fallback={stepBody(props.step, props.newest, text)}>
      {(step) => <FailedStep text={text.sourceText(step().text)} error={step().error} newest={props.newest} />}
    </Show>
  );
}

function stepBody(step: AgentStep, newest: boolean, text: TextValue): JSX.Element {
  if (step.kind === "memory") {
    const change = step.change;
    return (
      <span class="agent-step-memory" data-action={change.action}>
        <span class="agent-step-memory-action">{text.t(MEMORY_ACTION_LABEL[change.action])}</span>
        <Show when={change.previousText}>
          {(previous) => (
            <s class="agent-step-memory-previous" dir="auto">
              {previous()}
            </s>
          )}
        </Show>
        {change.action === "forgotten" ? <s dir="auto">{change.text}</s> : <span dir="auto">{change.text}</span>}
      </span>
    );
  }
  if (step.kind === "thinking") {
    // The agent's own words take their direction from their letters; a progress line is interface text.
    return (
      <span class={["agent-step-text", { "agent-activity-label": newest }]} dir="auto">
        {step.text}
        {newest && <ActivityShine text={step.text} />}
      </span>
    );
  }
  const label = text.sourceText(step.text);
  return (
    <span class={["agent-step-text", { "agent-activity-label": newest }]}>
      {label}
      {newest && <ActivityShine text={label} />}
    </span>
  );
}

/** The line of a failed tool step, with a closed toggle that shows its error. */
function FailedStep(props: { text: string; error: string | undefined; newest: boolean }) {
  const { t } = useText();
  const outputId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const expanded = () => (open() ? "true" : "false");
  const controls = () => (open() ? outputId : undefined);
  const label = () => t(open() ? "chat.steps.hideError" : "chat.steps.showError");
  return (
    <div class="agent-step-failed">
      <span class={["agent-step-text", { "agent-activity-label": props.newest }]}>
        {props.text}
        <Show when={props.newest}>
          <ActivityShine text={props.text} />
        </Show>
      </span>
      <Button
        type="button"
        variant="ghost"
        class="agent-step-error-toggle"
        aria-expanded={expanded()}
        aria-controls={controls()}
        onClick={() => setOpen(!open())}
      >
        <ChevronRight class="agent-steps-chevron" aria-hidden="true" />
        {label()}
      </Button>
      <Show when={open()}>
        <pre id={outputId} class="agent-step-error" dir="auto">
          {props.error}
        </pre>
      </Show>
    </div>
  );
}

function StepIcon(props: { kind: AgentStep["kind"] }) {
  return (
    <>
      {props.kind === "thinking" ? (
        <Sparkles class="agent-step-icon" aria-hidden="true" />
      ) : props.kind === "progress" ? (
        <Puzzle class="agent-step-icon" aria-hidden="true" />
      ) : (
        <Brain class="agent-step-icon" aria-hidden="true" />
      )}
    </>
  );
}

/** The one-line summary of a finished turn's steps: "9 steps · Memory: 2 saved and 1 forgotten". */
function stepsSummary(steps: readonly AgentStep[], text: TextValue): string {
  const work = steps.filter((step) => step.kind === "thinking" || step.kind === "progress").length;
  const changes = steps.flatMap((step) => (step.kind === "memory" ? [step.change] : []));
  const counts = countConversationMemoryChanges(changes);
  const memory = text.format.list(
    [
      counts.saved ? text.t("chat.steps.memorySaved", { count: counts.saved }) : null,
      counts.updated ? text.t("chat.steps.memoryUpdated", { count: counts.updated }) : null,
      counts.forgotten ? text.t("chat.steps.memoryForgotten", { count: counts.forgotten }) : null,
      counts.notChanged ? text.t("chat.steps.memoryNotChanged", { count: counts.notChanged }) : null,
    ].filter((part): part is string => part !== null),
  );
  const fallback = steps.find((step) => step.kind === "memory-summary");
  return [
    work > 0 ? text.t("chat.steps.count", { count: work }) : null,
    changes.length > 0 ? text.t("chat.steps.memory", { changes: memory }) : null,
    fallback?.kind === "memory-summary" ? text.sourceText(fallback.text) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** The trace of a turn, which its steps row opens in a dialog. */
export interface AgentStepsTrace {
  /** Read only while the dialog is open. */
  spans: () => readonly TraceSpan[];
  keyboard: TraceKeyboard;
  /** The spans that are not steps of the list but that the chat can show, such as subagents. */
  canSelectSpan?: (id: string) => boolean;
  onSelectSpan?: (id: string) => void;
}

/** The facts of a finished turn that its steps row shows. */
export interface AgentStepsFacts {
  durationMs: number;
  /** The steps and subagents that failed. */
  failed: number;
}

/**
 * The steps of a finished turn, above its answer: a closed summary row that opens the list, or the
 * trace when the turn has one. The row looks like the header of the subagents above it. The "Show
 * agent steps" setting opens the list at first. An open list, also one that a step picked in the
 * trace opened, closes from the row.
 */
export function AgentStepsDisclosure(props: {
  steps: readonly AgentStep[];
  defaultOpen: boolean;
  trace?: AgentStepsTrace | undefined;
  facts?: AgentStepsFacts | undefined;
  /**
   * False when the row opens only the trace, never the list. A channel answer shows its steps
   * in the trace, so its row stays one line. Give a trace with it.
   */
  list?: boolean | undefined;
}) {
  const text = useText();
  const duration = useDuration();
  /** Whole seconds, rounded as the trace rounds the turn, so that the row and the trace agree. */
  const turnTime = (ms: number) => duration(Math.round(ms / 1_000) * 1_000);
  const panelId = createUniqueId();
  const [choice, setChoice] = createSignal<boolean>();
  // The time the trace opened: a finished turn does not move, so its "now" stays at that time.
  const [traceOpenedAt, setTraceOpenedAt] = createSignal<number | null>(null);
  // A long chat has a row for each turn, so a row builds its trace dialog when it first opens.
  const [traceUsed, setTraceUsed] = createSignal(false);
  const open = () => props.list !== false && (choice() ?? props.defaultOpen);
  // The step that the user picked in the trace. A new object each time scrolls to it again.
  const [focus, setFocus] = createSignal<{ id: string } | null>(null);
  const isStep = (id: string) => props.steps.some((step) => step.id === id);
  const canSelectSpan = (id: string) =>
    (props.list !== false && isStep(id)) || (props.trace?.canSelectSpan?.(id) ?? false);
  /** Closes the trace and shows the step in the list, or lets the chat show it. */
  const selectSpan = (id: string) => {
    setTraceOpenedAt(null);
    if (!isStep(id)) {
      props.trace?.onSelectSpan?.(id);
      return;
    }
    setChoice(true);
    setFocus({ id });
  };
  /** The row opens the trace, unless it has none or its list is open. */
  const opensTrace = () => props.trace !== undefined && !open();
  const expanded = () => {
    if (opensTrace()) return undefined;
    return open() ? "true" : "false";
  };
  const controls = () => {
    if (!open()) return undefined;
    return panelId;
  };
  const popup = () => {
    if (opensTrace()) return "dialog";
    return undefined;
  };
  const activate = () => {
    if (opensTrace()) {
      setTraceUsed(true);
      setTraceOpenedAt(Date.now());
      return;
    }
    setFocus(null);
    setChoice(!open());
  };
  return (
    <div class="agent-steps" data-open={open() ? "" : undefined}>
      <div class="agent-steps-row">
        <Button
          type="button"
          variant="ghost"
          class="agent-steps-header"
          aria-expanded={expanded()}
          aria-controls={controls()}
          aria-haspopup={popup()}
          onClick={activate}
        >
          <span class="agent-steps-summary">{stepsSummary(props.steps, text)}</span>
          <Show when={props.facts}>
            {(facts) => (
              <>
                <Show when={facts().failed > 0}>
                  <Badge class="agent-steps-failed">{text.t("chat.steps.failed", { count: facts().failed })}</Badge>
                </Show>
                <span class="agent-steps-duration">{turnTime(facts().durationMs)}</span>
              </>
            )}
          </Show>
          <ChevronRight class="agent-steps-chevron" aria-hidden="true" />
        </Button>
      </div>
      <Show when={traceUsed() && props.trace}>
        {(trace) => {
          // The waterfall reads its spans many times for each change; this builds them once.
          const spans = createMemo(() => trace().spans());
          return (
            <TraceWaterfallDialog
              open={traceOpenedAt() !== null}
              onOpenChange={(next) => {
                if (!next) setTraceOpenedAt(null);
              }}
              spans={spans()}
              now={traceOpenedAt() ?? 0}
              keyboard={trace().keyboard}
              canSelectSpan={canSelectSpan}
              onSelectSpan={selectSpan}
            />
          );
        }}
      </Show>
      {/* A long chat has a row for each turn, so a closed row builds no list. */}
      <Show when={open()}>
        <div class="agent-steps-panel">
          <AgentStepList id={panelId} steps={props.steps} live={false} focus={focus()} />
        </div>
      </Show>
    </div>
  );
}

/** True when the steps have a thought or a progress line, which the full-thinking dialog shows. */
export function hasThinking(steps: readonly AgentStep[] | undefined): boolean {
  return steps?.some((step) => step.kind === "thinking" || step.kind === "progress") ?? false;
}

/**
 * The button that opens the full thinking of a turn (#3219). The dialog is built when the button is
 * first used, so a long chat with a row for each turn builds no dialogs.
 */
export function AgentThinkingButton(props: { steps: readonly AgentStep[]; live: boolean }) {
  const { t } = useText();
  const [open, setOpen] = createSignal(false);
  const [used, setUsed] = createSignal(false);
  return (
    <>
      <IconButton
        label={t("chat.steps.fullThinking")}
        variant="ghost"
        size="icon-xs"
        class="agent-thinking-open"
        aria-haspopup="dialog"
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
      >
        <Maximize2 aria-hidden="true" />
      </IconButton>
      <Show when={used()}>
        <AgentThinkingDialog open={open()} onOpenChange={setOpen} steps={props.steps} live={props.live} />
      </Show>
    </>
  );
}

/**
 * Each thought of a turn in full, with its paragraphs, and the progress lines between them, in time
 * order. While the turn runs, the dialog updates live and follows the newest text, until the reader
 * scrolls up. Scrolling back to the end follows again.
 */
export function AgentThinkingDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: readonly AgentStep[];
  live: boolean;
}) {
  const text = useText();
  // A controlled dialog has no Kobalte trigger, so it keeps the element that opened it itself.
  let opener: HTMLElement | undefined;
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay>
          <Dialog.Content
            as="div"
            class="agent-thinking-dialog"
            onOpenAutoFocus={() => {
              const active = document.activeElement;
              opener = active instanceof HTMLElement && active !== document.body ? active : undefined;
            }}
            onCloseAutoFocus={(event) => {
              if (!opener?.isConnected) return;
              event.preventDefault();
              opener.focus({ preventScroll: true });
            }}
          >
            <header class="agent-thinking-header">
              <Dialog.Title as="h2" class="agent-thinking-title">
                {text.t("chat.steps.fullThinkingTitle")}
              </Dialog.Title>
              <span class="agent-thinking-summary">{stepsSummary(props.steps, text)}</span>
              <Show when={props.live}>
                <Badge class="agent-thinking-live">{text.t("chat.steps.fullThinkingLive")}</Badge>
              </Show>
              <IconButton label={text.t("common.close")} variant="ghost" onClick={() => props.onOpenChange(false)}>
                <X />
              </IconButton>
            </header>
            <AgentThinkingTranscript steps={props.steps} live={props.live} />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AgentThinkingTranscript(props: { steps: readonly AgentStep[]; live: boolean }) {
  const { t } = useText();
  let body: HTMLElement | undefined;
  let list: HTMLOListElement | undefined;
  // A running turn opens at its newest text; a finished turn opens at its first step.
  let following = true;
  onSettled(() => {
    const scroller = body;
    const element = list;
    if (!scroller || !element) return;
    const follow = () => {
      if (props.live && following) scroller.scrollTop = scroller.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(element);
    return () => observer.disconnect();
  });
  return (
    <section
      ref={body}
      class="agent-thinking-body"
      aria-label={t("chat.steps.list")}
      // The transcript scrolls, so it needs a keyboard stop of its own.
      tabindex={0}
      onScroll={() => {
        if (body) following = isScrolledToEnd(body);
      }}
    >
      <ol ref={list} class="agent-steps-list">
        <For each={props.steps} keyed={(step) => step.id}>
          {(step) => (
            <li class="agent-step" data-kind={step().kind}>
              <StepIcon kind={step().kind} />
              <StepBody step={step()} newest={false} />
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}
