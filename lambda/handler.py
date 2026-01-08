"""
AWS Lambda handler wrapper
This file imports from main.py and exports the handler
"""
import sys
import os
import zipfile
import tempfile

# Extract requirements zip if it exists (for serverless-python-requirements with zip: true)
_requirements_extracted = False
if not _requirements_extracted:
    # Try multiple possible locations for .requirements.zip
    possible_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.requirements.zip'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '.requirements.zip'),
        '.requirements.zip',
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.requirements.zip'),
    ]
    
    for requirements_zip_path in possible_paths:
        abs_path = os.path.abspath(requirements_zip_path)
        if os.path.exists(abs_path):
            # Extract to a temporary directory and add to Python path
            temp_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(abs_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            sys.path.insert(0, temp_dir)
            _requirements_extracted = True
            break

# Add lambda directory to path so we can import main
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import handler

# Export handler for AWS Lambda
__all__ = ['handler']

