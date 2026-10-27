import { Icon } from "@/components/icons";
import OverlayModal from "@/components/modals/OverlayModal";
import { useCasesStore } from "@/stores";
import { type ButtonHTMLAttributes, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";

type CreateCaseModalProps = {
  isOpen: boolean;
  closeModal: () => void;
};

interface CreateCaseActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  icon?: string;
}

function CreateCaseActionButton({
  children,
  icon,
  className = "",
  ...props
}: CreateCaseActionButtonProps) {
  return (
    <button
      {...props}
      className={[
        "group relative inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden border px-6 font-display text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-subtle disabled:cursor-not-allowed disabled:border-subtle/50 disabled:bg-panel/50 disabled:text-terminal-txt disabled:transition-none sm:flex-none sm:min-w-44",
        "border-subtle bg-paper text-secondary-txt hover:border-review-border/35 hover:bg-black/15 hover:text-primary-txt",
        className,
      ].join(" ")}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/25 group-hover:bg-review-border/25" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-px w-6 bg-current/35 group-hover:bg-review-border/35" />
      {icon ? (
        <Icon
          icon={icon}
          className="h-4 w-4 shrink-0 -translate-x-px transition-transform duration-300 group-hover:translate-x-0 group-hover:animate-slow-pulse"
        />
      ) : null}
      <span className="truncate group-hover:animate-shine">{children}</span>
    </button>
  );
}

export default function CreateCaseModal({
  isOpen,
  closeModal,
}: CreateCaseModalProps) {
  const { t } = useTranslation();
  const { tabId } = useParams();
  const { createCase, isCreating } = useCasesStore();
  const cancelRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLabel("");
      setDescription("");
    }
  }, [isOpen]);

  const handleCreateCase = async (event: Event) => {
    event.preventDefault();
    if (!label.trim()) return;

    try {
      const newCase = await createCase({
        label: label.trim(),
        description: description.trim(),
      });
      toast.success(t("overview.createModal.created", { name: newCase.label }));
      closeModal();
      window.location.href = `http://localhost:5173/#/overview/${tabId}/case/${newCase.id}`;
    } catch (err: any) {
      toast.error(
        t("overview.createModal.failed", { message: err.message || err }),
      );
    }
  };

  return (
    <OverlayModal isOpen={isOpen} closeModal={closeModal} cancelRef={cancelRef}>
      <section className="relative mx-auto w-full max-w-150">
        <div className="relative overflow-hidden rounded-md border border-subtle/75 text-text-primary shadow-hairline shadow-2xl backdrop-blur-md">
          <div className="relative flex h-8 items-stretch border-b border-subtle/75">
            <div className="group relative flex max-w-56 flex-1 items-stretch overflow-hidden border-r border-kard bg-kard/10 text-text-primary">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-kard" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 bg-current/20" />
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[10px] uppercase tracking-[0.24em]">
                <Icon
                  icon="folder-plus"
                  className="h-3.5 w-3.5 shrink-0 text-review-text"
                />
                <span className="truncate">
                  {t("overview.createModal.eyebrow")}
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

          <div className="relative bg-paper/70 p-5">
            <section className="border border-subtle/25 bg-canvas p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <section className="min-w-0">
                  <h2 className="font-display text-lg uppercase tracking-wide text-primary-txt">
                    {t("overview.createModal.title")}
                  </h2>
                </section>
                <p className="flex shrink-0 items-center gap-2 rounded-xs border border-subtle/50 px-2 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-terminal-txt">
                  {t("overview.inventory.caseRecord")}
                  <Icon icon="folder-plus" className="h-3.5 w-3.5" />
                </p>
              </div>

              <form onSubmit={handleCreateCase} className="mt-4 space-y-4">
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-txt">
                    {t("overview.createModal.caseName")}
                  </span>
                  <input
                    type="text"
                    value={label}
                    onInput={(event) => setLabel(event.currentTarget.value)}
                    placeholder={t("overview.createModal.placeholder")}
                    required
                    autoFocus
                    className="relative mt-1 h-10 w-full rounded-xs border border-subtle/50 border-b bg-transparent px-3 font-display text-sm text-primary-txt outline-none transition placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/30"
                  />
                </label>

                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-txt">
                    {t("overview.createModal.description")}{" "}
                    {t("overview.createModal.descriptionHint")}
                  </span>
                  <textarea
                    value={description}
                    onInput={(event) =>
                      setDescription(event.currentTarget.value)
                    }
                    placeholder={t(
                      "overview.createModal.descriptionPlaceholder",
                    )}
                    rows={4}
                    className="relative mt-1 w-full resize-none rounded-xs border border-subtle/50 border-b bg-transparent px-3 py-2 font-display text-sm leading-6 text-primary-txt outline-none transition placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/30"
                  />
                </label>

                <div className="flex w-full flex-col-reverse gap-3 sm:flex-row">
                  <CreateCaseActionButton type="button" onClick={closeModal}>
                    {t("common.cancel")}
                  </CreateCaseActionButton>
                  <CreateCaseActionButton
                    type="submit"
                    icon="plus"
                    disabled={!label.trim() || isCreating}
                  >
                    {isCreating
                      ? t("overview.createModal.createSubmitting")
                      : t("overview.createModal.createAction")}
                  </CreateCaseActionButton>
                </div>
              </form>
            </section>
          </div>
        </div>
      </section>
    </OverlayModal>
  );
}
