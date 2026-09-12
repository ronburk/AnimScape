function get_export_svg() {
    const svg = document.querySelector("#svg-viewer > svg");
    if (!svg) throw new Error("There is no SVG to export.");
    return svg;
}

function get_export_canvas_size(svg) {
    const view_box = svg.viewBox.baseVal;
    if (view_box.width > 0 && view_box.height > 0) {
        const width = 1024;
        return {width: width, height: Math.max(1, Math.round(width * view_box.height / view_box.width))};
    }
    const rect = svg.getBoundingClientRect();
    return {width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height))};
}

function svg_to_png_blob(svg) {
    const text = new XMLSerializer().serializeToString(svg);
    const source_url = URL.createObjectURL(new Blob([text], {type: "image/svg+xml"}));
    const image = new Image();
    const size = get_export_canvas_size(svg);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");

    return new Promise((resolve, reject) => {
        image.onload = () => {
            try {
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed.")),
                    "image/png");
            } catch (error) {
                reject(error);
            } finally {
                URL.revokeObjectURL(source_url);
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(source_url);
            reject(new Error("The SVG could not be rendered as a PNG."));
        };
        image.src = source_url;
    });
}

async function export_png() {
    const blob = await svg_to_png_blob(get_export_svg());
    const download_url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = download_url;
    link.download = "AnimScape.png";
    link.click();
    URL.revokeObjectURL(download_url);
}
