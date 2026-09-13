window.main_ui = (() => {
const save_svg_button = document.getElementById("save-svg-button");
const export_png_button = document.getElementById("export-png-button");
const export_webm_button = document.getElementById("export-webm-button");
const undo_button = document.getElementById("undo-button");
const redo_button = document.getElementById("redo-button");
const delete_keyframe_button = document.getElementById("delete-keyframe-button");
const keyframe_panel = document.getElementById("keyframe-panel");
const open_svg_dialog = document.getElementById("open-svg-dialog");
const svg_file_selection = document.getElementById("svg-file-selection");
const svg_file_list = document.getElementById("svg-file-list");
const open_selected_svg_button = document.getElementById("open-selected-svg-button");
const keyframe_list = document.getElementById("keyframe-list");
const previous_keyframe_button = document.getElementById("previous-keyframe-button");
const play_button = document.getElementById("play-button");
const next_keyframe_button = document.getElementById("next-keyframe-button");
const duration_input = document.getElementById("duration-input");
const timeline_zoom_out_button = document.getElementById("timeline-zoom-out-button");
const timeline_zoom_in_button = document.getElementById("timeline-zoom-in-button");
const timeline_fit_button = document.getElementById("timeline-fit-button");
const timeline_viewport = document.getElementById("timeline-viewport");
const timeline_content = document.getElementById("timeline-content");
const timeline_track = document.getElementById("timeline-track");
const gallery_viewport = document.getElementById("gallery-viewport");
let svg_document = null;
let svg_choices = [];
let history_navigation_busy = false;
const keyframe_ui = { layers: [], selected_index: 0 };
const playback = {
    running: false,
    frame_index: 0,
    transition_start: null,
    animation_frame: null,
    progress: 0,
    last_now: null
};

function update_duration_input() {
    if (keyframe_ui.layers.length === 0) return;
    duration_input.value = String(get_keyframe_duration(keyframe_ui.layers[keyframe_ui.selected_index]));
}

function stop_playback() {
    if (playback.running && svg_document) {
        const duration = get_keyframe_duration(keyframe_ui.layers[playback.frame_index]);
        playback.progress = duration === 0 ? 1 : Math.min(1, Math.max(0,
            (playback.last_now - playback.transition_start) / (duration * 1000)));
    }
    if (playback.animation_frame !== null) cancelAnimationFrame(playback.animation_frame);
    playback.running = false;
    playback.animation_frame = null;
    play_button.textContent = "Play";
}

function render_playback_frame(now) {
    if (!playback.running) return;
    const current = playback.frame_index;
    const next = current + 1;
    const duration = get_keyframe_duration(keyframe_ui.layers[current]);
    if (playback.transition_start === null)
        playback.transition_start = now - playback.progress * duration * 1000;
    const progress = duration === 0 ? 1 : Math.min(1,
        Math.max(0, (now - playback.transition_start) / (duration * 1000)));
    playback.last_now = now;
    playback.progress = progress;
    show_keyframe_transition(parse_svg(svg_document.text), current, next, progress);
    if (progress >= 1) {
        playback.frame_index = next;
        keyframe_ui.selected_index = next;
        playback.progress = 0;
        render_keyframe_thumbnails(parse_svg(svg_document.text), next);
        update_duration_input();
        if (next >= keyframe_ui.layers.length - 1) {
            stop_playback();
            show_keyframe(parse_svg(svg_document.text), next);
            return;
        }
        playback.transition_start = now;
    }
    playback.animation_frame = requestAnimationFrame(render_playback_frame);
}

function start_playback() {
    if (keyframe_ui.layers.length < 2 || keyframe_ui.selected_index >= keyframe_ui.layers.length - 1) {
        return;
    }
    playback.frame_index = keyframe_ui.selected_index;
    playback.transition_start = null;
    playback.last_now = null;
    playback.running = true;
    play_button.textContent = "Pause";
    playback.animation_frame = requestAnimationFrame(render_playback_frame);
}

function toggle_playback() {
    if (playback.running) stop_playback();
    else start_playback();
}

function select_keyframe(index) {
    stop_playback();
    keyframe_ui.selected_index = Math.max(0, Math.min(index, keyframe_ui.layers.length - 1));
    playback.frame_index = keyframe_ui.selected_index;
    playback.progress = 0;
    playback.transition_start = null;
    playback.last_now = null;
    refresh_keyframe_ui();
    scroll_timeline_to_keyframe(parse_svg(svg_document.text), keyframe_ui.selected_index);
    keyframe_list.querySelectorAll(".keyframe-thumbnail")[keyframe_ui.selected_index].focus();
}

function change_duration() {
    if (!svg_document || history_navigation_busy || keyframe_ui.layers.length === 0) return;
    const duration = Number.parseFloat(duration_input.value);
    if (!Number.isFinite(duration) || duration < 0) {
        update_duration_input();
        return;
    }
    stop_playback();
    const parsed = parse_svg(svg_document.text);
    const layer = get_keyframe_layers(parsed)[keyframe_ui.selected_index];
    if (get_keyframe_duration(layer) === duration) return;
    set_keyframe_duration(layer, duration);
    svg_document.text = new XMLSerializer().serializeToString(parsed);
    record_document_edit("Change keyframe duration");
    refresh_keyframe_ui();
}

function record_document_edit(operation) {
    void history_io.record(operation, svg_document.text).catch(error =>
        error_ui.report("History", "The edit could not be added to the history file.", error));
}

function update_history_menu() {
    const state = history_io.state();
    undo_button.disabled = history_navigation_busy || !svg_document || !state.can_undo;
    redo_button.disabled = history_navigation_busy || !svg_document || !state.can_redo;
    const undo_label = state.undo_operation ? "Undo " + state.undo_operation : "Undo";
    const redo_label = state.redo_operation ? "Redo " + state.redo_operation : "Redo";
    undo_button.textContent = undo_label;
    redo_button.textContent = redo_label;
    undo_button.setAttribute("aria-label", undo_label);
    redo_button.setAttribute("aria-label", redo_label);
    undo_button.title = state.undo_operation ? undo_label + " (Ctrl+Z)" : "Ctrl+Z";
    redo_button.title = state.redo_operation
        ? redo_label + " (Ctrl+Y or Ctrl+Shift+Z)" : "Ctrl+Y or Ctrl+Shift+Z";
}

async function navigate_history(direction) {
    const state = history_io.state();
    if (!svg_document || history_navigation_busy ||
        !(direction < 0 ? state.can_undo : state.can_redo)) return;
    stop_playback();
    history_navigation_busy = true;
    update_history_menu();
    try {
        const text = await (direction < 0 ? history_io.undo() : history_io.redo());
        if (text !== null) {
            svg_document.text = text;
            refresh_keyframe_ui();
        }
    } catch (error) {
        error_ui.report(direction < 0 ? "Undo" : "Redo",
            "The history state could not be restored.", error);
    } finally {
        history_navigation_busy = false;
        update_history_menu();
    }
}

document.addEventListener("history-change", update_history_menu);

function refresh_keyframe_ui() {
    const parsed = parse_svg(svg_document.text);
    keyframe_ui.layers = get_keyframe_layers(parsed);
    if (keyframe_ui.layers.length === 0) {
        keyframe_panel.hidden = true;
        throw new Error("The SVG has no Inkscape layers.");
    }
    keyframe_ui.selected_index = Math.min(keyframe_ui.selected_index, keyframe_ui.layers.length - 1);
    playback.frame_index = keyframe_ui.selected_index;
    playback.progress = 0;
    keyframe_panel.hidden = false;
    show_keyframe(parsed, keyframe_ui.selected_index);
    render_keyframe_thumbnails(parsed, keyframe_ui.selected_index);
    update_duration_input();
    delete_keyframe_button.disabled = keyframe_ui.layers.length <= 1;
    save_svg_button.disabled = false;
    export_png_button.disabled = false;
    export_webm_button.disabled = false;
    resize_svg_page();
}

function reset_open_controls() {
    svg_document = null;
    update_history_menu();
    timeline_view.start_time = 0;
    timeline_view.pixels_per_second = default_timeline_scale;
    clear_svg();
    keyframe_panel.hidden = true;
    if (open_svg_dialog.open) open_svg_dialog.close();
    save_svg_button.disabled = true;
    export_png_button.disabled = true;
    export_webm_button.disabled = true;
    svg_file_selection.hidden = true;
    open_selected_svg_button.hidden = true;
    svg_choices = [];
}

function report_open_error(error) {
    reset_open_controls();
    const user_message = error.code === "history-format"
        ? "The SVG's history file is from an older AnimScape version. Back up and remove the matching .hst file, then try opening the SVG again."
        : error.code === "no-svg-files"
            ? error.message
            : error.message === "The selected file is not valid SVG."
                ? error.message
                : "The selected SVG could not be opened.";
    error_ui.report("Open", user_message, error);
}

async function choose_svg_file() {
    if (history_navigation_busy) return;
    try {
        svg_choices = await file_io.list_svg_files();
        svg_file_list.replaceChildren();
        svg_choices.forEach((file_handle, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = file_handle.name;
            svg_file_list.append(option);
        });
        svg_file_selection.hidden = false;
        open_selected_svg_button.hidden = false;
        open_svg_dialog.showModal();
        svg_file_list.focus();
    } catch (error) {
        report_open_error(error);
    }
}

async function choose_svg_directory() {
    if (history_navigation_busy) return;
    try {
        svg_choices = await file_io.open_directory();
        svg_file_list.replaceChildren();
        svg_choices.forEach((file_handle, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = file_handle.name;
            svg_file_list.append(option);
        });
        svg_file_selection.hidden = false;
        open_selected_svg_button.hidden = false;
        open_svg_dialog.showModal();
        svg_file_list.focus();
    } catch (error) {
        report_open_error(error);
    }
}

async function open_selected_svg() {
    if (history_navigation_busy) return;
    const file_handle = svg_choices[Number(svg_file_list.value)];
    if (!file_handle) {
        error_ui.report("Open", "Select an SVG file first.");
        return;
    }
    try {
        const opened = await file_io.open_svg(file_handle);
        svg_document = opened;
        await history_io.open(opened);
        timeline_view.start_time = 0;
        timeline_view.pixels_per_second = default_timeline_scale;
        keyframe_ui.selected_index = 0;
        refresh_keyframe_ui();
        update_history_menu();
        open_svg_dialog.close();
    } catch (error) {
        report_open_error(error);
    }
}

async function save_svg_file() {
    try { await file_io.save_svg(svg_document, svg_document.text); }
    catch (error) {
        error_ui.report("Save", "The SVG could not be saved. Check that it is still accessible and try again.", error);
    }
}

function create_keyframe_at_time(time) {
    if (history_navigation_busy) return;
    stop_playback();
    const old_text = svg_document.text;
    try {
        const result = add_keyframe_at_time(old_text, time);
        if (result.existing_index !== undefined) {
            keyframe_ui.selected_index = result.existing_index;
        } else {
            svg_document.text = result.text;
            record_document_edit("Add keyframe");
            keyframe_ui.selected_index = result.index;
        }
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        error_ui.report("Add keyframe", "The new keyframe could not be added.", error);
    }
}

function create_keyframe() {
    if (history_navigation_busy) return;
    stop_playback();
    const old_text = svg_document.text;
    const old_index = keyframe_ui.selected_index;
    try {
        svg_document.text = add_keyframe(old_text, old_index);
        record_document_edit("Duplicate keyframe");
        keyframe_ui.selected_index = old_index + 1;
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        error_ui.report("Duplicate keyframe", "The keyframe could not be duplicated.", error);
    }
}

function remove_keyframe() {
    if (history_navigation_busy) return;
    stop_playback();
    const old_text = svg_document.text;
    const old_index = keyframe_ui.selected_index;
    try {
        svg_document.text = delete_keyframe(old_text, old_index);
        record_document_edit("Delete keyframe");
        keyframe_ui.selected_index = Math.max(0, old_index - 1);
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        error_ui.report("Delete keyframe", "The keyframe could not be deleted.", error);
    }
}

open_selected_svg_button.onclick = open_selected_svg;
export_png_button.onclick = async () => {
    export_png_button.disabled = true;
    try { await render_io.export_png(); }
    catch (error) { error_ui.report("Export PNG", "The current image could not be exported as a PNG.", error); }
    finally { export_png_button.disabled = false; }
};
export_webm_button.onclick = async () => {
    export_webm_button.disabled = true;
    try {
        await render_io.export_webm({}, {
            on_progress: progress => {
                export_webm_button.textContent = "Render WebM " + Math.round(progress * 100) + "%";
            }
        });
    } catch (error) {
        error_ui.report("Render WebM", "The animation could not be rendered as a WebM video.", error);
    } finally {
        export_webm_button.textContent = "Render WebM";
        export_webm_button.disabled = false;
    }
};
document.addEventListener("menu-action", event => {
    if (event.detail === "open-svg") void choose_svg_file();
    else if (event.detail === "open-directory") void choose_svg_directory();
    else if (event.detail === "save-svg") void save_svg_file();
    else if (event.detail === "export-png") export_png_button.click();
    else if (event.detail === "export-webm") export_webm_button.click();
    else if (event.detail === "undo") void navigate_history(-1);
    else if (event.detail === "redo") void navigate_history(1);
});
delete_keyframe_button.onclick = remove_keyframe;
previous_keyframe_button.onclick = () => select_keyframe(keyframe_ui.selected_index - 1);
next_keyframe_button.onclick = () => select_keyframe(keyframe_ui.selected_index + 1);
play_button.onclick = toggle_playback;
duration_input.oninput = change_duration;
timeline_zoom_out_button.onclick = () => set_timeline_zoom(timeline_view.pixels_per_second / 1.5);
timeline_zoom_in_button.onclick = () => set_timeline_zoom(timeline_view.pixels_per_second * 1.5);
timeline_fit_button.onclick = fit_timeline;
timeline_track.onclick = event => {
    if (timeline_pan.suppress_click) {
        timeline_pan.suppress_click = false;
        return;
    }
    const rect = timeline_track.getBoundingClientRect();
    const time = Math.max(0, timeline_view.start_time +
        (event.clientX - rect.left) / timeline_view.pixels_per_second);
    create_keyframe_at_time(time);
};

const timeline_pan = { pointer_id: null, last_x: 0, moved: false, active: false, suppress_click: false };
timeline_viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.button !== 1) return;
    timeline_pan.pointer_id = event.pointerId;
    timeline_pan.last_x = event.clientX;
    timeline_pan.moved = false;
    timeline_pan.active = event.button === 1 || event.shiftKey;
    if (timeline_pan.active) {
        event.preventDefault();
        timeline_viewport.classList.add("panning");
        timeline_viewport.setPointerCapture(event.pointerId);
    }
});
timeline_viewport.addEventListener("pointermove", event => {
    if (event.pointerId !== timeline_pan.pointer_id) return;
    const delta = event.clientX - timeline_pan.last_x;
    if (!timeline_pan.active && Math.abs(delta) >= 4) {
        timeline_pan.active = true;
        timeline_pan.moved = true;
        timeline_viewport.classList.add("panning");
        timeline_viewport.setPointerCapture(event.pointerId);
    }
    if (!timeline_pan.active) return;
    if (Math.abs(delta) > 0) timeline_pan.moved = true;
    event.preventDefault();
    timeline_pan.last_x = event.clientX;
    pan_timeline(-delta);
});
function end_timeline_pan(event) {
    if (event.pointerId !== timeline_pan.pointer_id) return;
    timeline_pan.suppress_click = timeline_pan.active && timeline_pan.moved;
    timeline_pan.pointer_id = null;
    timeline_pan.active = false;
    timeline_viewport.classList.remove("panning");
    if (timeline_viewport.hasPointerCapture(event.pointerId))
        timeline_viewport.releasePointerCapture(event.pointerId);
}
timeline_viewport.addEventListener("pointerup", end_timeline_pan);
timeline_viewport.addEventListener("pointercancel", end_timeline_pan);
timeline_viewport.addEventListener("wheel", event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
        const rect = timeline_viewport.getBoundingClientRect();
        const x = event.clientX - rect.left -
            Number.parseFloat(getComputedStyle(timeline_viewport).paddingLeft);
        set_timeline_zoom(timeline_view.pixels_per_second *
            (event.deltaY < 0 ? 1.15 : 1 / 1.15), x);
        return;
    }
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    pan_timeline(delta);
}, {passive: false});

