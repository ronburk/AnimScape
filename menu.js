window.menu_ui = (() => {
    const menu_button = document.getElementById("file-menu-button");
    const menu_popup = document.getElementById("file-menu");

    function close_menu() {
        menu_popup.hidden = true;
        menu_button.setAttribute("aria-expanded", "false");
    }

    function open_menu() {
        menu_popup.hidden = false;
        menu_button.setAttribute("aria-expanded", "true");
        menu_popup.querySelector("[role=menuitem]:not(:disabled)").focus();
    }

    menu_button.onclick = () => {
        if (menu_popup.hidden) open_menu();
        else close_menu();
    };

    menu_button.onkeydown = event => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            open_menu();
        } else if (event.key === "Escape") {
            close_menu();
        }
    };

    menu_popup.onclick = event => {
        const item = event.target.closest("[data-menu-action]");
        if (!item || item.disabled) return;
        document.dispatchEvent(new CustomEvent("menu-action", {
            detail: item.dataset.menuAction
        }));
        close_menu();
    };

    document.addEventListener("click", event => {
        if (!event.target.closest("#menu-bar")) close_menu();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") close_menu();
    });

    return Object.freeze({close: close_menu});
})();
