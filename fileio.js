/*
 * Minimal file access for the SVG currently being edited.
 *
 * The browser owns the permission prompt.  The selected workspace handle is
 * persisted in IndexedDB so it can be reused by later sessions.
 */

window.file_io = (() => {
    let workspace_handle = null;
    const workspace_database_name = "animscape";
    const workspace_store_name = "settings";
    const workspace_key = "workspace";

    function same_file_state(a, b) {
        return a.last_modified === b.last_modified && a.size === b.size;
    }

    function load_saved_workspace() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(workspace_database_name, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(workspace_store_name);
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const get = database.transaction(workspace_store_name, "readonly")
                    .objectStore(workspace_store_name).get(workspace_key);
                get.onerror = () => reject(get.error);
                get.onsuccess = () => {
                    workspace_handle = get.result || null;
                    database.close();
                    resolve(workspace_handle);
                };
            };
        });
    }

    function save_workspace(handle) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(workspace_database_name, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const put = database.transaction(workspace_store_name, "readwrite")
                    .objectStore(workspace_store_name).put(handle, workspace_key);
                put.onerror = () => reject(put.error);
                put.onsuccess = () => {
                    database.close();
                    resolve();
                };
            };
        });
    }

    async function choose_workspace() {
        if (!workspace_handle) {
            await load_saved_workspace();
        }
        if (!workspace_handle) {
            workspace_handle = await window.showDirectoryPicker({
                mode: "readwrite"
            });
            await save_workspace(workspace_handle);
        }

        let permission = await workspace_handle.queryPermission({
            mode: "readwrite"
        });
        if (permission !== "granted") {
            permission = await workspace_handle.requestPermission({
                mode: "readwrite"
            });
        }
        if (permission !== "granted") {
            throw new DOMException("Workspace permission was not granted.",
                                   "NotAllowedError");
        }
    }

    async function list_svg_files() {
        await choose_workspace();
        const files = [];
        for await (const entry of workspace_handle.values()) {
            if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".svg"))
                files.push(entry);
        }
        files.sort((a, b) => a.name.localeCompare(b.name));
        if (files.length === 0) {
            const error = new Error("The selected directory contains no SVG files.");
            error.code = "no-svg-files";
            throw error;
        }
        return files;
    }

    async function open_svg(file_handle) {
        if (!file_handle || file_handle.kind !== "file")
            throw new TypeError("open_svg() requires an SVG file handle.");
        await choose_workspace();
        const file = await file_handle.getFile();

        return {
            file_handle: file_handle,
            workspace_handle: workspace_handle,
            text: await file.text(),
            state: {
                last_modified: file.lastModified,
                size: file.size
            }
        };
    }

    async function save_svg(document, edited_text) {
        if (!document || !document.file_handle || !document.state) {
            throw new TypeError("save_svg() requires a document returned by open_svg().");
        }
        if (typeof edited_text !== "string") {
            throw new TypeError("save_svg() requires SVG text.");
        }

        await choose_workspace();

        const file = await document.file_handle.getFile();
        const current_state = {
            last_modified: file.lastModified,
            size: file.size
        };
        if (!same_file_state(document.state, current_state)) {
            throw new Error("SVG changed on disk since it was opened.");
        }

        const writable = await document.file_handle.createWritable();
        try {
            await writable.write(edited_text);
            await writable.close();
        } catch (error) {
            await writable.abort();
            throw error;
        }

        const saved_file = await document.file_handle.getFile();
        document.text = edited_text;
        document.state = {
            last_modified: saved_file.lastModified,
            size: saved_file.size
        };
    }

    async function create_webm(filename) {
        await choose_workspace();
        const file_handle = await workspace_handle.getFileHandle(filename, {
            create: true
        });
        const writable = await file_handle.createWritable();
        return {
            write: chunk => writable.write(chunk),
            close: () => writable.close(),
            abort: () => writable.abort()
        };
    }

    return Object.freeze({
        list_svg_files: list_svg_files,
        open_svg: open_svg,
        save_svg: save_svg,
        create_webm: create_webm
    });
})();
