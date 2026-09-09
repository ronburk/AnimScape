function draw_svg(svg_text) {
    const parsed = new DOMParser().parseFromString(svg_text, "image/svg+xml");
    if (parsed.querySelector("parsererror")) {
        throw new Error("The selected file is not valid SVG.");
    }

    const svg = parsed.documentElement;
    if (svg.localName !== "svg") {
        throw new Error("The selected file is not an SVG document.");
    }

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const viewer = document.getElementById("svg-viewer");
    viewer.replaceChildren(document.importNode(svg, true));
}
