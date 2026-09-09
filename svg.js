const inkscape_namespace = "http://www.inkscape.org/namespaces/inkscape";
const animscape_namespace = "https://animscape.example/ns";
const default_keyframe_duration = 1.0;

function parse_svg(svg_text) {
    const parsed = new DOMParser().parseFromString(svg_text, "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg")
        throw new Error("The selected file is not valid SVG.");
    return parsed;
}

function get_keyframe_layers(svg_document) {
    return Array.from(svg_document.documentElement.children).filter(element =>
        element.localName === "g" &&
        element.getAttributeNS(inkscape_namespace, "groupmode") === "layer");
}

function hide_other_layers(svg_root, selected_index) {
    get_keyframe_layers({documentElement: svg_root}).forEach((layer, index) => {
        if (index !== selected_index) layer.style.display = "none";
    });
}

function serialize_display_svg(svg_root) {
    svg_root.setAttribute("width", "100%");
    svg_root.setAttribute("height", "100%");
    svg_root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return new XMLSerializer().serializeToString(svg_root);
}

function show_keyframe(svg_document, index) {
    const copy = svg_document.documentElement.cloneNode(true);
    hide_other_layers(copy, index);
    draw_svg(serialize_display_svg(copy));
}

function get_keyframe_duration(layer) {
    const duration = Number.parseFloat(layer.getAttributeNS(animscape_namespace, "duration"));
    return Number.isFinite(duration) && duration >= 0 ? duration : default_keyframe_duration;
}

function set_keyframe_duration(layer, duration) {
    const svg = layer.ownerDocument.documentElement;
    if (!svg.hasAttributeNS("http://www.w3.org/2000/xmlns/", "animscape"))
        svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:animscape", animscape_namespace);
    layer.setAttributeNS(animscape_namespace, "animscape:duration", String(duration));
}

function show_keyframe_transition(svg_document, current_index, next_index, progress) {
    const copy = svg_document.documentElement.cloneNode(true);
    const layers = get_keyframe_layers({documentElement: copy});
    layers.forEach((layer, index) => {
        if (index !== current_index && index !== next_index) layer.style.display = "none";
    });
    layers[current_index].style.opacity = String(1 - progress);
    layers[next_index].style.opacity = String(progress);
    draw_svg(serialize_display_svg(copy));
}

function render_keyframe_thumbnails(svg_document, selected_index) {
    const layers = get_keyframe_layers(svg_document);
    keyframe_list.replaceChildren();
    layers.forEach((layer, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.keyframeIndex = index;
        button.className = "keyframe-thumbnail" + (index === selected_index ? " selected" : "");
        const copy = svg_document.documentElement.cloneNode(true);
        hide_other_layers(copy, index);
        copy.setAttribute("width", "120");
        copy.setAttribute("height", "75");
        copy.setAttribute("preserveAspectRatio", "xMidYMid meet");
        button.append(document.importNode(copy, true));
        const label = document.createElement("span");
        label.className = "keyframe-thumbnail-label";
        label.textContent = layer.getAttributeNS(inkscape_namespace, "label") || "Keyframe " + (index + 1);
        button.append(label);
        button.onclick = () => {
            stop_playback();
            keyframe_ui.selected_index = index;
            show_keyframe(svg_document, index);
            render_keyframe_thumbnails(svg_document, index);
            update_duration_input();
        };
        keyframe_list.append(button);
    });
}

function draw_svg(svg_text) {
    const parsed = parse_svg(svg_text);
    document.getElementById("svg-viewer").replaceChildren(document.importNode(parsed.documentElement, true));
}

function add_keyframe(svg_text, selected_index) {
    const parsed = parse_svg(svg_text);
    const svg = parsed.documentElement;
    const layers = get_keyframe_layers(parsed);
    if (layers.length === 0) throw new Error("The SVG has no Inkscape layers.");
    if (!svg.hasAttributeNS("http://www.w3.org/2000/xmlns/", "animscape"))
        svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:animscape", animscape_namespace);
    const source = layers[selected_index];
    if (!source) throw new Error("Invalid keyframe selection.");
    const copy = source.cloneNode(true);
    let number = layers.length + 1;
    let layer_id;
    do { layer_id = "animscape-keyframe-" + number++; }
    while (svg.querySelector("#" + CSS.escape(layer_id)));
    copy.setAttribute("id", layer_id);
    copy.setAttributeNS(inkscape_namespace, "inkscape:label", "Keyframe " + (selected_index + 2));
    source.after(copy);
    return new XMLSerializer().serializeToString(parsed);
}

function delete_keyframe(svg_text, selected_index) {
    const parsed = parse_svg(svg_text);
    const layers = get_keyframe_layers(parsed);
    if (layers.length <= 1) throw new Error("Cannot delete the only keyframe.");
    if (!layers[selected_index]) throw new Error("Invalid keyframe selection.");
    layers[selected_index].remove();
    return new XMLSerializer().serializeToString(parsed);
}
