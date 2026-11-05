import { NAMESPACE } from './constants.ts'

export const CSS = `
.dshyce-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  max-width: 380px;
}
.dshyce-control {
  position: relative;
  width: 26px;
  height: 26px;
  flex: none;
}
.dshyce-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color 0.12s cubic-bezier(0.16, 1, 0.3, 1), color 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.dshyce-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.08));
  color: var(--dsw-alias-label-primary);
}
.dshyce-btn:hover:active {
  transform: scale(0.96);
}
.dshyce-btn:disabled:not([data-busy='true']) {
  opacity: 0.45;
  cursor: not-allowed;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
}
.dshyce-btn:disabled:not([data-busy='true']):hover {
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
.dshyce-icon {
  width: 13px;
  height: 13px;
  display: block;
}
.dshyce-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
}
.dshyce-wrap[data-busy='true'] .dshyce-control {
  pointer-events: none;
}
.dshyce-wrap[data-busy='true'] .dshyce-ring {
  opacity: 0.85;
  animation: dshyce-spin 1.5s linear infinite;
  background: conic-gradient(
    from var(--dshyce-from, 0deg) at 50% 50%,
    transparent 0deg,
    rgba(247, 214, 186, 0) 205deg,
    rgba(247, 214, 186, 0.45) 255deg,
    rgba(232, 170, 120, 0.78) 305deg,
    rgba(201, 122, 69, 0.55) 340deg,
    transparent 360deg
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
}
.dshyce-btn[data-busy='true'] {
  opacity: 1;
  cursor: progress;
  pointer-events: none;
  color: #d9884e;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
.dshyce-btn[data-busy='true']:hover {
  color: #d9884e;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
@property --dshyce-from {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes dshyce-spin {
  to { --dshyce-from: 360deg; }
}
.dshyce-status {
  min-width: 0;
  max-width: 210px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, #8b8b8b);
  pointer-events: none;
}
.dshyce-status[data-level='busy'] {
  color: #d9884e;
}
.dshyce-status[data-level='error'] {
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
.dshyce-status[data-level='ok'] {
  color: var(--dsw-alias-state-success-primary, #30a46c);
}
@media (prefers-reduced-motion: reduce) {
  .dshyce-wrap[data-busy='true'] .dshyce-ring {
    animation: none;
    opacity: 0.5;
  }
  .dshyce-btn,
  .dshyce-restore {
    transition: none;
    animation: none;
  }
}
.dshyce-restore {
  flex: none;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
}
.dshyce-restore:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.08));
  color: var(--dsw-alias-label-primary);
}
.dshyce-restore[data-accent='true'] {
  background: rgba(217, 136, 78, 0.14);
  color: #d9884e;
}
.dshyce-restore[data-accent='true']:hover {
  background: rgba(217, 136, 78, 0.22);
  color: #c57238;
}
.dshyce-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`

export function injectStyles(): () => void {
  const tag = document.createElement('style')
  tag.dataset.plugin = NAMESPACE
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
