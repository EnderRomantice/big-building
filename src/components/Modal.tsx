import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const label = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not([type="hidden"]), select, textarea, a[href], summary, [tabindex="0"]',
          ) ?? [],
        ).filter((element) => {
          if (!element.getClientRects().length) return false;
          // Closed details can still report layout boxes in some browsers.
          let parent = element.parentElement;
          while (parent && parent !== ref.current) {
            if (
              parent instanceof HTMLDetailsElement &&
              !parent.open &&
              parent.querySelector("summary") !== element
            )
              return false;
            parent = parent.parentElement;
          }
          return true;
        });
        const first = elements[0],
          last = elements[elements.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = bodyOverflow;
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label}
      >
        <div className="modal-header">
          <h2 id={label}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
