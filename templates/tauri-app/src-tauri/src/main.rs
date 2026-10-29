// Release builds run without a console window on Windows; the command line borrows the caller's (src/cli.rs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if __APP_CRATE___lib::cli::wants_cli(&args) {
        std::process::exit(__APP_CRATE___lib::cli::run(&args));
    }
    __APP_CRATE___lib::run()
}
