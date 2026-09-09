const svg_file_button = document.getElementById("svg-file-button");
const keyframe_button = document.getElementById("keyframe-button");
const status = document.getElementById("status");
let svg_document = null;

async function open_svg_file() {
    try {
        svg_document = await file_io.open_svg();
        draw_svg(svg_document.text);
        status.textContent = "SVG file loaded.";
        svg_file_button.textContent = "Save SVG File";
        svg_file_button.onclick = save_svg_file;
        keyframe_button.disabled = false;
    } catch (error) {
        svg_document = null;
        keyframe_button.disabled = true;
        status.textContent = "Open failed: " + error.message;
    }
}

async function save_svg_file() {
    try {
        await file_io.save_svg(svg_document, svg_document.text);
        status.textContent = "SVG file saved.";
    } catch (error) {
        status.textContent = "Save failed: " + error.message;
    }
}

function create_keyframe() {
    try {
        svg_document.text = add_keyframe(svg_document.text);
        draw_svg(svg_document.text);
        status.textContent = "Keyframe added.";
    } catch (error) {
        status.textContent = "Add keyframe failed: " + error.message;
    }
}

svg_file_button.onclick = open_svg_file;
keyframe_button.onclick = create_keyframe;
