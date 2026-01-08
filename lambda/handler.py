"""
AWS Lambda handler wrapper
This file imports from main.py and exports the handler
"""
import sys
import os

# Add lambda directory to path so we can import main
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import handler

# Export handler for AWS Lambda
__all__ = ['handler']

