const svg_file_button = document.getElementById("svg-file-button");
const delete_keyframe_button = document.getElementById("delete-keyframe-button");
const keyframe_panel = document.getElementById("keyframe-panel");
const file_controls = document.getElementById("file-controls");
const keyframe_list = document.getElementById("keyframe-list");
const keyframe_controls = document.getElementById("keyframe-controls");
const previous_keyframe_button = document.getElementById("previous-keyframe-button");
const play_button = document.getElementById("play-button");
const next_keyframe_button = document.getElementById("next-keyframe-button");
const duration_input = document.getElementById("duration-input");
const timeline_viewport = document.getElementById("timeline-viewport");
const timeline_scale = 20;
let svg_document = null;
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
    keyframe_list.children[keyframe_ui.selected_index].focus();
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
    file_controls.hidden = true;
}

async function open_svg_file() {
    try {
        const opened = await file_io.open_svg();
        svg_document = opened;
        keyframe_ui.selected_index = 0;
        refresh_keyframe_ui();
        svg_file_button.textContent = "Save";
        svg_file_button.onclick = save_svg_file;
    } catch (error) {
        svg_document = null;
        keyframe_panel.hidden = true;
        file_controls.append(svg_file_button);
        svg_file_button.textContent = "Open";
        svg_file_button.onclick = open_svg_file;
        file_controls.hidden = false;
        console.error("Open failed: " + error.message);
    }
}

async function save_svg_file() {
    try { await file_io.save_svg(svg_document, svg_document.text); }
    catch (error) { console.error("Save failed: " + error.message); }
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
            keyframe_ui.selected_index = result.index;
        }
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        console.error("Add keyframe failed: " + error.message);
    }
}

function remove_keyframe() {
    stop_playback();
    const old_text = svg_document.text;
    const old_index = keyframe_ui.selected_index;
    try {
        svg_document.text = delete_keyframe(old_text, old_index);
        keyframe_ui.selected_index = Math.max(0, old_index - 1);
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        console.error("Delete keyframe failed: " + error.message);
    }
}

svg_file_button.onclick = open_svg_file;
delete_keyframe_button.onclick = remove_keyframe;
previous_keyframe_button.onclick = () => select_keyframe(keyframe_ui.selected_index - 1);
next_keyframe_button.onclick = () => select_keyframe(keyframe_ui.selected_index + 1);
play_button.onclick = toggle_playback;
duration_input.oninput = change_duration;
keyframe_list.onclick = event => {
    if (event.target.closest(".keyframe-thumbnail")) return;
    const time = Math.max(0, (event.offsetX + timeline_viewport.scrollLeft) / timeline_scale);
    if (event.target === keyframe_list || event.target.closest(".timeline-axis"))
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
    }
});
