const svg_file_button = document.getElementById("svg-file-button");
const export_png_button = document.getElementById("export-png-button");
const export_webm_button = document.getElementById("export-webm-button");
const delete_keyframe_button = document.getElementById("delete-keyframe-button");
const keyframe_panel = document.getElementById("keyframe-panel");
const file_controls = document.getElementById("file-controls");
const svg_file_selection = document.getElementById("svg-file-selection");
const svg_file_list = document.getElementById("svg-file-list");
const open_selected_svg_button = document.getElementById("open-selected-svg-button");
const keyframe_list = document.getElementById("keyframe-list");
const keyframe_controls = document.getElementById("keyframe-controls");
const previous_keyframe_button = document.getElementById("previous-keyframe-button");
const play_button = document.getElementById("play-button");
const next_keyframe_button = document.getElementById("next-keyframe-button");
const duration_input = document.getElementById("duration-input");
const timeline_viewport = document.getElementById("timeline-viewport");
const timeline_content = document.getElementById("timeline-content");
const timeline_track = document.getElementById("timeline-track");
const gallery_viewport = document.getElementById("gallery-viewport");
const timeline_scale = 20;
const gallery_card_step = 100;
let svg_document = null;
let svg_choices = [];
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
    keyframe_list.querySelectorAll(".keyframe-thumbnail")[keyframe_ui.selected_index].focus();
}

function change_duration() {
    if (!svg_document || keyframe_ui.layers.length === 0) return;
    const duration = Number.parseFloat(duration_input.value);
    if (!Number.isFinite(duration) || duration < 0) {
        update_duration_input();
        return;
    }
    stop_playback();
    const parsed = parse_svg(svg_document.text);
    set_keyframe_duration(get_keyframe_layers(parsed)[keyframe_ui.selected_index], duration);
    svg_document.text = new XMLSerializer().serializeToString(parsed);
    void history_io.record("Change keyframe duration", svg_document.text);
    refresh_keyframe_ui();
}

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
    show_keyframe(parsed, keyframe_ui.selected_index);
    render_keyframe_thumbnails(parsed, keyframe_ui.selected_index);
    update_duration_input();
    delete_keyframe_button.disabled = keyframe_ui.layers.length <= 1;
    keyframe_panel.hidden = false;
    keyframe_controls.append(svg_file_button);
    keyframe_controls.append(export_png_button);
    keyframe_controls.append(export_webm_button);
    export_png_button.disabled = false;
    export_webm_button.disabled = false;
    file_controls.hidden = true;
}

function reset_open_controls() {
    svg_document = null;
    keyframe_panel.hidden = true;
    file_controls.append(svg_file_button);
    file_controls.append(export_png_button);
    file_controls.append(export_webm_button);
    export_png_button.disabled = true;
    export_webm_button.disabled = true;
    svg_file_button.textContent = "Open";
    svg_file_button.onclick = choose_svg_file;
    svg_file_selection.hidden = true;
    open_selected_svg_button.hidden = true;
    svg_choices = [];
    file_controls.hidden = false;
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
    report_error("Open", user_message, error);
}

async function choose_svg_file() {
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
        svg_file_list.focus();
    } catch (error) {
        report_open_error(error);
    }
}

async function open_selected_svg() {
    const file_handle = svg_choices[Number(svg_file_list.value)];
    if (!file_handle) {
        report_error("Open", "Select an SVG file first.");
        return;
    }
    try {
        const opened = await file_io.open_svg(file_handle);
        svg_document = opened;
        await history_io.open(opened);
        keyframe_ui.selected_index = 0;
        refresh_keyframe_ui();
        svg_file_button.textContent = "Save";
        svg_file_button.onclick = save_svg_file;
    } catch (error) {
        report_open_error(error);
    }
}

async function save_svg_file() {
    try { await file_io.save_svg(svg_document, svg_document.text); }
    catch (error) {
        report_error("Save", "The SVG could not be saved. Check that it is still accessible and try again.", error);
    }
}

function create_keyframe_at_time(time) {
    stop_playback();
    const old_text = svg_document.text;
    try {
        const result = add_keyframe_at_time(old_text, time);
        if (result.existing_index !== undefined) {
            keyframe_ui.selected_index = result.existing_index;
        } else {
            svg_document.text = result.text;
            void history_io.record("Add keyframe", svg_document.text);
            keyframe_ui.selected_index = result.index;
        }
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        report_error("Add keyframe", "The new keyframe could not be added.", error);
    }
}

function create_keyframe() {
    stop_playback();
    const old_text = svg_document.text;
    const old_index = keyframe_ui.selected_index;
    try {
        svg_document.text = add_keyframe(old_text, old_index);
        void history_io.record("Duplicate keyframe", svg_document.text);
        keyframe_ui.selected_index = old_index + 1;
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        report_error("Duplicate keyframe", "The keyframe could not be duplicated.", error);
    }
}

function remove_keyframe() {
    stop_playback();
    const old_text = svg_document.text;
    const old_index = keyframe_ui.selected_index;
    try {
        svg_document.text = delete_keyframe(old_text, old_index);
        void history_io.record("Delete keyframe", svg_document.text);
        keyframe_ui.selected_index = Math.max(0, old_index - 1);
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        report_error("Delete keyframe", "The keyframe could not be deleted.", error);
    }
}

svg_file_button.onclick = choose_svg_file;
open_selected_svg_button.onclick = open_selected_svg;
export_png_button.onclick = async () => {
    export_png_button.disabled = true;
    try { await export_png(); }
    catch (error) { report_error("Export PNG", "The current image could not be exported as a PNG.", error); }
    finally { export_png_button.disabled = false; }
};
export_webm_button.onclick = async () => {
    export_webm_button.disabled = true;
    try {
        await export_webm({}, {
            on_progress: progress => {
                export_webm_button.textContent = "Render WebM " + Math.round(progress * 100) + "%";
            }
        });
    } catch (error) {
        report_error("Render WebM", "The animation could not be rendered as a WebM video.", error);
    } finally {
        export_webm_button.textContent = "Render WebM";
        export_webm_button.disabled = false;
    }
};
delete_keyframe_button.onclick = remove_keyframe;
previous_keyframe_button.onclick = () => select_keyframe(keyframe_ui.selected_index - 1);
next_keyframe_button.onclick = () => select_keyframe(keyframe_ui.selected_index + 1);
play_button.onclick = toggle_playback;
duration_input.oninput = change_duration;
timeline_track.onclick = event => {
    const time = Math.max(0, (event.offsetX + timeline_viewport.scrollLeft) / timeline_scale);
    create_keyframe_at_time(time);
};

document.addEventListener("keydown", event => {
    if (event.target === duration_input || event.target.matches("input, textarea, select")) return;
    if (!svg_document || keyframe_ui.layers.length === 0) return;
    if (event.key === "ArrowLeft") {
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
    }
});
