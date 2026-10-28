//! The few texts the backend shows itself — tray menu and tooltip, job results, Windows
//! notifications — in the language picked in the UI (Settings → Language, kept in settings.json).
//! Everything else is translated in the UI (`src/i18n`).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    En,
    Vi,
}

pub struct Texts {
    pub tray_open: &'static str,
    pub tray_check: &'static str,
    pub tray_quit: &'static str,
    pub blender_open: &'static str,
}

const EN: Texts = Texts {
    tray_open: "Open Abyss",
    tray_check: "Check for updates",
    tray_quit: "Quit Abyss",
    blender_open: "This Blender is open; close it first",
};

const VI: Texts = Texts {
    tray_open: "Mở Abyss",
    tray_check: "Kiểm tra cập nhật",
    tray_quit: "Thoát Abyss",
    blender_open: "Blender này đang mở, hãy đóng nó trước",
};

impl Lang {
    /// `"vi"` is Vietnamese; anything else (an unknown code from a newer UI included) is English.
    pub fn parse(code: &str) -> Self {
        if code.trim().eq_ignore_ascii_case("vi") {
            Lang::Vi
        } else {
            Lang::En
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Vi => "vi",
        }
    }

    pub fn texts(self) -> &'static Texts {
        match self {
            Lang::En => &EN,
            Lang::Vi => &VI,
        }
    }

    pub fn installed(self, name: &str, version: &str) -> String {
        match self {
            Lang::En => format!("{name} v{version} installed"),
            Lang::Vi => format!("Đã cài {name} v{version}"),
        }
    }

    pub fn uninstalled(self, name: &str) -> String {
        match self {
            Lang::En => format!("{name} uninstalled"),
            Lang::Vi => format!("Đã gỡ {name}"),
        }
    }

    pub fn addons_installed(self, ok: usize, total: usize) -> String {
        match self {
            Lang::En => format!("Installed in {ok} of {total} Blender version(s)"),
            Lang::Vi => format!("Đã cài vào {ok}/{total} bản Blender"),
        }
    }

    pub fn addons_removed(self, ok: usize, total: usize) -> String {
        match self {
            Lang::En => format!("Removed from {ok} of {total} Blender version(s)"),
            Lang::Vi => format!("Đã gỡ khỏi {ok}/{total} bản Blender"),
        }
    }

    /// Tray icon tooltip; mentions waiting updates so they show without opening the window.
    pub fn tray_tooltip(self, updates: usize) -> String {
        match (self, updates) {
            (_, 0) => "Abyss".to_string(),
            (Lang::En, 1) => "Abyss — 1 update available".to_string(),
            (Lang::En, n) => format!("Abyss — {n} updates available"),
            (Lang::Vi, n) => format!("Abyss — {n} bản cập nhật mới"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_falls_back_to_english() {
        assert_eq!(Lang::parse("vi"), Lang::Vi);
        assert_eq!(Lang::parse(" VI "), Lang::Vi);
        assert_eq!(Lang::parse("en"), Lang::En);
        assert_eq!(Lang::parse("fr"), Lang::En);
        assert_eq!(Lang::parse(""), Lang::En);
    }

    #[test]
    fn tooltip_counts() {
        assert_eq!(Lang::En.tray_tooltip(0), "Abyss");
        assert_eq!(Lang::En.tray_tooltip(1), "Abyss — 1 update available");
        assert_eq!(Lang::Vi.tray_tooltip(2), "Abyss — 2 bản cập nhật mới");
    }
}
