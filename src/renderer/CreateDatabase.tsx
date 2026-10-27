import { type ButtonHTMLAttributes, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Callout } from "@/components/Callout";
import { Icon } from "@/components/icons";

interface CreateActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  icon: string;
}

function CreateActionButton({
  children,
  icon,
  className = "",
  ...props
}: CreateActionButtonProps) {
  return (
    <button
      {...props}
      className={[
        "group relative inline-flex h-9 min-w-0 items-center justify-center gap-2 overflow-hidden border px-3 font-display text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-subtle disabled:cursor-not-allowed disabled:border-subtle/50 disabled:bg-panel/50 disabled:text-terminal-txt border-subtle bg-paper text-secondary-txt hover:border-review-border/35 hover:bg-black/15 hover:text-primary-txt disabled:transition-none",
        className,
      ].join(" ")}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/25 group-hover:bg-review-border/25" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-px w-6 bg-current/35 group-hover:bg-review-border/35 " />
      <Icon
        icon={icon}
        className="h-4 w-4 shrink-0 disabled:transition-none group-hover:translate-x-0 -translate-x-px group-hover:animate-slow-pulse transition-transform duration-300"
      />
      <span className="truncate group-hover:animate-shine">{children}</span>
    </button>
  );
}

export default function CreateDatabases() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await window.api.database.create({ name: trimmedName });
      if (!result.success) {
        setError(result.error ?? t("databases.createError"));
      } else {
        toast.success(t("databases.createSuccess", { name: trimmedName }));
        setName("");
        navigate(`/?id=${result.database?.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <section className="relative w-full max-w-180">
        <div className="relative overflow-hidden rounded-md border border-subtle/75 shadow-hairline shadow-2xl backdrop-blur-md text-text-primary">
          <div className="relative flex h-8 items-stretch border-b border-subtle/75">
            <div className="group relative flex max-w-56 flex-1 items-stretch overflow-hidden border-r border-kard bg-kard/10 text-text-primary">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-kard" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 bg-current/20" />
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[10px] uppercase tracking-[0.24em]">
                <Icon
                  icon="folder"
                  className="h-3.5 w-3.5 shrink-0 text-review-text"
                />
                <span className="truncate">
                  {t("databases.createWorkspace")}
                </span>
              </div>
            </div>
            <div className="min-w-8 flex-1 border-r border-dashed border-kard" />
            <NavLink
              to="/"
              className="relative inline-flex w-10 shrink-0 items-center justify-center border-l border-dashed border-subtle bg-canvas text-ink-hard/60 transition-colors duration-150 hover:bg-subtle/8 hover:text-body-txt focus-visible:outline-none focus-visible:ring-1 group"
              aria-label={t("databases.selectOne")}
              title={t("databases.selectOne")}
            >
              <Icon
                icon="arrow-left"
                className="h-3.5 w-3.5 group-hover:scale-115"
              />
            </NavLink>
          </div>

          <div className="relative p-5">
            <section className="border border-subtle/25 bg-canvas p-5">
              <div className="flex gap-4 flex-row items-start justify-between">
                <section className="w-full">
                  <div className="font-display flex items-end justify-between text-xl uppercase tracking-wide text-primary-txt">
                    <h1>{t("databases.createTitle")}</h1>
                    <p className="flex shrink-0 items-center gap-2 border border-subtle/50 rounded-xs px-2 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-terminal-txt">
                      {/* TODO i18n */}
                      New Space
                      <Icon icon="database-plus" className="h-3.5 w-3.5" />
                    </p>
                  </div>
                  <p className="leading-6 text-muted-txt max-w-md">
                    {t("databases.createBody")}
                  </p>
                </section>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-txt">
                    {t("databases.databaseName")}
                  </span>
                  <input
                    type="text"
                    name="name"
                    placeholder={`${t("databases.workspaceNewPlaceholder")}...`}
                    value={name}
                    required
                    onInput={(e) =>
                      setName((e.target as HTMLInputElement).value)
                    }
                    className="relative rounded-xs mt-1 h-10 border border-subtle/50 flex text-primary-txt cursor-pointer text-sm px-3 w-full items-center justify-between text-left outline-none disabled:cursor-not-allowed disabled:opacity-60 border-b  font-display transition placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/30"
                  />
                </label>

                <p className="min-h-5 select-none text-xs text-muted-txt">
                  {name
                    ? t("databases.createHint", { name })
                    : t("databases.createHelp")}
                  .
                </p>

                <div className="flex gap-2 flex-row flex-wrap items-center">
                  <CreateActionButton
                    type="submit"
                    icon="database-plus"
                    disabled={isSubmitting || !name.trim()}
                  >
                    {isSubmitting
                      ? t("databases.createSubmitting")
                      : t("databases.createAction")}
                  </CreateActionButton>
                </div>
              </form>

              <div className="mt-5 border-t border-subtle pt-4">
                <p className="text-sm leading-5 text-muted-txt">
                  {t("databases.alreadyHave")}{" "}
                  <NavLink
                    to="/"
                    className="inline-flex items-center gap-1 text-muted-txt  transition-colors hover:text-primary-txt group"
                  >
                    {t("databases.selectOne")}...
                    <Icon
                      icon="arrow-right"
                      className="h-3 w-3 group-hover:translate-0 -translate-x-3 transition-all duration-150 group-hover:opacity-100 opacity-0"
                    />
                  </NavLink>
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      {error && (
        <div className="fixed bottom-4 left-4 max-w-sm">
          <Callout title={t("databases.createError")} type="warning">
            {error}
          </Callout>
        </div>
      )}
    </>
  );
}
