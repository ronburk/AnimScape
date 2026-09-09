const svg_file_button = document.getElementById("svg-file-button");
const keyframe_button = document.getElementById("keyframe-button");
let svg_document = null;
async function open_svg_file() { try { svg_document = await file_io.open_svg(); draw_svg(svg_document.text); svg_file_button.onclick = save_svg_file; keyframe_button.disabled = false; } catch (error) { svg_document = null; keyframe_button.disabled = true; } }
async function save_svg_file() { try { await file_io.save_svg(svg_document, svg_document.text); } catch (error) {} }
function create_keyframe() { try { svg_document.text = add_keyframe(svg_document.text); draw_svg(svg_document.text); } catch (error) {} }
svg_file_button.onclick = open_svg_file;
keyframe_button.onclick = create_keyframe;
