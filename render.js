function get_export_svg() {
    const svg = document.querySelector("#svg-viewer > svg");
    if (!svg) throw new Error("There is no SVG to export.");
    return svg;
}

function get_export_canvas_size(svg) {
    return get_canvas_size(svg, 1024);
}

function get_canvas_size(svg, width) {
    const view_box = svg.viewBox.baseVal;
    if (view_box.width > 0 && view_box.height > 0) {
        return {width: width, height: Math.max(1, Math.round(width * view_box.height / view_box.width))};
    }
    const rect = svg.getBoundingClientRect();
    return {width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height))};
}

function svg_to_png_blob(svg) {
    return svg_text_to_png_blob(new XMLSerializer().serializeToString(svg));
}

function svg_text_to_png_blob(text) {
    const parsed = parse_svg(text);
    const source_url = URL.createObjectURL(new Blob([text], {type: "image/svg+xml"}));
    const image = new Image();
    const size = get_export_canvas_size(parsed.documentElement);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    return render_image_to_canvas(image, source_url, canvas,
        "The SVG could not be rendered as a PNG.").then(() => new Promise((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed.")),
            "image/png")));
}

function render_image_to_canvas(image, source_url, canvas, error_message) {
    return new Promise((resolve, reject) => {
        image.onload = () => {
            try {
                const context = canvas.getContext("2d");
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve();
            } catch (error) {
                reject(error);
            } finally {
                URL.revokeObjectURL(source_url);
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(source_url);
            reject(new Error(error_message));
        };
        image.src = source_url;
    });
}

function render_png_at_time(svg_text, time) {
    const parsed = parse_svg(svg_text);
    return svg_text_to_png_blob(get_svg_at_time(parsed, time));
}

const default_webm_render_settings = Object.freeze({
    fps: 30,
    width: 1024,
    mime_type: "video/webm;codecs=vp9",
    video_bits_per_second: 4000000,
    timeslice_ms: 1000,
    filename: "AnimScape.webm"
});

function get_webm_render_settings(overrides = {}) {
    const settings = Object.assign({}, default_webm_render_settings, overrides);
    if (!Number.isInteger(settings.fps) || settings.fps < 1 || settings.fps > 120)
        throw new RangeError("WebM frame rate must be an integer from 1 through 120.");
    if (!Number.isInteger(settings.width) || settings.width < 1)
        throw new RangeError("WebM width must be a positive integer.");
    if (!Number.isInteger(settings.video_bits_per_second) || settings.video_bits_per_second < 1)
        throw new RangeError("WebM video bitrate must be a positive integer.");
    if (!Number.isInteger(settings.timeslice_ms) || settings.timeslice_ms < 0)
        throw new RangeError("WebM data interval must be a non-negative integer.");
    if (typeof settings.mime_type !== "string" || settings.mime_type.length === 0)
        throw new TypeError("WebM MIME type must be a non-empty string.");
    if (typeof settings.filename !== "string" || settings.filename.length === 0)
        throw new TypeError("WebM filename must be a non-empty string.");
    return settings;
}

function wait_for_frame(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function render_webm(svg_text, settings_overrides = {}, callbacks = {}) {
    const settings = get_webm_render_settings(settings_overrides);
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
        throw new Error("This browser cannot render WebM video.");
    if (!MediaRecorder.isTypeSupported(settings.mime_type))
        throw new Error("This browser does not support the selected WebM format.");

    const parsed = parse_svg(svg_text);
    const duration = get_animation_duration(parsed);
    const frame_count = Math.max(1, Math.ceil(duration * settings.fps) + 1);
    const canvas = document.createElement("canvas");
    const size = get_canvas_size(parsed.documentElement, settings.width);
    canvas.width = size.width;
    canvas.height = size.height;
    const stream = canvas.captureStream(settings.fps);
    const recorder = new MediaRecorder(stream, {
        mimeType: settings.mime_type,
        videoBitsPerSecond: settings.video_bits_per_second
    });
    const chunks = [];
    const recording_finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(recorder.error || new Error("WebM recording failed."));
        recorder.onstop = () => resolve(new Blob(chunks, {type: recorder.mimeType}));
    });

    try {
        recorder.start(settings.timeslice_ms);
        for (let frame = 0; frame < frame_count; ++frame) {
            if (callbacks.should_cancel && callbacks.should_cancel())
                throw new DOMException("WebM rendering was cancelled.", "AbortError");
            const time = Math.min(duration, frame / settings.fps);
            const frame_svg = get_svg_at_time(parsed, time);
            const source_url = URL.createObjectURL(new Blob([frame_svg], {type: "image/svg+xml"}));
            const image = new Image();
            await render_image_to_canvas(image, source_url, canvas,
                "The SVG could not be rendered for WebM export.");
            if (callbacks.on_progress) callbacks.on_progress((frame + 1) / frame_count);
            if (frame + 1 < frame_count) await wait_for_frame(1000 / settings.fps);
        }
        await wait_for_frame(1000 / settings.fps);
        recorder.stop();
        return await recording_finished;
    } catch (error) {
        if (recorder.state !== "inactive") recorder.stop();
        await recording_finished.catch(() => {});
        throw error;
    } finally {
        stream.getTracks().forEach(track => track.stop());
    }
}

async function export_webm(settings_overrides = {}, callbacks = {}) {
    const settings = get_webm_render_settings(settings_overrides);
    const blob = await render_webm(new XMLSerializer().serializeToString(get_export_svg()), settings, callbacks);
    const download_url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = download_url;
    link.download = settings.filename;
    link.click();
    URL.revokeObjectURL(download_url);
}

async function export_png() {
    const blob = await svg_to_png_blob(get_export_svg());
    const download_url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = download_url;
    link.download = "AnimScape.png";
    link.click();
    URL.revokeObjectURL(download_url);
}
