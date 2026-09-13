/* Append-only history snapshots for the currently opened SVG. */

window.history_io = (() => {

let history_file_handle = null;
let history_entries = [];
let history_tail = Promise.resolve();
const history_length_name = "animscape:history-length";
const history_revision_name = "animscape:history-revision";
const history_operation_name = "animscape:history-operation";
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

function history_copy_root(root, length_text, operation, revision) {
    const output = root.ownerDocument.createElementNS(root.namespaceURI, root.nodeName);
    output.setAttributeNS(xmlns_namespace, "xmlns:animscape", animscape_namespace);
    output.setAttributeNS(animscape_namespace, history_length_name, length_text);
    output.setAttributeNS(animscape_namespace, history_revision_name, String(revision));
    output.setAttributeNS(animscape_namespace, history_operation_name, operation);

    Array.from(root.attributes).forEach(attribute => {
        if (attribute.namespaceURI === animscape_namespace &&
            (attribute.localName === "history-length" ||
             attribute.localName === "history-revision" ||
             attribute.localName === "history-operation")) {
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

function history_serialize(root, length_text, operation, revision) {
    return new XMLSerializer().serializeToString(
        history_copy_root(root, length_text, operation, revision));
}

function history_metadata(svg_text, operation, revision) {
    const root = parse_svg(svg_text).documentElement;
    const provisional = history_serialize(
        root, " ".repeat(history_length_width), operation, revision);
    const length = history_encoder.encode(provisional).byteLength;
    const snapshot = history_serialize(
        root, history_padded_length(length), operation, revision);
    if (history_encoder.encode(snapshot).byteLength !== length)
        throw new Error("History length field changed the SVG size.");
    return snapshot;
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
        entries.push({
            offset,
            length,
            operation: root.getAttributeNS(animscape_namespace, "history-operation") || "Edit",
            revision: root.getAttributeNS(animscape_namespace, "history-revision") || String(entries.length)
        });
        offset = snapshot_end;
    }
    return entries;
}

async function history_open(opened) {
    history_file_handle = await opened.workspace_handle.getFileHandle(
        opened.file_handle.name.replace(/\.svg$/i, ".hst"), {create: true});
    history_entries = await history_scan();
    if (history_entries.length === 0)
        await history_record("Initial state", opened.text);
}

async function history_record(operation, svg_text) {
    if (!history_file_handle) return;
    history_tail = history_tail.then(async () => {
        const revision = history_entries.length;
        const snapshot = history_metadata(svg_text, operation, revision);
        const result = await history_append(snapshot);
        history_entries.push({
            offset: result.offset,
            length: result.length,
            operation,
            revision: String(revision)
        });
    });
    return history_tail;
}

return Object.freeze({
    open: history_open,
    record: history_record
});
})();
