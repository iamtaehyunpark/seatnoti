import json
import re
from typing import List, Dict

def extract_subject_data_ordered(file_path: str) -> str:
    """
    Reads the messy text file and extracts the subject data, ensuring the 
    extraction pattern strictly follows the file's structure (Code, Description, ShortDesc).
    """
    
    # 1. File Read and Cleaning
    try:
        # Read content, remove null characters and combine lines for maximum regex matching
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read().replace('\x00', '').replace('\n', ' ').replace('\r', ' ')
    except FileNotFoundError:
        return json.dumps({"error": f"File not found at path '{file_path}'"})
    
    output_pairs: List[Dict[str, str]] = []
    
    # --- FINAL ROBUST REGEX PATTERN ---
    # This pattern captures the fields in the exact sequence confirmed by the user.
    # Group 1: subjectCode (e.g., "320")
    # Group 2: description (Long Name, e.g., "ELECTRICAL AND COMPUTER ENGR")
    # Group 3: shortDescription (Short Name, e.g., "E C E")
    
    pattern = re.compile(
        r'"subjectCode"\s*:\s*"([^"]*?)"'      # Group 1: Capture subjectCode
        r'.*?'                                 # Non-greedy match for content in between
        r'"description"\s*:\s*"([^"]*?)"'      # Group 2: Capture description (Long Name)
        r'.*?'                                 # Non-greedy match for content in between
        r'"shortDescription"\s*:\s*"([^"]*?)"',# Group 3: Capture shortDescription (Short Name)
        re.DOTALL | re.IGNORECASE              
    )
    
    # 2. Extract Data using Regex
    # Matches returns a list of tuples: (CodeValue, LongDescValue, ShortDescValue)
    matches = pattern.findall(content)
    
    # 3. Process Captured Matches and enforce the final dictionary structure
    for code_val, long_desc_val, short_desc_val in matches:
        output_pairs.append({
            "subjectCode": code_val.strip(),
            "shortDescription": short_desc_val.strip(),
            "description": long_desc_val.strip()
        })
    
    # 4. Output Final JSON (Removing Duplicates and Sorting)
    unique_pairs = list(set((d['subjectCode'], d['shortDescription'], d['description']) for d in output_pairs))
    unique_pairs.sort(key=lambda x: x[0])
    
    final_data = [{
        "subjectCode": code, 
        "shortDescription": short_desc, 
        "description": desc
    } for code, short_desc, desc in unique_pairs]
    
    return final_data

# Example Usage (replace 'messy_data.txt' with your file name):
final_data_json = extract_subject_data_ordered('sub.txt')
with open('rrr.json', 'w', encoding='utf-8') as f:
            # json.dump() converts the Python object to a JSON string and writes it to the file.
            # indent=4 makes the file human-readable.
            json.dump(final_data_json, f, indent=4)