window.addEventListener("resize", () => {
    resize_svg_page();
    render_timeline();
});

document.addEventListener("keydown", event => {
    if (event.target === duration_input || event.target.matches("input, textarea, select")) return;
    if (!svg_document || keyframe_ui.layers.length === 0) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey &&
        event.key.toLowerCase() === "z") {
        event.preventDefault();
        void navigate_history(event.shiftKey ? 1 : -1);
    } else if ((event.ctrlKey || event.metaKey) && !event.altKey &&
               event.key.toLowerCase() === "y") {
        event.preventDefault();
        void navigate_history(1);
    } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        select_keyframe(keyframe_ui.selected_index - 1);
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        select_keyframe(keyframe_ui.selected_index + 1);
    } else if (event.code === "Space") {
        event.preventDefault();
        toggle_playback();
    } else if (event.key === "Delete") {
        event.preventDefault();
        remove_keyframe();
    } else if (event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        create_keyframe();
    } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        set_timeline_zoom(timeline_view.pixels_per_second * 1.5);
    } else if (event.key === "-") {
        event.preventDefault();
        set_timeline_zoom(timeline_view.pixels_per_second / 1.5);
    } else if (event.key === "Home") {
        event.preventDefault();
        fit_timeline();
    }
});
function get_svg_document() {
    return svg_document;
}

function get_selected_keyframe_index() {
    return keyframe_ui.selected_index;
}

function get_keyframe_card(index) {
    return keyframe_list.querySelectorAll(".keyframe-thumbnail")[index];
}

function get_timeline_elements() {
    return timeline_elements;
}

function is_history_navigation_busy() {
    return history_navigation_busy;
}

function refresh_keyframe_state() {
    keyframe_ui.layers = get_keyframe_layers(parse_svg(svg_document.text));
}

function get_keyframe_state() {
    return keyframe_ui;
}

function get_timeline_view() {
    return timeline_view;
}

const timeline_elements = Object.freeze({
    viewport: timeline_viewport,
    content: timeline_content,
    track: timeline_track,
    gallery_viewport,
    keyframe_list
});

return Object.freeze({
    get_svg_document,
    get_keyframe_state,
    get_timeline_view,
    get_selected_keyframe_index,
    get_keyframe_card,
    get_timeline_elements,
    is_history_navigation_busy,
    stop_playback,
    select_keyframe,
    record_document_edit,
    refresh_keyframe_state
});
})();
