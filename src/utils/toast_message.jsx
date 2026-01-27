import toast from "react-hot-toast";

/**
 * Global confirm toast with loader
 * @param {Object} options
 * @param {string} options.message
 * @param {Function} options.onConfirm (must return a promise)
 * @param {string} options.confirmText
 * @param {string} options.cancelText
 * @param {string} options.loadingText
 * @param {string} options.successText
 * @param {string} options.errorText
 */
export const confirmToast = ({
  message = "Are you sure?",
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  loadingText = "Processing...",
  successText = "Done successfully",
  errorText = "Something went wrong",
}) => {
  toast(
    (t) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span>{message}</span>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={async () => {
              toast.dismiss(t.id);

              const loaderId = toast.loading(loadingText);

              try {
                await onConfirm();
                toast.success(successText, { id: loaderId });
              } catch (error) {
                console.error(error);
                toast.error(errorText, { id: loaderId });
              }
            }}
            style={{
              background: "#ef4444",
              color: "#fff",
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>

          <button
            onClick={() => toast.dismiss(t.id)}
            style={{
              background: "#e5e7eb",
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
        </div>
      </div>
    ),
    { duration: Infinity }
  );
};
