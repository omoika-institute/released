import { memo, useState } from "preact/compat";
import { Icon } from "@/components/icons";
import { useParams } from "react-router-dom";
import { usePdfViewerStore, useAudioViewerStore } from "@/stores";
import { entitiesApi, type AttachmentItem } from "@/api";
import { useEffect } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

export interface HTMLFileEvent extends Event {
  target: HTMLInputElement & EventTarget;
}

interface FileInputProps {
  id: string;
  label: string;
  value: string;
  icon?: any;
  accept?: string;
}

export function UploadFileInput({
  id,
  value: initialValue,
  label,
  icon,
  accept,
}: FileInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState<File>(initialValue as any);
  const { hid } = useParams();
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { openViewer } = usePdfViewerStore();
  const { openViewer: openAudioViewer } = useAudioViewerStore();

  const fetchAttachments = async () => {
    if (!hid) return;
    try {
      setLoading(true);
      const items = await entitiesApi.listAttachments(String(hid), id);
      setAttachments(items);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [hid, id]);

  const updateValue = (event: HTMLFileEvent) => {
    if (event?.target?.files && event.target.files?.length > 0) {
      const file = event.target.files[0];
      // Optional type filter
      if (accept && file) {
        const okType = file.type === accept;
        const okExt =
          accept === "application/pdf" &&
          file.name.toLowerCase().endsWith(".pdf");
        if (!okType && !okExt) {
          toast.error(t("graph.fileInput.invalidType", { accept }));
          return;
        }
      }
      setValue(file);
      // Upload to API as entity attachment
      const form = new FormData();
      form.append("graph_id", String(hid));
      form.append("entity_id", id);
      form.append("file", file);
      form.append("meta", JSON.stringify({ label }));

      const upload = async () => {
        // TODO: change to IPC calls
        // const resp = await fetch(`${BASE_URL}/entities/attachments`, {
        //   method: "POST",
        //   body: form,
        //   headers: {
        //     Authorization: `Bearer ${access_token}`,
        //   },
        // });
        const resp: any = {};
        if (!resp.ok) {
          const err = await resp
            .json()
            .catch(() => ({ message: t("graph.fileInput.uploadFailed") }));
          throw new Error(err?.message || t("graph.fileInput.uploadFailed"));
        }
        return await resp.json();
      };
      toast
        .promise(upload(), {
          pending: t("graph.fileInput.uploadPending"),
          success: t("graph.fileInput.uploadSuccess"),
          error: t("graph.fileInput.uploadError"),
        })
        .then(() => fetchAttachments())
        .catch(() => {});
    }
  };

  return (
    <>
      <p className="mt-1 font-display text-[0.5rem] font-medium uppercase tracking-[0.22em] text-terminal-txt/60">
        {label}
      </p>
      {/* Existing attachments */}
      <div className="mb-1 w-50">
        {loading ? (
          <div className="font-display text-[10px] uppercase tracking-[0.18em] text-terminal-txt/60">
            {t("graph.fileInput.loadingAttachments")}
          </div>
        ) : attachments.length > 0 ? (
          <ul className="flex w-full flex-col gap-y-1">
            {attachments.map((a) => (
              <li
                key={a.attachment_id}
                className="flex items-center justify-between border border-subtle/50 bg-paper pl-2 font-display text-[10px] uppercase tracking-[0.14em] text-terminal-txt"
              >
                <span className="truncate">{a.filename}</span>
                <span className="shrink-0">
                  {a.media_type === "application/pdf" && (
                    <button
                      title={t("graph.fileInput.previewPdf")}
                      className="group border-l border-subtle/50 px-1.5 py-1 text-primary-txt/55 transition-colors duration-150 hover:bg-panel hover:text-review-border"
                      onClick={() => openViewer(a.attachment_id, a.filename)}
                    >
                      <Icon
                        icon="eye"
                        className="h-3.5 w-3.5 transition-colors duration-150"
                      />
                    </button>
                  )}
                  {a.media_type?.startsWith("audio/") && (
                    <button
                      title={t("graph.fileInput.previewAudio")}
                      className="group border-l border-subtle/50 px-1.5 py-1 text-primary-txt/55 transition-colors duration-150 hover:bg-panel hover:text-review-border"
                      onClick={() =>
                        openAudioViewer(a.attachment_id, a.filename)
                      }
                    >
                      <Icon
                        icon="player-play"
                        className="h-3.5 w-3.5 transition-colors duration-150"
                      />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="font-display text-[10px] uppercase tracking-[0.18em] text-terminal-txt/50">
            {t("graph.fileInput.noAttachments")}
          </div>
        )}
      </div>
      <div className="node-field relative flex w-full items-center justify-between pl-0.5">
        <Icon
          icon={icon || "file-upload"}
          className="pointer-events-none absolute right-1 h-4 w-4 text-primary-txt/45"
        />
        <label
          for={`${id}-${label}`}
          className="ml-0.5 w-full py-0.5 text-xs text-terminal-txt"
        >
          <input
            name={label}
            data-label={label}
            id={`${id}-${label}`}
            type="file"
            accept={accept}
            className="nodrag w-full py-[3px] pr-5 pl-1 font-display text-[10px] uppercase tracking-[0.16em] text-inherit transition-colors duration-100 ease-in file:mr-2 file:border-0 file:bg-panel file:px-2 file:py-0.5 file:font-display file:text-[9px] file:uppercase file:tracking-[0.16em] file:text-primary-txt hover:file:text-review-border focus:ring-0 focus:outline-hidden"
            onChange={(event: any) => updateValue(event)}
          />
          {value?.name ? value.name : label}
        </label>
      </div>
    </>
  );
}

export default memo(UploadFileInput);
