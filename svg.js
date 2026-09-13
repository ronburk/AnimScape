const inkscape_namespace = "http://www.inkscape.org/namespaces/inkscape";
const animscape_namespace = "https://animscape.example/ns";
const default_keyframe_duration = 1.0;
const default_timeline_scale = 20;
const min_timeline_scale = 4;
const max_timeline_scale = 400;
const xmlns_namespace = "http://www.w3.org/2000/xmlns/";
const object_id_attribute = "object-id";
const timeline_view = { start_time: 0, pixels_per_second: default_timeline_scale };

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

function get_keyframe_svg(svg_document, index) {
    const copy = svg_document.documentElement.cloneNode(true);
    hide_other_layers(copy, index);
    return serialize_display_svg(copy);
}

function show_keyframe(svg_document, index) {
    draw_svg(get_keyframe_svg(svg_document, index));
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

function get_keyframe_transition_svg(svg_document, current_index, next_index, progress) {
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
    return serialize_display_svg(copy);
}

function show_keyframe_transition(svg_document, current_index, next_index, progress) {
    draw_svg(get_keyframe_transition_svg(svg_document, current_index, next_index, progress));
}

function get_animation_duration(svg_document) {
    const layers = get_keyframe_layers(svg_document);
    let duration = 0;
    layers.forEach((layer, index) => {
        if (index + 1 < layers.length) duration += get_keyframe_duration(layer);
    });
    return duration;
}

function get_keyframe_times(svg_document) {
    const times = [];
    let time = 0;
    get_keyframe_layers(svg_document).forEach((layer, index, layers) => {
        times.push(time);
        if (index + 1 < layers.length) time += get_keyframe_duration(layer);
    });
    return times;
}

function get_svg_at_time(svg_document, time) {
    const layers = get_keyframe_layers(svg_document);
    if (layers.length === 0) throw new Error("The SVG has no Inkscape layers.");
    if (!Number.isFinite(time) || time < 0) throw new Error("Animation time must be non-negative.");

    let start = 0;
    for (let index = 0; index + 1 < layers.length; ++index) {
        const duration = get_keyframe_duration(layers[index]);
        if (time < start + duration) {
            const progress = duration === 0 ? 1 : (time - start) / duration;
            return get_keyframe_transition_svg(svg_document, index, index + 1, progress);
        }
        start += duration;
    }
    return get_keyframe_svg(svg_document, layers.length - 1);
}

function render_keyframe_thumbnails(svg_document, selected_index) {
    const layers = get_keyframe_layers(svg_document);
    const times = get_keyframe_times(svg_document);
    const timeline_width = get_viewport_content_width(timeline_viewport);
    timeline_track.replaceChildren();
    timeline_track.style.position = "relative";
    timeline_track.style.height = "42px";
    timeline_track.style.width = "100%";
    const axis = document.createElement("div");
    axis.className = "timeline-axis";
    axis.style.width = "100%";
    const visible_start = timeline_view.start_time;
    const visible_end = visible_start + timeline_width / timeline_view.pixels_per_second;
    const tick_step = get_timeline_tick_step(timeline_view.pixels_per_second);
    const first_tick = Math.floor(visible_start / tick_step) * tick_step;
    for (let tick = first_tick; tick <= visible_end + tick_step * 0.001; tick += tick_step) {
        if (tick < 0) continue;
        const mark = document.createElement("span");
        mark.className = "timeline-tick";
        mark.style.left = timeline_x_for_time(tick) + "px";
        mark.textContent = format_timeline_time(tick) + "s";
        axis.append(mark);
    }
    timeline_track.append(axis);
    layers.forEach((layer, index) => {
        if (times[index] < visible_start - 1 / timeline_view.pixels_per_second ||
            times[index] > visible_end + 1 / timeline_view.pixels_per_second) return;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "timeline-marker" + (index === selected_index ? " selected" : "");
        marker.style.left = timeline_x_for_time(times[index]) + "px";
        marker.title = layer.getAttributeNS(inkscape_namespace, "label") || "Keyframe " + (index + 1);
        marker.onclick = event => { event.stopPropagation(); select_keyframe(index); };
        timeline_track.append(marker);
    });
    timeline_content.style.width = "100%";
    keyframe_list.replaceChildren(document.getElementById("gallery-playhead"));
    const gallery_width = Math.max(layers.length * gallery_card_step,
        get_viewport_content_width(gallery_viewport));
    keyframe_list.style.width = gallery_width + "px";
    layers.forEach((layer, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.keyframeIndex = index;
        button.style.left = (index * gallery_card_step + gallery_card_step / 2) + "px";
        button.className = "keyframe-thumbnail" + (index === selected_index ? " selected" : "");
        const copy = svg_document.documentElement.cloneNode(true);
        hide_other_layers(copy, index);
        copy.setAttribute("width", "76");
        copy.setAttribute("height", "44");
        copy.setAttribute("preserveAspectRatio", "xMidYMid meet");
        button.append(document.importNode(copy, true));
        button.onclick = () => select_keyframe(index);
        keyframe_list.append(button);
    });
    render_playheads(times[selected_index]);
    update_timeline_zoom_label();
}

function scroll_timeline_to_keyframe(svg_document, index) {
    const time = get_keyframe_times(svg_document)[index];
    if (!Number.isFinite(time)) return;
    const width = get_viewport_content_width(timeline_viewport);
    if (width <= 0) return;
    const centered_start = Math.max(0, time -
        width / (2 * timeline_view.pixels_per_second));
    if (centered_start === timeline_view.start_time) return;
    timeline_view.start_time = centered_start;
    render_timeline();
}

function get_viewport_content_width(viewport) {
    const style = getComputedStyle(viewport);
    return Math.max(0, viewport.clientWidth -
        Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight));
}

