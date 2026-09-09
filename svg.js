const inkscape_namespace = "http://www.inkscape.org/namespaces/inkscape";
const animscape_namespace = "https://animscape.example/ns";

function parse_svg(svg_text) {
    const parsed = new DOMParser().parseFromString(svg_text, "image/svg+xml");
    if (parsed.querySelector("parsererror") ||
        parsed.documentElement.localName !== "svg") {
        throw new Error("The selected file is not valid SVG.");
    }
    return parsed;
}

function draw_svg(svg_text) {
    const parsed = parse_svg(svg_text);
    const svg = parsed.documentElement;
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const viewer = document.getElementById("svg-viewer");
    viewer.replaceChildren(document.importNode(svg, true));
}

function add_keyframe(svg_text) {
    const parsed = parse_svg(svg_text);
    const svg = parsed.documentElement;
    if (!svg.hasAttribute("xmlns:animscape")) {
        svg.setAttribute("xmlns:animscape", animscape_namespace);
    }

    const layers = Array.from(svg.children).filter(element =>
        element.localName === "g" &&
        element.getAttributeNS(inkscape_namespace, "groupmode") === "layer");
    if (layers.length === 0) {
        throw new Error("The SVG has no Inkscape layers.");
    }

    const source = layers[layers.length - 1];
    const copy = source.cloneNode(true);
    let number = layers.length + 1;
    let layer_id;
    do {
        layer_id = "animscape-keyframe-" + number++;
    } while (svg.querySelector("#" + CSS.escape(layer_id)));

    copy.setAttribute("id", layer_id);
    copy.setAttributeNS(inkscape_namespace, "inkscape:label",
                        "Keyframe " + layers.length);
    svg.appendChild(copy);

    return new XMLSerializer().serializeToString(parsed);
}
