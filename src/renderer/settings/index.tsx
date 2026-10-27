import { Button } from "@/components/buttons/Button";
import { Grid, Hatch } from "@/components/Geometry";
import { Icon } from "@/components/icons";
import Input from "@/components/inputs";
import WorldMapBackground from "@/components/WorldMapBackground";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings";

type PluginSettingsMap = Record<string, Record<string, string>>;
type PluginOption = {
  value: string;
  label: string;
};
type PluginSettingDefinition = {
  name: string;
  display_name?: string;
  setting_type?: string;
  default_value?: string;
  required?: boolean;
  global_setting?: boolean;
  description?: string;
};
type PluginSettingsDefinition = {
  id: string;
  label: string;
  settings: PluginSettingDefinition[];
};

const EMPTY_PLUGIN_ID = "__global__";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { pluginSettings } = useSettingsStore();
  const [pluginDefinitions, setPluginDefinitions] = useState<
    PluginSettingsDefinition[]
  >([]);
  const [selectedPluginId, setSelectedPluginId] = useState(EMPTY_PLUGIN_ID);
  const [draftPluginSettings, setDraftPluginSettings] =
    useState<PluginSettingsMap>({});
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(false);
  const [isSavingPluginSettings, setIsSavingPluginSettings] = useState(false);
  const [pluginSettingsError, setPluginSettingsError] = useState<string | null>(
    null
  );

  // Load settings on mount
  useEffect(() => {
    void useSettingsStore.getState().load();
  }, []);

  useEffect(() => {
    setDraftPluginSettings(pluginSettings ?? {});
  }, [pluginSettings]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPlugins(true);

    window.api.plugins
      .settingsDefinitions()
      .then((definitions) => {
        if (cancelled) return;
        const nextDefinitions = (definitions ?? [])
          .map((definition: any) => ({
            id: String(definition?.id ?? "").trim(),
            label: String(definition?.label ?? "").trim(),
            settings: Array.isArray(definition?.settings)
              ? definition.settings
              : [],
          }))
          .filter(
            (definition) =>
              definition.id && definition.label && definition.settings.length
          );
        setPluginDefinitions(nextDefinitions);
        setSelectedPluginId((currentPluginId) =>
          currentPluginId !== EMPTY_PLUGIN_ID &&
          !nextDefinitions.some((plugin) => plugin.id === currentPluginId) &&
          !Object.prototype.hasOwnProperty.call(
            pluginSettings ?? {},
            currentPluginId
          )
            ? EMPTY_PLUGIN_ID
            : currentPluginId
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setPluginSettingsError(
            error instanceof Error
              ? error.message
              : t("settings.pluginSettings.loadError")
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlugins(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pluginSettings, t]);

  const pluginOptions = useMemo(() => {
    const options: PluginOption[] = [
      {
        value: EMPTY_PLUGIN_ID,
        label: t("settings.pluginSettings.globalPlugin"),
      },
      ...pluginDefinitions.map((plugin) => ({
        value: plugin.id,
        label: plugin.label,
      })),
    ];
    const existingValues = new Set(options.map((option) => option.value));
    for (const pluginId of Object.keys(draftPluginSettings)) {
      if (pluginId === EMPTY_PLUGIN_ID || existingValues.has(pluginId)) {
        continue;
      }
      options.push({
        value: pluginId,
        label: pluginId,
      });
    }
    return options;
  }, [draftPluginSettings, pluginDefinitions, t]);

  const selectedPluginDefinition = useMemo(
    () =>
      pluginDefinitions.find((plugin) => plugin.id === selectedPluginId) ??
      null,
    [pluginDefinitions, selectedPluginId]
  );

  const selectedPluginSettings = draftPluginSettings[selectedPluginId] ?? {};
  const declaredSettings = selectedPluginDefinition?.settings ?? [];
  const declaredSettingNames = useMemo(
    () => new Set(declaredSettings.map((setting) => setting.name)),
    [declaredSettings]
  );
  const selectedPluginEntries = Object.entries(selectedPluginSettings).filter(
    ([key]) => !declaredSettingNames.has(key)
  );
  const hasPluginSettingRows =
    declaredSettings.length > 0 || selectedPluginEntries.length > 0;

  const getSettingValue = (setting: PluginSettingDefinition) =>
    selectedPluginSettings[setting.name] ?? setting.default_value ?? "";

  const getSettingInputType = (settingType?: string) => {
    switch (String(settingType ?? "").toLowerCase()) {
      case "password":
        return "password";
      case "int":
      case "float":
        return "number";
      default:
        return "text";
    }
  };

  const handleAddPluginSetting = () => {
    const existing = draftPluginSettings[selectedPluginId] ?? {};
    let index = Object.keys(existing).length + 1;
    let key = `key_${index}`;

    while (
      Object.prototype.hasOwnProperty.call(existing, key) ||
      declaredSettingNames.has(key)
    ) {
      index += 1;
      key = `key_${index}`;
    }

    setDraftPluginSettings({
      ...draftPluginSettings,
      [selectedPluginId]: {
        ...existing,
        [key]: "",
      },
    });
  };

  const handlePluginSettingKeyChange = (oldKey: string, nextKey: string) => {
    const cleanKey = nextKey.trim();
    if (!cleanKey || cleanKey === oldKey) return;

    const current = draftPluginSettings[selectedPluginId] ?? {};
    if (
      Object.prototype.hasOwnProperty.call(current, cleanKey) ||
      declaredSettingNames.has(cleanKey)
    ) {
      return;
    }

    const nextSettings: Record<string, string> = {};
    for (const [key, value] of Object.entries(current)) {
      nextSettings[key === oldKey ? cleanKey : key] = value;
    }

    setDraftPluginSettings({
      ...draftPluginSettings,
      [selectedPluginId]: nextSettings,
    });
  };

  const handlePluginSettingValueChange = (key: string, value: string) => {
    setDraftPluginSettings({
      ...draftPluginSettings,
      [selectedPluginId]: {
        ...(draftPluginSettings[selectedPluginId] ?? {}),
        [key]: value,
      },
    });
  };

  const handleRemovePluginSetting = (keyToRemove: string) => {
    const nextSettings = { ...(draftPluginSettings[selectedPluginId] ?? {}) };
    delete nextSettings[keyToRemove];

    setDraftPluginSettings({
      ...draftPluginSettings,
      [selectedPluginId]: nextSettings,
    });
  };

  const handleSavePluginSettings = async () => {
    setIsSavingPluginSettings(true);
    setPluginSettingsError(null);

    const cleaned: PluginSettingsMap = {};
    for (const [pluginId, settings] of Object.entries(draftPluginSettings)) {
      const cleanPluginId = pluginId.trim();
      if (!cleanPluginId) continue;

      const cleanSettings: Record<string, string> = {};
      for (const [key, value] of Object.entries(settings)) {
        const cleanKey = key.trim();
        if (!cleanKey) continue;
        cleanSettings[cleanKey] = value;
      }

      if (Object.keys(cleanSettings).length > 0) {
        cleaned[cleanPluginId] = cleanSettings;
      }
    }

    try {
      await useSettingsStore.getState().update({
        pluginSettings: Object.keys(cleaned).length ? cleaned : undefined,
      });
    } catch (error) {
      setPluginSettingsError(
        error instanceof Error
          ? error.message
          : t("settings.pluginSettings.saveError")
      );
    } finally {
      setIsSavingPluginSettings(false);
    }
  };

  return (
    <WorldMapBackground>
      <div className="relative isolate flex h-screen min-h-0 w-full overflow-auto pt-8 text-primary-txt xl:overflow-hidden">
        <main className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[18rem_minmax(0,1fr)] xl:overflow-hidden">
            <aside className="relative min-h-0 overflow-hidden rounded-sm border border-subtle/75">
            <div className="relative flex h-full min-h-0 flex-col">
              <div className="relative border-b border-subtle bg-panel/50 p-5">
                <div className="absolute right-2 top-0 z-999 h-full w-px bg-accent" />
                <div className="absolute bottom-2 left-4 z-999 h-px w-40 bg-accent" />
                <Hatch />
                <Grid />
                <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-review-txt">
                  {t("settings.nav.global")}
                </p>
                <p className="relative mt-3 text-sm leading-6 text-secondary-txt">
                  {t("settings.header.body")}
                </p>
              </div>

              <div className="space-y-3 px-5 py-5">
                <button
                  type="button"
                  className="group relative inline-flex h-12 w-full items-center gap-3 overflow-hidden rounded-none border border-review-border/35 bg-review-border/8 px-4 font-display text-[11px] font-medium uppercase tracking-[0.3em] text-review-border shadow-[inset_2px_0_0_var(--color-review-border)] transition duration-150 ease-out hover:-translate-y-px"
                >
                  <span className="absolute inset-y-0 left-0 w-3 border-r border-current/12" />
                  <span className="relative z-10 ml-3 flex w-full items-center justify-between gap-4">
                    <span>{t("settings.nav.plugin")}</span>
                    <Icon icon="settings" className="h-4 w-4" />
                  </span>
                </button>
              </div>

            </div>
            </aside>

            <section className="relative min-h-0 overflow-hidden rounded-md border border-subtle bg-canvas/20 backdrop-blur-xs">
            <div className="relative flex min-h-12 items-center justify-between gap-4 border-b border-subtle px-5 py-3">
              <p className="min-w-0 truncate border-b border-b-accent pb-0.5 pr-20 font-mono text-[11px] uppercase tracking-[0.28em] text-review-txt">
                {t("settings.pluginSettings.title")}
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={handleSavePluginSettings}
                disabled={isSavingPluginSettings}
                className="h-8"
              >
                <Icon icon="check" className="h-4 w-4" />
                {isSavingPluginSettings
                  ? t("settings.pluginSettings.saving")
                  : t("settings.pluginSettings.save")}
              </Button>
            </div>

            <div className="relative min-h-0 overflow-y-auto p-5">
              <div className="rounded-sm border border-dashed border-subtle/25 bg-canvas p-5">
                <>
                  <div className="max-w-3xl">
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary-txt">
                      {t("settings.nav.global")} / {t("settings.nav.plugin")}
                    </p>
                    <h2 className="mt-3 text-3xl font-medium uppercase tracking-tight text-primary-txt">
                      {t("settings.pluginSettings.title")}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-body-txt">
                      {t("settings.pluginSettings.body")}
                    </p>
                  </div>

                  {pluginSettingsError && (
                    <div className="mt-5 rounded-sm border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">
                      {pluginSettingsError}
                    </div>
                  )}

                    <div className="mt-6 grid gap-5">
                      <div className="pt-2">
                        <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.24em] text-secondary-txt">
                          {t("settings.pluginSettings.plugin")}
                        </span>
                        <div className="relative h-10 rounded-sm border border-subtle/50 bg-black/30">
                          <Input.AltDropdown
                            label={t("settings.pluginSettings.plugin")}
                            title={t("settings.pluginSettings.plugin")}
                            options={pluginOptions}
                            value={selectedPluginId}
                            disabled={isLoadingPlugins}
                            onValueChange={(value) =>
                              setSelectedPluginId(value || EMPTY_PLUGIN_ID)
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary-txt">
                            {t("settings.pluginSettings.keyValues")}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleAddPluginSetting}
                            className="h-8"
                          >
                            <Icon icon="plus" className="h-4 w-4" />
                            {t("settings.pluginSettings.add")}
                          </Button>
                        </div>

                        {hasPluginSettingRows ? (
                          <div className="space-y-3">
                            {declaredSettings.map((setting) => (
                              <div
                                key={setting.name}
                                className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_2.75rem]"
                              >
                                <div className="min-h-11 rounded-sm border border-subtle/50 bg-black/30 px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-mono text-sm text-primary-txt">
                                      {setting.display_name || setting.name}
                                    </p>
                                    {setting.required && (
                                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-review-border">
                                        {t("settings.pluginSettings.required")}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 font-mono text-[10px] text-muted-txt">
                                    {setting.name}
                                  </p>
                                  {setting.description && (
                                    <p className="mt-2 text-xs leading-5 text-body-txt">
                                      {setting.description}
                                    </p>
                                  )}
                                </div>
                                {String(
                                  setting.setting_type ?? ""
                                ).toLowerCase() === "bool" ? (
                                  <select
                                    value={getSettingValue(setting)}
                                    onInput={(event) =>
                                      handlePluginSettingValueChange(
                                        setting.name,
                                        event.currentTarget.value
                                      )
                                    }
                                    className="h-11 w-full rounded-sm border border-subtle/50 bg-black/30 px-3 font-mono text-sm text-primary-txt outline-none transition focus:border-review-border/35 focus:bg-black/40"
                                  >
                                    <option value="false">false</option>
                                    <option value="true">true</option>
                                  </select>
                                ) : (
                                  <input
                                    type={getSettingInputType(
                                      setting.setting_type
                                    )}
                                    value={getSettingValue(setting)}
                                    onInput={(event) =>
                                      handlePluginSettingValueChange(
                                        setting.name,
                                        event.currentTarget.value
                                      )
                                    }
                                    className="h-11 w-full rounded-sm border border-subtle/50 bg-black/30 px-3 font-mono text-sm text-primary-txt outline-none transition placeholder:text-muted-txt focus:border-review-border/35 focus:bg-black/40"
                                    placeholder={
                                      setting.default_value ||
                                      t(
                                        "settings.pluginSettings.valuePlaceholder"
                                      )
                                    }
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePluginSetting(setting.name)
                                  }
                                  className="grid h-11 w-11 place-items-center rounded-sm border border-subtle bg-black/30 text-reject-text transition-colors hover:border-reject-border/60 hover:bg-reject-border/10 disabled:cursor-not-allowed disabled:opacity-35"
                                  disabled={
                                    !Object.prototype.hasOwnProperty.call(
                                      selectedPluginSettings,
                                      setting.name
                                    )
                                  }
                                  title={t("settings.pluginSettings.remove")}
                                >
                                  <Icon icon="trash" className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            {selectedPluginEntries.map(([key, value]) => (
                              <div
                                key={key}
                                className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_2.75rem]"
                              >
                                <input
                                  type="text"
                                  defaultValue={key}
                                  onBlur={(event) =>
                                    handlePluginSettingKeyChange(
                                      key,
                                      event.currentTarget.value
                                    )
                                  }
                                  className="h-11 w-full rounded-sm border border-subtle/50 bg-black/30 px-3 font-mono text-sm text-primary-txt outline-none transition placeholder:text-muted-txt focus:border-review-border/35 focus:bg-black/40"
                                  placeholder={t(
                                    "settings.pluginSettings.keyPlaceholder"
                                  )}
                                />
                                <input
                                  type="text"
                                  value={value}
                                  onInput={(event) =>
                                    handlePluginSettingValueChange(
                                      key,
                                      event.currentTarget.value
                                    )
                                  }
                                  className="h-11 w-full rounded-sm border border-subtle/50 bg-black/30 px-3 font-mono text-sm text-primary-txt outline-none transition placeholder:text-muted-txt focus:border-review-border/35 focus:bg-black/40"
                                  placeholder={t(
                                    "settings.pluginSettings.valuePlaceholder"
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePluginSetting(key)}
                                  className="grid h-11 w-11 place-items-center rounded-sm border border-subtle bg-black/30 text-reject-text transition-colors hover:border-reject-border/60 hover:bg-reject-border/10"
                                  title={t("settings.pluginSettings.remove")}
                                >
                                  <Icon icon="trash" className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleAddPluginSetting}
                            className="w-full rounded-sm border border-dashed border-subtle/50 bg-canvas px-4 py-8 text-left text-sm text-secondary-txt transition-colors hover:border-review-border/25 hover:text-primary-txt"
                          >
                            {t("settings.pluginSettings.empty")}
                          </button>
                        )}
                      </div>
                    </div>

                  <p className="mt-5 border-t border-dashed border-subtle/50 pt-4 text-xs leading-5 text-body-txt">
                    {t("settings.pluginSettings.footer")}
                  </p>
                </>
              </div>
            </div>
            </section>
          </div>
        </main>
      </div>
    </WorldMapBackground>
  );
}
