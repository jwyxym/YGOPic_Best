mod lib;
use lib::CardHashEntry;

use bincode::{encode_to_vec, config::standard};
use std::fs::{write, create_dir_all};

#[cfg(not(target_family = "wasm"))]
    use anyhow::{Result, Error};

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
        let mut tasks: Vec<JoinHandle<Result<(u32, String), Error>>> = Vec::new();
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
                                    Ok((code, lib::get_phash(&content)))
                                }));
                            }
					    }
					}
                }
            });
        let mut result: Vec<CardHashEntry> = Vec::new();
        for task in tasks {
            let (code, phash) = task.await??;
            result.push(CardHashEntry {
                phash: phash,
                id: code,
                card_type: String::from("standard")
            });
        }
        let buffer = encode_to_vec(result, standard())?;
        create_dir_all("../dist")?;
        write("../dist/card_data", buffer)?;
    }
    Ok(())
}