use super::PopupInteraction;

pub(in crate::tray) fn popup_interaction(window: &tauri::Window) -> Option<PopupInteraction> {
    use windows_sys::Win32::UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON},
        WindowsAndMessaging::{
            GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
            GUI_INMOVESIZE,
        },
    };

    let hwnd = window.hwnd().ok()?.0;
    // Query the popup's own GUI thread so another application's move/resize
    // operation cannot keep this popup open. No window handles are retained.
    unsafe {
        let thread_id = GetWindowThreadProcessId(hwnd, std::ptr::null_mut());
        if thread_id == 0 {
            return None;
        }
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        let resizing = GetGUIThreadInfo(thread_id, &mut info) != 0
            && info.flags & GUI_INMOVESIZE != 0
            && info.hwndMoveSize == hwnd;
        Some(PopupInteraction {
            focused: GetForegroundWindow() == hwnd,
            pointer_down: [VK_LBUTTON, VK_MBUTTON, VK_RBUTTON]
                .into_iter()
                .any(|button| GetAsyncKeyState(button as i32) < 0),
            resizing,
        })
    }
}
