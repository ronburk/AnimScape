const drag_state = {
    element: null,
    start_x: 0,
    start_y: 0,
    delta_x: 0,
    delta_y: 0,
    object_id: null,
    element_id: null,
    attributes: null
};

function get_drag_attributes(element) {
    const names = element.localName === "ellipse" || element.localName === "circle"
        ? ["cx", "cy"]
        : element.localName === "line"
            ? ["x1", "y1", "x2", "y2"]
            : ["x", "y"];
    if (!names.every(name => Number.isFinite(Number.parseFloat(element.getAttribute(name)))))
        return null;
    return names.map(name => ({name, value: Number.parseFloat(element.getAttribute(name))}));
}

function get_svg_delta(svg, event) {
    const rect = svg.getBoundingClientRect();
    const view_box = svg.viewBox.baseVal;
    return {
        x: (event.clientX - drag_state.start_x) * view_box.width / rect.width,
        y: (event.clientY - drag_state.start_y) * view_box.height / rect.height
    };
}

function move_dragged_element(delta_x, delta_y) {
    drag_state.attributes.forEach(attribute =>
        drag_state.element.setAttribute(attribute.name,
            String(attribute.value + (attribute.name.startsWith("x") ? delta_x : delta_y))));
}

function find_source_object(layer, object_id, element_id) {
    return get_animscape_objects(layer).find(element =>
        (object_id && get_animscape_object_id(element) === object_id) ||
        (!object_id && element.id === element_id));
}

function commit_drag() {
    if (!svg_document || !drag_state.attributes) return;
    const parsed = parse_svg(svg_document.text);
    const layer = get_keyframe_layers(parsed)[keyframe_ui.selected_index];
    const source = find_source_object(layer, drag_state.object_id, drag_state.element_id);
    if (!source) return;
    drag_state.attributes.forEach(attribute =>
        source.setAttribute(attribute.name,
            String(attribute.value + (attribute.name.startsWith("x")
                ? drag_state.delta_x : drag_state.delta_y))));
    svg_document.text = new XMLSerializer().serializeToString(parsed);
}

function finish_drag() {
    if (!drag_state.element) return;
    commit_drag();
    drag_state.element.releasePointerCapture?.(drag_state.pointer_id);
    drag_state.element = null;
    drag_state.attributes = null;
}

function start_drag(event) {
    const svg = event.target.closest("#svg-viewer > svg");
    const element = event.target.closest("#svg-viewer > svg *");
    if (!svg || !element || ["g", "defs", "title", "desc"].includes(element.localName))
        return;
    const attributes = get_drag_attributes(element);
    if (!attributes) return;
    stop_playback();
    drag_state.element = element;
    drag_state.pointer_id = event.pointerId;
    drag_state.start_x = event.clientX;
    drag_state.start_y = event.clientY;
    drag_state.delta_x = 0;
    drag_state.delta_y = 0;
    drag_state.object_id = get_animscape_object_id(element);
    drag_state.element_id = element.id;
    drag_state.attributes = attributes;
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function continue_drag(event) {
    if (!drag_state.element || event.pointerId !== drag_state.pointer_id) return;
    const delta = get_svg_delta(drag_state.element.closest("svg"), event);
    drag_state.delta_x = delta.x;
    drag_state.delta_y = delta.y;
    move_dragged_element(delta.x, delta.y);
    event.preventDefault();
}

document.getElementById("svg-viewer").addEventListener("pointerdown", start_drag);
document.getElementById("svg-viewer").addEventListener("pointermove", continue_drag);
document.getElementById("svg-viewer").addEventListener("pointerup", finish_drag);
document.getElementById("svg-viewer").addEventListener("pointercancel", finish_drag);
