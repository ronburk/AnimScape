(() => {
const drag_state = {
    element: null,
    start_x: 0,
    start_y: 0,
    delta_x: 0,
    delta_y: 0,
    object_id: null,
    element_id: null,
    attributes: null,
    original_transform: ""
};

function is_horizontal_drag_attribute(name) {
    return name === "x" || name === "x1" || name === "x2" || name === "cx";
}

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
    const transform = delta_x === 0 && delta_y === 0 ? drag_state.original_transform :
        "translate(" + delta_x + " " + delta_y + ")" +
        (drag_state.original_transform ? " " + drag_state.original_transform : "");
    drag_state.element.setAttribute("transform", transform);
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
    const transform = drag_state.delta_x === 0 && drag_state.delta_y === 0
        ? drag_state.original_transform
        : "translate(" + drag_state.delta_x + " " + drag_state.delta_y + ")" +
            (drag_state.original_transform ? " " + drag_state.original_transform : "");
    source.setAttribute("transform", transform);
    svg_document.text = new XMLSerializer().serializeToString(parsed);
    void history_record("Move object", svg_document.text);
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
    drag_state.original_transform = element.getAttribute("transform") || "";
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

let title_hold = null;
let suppress_title_click = false;

function cancel_title_hold() {
    if (title_hold) clearTimeout(title_hold.timer);
    title_hold = null;
}

function edit_keyframe_title(index) {
    select_keyframe(index);
    const card = keyframe_list.querySelectorAll(".keyframe-thumbnail")[index];
    const label = card.querySelector(".keyframe-thumbnail-label");
    const rect = label.getBoundingClientRect();
    const input = document.createElement("input");
    input.className = "keyframe-title-input";
    input.setAttribute("aria-label", "Keyframe title");
    input.value = label.textContent;
    const width = Math.min(180, document.documentElement.clientWidth);
    input.style.width = width + "px";
    input.style.left = Math.max(0, Math.min(rect.left, document.documentElement.clientWidth - width)) + "px";
    input.style.top = rect.top + "px";
    let finished = false;
    function finish(commit, focus) {
        if (finished) return;
        finished = true;
        const value = input.value.trim();
        if (commit && value && value !== label.textContent) {
            svg_document.text = rename_keyframe(svg_document.text, index, value);
            void history_record("Rename keyframe", svg_document.text);
            // Updating the title alone preserves the target of an outside click.
            label.textContent = value;
            keyframe_ui.layers = get_keyframe_layers(parse_svg(svg_document.text));
        }
        input.remove();
        if (focus) card.focus();
    }
    input.addEventListener("blur", () => finish(true, false));
    input.addEventListener("keydown", event => {
        if (event.isComposing) return;
        if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            finish(event.key === "Enter", true);
        }
    });
    document.body.append(input);
    input.focus();
    input.select();
}

document.addEventListener("pointerdown", event => {
    cancel_title_hold();
    suppress_title_click = false;
    const label = event.target.closest(".keyframe-thumbnail-label");
    if (!label || event.button !== 0 || !event.isPrimary) return;
    const index = Number(label.closest(".keyframe-thumbnail").dataset.keyframeIndex);
    title_hold = {
        pointer_id: event.pointerId, x: event.clientX, y: event.clientY,
        timer: setTimeout(() => {
            cancel_title_hold();
            if (!label.isConnected) return;
            suppress_title_click = true;
            edit_keyframe_title(index);
        }, 500)
    };
    // Avoid native text selection during the hold; short clicks still select the frame.
    event.preventDefault();
});
document.addEventListener("pointermove", event => {
    if (title_hold && event.pointerId === title_hold.pointer_id &&
        Math.hypot(event.clientX - title_hold.x, event.clientY - title_hold.y) > 5)
        cancel_title_hold();
});
document.addEventListener("pointerup", cancel_title_hold);
document.addEventListener("pointercancel", cancel_title_hold);
window.addEventListener("blur", cancel_title_hold);
document.addEventListener("scroll", cancel_title_hold, true);
document.addEventListener("click", event => {
    if (!suppress_title_click) return;
    suppress_title_click = false;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);
})();
