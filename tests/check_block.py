import subprocess
import os

def check_block():
    file_path = r"c:\0_PROJECTS\CrazyWalk-Game\CORE\FRONTEND\B_map_page\index.html"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    # Extract attachDebugClick block (approx 1660 to 2055)
    # Adjust range based on previous views
    start = 1659 # 0-indexed, line 1660
    end = 2056   # Include the closing brace
    
    block = "".join(lines[start:end])
    
    # Wrap in closures to simulate context if needed, but syntax check should pass for arrow function assignment
    test_code = block
    
    with open("temp_block.js", "w", encoding='utf-8') as f:
        f.write(test_code)
        
    print("Checking temp_block.js...")
    result = subprocess.run(['node', '-c', 'temp_block.js'], capture_output=True, text=True, shell=True)
    
    if result.returncode != 0:
        print("SYNTAX ERROR IN BLOCK")
        print(result.stderr)
    else:
        print("Block syntax OK")

if __name__ == "__main__":
    check_block()