function timeline_x_for_time(time) {
    return (time - timeline_view.start_time) * timeline_view.pixels_per_second;
}

function get_timeline_tick_step(pixels_per_second) {
    const minimum_step = 80 / Math.max(1, pixels_per_second);
    const magnitude = 10 ** Math.floor(Math.log10(minimum_step));
    for (const factor of [1, 2, 5, 10]) {
        const step = factor * magnitude;
        if (step >= minimum_step) return step;
    }
    return 10 * magnitude;
}

function format_timeline_time(time) {
    if (Math.abs(time) < 1e-9) return "0";
    return Number(time.toPrecision(6)).toString();
}

function update_timeline_zoom_label() {
    const label = document.getElementById("timeline-zoom-label");
    if (label) label.textContent = format_timeline_time(timeline_view.pixels_per_second) + " px/s";
}

function render_timeline() {
    if (!svg_document || keyframe_ui.layers.length === 0) return;
    render_keyframe_thumbnails(parse_svg(svg_document.text), keyframe_ui.selected_index);
}

function set_timeline_zoom(pixels_per_second, anchor_x = get_viewport_content_width(timeline_viewport) / 2) {
    const old_scale = timeline_view.pixels_per_second;
    const new_scale = Math.max(min_timeline_scale, Math.min(max_timeline_scale, pixels_per_second));
    if (new_scale === old_scale) return;
    const anchor_time = timeline_view.start_time + anchor_x / old_scale;
    timeline_view.pixels_per_second = new_scale;
    timeline_view.start_time = Math.max(0, anchor_time - anchor_x / new_scale);
    render_timeline();
}

function pan_timeline(delta_pixels) {
    timeline_view.start_time = Math.max(0,
        timeline_view.start_time + delta_pixels / timeline_view.pixels_per_second);
    render_timeline();
}

function fit_timeline() {
    if (!svg_document) return;
    const width = get_viewport_content_width(timeline_viewport);
    const duration = Math.max(1, get_animation_duration(parse_svg(svg_document.text)));
    timeline_view.start_time = 0;
    const fit_width = Math.max(1, width - 20);
    timeline_view.pixels_per_second = Math.max(min_timeline_scale,
        Math.min(max_timeline_scale, fit_width / duration));
    render_timeline();
}

function render_playheads(time) {
    if (!keyframe_ui || keyframe_ui.layers.length === 0) return;
    const times = [];
    let elapsed = 0;
    keyframe_ui.layers.forEach((layer, index) => {
        times.push(elapsed);
        if (index + 1 < keyframe_ui.layers.length) elapsed += get_keyframe_duration(layer);
    });
    const selected = keyframe_ui.selected_index;
    document.getElementById("timeline-playhead").style.left = timeline_x_for_time(time) + "px";
    document.getElementById("gallery-playhead").style.left =
        (selected * gallery_card_step + gallery_card_step / 2) + "px";
}

function ensure_animscape_object_ids(svg) {
    const used = new Set(get_animscape_objects(svg).map(get_animscape_object_id));
    let number = 1;
    get_animscape_objects(svg).forEach(element => {
        if (get_animscape_object_id(element)) return;
        let object_id;
        do { object_id = "object-" + number++; } while (used.has(object_id));
        element.setAttributeNS(animscape_namespace, "animscape:object-id", object_id);
        used.add(object_id);
    });
}

function clone_keyframe_layer(svg, source) {
    const copy = source.cloneNode(true);
    const used_ids = new Set(Array.from(svg.querySelectorAll("[id]")).map(element => element.id));
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
