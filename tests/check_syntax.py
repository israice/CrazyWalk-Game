import re
import subprocess
import os

def check_js_syntax():
    file_path = r"c:\0_PROJECTS\CrazyWalk-Game\CORE\FRONTEND\B_map_page\index.html"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Extract JS between <script> tags
    # Handle module type
    matches = re.findall(r'<script.*?>(.*?)</script>', content, re.DOTALL)
    
    if not matches:
        print("No script tags found!")
        return

    # Assuming the main logic is in the last script tag or largest one
    # Let's inspect all
    for i, js_content in enumerate(matches):
        if not js_content.strip(): continue
        
        temp_js = f"temp_script_{i}.js"
        with open(temp_js, 'w', encoding='utf-8') as f:
            f.write(js_content)
            
        print(f"Checking syntax for Script Block {i}...")
        try:
            # node --check (or -c) checks syntax without executing
            result = subprocess.run(['node', '-c', temp_js], capture_output=True, text=True, shell=True)
            if result.returncode == 0:
                print(f"Script Block {i}: OK")
            else:
                print(f"Script Block {i}: SYNTAX ERROR")
                print(result.stderr)
        except Exception as e:
            print(f"Failed to run node: {e}")
            
        # Cleanup only if OK
        if result.returncode == 0 and os.path.exists(temp_js):
            os.remove(temp_js)
        elif result.returncode != 0:
             print(f"Kept {temp_js} for inspection.")

if __name__ == "__main__":
    check_js_syntax()
