import os
from thefuzz import process, fuzz

def search_files(target_filename, search_dir, limit=5):
    """
    Crawls search_dir and tries to find up to `limit` files matching target_filename.
    Guarantees that files containing the exact words are included first.
    Returns a list of dictionaries with path and score.
    """
    all_files = []
    
    # Collect all filenames
    for root, dirs, files in os.walk(search_dir):
        # Skip hidden directories and common node blocks to save time
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', '.git', '__pycache__')]
        for file in files:
            # Only consider documents we can actually read
            if file.lower().endswith(('.pdf', '.docx', '.doc', '.epub', '.txt')):
                all_files.append(os.path.join(root, file))
            
    if not all_files:
        return []

    target_lower = target_filename.lower()
    file_basenames = {os.path.basename(f): f for f in all_files}
    
    results = []
    seen_paths = set()
    
    # 1. Exact substring matches first (Score: 100)
    for basename, full_path in file_basenames.items():
        if target_lower in basename.lower():
            results.append({
                "filename": basename,
                "path": full_path,
                "score": 100
            })
            seen_paths.add(full_path)
    
    # If we already hit the limit just with exact matches, return them
    if len(results) >= limit:
        return results[:limit]

    # 2. Fuzzy matches for the remaining slots
    best_matches = process.extractBests(
        target_filename, 
        list(file_basenames.keys()), 
        scorer=fuzz.token_set_ratio, 
        limit=limit * 3 
    )
    
    for match, score in best_matches:
        if len(match) < 3:
            continue
            
        full_path = file_basenames[match]
        if score > 35 and full_path not in seen_paths:
             results.append({
                 "filename": match,
                 "path": full_path,
                 "score": score
             })
             seen_paths.add(full_path)
             if len(results) >= limit:
                 break

    # Sort results by score descending
    results.sort(key=lambda x: x['score'], reverse=True)
    return results
