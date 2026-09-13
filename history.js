/* Append-only history snapshots for the currently opened SVG. */

window.history_io = (() => {

let history_file_handle = null;
let history_entries = [];
let history_tail = Promise.resolve();
let history_pending = 0;
let history_head = -1;
let history_tip = -1;
let history_path = [];
const history_length_name = "animscape:history-length";
const history_revision_name = "animscape:history-revision";
const history_operation_name = "animscape:history-operation";
const history_parent_name = "animscape:history-parent";
const history_cursor_name = "animscape:history-cursor";
const history_tip_name = "animscape:history-tip";
const history_source_namespace_name = "animscape:history-source-xmlns";
const history_attribute_names = new Set([
    "history-length", "history-revision", "history-operation", "history-parent",
    "history-cursor", "history-tip", "history-source-xmlns"
]);
const history_length_width = 12;
const history_header_size = 512;
const history_encoder = new TextEncoder();
const history_decoder = new TextDecoder();

function history_padded_length(length) {
    const text = String(length);
    if (text.length > history_length_width)
        throw new Error("SVG history record is too large.");
    return text.padStart(history_length_width, " ");
}

function history_copy_root(root, length_text, operation, revision, parent) {
    const output = root.ownerDocument.createElementNS(root.namespaceURI, root.nodeName);
    output.setAttributeNS(xmlns_namespace, "xmlns:animscape", animscape_namespace);
    output.setAttributeNS(animscape_namespace, history_length_name, length_text);
    output.setAttributeNS(animscape_namespace, history_revision_name, String(revision));
    output.setAttributeNS(animscape_namespace, history_operation_name, operation);
    output.setAttributeNS(animscape_namespace, history_parent_name, String(parent));
    output.setAttributeNS(animscape_namespace, history_source_namespace_name,
        root.hasAttributeNS(xmlns_namespace, "animscape") ? "1" : "0");

    Array.from(root.attributes).forEach(attribute => {
        if (attribute.namespaceURI === animscape_namespace &&
            history_attribute_names.has(attribute.localName)) {
            return;
        }
        if (attribute.namespaceURI === xmlns_namespace &&
            attribute.localName === "animscape") {
            return;
        }
        if (attribute.namespaceURI) {
            output.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
        } else {
            output.setAttribute(attribute.name, attribute.value);
        }
    });
    Array.from(root.childNodes).forEach(child => output.appendChild(child.cloneNode(true)));
    return output;
}

function history_serialize(root, length_text, operation, revision, parent) {
    return new XMLSerializer().serializeToString(
        history_copy_root(root, length_text, operation, revision, parent));
}

function history_metadata(svg_text, operation, revision, parent) {
    const root = parse_svg(svg_text).documentElement;
    const provisional = history_serialize(
        root, " ".repeat(history_length_width), operation, revision, parent);
    const length = history_encoder.encode(provisional).byteLength;
    const snapshot = history_serialize(
        root, history_padded_length(length), operation, revision, parent);
    if (history_encoder.encode(snapshot).byteLength !== length)
        throw new Error("History length field changed the SVG size.");
    return snapshot;
}

function history_cursor_record(head, tip) {
    function serialize(length) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttributeNS(xmlns_namespace, "xmlns:animscape", animscape_namespace);
        svg.setAttributeNS(animscape_namespace, history_length_name, length);
        svg.setAttributeNS(animscape_namespace, history_cursor_name, String(head));
        svg.setAttributeNS(animscape_namespace, history_tip_name, String(tip));
        return new XMLSerializer().serializeToString(svg);
    }
    const length = history_encoder.encode(serialize(" ".repeat(history_length_width))).byteLength;
    return serialize(history_padded_length(length));
}

function history_document_root(snapshot) {
    const root = parse_svg(snapshot).documentElement;
    const had_namespace = root.getAttributeNS(animscape_namespace, "history-source-xmlns");
    Array.from(root.attributes).forEach(attribute => {
        if (attribute.namespaceURI === animscape_namespace &&
            history_attribute_names.has(attribute.localName))
            root.removeAttributeNS(animscape_namespace, attribute.localName);
    });
    if (had_namespace === "0" ||
        (had_namespace === null && ![root, ...root.querySelectorAll("*")].some(element =>
            Array.from(element.attributes).some(attribute =>
                attribute.namespaceURI === animscape_namespace)))) {
        root.removeAttributeNS(xmlns_namespace, "animscape");
    }
    return root;
}

function history_set_path() {
    const path = [];
    for (let index = history_tip; index !== -1; index = history_entries[index].parent) {
        if (!history_entries[index] || path.length > history_entries.length)
            throw new Error("Invalid history parent.");
        path.push(index);
    }
    history_path = path.reverse();
    if (!history_path.includes(history_head))
        throw new Error("Invalid history cursor.");
}

function history_notify() {
    document.dispatchEvent(new Event("history-change"));
}

function history_queue(task) {
    ++history_pending;
    history_notify();
    const pending = history_tail.then(task);
    history_tail = pending.catch(() => {});
    void pending.finally(() => {
        --history_pending;
        history_notify();
    }).catch(() => {});
    return pending;
}

async function history_append(snapshot) {
    const encoded = history_encoder.encode(snapshot);
    const newline = history_encoder.encode("\n");
    const file = await history_file_handle.getFile();
    const writable = await history_file_handle.createWritable({keepExistingData: true});
    try {
        await writable.seek(file.size);
        await writable.write(encoded);
        await writable.write(newline);
        await writable.close();
        return {offset: file.size, length: encoded.byteLength};
    } catch (error) {
        await writable.abort();
        throw error;
    }
}

function history_skip_whitespace(bytes, offset) {
    while (offset < bytes.length &&
           (bytes[offset] === 9 || bytes[offset] === 10 ||
            bytes[offset] === 13 || bytes[offset] === 32)) {
        ++offset;
    }
    return offset;
}

function history_read_length(bytes, offset) {
    const end = Math.min(bytes.length, offset + history_header_size);
    const prefix = history_decoder.decode(bytes.slice(offset, end));
    const parsed = new DOMParser().parseFromString(prefix, "text/html");
    const element = Array.from(parsed.getElementsByTagName("*"))
        .find(candidate => candidate.localName === "svg" &&
              candidate.hasAttribute(history_length_name));
    if (!element) return null;
    const length = Number(element.getAttribute(history_length_name).trim());
    return Number.isSafeInteger(length) && length > 0 ? length : null;
}

async function history_scan() {
    const file = await history_file_handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = [];
    let offset = history_skip_whitespace(bytes, 0);
    if (offset === bytes.length) return entries;
    if (bytes[offset] !== 60) {
        const error = new Error("The history file is not in the current format.");
        error.code = "history-format";
        throw error;
    }

    while (offset < bytes.length) {
        offset = history_skip_whitespace(bytes, offset);
        if (offset === bytes.length) break;
        const length = history_read_length(bytes, offset);
        if (length === null) break;
        const snapshot_end = offset + length;
        if (snapshot_end > bytes.length) break;
        const snapshot = history_decoder.decode(bytes.slice(offset, snapshot_end));
        const root = parse_svg(snapshot).documentElement;
        const cursor = root.getAttributeNS(animscape_namespace, "history-cursor");
        if (cursor !== null) {
            const head = Number(cursor);
            const tip = Number(root.getAttributeNS(animscape_namespace, "history-tip"));
            if (!Number.isSafeInteger(head) || !Number.isSafeInteger(tip) ||
                head < 0 || tip < 0 || head >= entries.length || tip >= entries.length)
                throw new Error("Invalid history cursor record.");
            history_head = head;
            history_tip = tip;
        } else {
            const revision = Number(root.getAttributeNS(animscape_namespace, "history-revision"));
            const parent_text = root.getAttributeNS(animscape_namespace, "history-parent");
            const parent = parent_text === null ? entries.length - 1 : Number(parent_text);
            if (revision !== entries.length || !Number.isSafeInteger(parent) ||
                parent < -1 || parent >= entries.length)
                throw new Error("Invalid history snapshot record.");
            entries.push({
                offset,
                length,
                parent,
                operation: root.getAttributeNS(animscape_namespace, "history-operation") || "Edit"
            });
            history_head = entries.length - 1;
            history_tip = history_head;
        }
        offset = snapshot_end;
    }
    return entries;
}

async function history_open(opened) {
    await history_tail;
    history_file_handle = await opened.workspace_handle.getFileHandle(
        opened.file_handle.name.replace(/\.svg$/i, ".hst"), {create: true});
    history_head = -1;
    history_tip = -1;
    history_path = [];
    history_entries = await history_scan();
    if (history_entries.length === 0)
        await history_record("Initial state", opened.text);
    else {
        history_set_path();
        const selected = await history_read_entry(history_head);
        if (!parse_svg(selected).documentElement.isEqualNode(parse_svg(opened.text).documentElement))
            await history_record("Open changed SVG", opened.text);
    }
    history_notify();
}

function history_record(operation, svg_text) {
    if (!history_file_handle) return Promise.resolve();
    return history_queue(async () => {
        const revision = history_entries.length;
        const parent = history_head;
        const snapshot = history_metadata(svg_text, operation, revision, parent);
        const result = await history_append(snapshot);
        history_entries.push({
            offset: result.offset,
            length: result.length,
            operation,
            parent
        });
        history_head = revision;
        history_tip = revision;
        history_set_path();
    });
}

async function history_read_entry(index) {
    const entry = history_entries[index];
    const file = await history_file_handle.getFile();
    const snapshot = await file.slice(entry.offset, entry.offset + entry.length).text();
    return new XMLSerializer().serializeToString(history_document_root(snapshot));
}

function history_state() {
    const index = history_path.indexOf(history_head);
    return {
        can_undo: history_pending === 0 && index > 0,
        can_redo: history_pending === 0 && index >= 0 && index + 1 < history_path.length,
        undo_operation: index > 0 ? history_entries[history_head].operation : null,
        redo_operation: index >= 0 && index + 1 < history_path.length
            ? history_entries[history_path[index + 1]].operation : null
    };
}

function history_move(delta) {
    if (!history_file_handle ||
        !(delta < 0 ? history_state().can_undo : history_state().can_redo))
        return Promise.resolve(null);
    return history_queue(async () => {
        const index = history_path.indexOf(history_head) + delta;
        const head = history_path[index];
        const text = await history_read_entry(head);
        await history_append(history_cursor_record(head, history_tip));
        history_head = head;
        return text;
    });
}

return Object.freeze({
    open: history_open,
    record: history_record,
    state: history_state,
    undo: () => history_move(-1),
    redo: () => history_move(1)
});
})();
