import {
  createPortal,
  PropsWithChildren,
  Ref,
  useEffect,
  useState,
} from "preact/compat";

export interface TransparentModalProps {
  cancelRef: Ref<HTMLDivElement>;
  closeModal: any;
  isOpen: boolean;
}

export default function TransparentModal({
  children,
  isOpen,
  cancelRef,
  closeModal,
}: PropsWithChildren<TransparentModalProps>) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      setTimeout(() => setShouldRender(false), 200);
    }
  }, [isOpen]);

  const handleBackdropClick = () => {
    closeModal();
  };

  useEffect(() => {
    const close = (e) => {
      if (e.keyCode === 27) {
        closeModal();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed z-999 w-screen" ref={cancelRef}>
      {/* Transparent backdrop with click-outside-to-close */}
      <div
        className="fixed inset-0 h-screen w-screen cursor-pointer opacity-0 transition-opacity duration-200 ease-out"
        onClick={handleBackdropClick}
      />

      <div className="pointer-events-none fixed inset-0 z-20 overflow-y-auto">
        <div className="flex min-h-full items-center  text-center justify-center">
          {/* Modal content with animations */}
          <div
            className={`pointer-events-auto relative top-0 w-full max-w-xl transform overflow-hidden rounded-r-xl text-left transition-all duration-200 ease-out ${
              isVisible
                ? "translate-y-0 opacity-100 sm:scale-100"
                : "translate-y-4 opacity-0 sm:scale-90"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
