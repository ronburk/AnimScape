window.menu_ui = (() => {
    const menus = Array.from(document.querySelectorAll("#menu-bar .menu"));

    function close_menu() {
        menus.forEach(menu => {
            menu.querySelector(".menu-popup").hidden = true;
            menu.querySelector(".menu-button").setAttribute("aria-expanded", "false");
        });
    }

    function open_menu(menu) {
        close_menu();
        const menu_popup = menu.querySelector(".menu-popup");
        const menu_button = menu.querySelector(".menu-button");
        menu_popup.hidden = false;
        menu_button.setAttribute("aria-expanded", "true");
        menu_popup.querySelector("[role=menuitem]:not(:disabled)")?.focus();
    }

    menus.forEach(menu => {
        const menu_button = menu.querySelector(".menu-button");
        const menu_popup = menu.querySelector(".menu-popup");
        menu_button.onclick = () => {
            if (menu_popup.hidden) open_menu(menu);
            else close_menu();
        };
        menu_button.onkeydown = event => {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                open_menu(menu);
            } else if (event.key === "Escape") {
                close_menu();
            }
        };
        menu_popup.addEventListener("click", event => {
            const item = event.target.closest("[data-menu-action]");
            if (!item || item.disabled) return;
            event.preventDefault();
            event.stopPropagation();
            close_menu();
            document.dispatchEvent(new CustomEvent("menu-action", {
                detail: item.dataset.menuAction
            }));
        }, true);
    });

    document.addEventListener("click", event => {
        if (!event.target.closest("#menu-bar")) close_menu();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") close_menu();
    });

    return Object.freeze({close: close_menu});
})();
