use std::fs;
use std::path::Path;

#[tauri::command]
fn list_snippets(folder: String) -> Result<Vec<serde_json::Value>, String> {
    let path = Path::new(&folder);
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut snippets = vec![];
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_path = entry.path();
        if file_path.extension().and_then(|s| s.to_str()) == Some("txt") {
            let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
            let filename = file_path.file_name().unwrap().to_str().unwrap().to_string();
            snippets.push(parse_snippet(&filename, &content));
        }
    }
    snippets.sort_by(|a, b| {
        a["title"].as_str().unwrap_or("").cmp(b["title"].as_str().unwrap_or(""))
    });
    Ok(snippets)
}

fn parse_snippet(filename: &str, raw: &str) -> serde_json::Value {
    let mut title = filename.trim_end_matches(".txt").to_string();
    let mut tag = String::new();
    let body;

    let parts: Vec<&str> = raw.splitn(2, "\n---\n").collect();
    if parts.len() == 2 {
        body = parts[1].to_string();
        for line in parts[0].lines() {
            if let Some(t) = line.strip_prefix("TITLE: ") {
                title = t.to_string();
            } else if let Some(t) = line.strip_prefix("TAG: ") {
                tag = t.to_string();
            }
        }
    } else {
        body = raw.to_string();
    }

    serde_json::json!({
        "filename": filename,
        "title": title,
        "tag": tag,
        "content": body
    })
}

fn sanitize_filename(title: &str) -> String {
    title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
}

#[tauri::command]
fn save_snippet(
    folder: String,
    old_filename: String,
    title: String,
    tag: String,
    content: String,
) -> Result<String, String> {
    let new_filename = sanitize_filename(&title) + ".txt";
    let file_content = format!("TITLE: {}\nTAG: {}\n---\n{}", title, tag, content);

    if !old_filename.is_empty() && old_filename != new_filename {
        let old_path = Path::new(&folder).join(&old_filename);
        if old_path.exists() {
            fs::remove_file(old_path).map_err(|e| e.to_string())?;
        }
    }

    let new_path = Path::new(&folder).join(&new_filename);
    fs::write(new_path, file_content).map_err(|e| e.to_string())?;
    Ok(new_filename)
}

#[tauri::command]
fn delete_snippet(folder: String, filename: String) -> Result<(), String> {
    let path = Path::new(&folder).join(&filename);
    fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![list_snippets, save_snippet, delete_snippet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}