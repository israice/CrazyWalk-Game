import subprocess
import sys

def install_package(package_name):
    print(f"Installing {package_name}...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])
        print(f"Successfully installed {package_name}")
    except subprocess.CalledProcessError:
        print(f"Failed to install {package_name}")
        sys.exit(1)

def main():
    print("Setting up development environment...")
    
    # Install Ruff
    install_package("ruff")
    
    # Check installation
    try:
        ruff_version = subprocess.check_output(["ruff", "--version"]).decode("utf-8").strip()
        print(f"Ruff installed: {ruff_version}")
    except FileNotFoundError:
        print("Ruff executable not found after installation.")
    
    print("Dev tools installation complete.")

if __name__ == "__main__":
    main()
