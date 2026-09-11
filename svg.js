const inkscape_namespace = "http://www.inkscape.org/namespaces/inkscape";
const animscape_namespace = "https://animscape.example/ns";
const default_keyframe_duration = 1.0;
const xmlns_namespace = "http://www.w3.org/2000/xmlns/";
const object_id_attribute = "object-id";

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
    if (!svg.hasAttributeNS(xmlns_namespace, "animscape"))
        svg.setAttributeNS(xmlns_namespace, "xmlns:animscape", animscape_namespace);
    layer.setAttributeNS(animscape_namespace, "animscape:duration", String(duration));
}

function get_animscape_object_id(element) {
    return element.getAttributeNS(animscape_namespace, object_id_attribute);
}

function get_animscape_objects(layer) {
    const objects = [];
    function visit(element) {
        Array.from(element.childNodes).forEach(child => {
            if (child.nodeType !== 1) return;
            if (child.localName !== "g" && child.localName !== "defs" &&
                child.localName !== "title" && child.localName !== "desc")
                objects.push(child);
            visit(child);
        });
    }
    visit(layer);
    return objects;
}

function interpolate_number_attribute(current, next, name, progress) {
    const current_value = Number.parseFloat(current.getAttribute(name));
    const next_value = Number.parseFloat(next.getAttribute(name));
    if (Number.isFinite(current_value) && Number.isFinite(next_value)) {
        current.setAttribute(name, String(current_value + (next_value - current_value) * progress));
    }
}

function interpolate_transform(current, next, progress) {
    const current_transform = current.getAttribute("transform");
    const next_transform = next.getAttribute("transform");
    if (current_transform === null || next_transform === null) return;
    const number_pattern = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
    const current_numbers = current_transform.match(number_pattern) || [];
    const next_numbers = next_transform.match(number_pattern) || [];
    const current_shape = current_transform.replace(number_pattern, "#").replace(/\s+/g, " ");
    const next_shape = next_transform.replace(number_pattern, "#").replace(/\s+/g, " ");
    if (current_numbers.length !== next_numbers.length || current_shape !== next_shape) return;
    let number_index = 0;
    current.setAttribute("transform", current_transform.replace(number_pattern, () => {
        const value = Number(current_numbers[number_index]) +
            (Number(next_numbers[number_index]) - Number(current_numbers[number_index])) * progress;
        ++number_index;
        return String(value);
    }));
}

function set_effective_opacity(element, opacity) {
    const original = Number.parseFloat(element.getAttribute("opacity"));
    const base = Number.isFinite(original) ? original : 1;
    element.style.opacity = String(base * opacity);
}

function interpolate_animscape_object(current, next, progress) {
    ["x", "y", "cx", "cy", "width", "height"].forEach(name =>
        interpolate_number_attribute(current, next, name, progress));
    interpolate_number_attribute(current, next, "opacity", progress);
    interpolate_transform(current, next, progress);
}

function show_keyframe_transition(svg_document, current_index, next_index, progress) {
    const copy = svg_document.documentElement.cloneNode(true);
    const layers = get_keyframe_layers({documentElement: copy});
    layers.forEach((layer, index) => {
        if (index !== current_index && index !== next_index) layer.style.display = "none";
    });
    const current_objects = new Map(get_animscape_objects(layers[current_index])
        .map(element => [get_animscape_object_id(element), element]));
    const next_objects = new Map(get_animscape_objects(layers[next_index])
        .map(element => [get_animscape_object_id(element), element]));
    current_objects.forEach((current, object_id) => {
        const next = next_objects.get(object_id);
        if (next) {
            interpolate_animscape_object(current, next, progress);
            next.style.display = "none";
        } else {
            set_effective_opacity(current, 1 - progress);
        }
    });
    next_objects.forEach((next, object_id) => {
        if (!current_objects.has(object_id)) set_effective_opacity(next, progress);
    });
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
        copy.setAttribute("width", "60");
        copy.setAttribute("height", "38");
        copy.setAttribute("preserveAspectRatio", "xMidYMid meet");
        button.append(document.importNode(copy, true));
        const label = document.createElement("span");
        label.className = "keyframe-thumbnail-label";
        label.textContent = layer.getAttributeNS(inkscape_namespace, "label") || "Keyframe " + (index + 1);
        button.append(label);
        const duration = document.createElement("span");
        duration.className = "keyframe-thumbnail-duration";
        duration.textContent = index + 1 < layers.length ? get_keyframe_duration(layer) + "s" : "end";
        button.append(duration);
        button.onclick = () => select_keyframe(index);
        keyframe_list.append(button);
    });
}

function next_keyframe_label(layers) {
    let number = 0;
    layers.forEach(layer => {
        const match = /^Keyframe ([0-9]+)$/.exec(
            layer.getAttributeNS(inkscape_namespace, "label") || "");
        if (match) number = Math.max(number, Number(match[1]));
    });
    return "Keyframe " + (number + 1);
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
    if (!svg.hasAttributeNS(xmlns_namespace, "animscape"))
        svg.setAttributeNS(xmlns_namespace, "xmlns:animscape", animscape_namespace);
    const source = layers[selected_index];
    if (!source) throw new Error("Invalid keyframe selection.");
    const used_object_ids = new Set(get_animscape_objects(svg).map(get_animscape_object_id));
    let next_object_number = 1;
    get_animscape_objects(svg).forEach(element => {
        if (get_animscape_object_id(element)) return;
        let object_id;
        do { object_id = "object-" + next_object_number++; }
        while (used_object_ids.has(object_id));
        element.setAttributeNS(animscape_namespace, "animscape:object-id", object_id);
        used_object_ids.add(object_id);
    });
    const copy = source.cloneNode(true);
    let number = layers.length + 1;
    let layer_id;
    const used_ids = new Set(Array.from(svg.querySelectorAll("[id]")).map(element => element.id));
    do { layer_id = "animscape-keyframe-" + number++; }
    while (used_ids.has(layer_id));
    copy.setAttribute("id", layer_id);
    const id_map = new Map();
    copy.querySelectorAll("[id]").forEach(element => {
        const old_id = element.id;
        let new_id = old_id + "-copy";
        let copy_number = 2;
        while (used_ids.has(new_id)) new_id = old_id + "-copy-" + copy_number++;
        id_map.set(old_id, new_id);
        element.setAttribute("id", new_id);
        used_ids.add(new_id);
    });
    copy.querySelectorAll("*").forEach(element => {
        Array.from(element.attributes).forEach(attribute => {
            let value = attribute.value.replace(/url\(#([^)]*)\)/g,
                (match, id) => id_map.has(id) ? "url(#" + id_map.get(id) + ")" : match);
            value = value.replace(/^#(.+)$/, (match, id) =>
                id_map.has(id) ? "#" + id_map.get(id) : match);
            if (value !== attribute.value) element.setAttribute(attribute.name, value);
        });
    });
    copy.setAttributeNS(inkscape_namespace, "inkscape:label", next_keyframe_label(layers));
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
