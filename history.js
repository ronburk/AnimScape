/* Append-only history snapshots for the currently opened SVG. */

let history_file_handle = null;
let history_entries = [];
let history_tail = Promise.resolve();

function history_metadata(svg_text, operation, revision) {
    const parsed = parse_svg(svg_text);
    const root = parsed.documentElement;
    root.setAttribute("data-animscape-history-revision", String(revision));
    root.setAttribute("data-animscape-history-operation", operation);
    return new XMLSerializer().serializeToString(parsed);
}

async function history_append(snapshot) {
    const encoded = new TextEncoder().encode(snapshot);
    const prefix = new TextEncoder().encode(String(encoded.byteLength) + "\n");
    const file = await history_file_handle.getFile();
    const writable = await history_file_handle.createWritable({keepExistingData: true});
    try {
        await writable.seek(file.size);
        await writable.write(prefix);
        await writable.write(encoded);
        await writable.close();
        return file.size;
    } catch (error) {
        await writable.abort();
        throw error;
    }
}

async function history_scan() {
    const file = await history_file_handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoder = new TextDecoder();
    const entries = [];
    let offset = 0;
    while (offset < bytes.length) {
        const line_end = bytes.indexOf(10, offset);
        if (line_end < 0) break;
        const length = Number(decoder.decode(bytes.slice(offset, line_end)));
        if (!Number.isSafeInteger(length) || length < 0) break;
        const snapshot_offset = line_end + 1;
        if (snapshot_offset + length > bytes.length) break;
        const snapshot = decoder.decode(bytes.slice(snapshot_offset, snapshot_offset + length));
        const root = parse_svg(snapshot).documentElement;
        entries.push({
            offset,
            length,
            operation: root.getAttribute("data-animscape-history-operation") || "Edit",
            revision: root.getAttribute("data-animscape-history-revision") || String(entries.length)
        });
        offset = snapshot_offset + length;
    }
    history_entries = entries;
    return entries;
}

async function history_open(opened) {
    history_file_handle = await opened.workspace_handle.getFileHandle(
        opened.file_handle.name.replace(/\.svg$/i, ".hst"), {create: true});
    await history_scan();
    if (history_entries.length === 0)
        await history_record("Initial state", opened.text);
}

async function history_record(operation, svg_text) {
    if (!history_file_handle) return;
    history_tail = history_tail.then(async () => {
        const revision = history_entries.length;
        const snapshot = history_metadata(svg_text, operation, revision);
        const offset = await history_append(snapshot);
        history_entries.push({
            offset,
            length: new TextEncoder().encode(snapshot).byteLength,
            operation,
            revision: String(revision)
        });
    });
    return history_tail;
}
