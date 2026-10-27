import {
  type ButtonHTMLAttributes,
  type ComponentChildren,
  TargetedSubmitEvent,
} from "preact";
import { useRef, useState, useEffect } from "preact/hooks";
import { useTranslation } from "react-i18next";
import OverlayModal from "@/components/modals/OverlayModal";
import { Icon } from "@/components/icons";

export interface ConfirmDeleteProps {
  isOpen: boolean;
  closeModal: () => void;
  itemName: string;
  itemType?: string;
  onConfirmDelete: () => void | Promise<void>;
  isDeleting?: boolean;
}

function ConfirmDeleteActionButton({
  children,
  icon,
  tone = "default",
  ...props
}: {
  children: ComponentChildren;
  icon?: string;
  tone?: "default" | "danger";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "group relative inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden border px-6 font-display text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:transition-none sm:min-w-56",
        tone === "danger"
          ? "border-danger-700/70 bg-danger-900/30 text-danger-400 hover:border-danger-400/45 hover:bg-danger-900/50 hover:text-danger-e00 focus-visible:ring-danger-500/40"
          : "border-subtle bg-paper text-secondary-txt hover:border-review-border/35 hover:bg-black/15 hover:text-primary-txt focus-visible:ring-subtle",
      ].join(" ")}
    >
      {icon ? <Icon icon={icon} className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

export default function ConfirmDelete({
  isOpen,
  closeModal,
  itemName,
  itemType = "item",
  onConfirmDelete,
  isDeleting = false,
}: ConfirmDeleteProps) {
  const { t } = useTranslation();
  const [showConfirmBtn, setShowConfirmBtn] = useState(true);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const cancelDeleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setShowConfirmBtn(true);
      setConfirmPhrase("");
    }
  }, [isOpen]);

  const handleConfirmDelete = async (event: TargetedSubmitEvent<any>) => {
    event.preventDefault();
    if (itemName === confirmPhrase) {
      await onConfirmDelete();
      setConfirmPhrase("");
      setShowConfirmBtn(true);
    }
  };

  return (
    <OverlayModal
      isOpen={isOpen}
      closeModal={closeModal}
      cancelRef={cancelDeleteRef}
    >
      <section className="relative w-full  max-w-150 mx-auto">
        <div className="relative overflow-hidden rounded-md border border-subtle/75 text-text-primary">
          <div className="relative flex h-8 items-stretch border-b border-subtle/75">
            <div className="group relative flex max-w-56 flex-1 items-stretch overflow-hidden border-r border-danger-500/20 bg-danger-700/20 text-danger-500">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-danger-700" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 " />
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 font-display text-[10px] uppercase tracking-[0.24em]">
                <Icon icon="trash" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {t("common.delete")} {itemType}
                </span>
              </div>
            </div>
            <div className="min-w-8 flex-1 border-r border-dashed border-kard" />
            <button
              type="button"
              onClick={closeModal}
              className="relative inline-flex w-10 shrink-0 items-center justify-center border-l border-dashed border-subtle bg-canvas text-ink-hard/60 transition-colors duration-150 hover:bg-subtle/8 hover:text-body-txt focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-subtle"
              aria-label={t("common.cancel")}
              title={t("common.cancel")}
            >
              <Icon icon="x" className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative p-5 bg-paper/70">
            <section className="border border-subtle/25 bg-canvas p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                <section className="min-w-0">
                  <p className="font-display text-lg uppercase tracking-wide text-primary-txt">
                    {t("shared.confirmDelete.question", { itemType })}
                  </p>
                  <h2 className="mt-1 truncate font-display text-sm uppercase tracking-widest text-review-txt">
                    {itemName}
                  </h2>
                </section>
              </div>

              <div className="mt-5 border border-danger-800/70 rounded-xs bg-danger-900/10 p-4">
                <ul className="space-y-2.5 text-sm leading-6 text-muted-txt">
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1 w-1 shrink-0 bg-danger-400" />
                    <span>
                      {t("shared.confirmDelete.permanentDelete", {
                        itemType,
                        itemName,
                      })}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1 w-1 shrink-0 bg-danger-400" />
                    <span>{t("shared.confirmDelete.permanentLost")}</span>
                  </li>
                </ul>
              </div>

              {showConfirmBtn ? (
                <div className="mt-5 flex w-full flex-col-reverse gap-3 sm:flex-row">
                  <ConfirmDeleteActionButton type="button" onClick={closeModal}>
                    {t("common.cancel")}
                  </ConfirmDeleteActionButton>
                  <ConfirmDeleteActionButton
                    type="button"
                    icon="trash"
                    tone="danger"
                    onClick={() => setShowConfirmBtn(false)}
                  >
                    {t("shared.confirmDelete.action", { itemType })}
                  </ConfirmDeleteActionButton>
                </div>
              ) : (
                <>
                  <p className="mt-5 text-sm leading-6 text-muted-txt">
                    {t("shared.confirmDelete.confirmType", { itemName })}
                  </p>

                  <form
                    onSubmit={(e) => handleConfirmDelete(e)}
                    className="mt-4 space-y-4"
                  >
                    <label className="block">
                      <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-txt">
                        {t("shared.confirmDelete.nameLabel", { itemType })}
                      </span>
                      <input
                        spellcheck={false}
                        type="text"
                        value={confirmPhrase}
                        onInput={(e) => setConfirmPhrase(e.currentTarget.value)}
                        placeholder={itemName}
                        className="relative mt-1 h-10 w-full rounded-xs border border-subtle/50 border-b bg-transparent px-3 font-display text-sm text-primary-txt outline-none transition placeholder:text-muted-txt focus:border-danger-700/50 focus:bg-black/30"
                      />
                    </label>

                    <div className="flex w-full flex-col-reverse gap-3 sm:flex-row">
                      <ConfirmDeleteActionButton
                        type="button"
                        onClick={closeModal}
                      >
                        {t("common.cancel")}
                      </ConfirmDeleteActionButton>
                      <ConfirmDeleteActionButton
                        type="submit"
                        icon="trash"
                        tone="danger"
                        disabled={confirmPhrase !== itemName || isDeleting}
                      >
                        {isDeleting ? t("common.deleting") : t("common.delete")}
                      </ConfirmDeleteActionButton>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        </div>
      </section>
    </OverlayModal>
  );
}
