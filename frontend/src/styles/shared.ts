import { css } from "lit";

/** Controls shared by all views: buttons, chips, form fields, cards, dialogs. */
export const shared = css`
  * {
    box-sizing: border-box;
  }
  .muted {
    color: var(--pg-text-muted);
  }
  .card {
    background: var(--pg-surface);
    border-radius: var(--pg-radius);
    box-shadow: var(--pg-shadow);
  }
  .icon {
    width: 24px;
    height: 24px;
    fill: currentColor;
    flex: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ------------------------------------------------ buttons */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 8px 18px;
    border: none;
    border-radius: 999px;
    background: var(--pg-accent);
    color: var(--text-primary-color, #fff);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition:
      filter 120ms ease,
      background 120ms ease;
  }
  .button:hover {
    filter: brightness(1.06);
  }
  .button:disabled {
    opacity: 0.5;
    cursor: default;
    filter: none;
  }
  .button.secondary {
    background: color-mix(in srgb, var(--pg-accent) 12%, transparent);
    color: var(--pg-accent);
  }
  .button.text {
    background: transparent;
    color: var(--pg-accent);
    padding: 8px 12px;
  }
  .button.danger {
    background: var(--error-color, #db4437);
    color: #fff;
  }
  .button.text.danger {
    background: transparent;
    color: var(--error-color, #db4437);
  }
  .button .icon {
    width: 18px;
    height: 18px;
  }
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    flex: none;
  }
  .icon-button:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .button:focus-visible,
  .icon-button:focus-visible,
  .chip:focus-visible {
    outline: 2px solid var(--pg-accent);
    outline-offset: 2px;
  }

  /* ------------------------------------------------ chips */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border: 1px solid var(--pg-divider);
    border-radius: 999px;
    background: transparent;
    color: var(--pg-text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip[aria-pressed="true"],
  .chip.selected {
    background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
    border-color: transparent;
    color: var(--pg-accent);
    font-weight: 500;
  }
  .chip.static {
    cursor: default;
  }
  .chip .icon {
    width: 16px;
    height: 16px;
  }

  /* ------------------------------------------------ status */
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .status::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--status-color, var(--pg-leaf));
  }
  .status-healthy {
    --status-color: var(--success-color, #43a047);
  }
  .status-watch {
    --status-color: var(--warning-color, #ffa600);
  }
  .status-problem {
    --status-color: var(--error-color, #db4437);
  }
  .status-dead,
  .status-removed {
    --status-color: var(--disabled-text-color, #9e9e9e);
  }

  /* ------------------------------------------------ form fields */
  .field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .field > span {
    font-size: 12px;
    color: var(--pg-text-muted);
  }
  .field small {
    font-size: 12px;
    color: var(--pg-text-muted);
  }
  input,
  select,
  textarea {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--pg-divider);
    border-radius: 8px;
    background: var(--pg-input-bg);
    color: var(--pg-text);
    font: inherit;
  }
  textarea {
    min-height: 80px;
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: 2px solid color-mix(in srgb, var(--pg-accent) 60%, transparent);
    outline-offset: -1px;
    border-color: transparent;
  }
  input[type="file"] {
    padding: 6px;
  }
  .error-text {
    color: var(--error-color, #db4437);
    font-size: 13px;
  }

  /* ------------------------------------------------ dialogs */
  dialog {
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    padding: 0;
    border: none;
    border-radius: 16px;
    background: var(--pg-surface);
    color: var(--pg-text);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  dialog form {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 24px);
  }
  .dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px 8px;
  }
  .dialog-header h2 {
    flex: 1;
    margin: 0;
    font-size: 20px;
    font-weight: 500;
  }
  .dialog-body {
    padding: 8px 20px 16px;
    overflow: auto;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--pg-divider);
  }
`;
