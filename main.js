const svg_file_button = document.getElementById("svg-file-button");
const status = document.getElementById("status");
let svg_document = null;

async function open_svg_file() {
    try {
        svg_document = await file_io.open_svg();
        draw_svg(svg_document.text);
        status.textContent = "SVG file loaded.";
        svg_file_button.textContent = "Save SVG File";
        svg_file_button.onclick = save_svg_file;
    } catch (error) {
        svg_document = null;
        status.textContent = "Choose an SVG file to begin.";
    }
}

async function save_svg_file() {
    try {
        await file_io.save_svg(svg_document, svg_document.text);
        status.textContent = "SVG file saved.";
    } catch (error) {
        status.textContent = "SVG file loaded.";
    }
}

svg_file_button.onclick = open_svg_file;
