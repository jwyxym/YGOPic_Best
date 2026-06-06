mod lib;
use lib::CardHashEntry;

use bincode::{encode_to_vec, config::standard};
use image::GenericImageView;
use std::fs::write;

#[cfg(not(target_family = "wasm"))]
    use anyhow::{Result, Error};

#[cfg(not(target_family = "wasm"))]
fn is_pendulum_artwork(bytes: &[u8]) -> Result<bool, Error> {
    let img = image::load_from_memory(bytes)?;
    let ratio = img.width() as f32 / img.height() as f32;

    Ok(ratio != 1.0)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    #[cfg(not(target_family = "wasm"))]
    {
        use std::env;
        use walkdir::WalkDir;
        use tokio::{
            task::{JoinHandle, spawn},
            fs::read
        };
        let args: Vec<String> = env::args().collect();
        let mut tasks: Vec<JoinHandle<Result<(u32, String, bool), Error>>> = Vec::new();
		WalkDir::new(&args[1])
			.max_depth(1)
			.into_iter()
			.for_each(|i| {
				if let Ok(i) = i {
                    let path = i.path();
                    if let Some(ext) = path.extension() && path.is_file() {
                        let ext = ext.to_str().unwrap_or("");
                        if ["jpg", "jpeg", "png", "gif"].contains(&ext) && let Some(stem) = path.file_stem() {
                            let stem = stem.to_str().unwrap_or("");
                            let code: u32 = stem.parse::<u32>().unwrap_or(0);
                            if code > 0 {
                                let p = path.to_path_buf();
                                tasks.push(spawn(async move {
                                    let content= read(p).await?;
                                    let is_pendulum = is_pendulum_artwork(&content)?;
                                    Ok((code, lib::get_phash(&content), is_pendulum))
                                }));
                            }
					    }
					}
                }
            });
        let mut result: Vec<CardHashEntry> = Vec::new();
        for task in tasks {
            let (code, phash, is_pendulum) = task.await??;
            result.push(CardHashEntry {
                phash: phash,
                id: code,
                card_type: if is_pendulum { 1 } else { 0 }
            });
        }
        let buffer = encode_to_vec(result, standard())?;
        write("./card_data", buffer)?;
    }
    Ok(())
}