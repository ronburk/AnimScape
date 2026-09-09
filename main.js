const svg_file_button = document.getElementById("svg-file-button");
const add_keyframe_button = document.getElementById("add-keyframe-button");
const delete_keyframe_button = document.getElementById("delete-keyframe-button");
const keyframe_panel = document.getElementById("keyframe-panel");
const keyframe_list = document.getElementById("keyframe-list");
let svg_document = null;
const keyframe_ui = { layers: [], selected_index: 0 };

function refresh_keyframe_ui() {
    const parsed = parse_svg(svg_document.text);
    keyframe_ui.layers = get_keyframe_layers(parsed);
    if (keyframe_ui.layers.length === 0) {
        keyframe_panel.hidden = true;
        throw new Error("The SVG has no Inkscape layers.");
    }
    keyframe_ui.selected_index = Math.min(keyframe_ui.selected_index, keyframe_ui.layers.length - 1);
    show_keyframe(parsed, keyframe_ui.selected_index);
    render_keyframe_thumbnails(parsed, keyframe_ui.selected_index);
    delete_keyframe_button.disabled = keyframe_ui.layers.length <= 1;
    keyframe_panel.hidden = false;
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
        console.error("Open failed: " + error.message);
    }
}

async function save_svg_file() {
    try { await file_io.save_svg(svg_document, svg_document.text); }
    catch (error) { console.error("Save failed: " + error.message); }
}

function create_keyframe() {
    const old_text = svg_document.text;
    const old_index = keyframe_ui.selected_index;
    try {
        svg_document.text = add_keyframe(old_text, old_index);
        keyframe_ui.selected_index = old_index + 1;
        refresh_keyframe_ui();
    } catch (error) {
        svg_document.text = old_text;
        keyframe_ui.selected_index = old_index;
        console.error("Add keyframe failed: " + error.message);
    }
}

function remove_keyframe() {
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
add_keyframe_button.onclick = create_keyframe;
delete_keyframe_button.onclick = remove_keyframe;
