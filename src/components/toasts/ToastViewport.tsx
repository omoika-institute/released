import { h } from "preact";
import { ToastContainer, toast, type ToastContainerProps } from "react-toastify";
import InfoToast from "@/components/toasts/InfoToast";

const PERSISTENT_ERROR_TOASTS_KEY = "__omoikaPersistentErrorToastsInstalled";

const toastContainerProps: Partial<ToastContainerProps> = {
  position: "bottom-right",
  autoClose: 3000,
  hideProgressBar: false,
  newestOnTop: false,
  closeOnClick: false,
  rtl: false,
  pauseOnFocusLoss: true,
  draggable: true,
  pauseOnHover: true,
  theme: "dark",
};

function installPersistentErrorToasts(): void {
  const patchedToast = toast as typeof toast & Record<string, any>;
  if (patchedToast[PERSISTENT_ERROR_TOASTS_KEY]) return;
  patchedToast[PERSISTENT_ERROR_TOASTS_KEY] = true;

  const originalError = toast.error.bind(toast);
  const originalInfo = toast.info.bind(toast);
  const originalUpdate = toast.update.bind(toast);

  patchedToast.error = ((content: any, options?: Record<string, any>) =>
    originalError(content, {
      autoClose: false,
      closeButton: true,
      ...options,
    })) as typeof toast.error;

  patchedToast.info = ((content: any, options?: Record<string, any>) =>
    originalInfo(
      typeof content === "string"
        ? h(InfoToast, { message: content })
        : content,
      {
        icon: false,
        ...options,
      },
    )) as typeof toast.info;

  patchedToast.update = ((toastId: any, options?: Record<string, any>) => {
    if (options?.type === "error") {
      return originalUpdate(toastId, {
        autoClose: false,
        closeButton: true,
        ...options,
      });
    }

    return originalUpdate(toastId, options);
  }) as typeof toast.update;
}

installPersistentErrorToasts();

export default function ToastViewport() {
  return <ToastContainer {...toastContainerProps} />;
}
