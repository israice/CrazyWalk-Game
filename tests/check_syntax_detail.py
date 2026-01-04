import subprocess
import re
import os

def check_detail():
    file_path = "temp_script_3.js"
    if not os.path.exists(file_path):
        print("temp_script_3.js not found! Run check_syntax.py first.")
        return

    print(f"Checking {file_path}...")
    result = subprocess.run(['node', '-c', file_path], capture_output=True, text=True, shell=True)
    
    if result.returncode != 0:
        print("SYNTAX ERROR DETECTED")
        print("STDERR START")
        print(result.stderr)
        print("STDERR END")
        
        # Extract line number
        match = re.search(r':(\d+)', result.stderr)
        if match:
            line_num = int(match.group(1))
            print(f"Error reported at line {line_num}")
            
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                if 0 <= line_num - 1 < len(lines):
                    print(f"Line {line_num}: {lines[line_num - 1].rstrip()}")
                    # Context
                    start = max(0, line_num - 5)
                    end = min(len(lines), line_num + 5)
                    print("\nContext:")
                    for i in range(start, end):
                        marker = ">> " if i == line_num - 1 else "   "
                        print(f"{marker}{i+1}: {lines[i].rstrip()}")
                else:
                    print("Line number out of range.")
    else:
        print("No syntax errors found.")

if __name__ == "__main__":
    check_detail()
