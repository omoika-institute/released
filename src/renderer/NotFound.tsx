import Logo from "@/assets/images/logo.svg";
import { Icon } from "@/components/icons";
import Button from "@/components/buttons";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  const links = [
    {
      title: t("app.notFound.documentation"),
      href: "https://osintbuddy.com",
      description: t("app.notFound.learnAbout"),
      icon: (
        <Icon
          icon="book"
          className="h-6 w-6 text-slate-300/70 group-hover:text-slate-300"
        />
      ),
    },
    {
      title: t("app.notFound.architectureGuide"),
      href: "https://osintbuddy.com/docs/architecture-guide",
      description: t("app.notFound.architectureOverview"),
      icon: (
        <Icon
          icon="buildings"
          className="h-6 w-6 text-slate-300/70 group-hover:text-slate-300"
        />
      ),
    },
  ];
  void links;
  const social = [
    {
      name: "GitHub",
      href: "https://github.com/jerlendds/osintbuddy",
      icon: <Icon icon="brand-github" className="h-6 w-6" />,
    },
  ];
  void social;

  return (
    <div class="flex h-screen flex-col justify-between">
      <main class="mx-auto w-full max-w-7xl px-8">
        <img
          class="mx-auto mt-16 h-12 w-auto"
          src={Logo}
          alt={t("app.notFound.logoAlt")}
        />
        <div class="mx-auto max-w-xl py-16 sm:py-24">
          <div class="text-center">
            <p class="text-primary-200 text-base font-semibold">404</p>
            <h1 class="font-display mt-2 text-4xl font-bold tracking-tight text-slate-300 sm:text-5xl">
              {t("app.notFound.title")}
            </h1>
          </div>
          <div class="mt-12">
            <a href="/">
              <Button.Ghost variant="primary" className="mt-8">
                {t("app.notFound.goHome")}
                <Icon icon="home" className="btn-icon" />
              </Button.Ghost>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
