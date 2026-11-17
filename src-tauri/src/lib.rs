// The webview does the networking (WebRTC via PeerJS); Rust only replays the
// mouse and keyboard events the controlling side sends.

use enigo::{Axis, Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use serde::Deserialize;
use std::sync::Mutex;

#[derive(Deserialize)]
#[serde(tag = "t")]
enum Input {
    /// x and y are 0..1 across the shared screen
    Move { x: f64, y: f64 },
    Button { b: u8, down: bool },
    Wheel { dx: i32, dy: i32 },
    /// PS/2 set 1 scan code (0xE0.. for extended keys): replays the physical key
    Key { scan: u16, down: bool },
}

#[tauri::command]
fn input(ev: Input, enigo: tauri::State<Mutex<Enigo>>) -> Result<(), String> {
    let mut e = enigo.lock().map_err(|e| e.to_string())?;
    let dir = |down| if down { Direction::Press } else { Direction::Release };
    match ev {
        // ponytail: maps to the primary monitor only; pass the shared monitor's rect if multi-monitor matters
        Input::Move { x, y } => {
            let (w, h) = e.main_display().map_err(|e| e.to_string())?;
            let px = (x.clamp(0.0, 1.0) * (w - 1) as f64) as i32;
            let py = (y.clamp(0.0, 1.0) * (h - 1) as f64) as i32;
            e.move_mouse(px, py, Coordinate::Abs)
        }
        Input::Button { b, down } => {
            let b = match b {
                0 => Button::Left,
                1 => Button::Middle,
                2 => Button::Right,
                _ => return Err(format!("unknown button {b}")),
            };
            e.button(b, dir(down))
        }
        Input::Wheel { dx, dy } => {
            if dy != 0 { e.scroll(dy, Axis::Vertical).map_err(|e| e.to_string())?; }
            if dx != 0 { e.scroll(dx, Axis::Horizontal) } else { Ok(()) }
        }
        Input::Key { scan, down } => e.raw(scan, dir(down)),
    }
    .map_err(|e| e.to_string())
}

/// Called when a session ends: dropping the old Enigo releases any key or button still held.
#[tauri::command]
fn reset(enigo: tauri::State<Mutex<Enigo>>) -> Result<(), String> {
    let fresh = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    *enigo.lock().map_err(|e| e.to_string())? = fresh;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let enigo = Enigo::new(&Settings::default()).expect("input simulation unavailable");
    tauri::Builder::default()
        .manage(Mutex::new(enigo))
        .invoke_handler(tauri::generate_handler![input, reset])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
