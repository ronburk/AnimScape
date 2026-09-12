const error_dialog = document.getElementById("error-dialog");
const error_dialog_title = document.getElementById("error-dialog-title");
const error_dialog_message = document.getElementById("error-dialog-message");
const error_dialog_ok = document.getElementById("error-dialog-ok");

function report_error(operation, user_message, cause = null) {
    const detail = cause instanceof Error ? cause.message : String(cause || user_message);
    console.error(operation + " failed: " + detail, cause || user_message);
    const visible_message = detail && detail !== user_message
        ? user_message + "\n\nDetails: " + detail
        : user_message;
    error_dialog_title.textContent = operation + " failed";
    error_dialog_message.textContent = visible_message;
    if (!error_dialog.open) error_dialog.showModal();
    error_dialog_ok.focus();
}
